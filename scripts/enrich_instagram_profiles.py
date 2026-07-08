#!/usr/bin/env python3
"""
Enrich Instagram profiles with data from the Apify Instagram Profile Scraper.

Weekly workflow (instagram_enrichment.yml), scheduled after social_discovery.yml:

1. Selects social_profiles rows with enrichment_status='pending' whose athlete
   is confirmed/manual — or auto_detected with discovery_confidence >= 0.6.
2. Starts ONE Apify actor run for the whole batch (usernames list), polls the
   run status, then downloads the dataset items.
3. Persists followers/posts/verified/private/bio/engagement rate, and copies
   the profile picture into Supabase Storage (bucket 'athlete-avatars') —
   Instagram CDN URLs expire within days, so the DB stores the Storage URL.
   Also fills athletes.photo_url when the athlete has no photo yet.
4. Per-profile failures (nonexistent handle, actor error) mark that row
   enrichment_status='failed' and never abort the rest of the batch. Private
   accounts still expose public counters + avatar, so they count as enriched.

Cost: pay-per-result, ~$0.0026/profile — default cap 60 profiles/run (~$0.16).

Env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APIFY_API_TOKEN   (required)
  ENRICH_LIMIT (default 60), ENRICH_MIN_CONFIDENCE (default 0.6)
"""

import os
import sys
import time
from datetime import datetime, timezone

import requests
from supabase import create_client, Client

APIFY_BASE = "https://api.apify.com/v2"
APIFY_INSTAGRAM_ACTOR = "apify~instagram-profile-scraper"
AVATAR_BUCKET = "athlete-avatars"

ENRICH_LIMIT = int(os.environ.get("ENRICH_LIMIT", "60"))
ENRICH_MIN_CONFIDENCE = float(os.environ.get("ENRICH_MIN_CONFIDENCE", "0.6"))
RUN_TIMEOUT_S = 900
POLL_INTERVAL_S = 15


def get_supabase() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def _storage_headers() -> dict:
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return {"Authorization": f"Bearer {key}", "apikey": key}


def ensure_avatar_bucket() -> None:
    """Create the public avatars bucket if it doesn't exist (idempotent)."""
    base = os.environ["SUPABASE_URL"]
    resp = requests.get(
        f"{base}/storage/v1/bucket/{AVATAR_BUCKET}",
        headers=_storage_headers(), timeout=20,
    )
    if resp.status_code == 200:
        return
    resp = requests.post(
        f"{base}/storage/v1/bucket",
        headers=_storage_headers(),
        json={"id": AVATAR_BUCKET, "name": AVATAR_BUCKET, "public": True},
        timeout=20,
    )
    resp.raise_for_status()
    print(f"Created Storage bucket '{AVATAR_BUCKET}' (public)")


def store_avatar(athlete_id: str, pic_url: str) -> str | None:
    """Download the IG profile picture and re-host it in Supabase Storage."""
    img = requests.get(pic_url, timeout=30)
    img.raise_for_status()
    content_type = img.headers.get("Content-Type", "image/jpeg").split(";")[0]
    if not content_type.startswith("image/") or not img.content:
        return None

    base = os.environ["SUPABASE_URL"]
    path = f"{athlete_id}.jpg"
    up = requests.post(
        f"{base}/storage/v1/object/{AVATAR_BUCKET}/{path}",
        headers={**_storage_headers(), "Content-Type": content_type, "x-upsert": "true"},
        data=img.content,
        timeout=30,
    )
    up.raise_for_status()
    return f"{base}/storage/v1/object/public/{AVATAR_BUCKET}/{path}"


# ---------------------------------------------------------------------------
# Apify — one batched actor run for all handles
# ---------------------------------------------------------------------------

def run_apify_batch(handles: list[str], token: str) -> list[dict]:
    """Start actor run, poll until finished, return dataset items."""
    resp = requests.post(
        f"{APIFY_BASE}/acts/{APIFY_INSTAGRAM_ACTOR}/runs",
        json={"usernames": handles},
        params={"token": token},
        timeout=30,
    )
    resp.raise_for_status()
    run = resp.json()["data"]
    print(f"Apify run {run['id']} started for {len(handles)} handles")

    deadline = time.time() + RUN_TIMEOUT_S
    while True:
        time.sleep(POLL_INTERVAL_S)
        resp = requests.get(
            f"{APIFY_BASE}/actor-runs/{run['id']}", params={"token": token}, timeout=30
        )
        resp.raise_for_status()
        run = resp.json()["data"]
        status = run["status"]
        if status == "SUCCEEDED":
            break
        if status in ("FAILED", "ABORTED", "TIMED-OUT"):
            raise RuntimeError(f"Apify run {run['id']} ended with status {status}")
        if time.time() > deadline:
            raise TimeoutError(f"Apify run {run['id']} still {status} after {RUN_TIMEOUT_S}s")

    resp = requests.get(
        f"{APIFY_BASE}/datasets/{run['defaultDatasetId']}/items",
        params={"token": token, "clean": "true"},
        timeout=60,
    )
    resp.raise_for_status()
    items = resp.json()
    print(f"Apify run finished: {len(items)} dataset items")
    return items


def engagement_rate(item: dict) -> float | None:
    """Avg interactions of latest posts / followers. IG hides some like counts (-1)."""
    followers = item.get("followersCount")
    posts = item.get("latestPosts") or []
    if not followers or not posts:
        return None
    interactions = [
        (p.get("likesCount") or 0) + (p.get("commentsCount") or 0)
        for p in posts[:12]
        if (p.get("likesCount") or 0) >= 0
    ]
    if not interactions:
        return None
    return round(min(9.9999, (sum(interactions) / len(interactions)) / followers), 4)


# ---------------------------------------------------------------------------
# Selection — pending profiles of verified (or high-confidence) athletes
# ---------------------------------------------------------------------------

def fetch_pending_profiles(sb: Client) -> list[dict]:
    resp = (
        sb.table("social_profiles")
        .select(
            "id,athlete_id,handle,discovery_confidence,"
            "athletes(name,discovery_status,photo_url)"
        )
        .eq("platform", "instagram")
        .eq("enrichment_status", "pending")
        .order("discovery_confidence", desc=True, nullsfirst=False)
        .limit(ENRICH_LIMIT * 3)
        .execute()
    )
    eligible = []
    for row in resp.data or []:
        athlete = row.get("athletes") or {}
        status = athlete.get("discovery_status")
        conf = row.get("discovery_confidence") or 0
        if status in ("confirmed", "manual") or (
            status == "auto_detected" and conf >= ENRICH_MIN_CONFIDENCE
        ):
            eligible.append(row)
    return eligible[:ENRICH_LIMIT]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    token = os.environ.get("APIFY_API_TOKEN") or os.environ.get("APIFY_API_KEY")
    if not token:
        print("SKIPPED — APIFY_API_TOKEN not set.")
        return

    sb = get_supabase()
    ensure_avatar_bucket()

    run_resp = sb.table("ingestion_runs").insert({
        "source": "instagram_enrichment",
        "status": "running",
        "items_processed": 0,
    }).execute()
    run_id = run_resp.data[0]["id"]

    enriched = 0
    failed = 0
    errors: list[str] = []
    try:
        profiles = fetch_pending_profiles(sb)
        print(f"Pending profiles to enrich: {len(profiles)} (cap {ENRICH_LIMIT})")

        if profiles:
            items = run_apify_batch([p["handle"] for p in profiles], token)
            by_handle = {
                (it.get("username") or "").lower(): it
                for it in items
                if it.get("username")
            }
            now = datetime.now(timezone.utc).isoformat()

            for profile in profiles:
                handle = profile["handle"].lower()
                athlete = profile.get("athletes") or {}
                name = athlete.get("name", handle)
                item = by_handle.get(handle)

                if item is None or item.get("error"):
                    reason = (item or {}).get("error", "not in dataset (nonexistent?)")
                    sb.table("social_profiles").update({
                        "enrichment_status": "failed",
                        "enriched_at": now,
                    }).eq("id", profile["id"]).execute()
                    errors.append(f"{name} @{handle}: {reason}")
                    print(f"  ✗ {name} @{handle}: {reason}")
                    failed += 1
                    continue

                avatar_url = None
                pic = item.get("profilePicUrlHD") or item.get("profilePicUrl")
                if pic:
                    try:
                        avatar_url = store_avatar(profile["athlete_id"], pic)
                    except Exception as e:
                        errors.append(f"{name} @{handle}: avatar upload — {e}")
                        print(f"  [WARN] {name}: avatar upload failed — {e}")

                update = {
                    "followers_count": item.get("followersCount"),
                    "following_count": item.get("followsCount"),
                    "posts_count": item.get("postsCount"),
                    "is_verified_account": bool(item.get("verified")),
                    "is_private": bool(item.get("private")),
                    "bio_text": (item.get("biography") or "")[:500] or None,
                    "business_category": item.get("businessCategoryName"),
                    "engagement_rate": engagement_rate(item),
                    "enrichment_status": "enriched",
                    "enriched_at": now,
                    "last_scraped_at": now,
                }
                if avatar_url:
                    update["profile_pic_url"] = avatar_url
                sb.table("social_profiles").update(update).eq("id", profile["id"]).execute()

                if avatar_url and not athlete.get("photo_url"):
                    sb.table("athletes").update({"photo_url": avatar_url}).eq(
                        "id", profile["athlete_id"]
                    ).execute()

                followers = item.get("followersCount") or 0
                print(f"  ✓ {name} @{handle}: {followers:,} followers"
                      f"{', private' if item.get('private') else ''}"
                      f"{', avatar' if avatar_url else ''}")
                enriched += 1
    except Exception as e:
        # Batch-level failure (Apify run failed, network) — rows stay 'pending'
        # and are retried next week.
        errors.append(f"batch: {e}")
        print(f"[ERR] batch failed: {e}")

    sb.table("ingestion_runs").update({
        "status": "error" if errors else "success",
        "items_processed": enriched + failed,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "error_log": "\n".join(errors) if errors else None,
    }).eq("id", run_id).execute()

    print(f"\nDone. Enriched: {enriched}, failed: {failed}, errors: {len(errors)}")
    if any(e.startswith("batch:") for e in errors):
        sys.exit(1)


if __name__ == "__main__":
    main()
