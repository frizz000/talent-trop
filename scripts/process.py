#!/usr/bin/env python3
"""
Process untagged news_articles with Claude Haiku:
  - LLM paraphrase (summary)
  - discipline_tag
  - sentiment
  - athlete link attempt

Runs daily at 06:00 UTC via GitHub Actions (process.yml).
Processes max 50 articles per run to stay within budget.
"""

import json
import os
import sys
import time
from datetime import datetime, timezone

import anthropic
import requests
from bs4 import BeautifulSoup
from supabase import create_client, Client

BATCH_SIZE = 50
HAIKU_MODEL = "claude-haiku-4-5-20251001"

DISCIPLINES = (
    "skateboarding, snowboarding, freestyle skiing, mountain biking, BMX, "
    "surfing, rock climbing, motocross, wingsuit, paragliding, trail running, "
    "kitesurfing, wakeboarding, parkour, luge, slacklining, "
    "athletics, swimming, cycling, football, basketball, tennis, volleyball, "
    "combat sports, winter sports, water sports, extreme sports, other"
)

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; TalentTropBot/1.0)"}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_supabase() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def get_claude() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


def fetch_excerpt(url: str, timeout: int = 8) -> str:
    """Get og:description or first substantial paragraph."""
    try:
        resp = requests.get(url, timeout=timeout, headers=HEADERS)
        soup = BeautifulSoup(resp.text, "html.parser")

        # og:description is usually the best short excerpt
        og = soup.find("meta", property="og:description")
        if og and og.get("content"):
            return og["content"].strip()[:700]

        # First paragraph fallback
        for p in soup.find_all("p"):
            text = p.get_text(separator=" ").strip()
            if len(text) > 80:
                return text[:700]
    except Exception:
        pass
    return ""


def analyze_article(
    claude: anthropic.Anthropic, title: str, excerpt: str, source: str, region: str
) -> dict:
    """Call Claude Haiku to analyze a single article. Returns dict with fields."""
    lang_hint = "Polish" if region == "poland" else "English"

    prompt = f"""You are a sports news analyzer. Analyze this article and return JSON only.

Title: {title}
Source: {source}
Excerpt: {excerpt or "(no excerpt available)"}

Return valid JSON with these exact keys (no markdown, no code block):
{{
  "summary": "2-3 sentence paraphrase in {lang_hint}. Never copy text verbatim. Write as if briefing a talent scout.",
  "discipline_tag": "one value from: {DISCIPLINES}",
  "sentiment": "positive" | "neutral" | "negative",
  "athlete_name": "full name if ONE specific athlete is the clear subject, else null"
}}"""

    response = claude.messages.create(
        model=HAIKU_MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()
    # Strip markdown fences if model added them
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


def try_link_athlete(sb: Client, athlete_name: str | None) -> str | None:
    """Find athlete by fuzzy name match in our DB."""
    if not athlete_name or len(athlete_name.strip()) < 3:
        return None
    try:
        result = (
            sb.table("athletes")
            .select("id")
            .ilike("name", f"%{athlete_name.strip()}%")
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]["id"]
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    sb = get_supabase()
    claude = get_claude()

    # Log run
    run_resp = sb.table("ingestion_runs").insert({
        "source": "llm_process",
        "status": "running",
        "items_processed": 0,
    }).execute()
    run_id = run_resp.data[0]["id"]

    # Fetch unprocessed articles (summary IS NULL)
    articles_resp = (
        sb.table("news_articles")
        .select("id,title,url,source,region")
        .is_("summary", "null")
        .order("published_at", desc=True)
        .limit(BATCH_SIZE)
        .execute()
    )
    articles = articles_resp.data or []
    print(f"Found {len(articles)} unprocessed articles")

    processed = 0
    errors: list[str] = []

    for art in articles:
        aid = art["id"]
        title = art["title"]
        print(f"\n→ {title[:70]}")

        try:
            excerpt = fetch_excerpt(art["url"])
            result = analyze_article(claude, title, excerpt, art["source"], art["region"])

            update: dict = {
                "summary": result.get("summary"),
                "discipline_tag": result.get("discipline_tag"),
                "sentiment": result.get("sentiment"),
            }

            athlete_id = try_link_athlete(sb, result.get("athlete_name"))
            if athlete_id:
                update["athlete_id"] = athlete_id
                print(f"  linked athlete: {result['athlete_name']}")

            sb.table("news_articles").update(update).eq("id", aid).execute()
            processed += 1
            print(f"  ✓ {result.get('discipline_tag')} | {result.get('sentiment')}")

        except json.JSONDecodeError as e:
            msg = f"{aid}: JSON parse error — {e}"
            print(f"  [ERR] {msg}")
            errors.append(msg)
        except Exception as e:
            msg = f"{aid}: {e}"
            print(f"  [ERR] {msg}")
            errors.append(msg)

        # Small delay to avoid rate-limit bursts
        time.sleep(0.3)

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
