#!/usr/bin/env python3
"""
Discover Instagram handles for athletes and compute Brand Fit Score via Claude Haiku.

Weekly workflow (social_discovery.yml):
1. For each athlete without a confirmed social profile, build a search query and
   ask Claude to suggest a likely Instagram handle based on name + discipline.
2. If APIFY_API_KEY is set, validate the handle exists and pull follower count.
3. Compute brand_fit_score (0–100) for each athlete via Claude Haiku.
4. Write results to social_profiles and brand_fit_scores tables.

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, APIFY_API_KEY (optional)
"""

import json
import os
import sys
import time
from datetime import datetime, timezone

import anthropic
import requests
from supabase import create_client, Client

HAIKU_MODEL = "claude-haiku-4-5-20251001"

APIFY_INSTAGRAM_ACTOR = "apify/instagram-profile-scraper"

RED_BULL_CRITERIA = """
Red Bull athlete brand fit criteria:
- Extreme / action sport or outdoor discipline (high visual impact)
- Young (under 27 ideally), competitive, rising trajectory
- Strong personal brand or storytelling potential
- Appeals to 18–30 male-skewed audience
- Performs at national or international level
- Not currently signed with a competing energy drink brand (Monster, Rockstar, etc.)
"""


# ---------------------------------------------------------------------------
# Supabase / Claude helpers
# ---------------------------------------------------------------------------

def get_supabase() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def get_claude() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


# ---------------------------------------------------------------------------
# Step 1 — Handle discovery via Claude
# ---------------------------------------------------------------------------

def suggest_handle(claude: anthropic.Anthropic, name: str, discipline: str) -> dict:
    """Ask Claude to suggest a likely Instagram handle for the athlete."""
    prompt = f"""You are helping a talent scout find social media profiles of athletes.

Athlete: {name}
Sport: {discipline}
Country: Poland

Based on common naming conventions for Polish athletes on Instagram, suggest:
1. The most likely Instagram handle (without @)
2. Your confidence level: "high" | "medium" | "low"

Return JSON only (no markdown):
{{"handle": "suggested_handle", "confidence": "medium"}}

If you cannot reasonably guess the handle, return:
{{"handle": null, "confidence": "low"}}"""

    resp = claude.messages.create(
        model=HAIKU_MODEL,
        max_tokens=100,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = resp.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1].lstrip("json").strip()
    return json.loads(raw)


# ---------------------------------------------------------------------------
# Step 2 — Validate handle via Apify (optional)
# ---------------------------------------------------------------------------

def validate_handle_apify(handle: str, api_key: str) -> dict | None:
    """Use Apify Instagram scraper to validate handle and get follower count."""
    url = f"https://api.apify.com/v2/acts/{APIFY_INSTAGRAM_ACTOR}/run-sync-get-dataset-items"
    params = {"token": api_key}
    payload = {"usernames": [handle]}

    try:
        resp = requests.post(url, json=payload, params=params, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        if data and isinstance(data, list) and data[0].get("username"):
            profile = data[0]
            return {
                "handle": profile.get("username", handle),
                "followers_count": profile.get("followersCount"),
                "is_verified": profile.get("verified", False),
                "profile_url": f"https://instagram.com/{handle}",
            }
    except Exception as e:
        print(f"  [Apify] error for @{handle}: {e}")
    return None


# ---------------------------------------------------------------------------
# Step 3 — Brand fit score via Claude
# ---------------------------------------------------------------------------

def compute_brand_fit(
    claude: anthropic.Anthropic,
    athlete: dict,
    followers: int | None,
) -> dict:
    """Compute Red Bull brand fit score and factor breakdown via Claude Haiku."""
    followers_str = f"{followers:,}" if followers else "unknown"

    prompt = f"""You are a Red Bull talent scouting analyst. Score this Polish athlete for Red Bull brand fit.

Athlete: {athlete['name']}
Discipline: {athlete['discipline']} / {athlete.get('sub_discipline', '')}
Born: {athlete.get('birth_date', 'unknown')}
Instagram followers: {followers_str}
Red Bull status: {athlete.get('red_bull_status', 'unknown')}

{RED_BULL_CRITERIA}

Return JSON only (no markdown):
{{
  "score": 0-100,
  "factors": {{
    "content_theme": 0-25,
    "audience_fit": 0-25,
    "performance_level": 0-25,
    "brand_risk": 0-25
  }},
  "rationale": "2-sentence explanation"
}}

content_theme: how extreme/visual is the sport
audience_fit: 18-30 male-skewed alignment
performance_level: how competitive at national/international level
brand_risk: inverse score — 0=high risk, 25=low risk (no competitor brand etc.)"""

    resp = claude.messages.create(
        model=HAIKU_MODEL,
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = resp.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1].lstrip("json").strip()
    return json.loads(raw)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    sb = get_supabase()
    claude = get_claude()
    apify_key = os.environ.get("APIFY_API_KEY")

    # Log run
    run_resp = sb.table("ingestion_runs").insert({
        "source": "social_discovery",
        "status": "running",
        "items_processed": 0,
    }).execute()
    run_id = run_resp.data[0]["id"]

    # Fetch athletes without confirmed social profiles
    existing_profiles_resp = (
        sb.table("social_profiles")
        .select("athlete_id")
        .eq("discovery_method", "manual_confirmed")
        .execute()
    )
    confirmed_ids = {r["athlete_id"] for r in (existing_profiles_resp.data or [])}

    athletes_resp = (
        sb.table("athletes")
        .select("id,name,discipline,sub_discipline,birth_date,red_bull_status")
        .execute()
    )
    athletes = [a for a in (athletes_resp.data or []) if a["id"] not in confirmed_ids]
    print(f"Athletes to process: {len(athletes)}")

    processed = 0
    errors: list[str] = []

    for athlete in athletes:
        aid = athlete["id"]
        name = athlete["name"]
        print(f"\n→ {name} ({athlete['discipline']})")

        followers = None

        try:
            # Step 1: suggest handle
            suggestion = suggest_handle(claude, name, athlete["discipline"])
            handle = suggestion.get("handle")
            confidence_str = suggestion.get("confidence", "low")
            confidence_map = {"high": 0.85, "medium": 0.60, "low": 0.35}
            confidence = confidence_map.get(confidence_str, 0.35)

            if handle:
                # Step 2: validate via Apify if key present
                profile_data = None
                if apify_key:
                    profile_data = validate_handle_apify(handle, apify_key)
                    if profile_data:
                        followers = profile_data.get("followers_count")
                        handle = profile_data["handle"]
                        confidence = min(1.0, confidence + 0.1)
                        print(f"  Apify: @{handle} — {followers:,} followers" if followers else f"  Apify: @{handle} — verified")

                # Upsert social_profile
                profile_url = f"https://instagram.com/{handle}"
                sb.table("social_profiles").upsert({
                    "athlete_id": aid,
                    "platform": "instagram",
                    "handle": handle,
                    "profile_url": profile_url,
                    "discovery_confidence": round(confidence, 3),
                    "discovery_method": "manual_confirmed" if (profile_data and confidence >= 0.9) else "auto",
                    "followers_count": followers,
                    "last_checked_at": datetime.now(timezone.utc).isoformat(),
                }, on_conflict="athlete_id,platform").execute()
                print(f"  handle: @{handle} (confidence={confidence:.2f})")

            # Step 3: compute brand fit score
            brand_result = compute_brand_fit(claude, athlete, followers)
            score = float(brand_result.get("score", 50))
            factors = brand_result.get("factors", {})
            rationale = brand_result.get("rationale", "")

            # Include rationale in factors jsonb
            factors["rationale"] = rationale

            sb.table("brand_fit_scores").upsert({
                "athlete_id": aid,
                "brand": "red_bull",
                "score": score,
                "factors": factors,
                "computed_at": datetime.now(timezone.utc).isoformat(),
            }, on_conflict="athlete_id,brand").execute()
            print(f"  brand_fit_score: {score:.1f}")

            processed += 1

        except json.JSONDecodeError as e:
            msg = f"{name}: JSON parse error — {e}"
            print(f"  [ERR] {msg}")
            errors.append(msg)
        except Exception as e:
            msg = f"{name}: {e}"
            print(f"  [ERR] {msg}")
            errors.append(msg)

        time.sleep(0.5)

    # Update run log
    sb.table("ingestion_runs").update({
        "status": "error" if errors else "success",
        "items_processed": processed,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "error_log": "\n".join(errors) if errors else None,
    }).eq("id", run_id).execute()

    print(f"\nDone. Processed: {processed}, Errors: {len(errors)}")
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
