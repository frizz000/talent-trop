#!/usr/bin/env python3
"""
Ingest RSS feeds from Polish and world sports sources into Supabase news_articles.
Runs every 3h via GitHub Actions (ingest.yml).

Deduplicates by URL. Tries to extract og:image if not in RSS feed.
Sets region = 'poland' | 'world' based on source.
"""

import os
import sys
import calendar
from datetime import datetime, timezone

import feedparser
import requests
from bs4 import BeautifulSoup
from supabase import create_client, Client

# ---------------------------------------------------------------------------
# Sources
# ---------------------------------------------------------------------------

SOURCES = [
    # Polish
    {"name": "Sport.pl",          "url": "https://sport.pl/rss.xml",                            "region": "poland"},
    {"name": "Polsat Sport",       "url": "https://www.polsatsport.pl/rss/",                     "region": "poland"},
    {"name": "Interia Sport",      "url": "https://sport.interia.pl/rss/sport.xml",              "region": "poland"},
    {"name": "WP SportoweFakty",   "url": "https://sportowefakty.wp.pl/rss.xml",                "region": "poland"},
    {"name": "Przegląd Sportowy",  "url": "https://przegladsportowy.pl/feed",                   "region": "poland"},
    # Polish — niche discipline media (verified 2026-07-06); crossnews.pl,
    # swim.pl, ridemag.pl unreachable; snowboarding.pl feed empty
    {"name": "Wspinanie.pl",       "url": "https://wspinanie.pl/feed/",                         "region": "poland"},
    {"name": "NaSzosie.pl",        "url": "https://naszosie.pl/feed/",                          "region": "poland"},
    {"name": "SkiJumping.pl",      "url": "https://www.skijumping.pl/rss",                      "region": "poland"},
    {"name": "SpeedwayNews.pl",    "url": "https://speedwaynews.pl/feed/",                      "region": "poland"},
    # World
    {"name": "BBC Sport",          "url": "https://feeds.bbci.co.uk/sport/rss.xml",             "region": "world"},
    {"name": "ESPN",               "url": "https://www.espn.com/espn/rss/news",                 "region": "world"},
    {"name": "Sky Sports",         "url": "https://www.skysports.com/rss/12040",                "region": "world"},
    {"name": "Reuters Sports",     "url": "https://feeds.reuters.com/reuters/sportsNews",       "region": "world"},
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; TalentTropBot/1.0; "
        "+https://github.com/frizz000/talent-trop)"
    )
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_supabase() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def fetch_og_image(url: str, timeout: int = 6) -> str | None:
    """Fetch og:image meta tag from article page."""
    try:
        resp = requests.get(url, timeout=timeout, headers=HEADERS)
        soup = BeautifulSoup(resp.text, "html.parser")
        tag = soup.find("meta", property="og:image")
        if tag and tag.get("content"):
            return tag["content"].strip()
    except Exception:
        pass
    return None


def entry_image(entry: feedparser.FeedParserDict) -> str | None:
    """Extract image URL from RSS entry (media:content, enclosure)."""
    # media:content
    media = getattr(entry, "media_content", None)
    if media and isinstance(media, list) and media:
        url = media[0].get("url")
        if url:
            return url
    # enclosure
    for enc in getattr(entry, "enclosures", []):
        if (enc.get("type") or "").startswith("image/"):
            return enc.get("href") or enc.get("url")
    return None


def parse_date(entry: feedparser.FeedParserDict) -> str:
    if getattr(entry, "published_parsed", None):
        dt = datetime.fromtimestamp(
            calendar.timegm(entry.published_parsed), tz=timezone.utc
        )
        return dt.isoformat()
    return datetime.now(timezone.utc).isoformat()


def parse_source(source: dict) -> list[dict]:
    try:
        feed = feedparser.parse(source["url"])
    except Exception as e:
        print(f"  [WARN] failed to parse {source['name']}: {e}")
        return []

    articles = []
    for entry in feed.entries:
        url = (entry.get("link") or "").strip()
        title = (entry.get("title") or "").strip()[:500]
        if not url or not title:
            continue

        articles.append({
            "url": url,
            "title": title,
            "source": source["name"],
            "image_credit": source["name"],
            "region": source["region"],
            "published_at": parse_date(entry),
            "_rss_image": entry_image(entry),
        })
    return articles


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    sb = get_supabase()

    # Start ingestion run log
    run_resp = sb.table("ingestion_runs").insert({
        "source": "rss_all",
        "status": "running",
        "items_processed": 0,
    }).execute()
    run_id = run_resp.data[0]["id"]

    total_inserted = 0
    errors: list[str] = []

    for source in SOURCES:
        print(f"\n→ {source['name']} ({source['region']})")
        articles = parse_source(source)
        print(f"  fetched {len(articles)} items from feed")

        source_inserted = 0
        for art in articles:
            url = art["url"]

            # Deduplication by URL
            existing = sb.table("news_articles").select("id").eq("url", url).limit(1).execute()
            if existing.data:
                continue

            # og:image fallback
            image_url = art.pop("_rss_image", None)
            if not image_url:
                image_url = fetch_og_image(url)

            row = {k: v for k, v in art.items() if not k.startswith("_")}
            if image_url:
                row["image_url"] = image_url

            try:
                sb.table("news_articles").insert(row).execute()
                source_inserted += 1
            except Exception as e:
                msg = f"{source['name']} | {url[:80]}: {e}"
                print(f"  [ERR] {msg}")
                errors.append(msg)

        print(f"  inserted {source_inserted} new articles")
        total_inserted += source_inserted

    # Update run log
    sb.table("ingestion_runs").update({
        "status": "error" if errors else "success",
        "items_processed": total_inserted,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "error_log": "\n".join(errors) if errors else None,
    }).eq("id", run_id).execute()

    print(f"\nDone. Total inserted: {total_inserted}")
    if errors:
        print(f"Errors ({len(errors)}):")
        for e in errors:
            print(f"  {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
