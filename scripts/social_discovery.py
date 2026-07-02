#!/usr/bin/env python3
"""
Discover Instagram handles for top prospects and compute Red Bull Brand Fit Score.

Weekly workflow (social_discovery.yml). Two independent steps:

1. Handle discovery — Google Custom Search (site:instagram.com) for athletes
   without a social profile. Only runs when GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX
   are set and valid. Optional Apify validation (followers count) when
   APIFY_API_TOKEN is set. Handles are stored with a confidence score and
   discovery_method='auto' — the scout verifies them in the UI.
   NOTE: no LLM guessing — a hallucinated handle is worse than no handle.

2. Brand fit — Claude Haiku scores Red Bull brand fit for top prospects
   (unsigned/unknown, not rejected, ordered by talent_score). Recomputes
   scores older than BRAND_FIT_MAX_AGE_DAYS.

Env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY   (required)
  GOOGLE_CSE_API_KEY, GOOGLE_CSE_CX                            (handle discovery)
  APIFY_API_TOKEN (or legacy APIFY_API_KEY)                    (handle validation)
  DISCOVERY_LIMIT (default 40), BRAND_FIT_LIMIT (default 150)
"""

import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher

import anthropic
import requests
from supabase import create_client, Client

HAIKU_MODEL = "claude-haiku-4-5-20251001"
APIFY_INSTAGRAM_ACTOR = "apify~instagram-profile-scraper"

DISCOVERY_LIMIT = int(os.environ.get("DISCOVERY_LIMIT", "40"))
BRAND_FIT_LIMIT = int(os.environ.get("BRAND_FIT_LIMIT", "150"))
BRAND_FIT_MAX_AGE_DAYS = int(os.environ.get("BRAND_FIT_MAX_AGE_DAYS", "14"))

# Instagram accounts that are never an athlete's personal profile
IG_HANDLE_BLOCKLIST = {
    "p", "reel", "reels", "stories", "explore", "accounts", "tv",
    "redbull", "redbullpol", "instagram",
}

RED_BULL_CRITERIA = """
Red Bull athlete brand fit criteria:
- Extreme / action sport or outdoor discipline (high visual impact)
- Young (under 23 ideally — Red Bull signs athletes as young as 14-15), competitive, rising trajectory
- Strong personal brand or storytelling potential
- Appeals to 18-30 male-skewed audience
- Performs at national or international level
- Not currently signed with a competing energy drink brand (Monster, Rockstar, etc.)
"""


def get_supabase() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def get_claude() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


# ---------------------------------------------------------------------------
# Step 1 — Handle discovery via Google Custom Search
# ---------------------------------------------------------------------------

def _name_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def search_instagram_handle(name: str, discipline: str) -> dict | None:
    """
    Google CSE query for the athlete's Instagram. Returns
    {handle, confidence, source_title} or None.
    """
    api_key = os.environ.get("GOOGLE_CSE_API_KEY")
    cx = os.environ.get("GOOGLE_CSE_CX")
    if not api_key or not cx:
        return None

    resp = requests.get(
        "https://www.googleapis.com/customsearch/v1",
        params={
            "key": api_key,
            "cx": cx,
            "q": f'"{name}" {discipline} site:instagram.com',
            "num": 5,
        },
        timeout=20,
    )
    resp.raise_for_status()
    items = resp.json().get("items", [])

    best: dict | None = None
    for rank, item in enumerate(items):
        link = item.get("link", "")
        m = re.search(r"instagram\.com/([A-Za-z0-9_.]+)/?", link)
        if not m:
            continue
        handle = m.group(1).lower().rstrip(".")
        if handle in IG_HANDLE_BLOCKLIST:
            continue

        # Confidence: does the result title contain the athlete's name?
        title = item.get("title", "")
        title_sim = max(
            (_name_similarity(name, part.strip()) for part in re.split(r"[|•(–-]", title) if part.strip()),
            default=0.0,
        )
        confidence = 0.35 + 0.4 * title_sim + (0.15 if rank == 0 else 0.0)
        confidence = round(min(0.95, confidence), 3)

        if best is None or confidence > best["confidence"]:
            best = {"handle": handle, "confidence": confidence, "source_title": title}

    return best


def validate_handle_apify(handle: str, token: str) -> dict | None:
    """Use Apify Instagram scraper to validate handle and get follower count."""
    url = f"https://api.apify.com/v2/acts/{APIFY_INSTAGRAM_ACTOR}/run-sync-get-dataset-items"
    try:
        resp = requests.post(
            url, json={"usernames": [handle]}, params={"token": token}, timeout=90
        )
        resp.raise_for_status()
        data = resp.json()
        if data and isinstance(data, list) and data[0].get("username"):
            p = data[0]
            return {
                "handle": p.get("username", handle),
                "followers_count": p.get("followersCount"),
                "following_count": p.get("followsCount"),
                "posts_count": p.get("postsCount"),
                "is_verified": p.get("verified", False),
                "is_private": p.get("private", False),
                "bio_text": (p.get("biography") or "")[:500] or None,
            }
    except Exception as e:
        print(f"  [Apify] error for @{handle}: {e}")
    return None


def run_handle_discovery(sb: Client) -> tuple[int, list[str]]:
    """Discover IG handles for top prospects without a social profile."""
    api_key = os.environ.get("GOOGLE_CSE_API_KEY")
    cx = os.environ.get("GOOGLE_CSE_CX")
    if not api_key or not cx:
        print("\n[1/2] Handle discovery SKIPPED — GOOGLE_CSE_API_KEY / GOOGLE_CSE_CX not set.")
        return 0, []

    apify_token = os.environ.get("APIFY_API_TOKEN") or os.environ.get("APIFY_API_KEY")

    existing = sb.table("social_profiles").select("athlete_id").execute()
    covered_ids = {r["athlete_id"] for r in (existing.data or [])}

    athletes_resp = (
        sb.table("athletes")
        .select("id,name,discipline")
        .neq("discovery_status", "rejected")
        .neq("red_bull_status", "signed")
        .order("talent_score", desc=True, nullsfirst=False)
        .limit(DISCOVERY_LIMIT + len(covered_ids))
        .execute()
    )
    todo = [a for a in (athletes_resp.data or []) if a["id"] not in covered_ids][:DISCOVERY_LIMIT]
    print(f"\n[1/2] Handle discovery: {len(todo)} top prospects without a profile")

    found = 0
    errors: list[str] = []
    for athlete in todo:
        name = athlete["name"]
        try:
            result = search_instagram_handle(name, athlete["discipline"])
            if not result:
                print(f"  ○ {name}: no match")
                continue

            handle = result["handle"]
            confidence = result["confidence"]
            row = {
                "athlete_id": athlete["id"],
                "platform": "instagram",
                "handle": handle,
                "discovery_confidence": confidence,
                "discovery_method": "auto",
                "last_scraped_at": datetime.now(timezone.utc).isoformat(),
            }

            if apify_token:
                profile = validate_handle_apify(handle, apify_token)
                if profile:
                    row.update({
                        "handle": profile["handle"],
                        "followers_count": profile["followers_count"],
                        "following_count": profile["following_count"],
                        "posts_count": profile["posts_count"],
                        "is_verified_account": profile["is_verified"],
                        "is_private": profile["is_private"],
                        "bio_text": profile["bio_text"],
                        "discovery_confidence": min(1.0, confidence + 0.15),
                    })

            sb.table("social_profiles").upsert(
                row, on_conflict="athlete_id,platform"
            ).execute()
            sb.table("athletes").update({"social_status": "pending_review"}).eq(
                "id", athlete["id"]
            ).execute()
            followers = row.get("followers_count")
            extra = f", {followers:,} followers" if followers else ""
            print(f"  ✓ {name}: @{row['handle']} (conf={row['discovery_confidence']:.2f}{extra})")
            found += 1
        except Exception as e:
            msg = f"discovery {name}: {e}"
            print(f"  [ERR] {msg}")
            errors.append(msg)
        time.sleep(0.5)

    return found, errors


# ---------------------------------------------------------------------------
# Step 2 — Brand fit score via Claude
# ---------------------------------------------------------------------------

def compute_brand_fit(
    claude: anthropic.Anthropic, athlete: dict, followers: int | None
) -> dict:
    """Compute Red Bull brand fit score and factor breakdown via Claude Haiku."""
    followers_str = f"{followers:,}" if followers else "unknown"
    fed_lines = athlete.get("_fed_summary") or "none on record"

    prompt = f"""You are a Red Bull talent scouting analyst. Score this Polish athlete for Red Bull brand fit.

Athlete: {athlete['name']}
Discipline: {athlete['discipline']} / {athlete.get('sub_discipline') or ''}
Born: {athlete.get('birth_date') or 'unknown'}
Federation rankings: {fed_lines}
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
  "rationale": "2-sentence explanation in Polish"
}}

content_theme: how extreme/visual is the sport
audience_fit: 18-30 male-skewed alignment
performance_level: competitiveness based on federation rankings and age category
brand_risk: inverse score — 0=high risk, 25=low risk (no competitor brand etc.)"""

    resp = claude.messages.create(
        model=HAIKU_MODEL,
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = resp.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


def run_brand_fit(sb: Client, claude: anthropic.Anthropic) -> tuple[int, list[str]]:
    """Score brand fit for top prospects; recompute stale scores."""
    stale_cutoff = (
        datetime.now(timezone.utc) - timedelta(days=BRAND_FIT_MAX_AGE_DAYS)
    ).isoformat()

    fresh = sb.table("brand_fit_scores").select("athlete_id").gte(
        "computed_at", stale_cutoff
    ).execute()
    fresh_ids = {r["athlete_id"] for r in (fresh.data or [])}

    athletes_resp = (
        sb.table("athletes")
        .select(
            "id,name,discipline,sub_discipline,birth_date,red_bull_status,"
            "federation_profiles(federation,ranking_category,ranking_position,season)"
        )
        .neq("discovery_status", "rejected")
        .neq("red_bull_status", "signed")
        .order("talent_score", desc=True, nullsfirst=False)
        .limit(BRAND_FIT_LIMIT + len(fresh_ids))
        .execute()
    )
    todo = [a for a in (athletes_resp.data or []) if a["id"] not in fresh_ids][:BRAND_FIT_LIMIT]
    print(f"\n[2/2] Brand fit: {len(todo)} prospects to score (fresh: {len(fresh_ids)})")

    # Followers per athlete for context (if any profile data exists)
    profiles = sb.table("social_profiles").select("athlete_id,followers_count").execute()
    followers_by_id = {
        r["athlete_id"]: r["followers_count"]
        for r in (profiles.data or [])
        if r.get("followers_count")
    }

    scored = 0
    errors: list[str] = []
    for athlete in todo:
        name = athlete["name"]
        try:
            feds = athlete.get("federation_profiles") or []
            athlete["_fed_summary"] = "; ".join(
                f"{f['federation']} {f.get('ranking_category') or ''} #{f.get('ranking_position')} ({f.get('season')})"
                for f in feds[:3]
            ) or None

            result = compute_brand_fit(claude, athlete, followers_by_id.get(athlete["id"]))
            score = max(0.0, min(100.0, float(result.get("score", 50))))
            factors = result.get("factors", {})
            factors["rationale"] = result.get("rationale", "")

            sb.table("brand_fit_scores").upsert({
                "athlete_id": athlete["id"],
                "brand": "red_bull",
                "score": score,
                "factors": factors,
                "computed_at": datetime.now(timezone.utc).isoformat(),
            }, on_conflict="athlete_id,brand").execute()
            print(f"  ✓ {name:40s} brand_fit={score:5.1f}")
            scored += 1
        except json.JSONDecodeError as e:
            errors.append(f"brand_fit {name}: JSON parse — {e}")
            print(f"  [ERR] {name}: JSON parse error")
        except Exception as e:
            errors.append(f"brand_fit {name}: {e}")
            print(f"  [ERR] {name}: {e}")
        time.sleep(0.3)

    return scored, errors


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    sb = get_supabase()
    claude = get_claude()

    run_resp = sb.table("ingestion_runs").insert({
        "source": "social_discovery",
        "status": "running",
        "items_processed": 0,
    }).execute()
    run_id = run_resp.data[0]["id"]

    found, disc_errors = run_handle_discovery(sb)
    scored, fit_errors = run_brand_fit(sb, claude)
    errors = disc_errors + fit_errors

    sb.table("ingestion_runs").update({
        "status": "error" if errors else "success",
        "items_processed": found + scored,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "error_log": "\n".join(errors) if errors else None,
    }).eq("id", run_id).execute()

    print(f"\nDone. Handles found: {found}, brand fit scored: {scored}, errors: {len(errors)}")
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
