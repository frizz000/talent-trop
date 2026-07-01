#!/usr/bin/env python3
"""
Federation data ingestion pipeline.

Pulls athlete data from Polish national federation sources and external
competition databases, then upserts into athletes + federation_profiles tables.

Sources enabled:
  - pza_climbing   PZA (Polski Związek Alpinizmu) — Google Sheet + PDF
  - pzkol_mtb      PZKol MTB XCO — classification PDF
  - pzm_motocross  PZM Motocross — motoresults.pl HTML tables

Disabled (future, require JS rendering or auth):
  - itra           ITRA trail running
  - worldskate     World Skate / skateboarding

Discovery status: athletes created from federation data get
  discovery_status='confirmed' (national federation = definitive Polish identity).
  Athletes from pzm_motocross get discovery_status='auto_detected'
  (LLM-filtered, not license-verified).

Run:
  python3 scripts/ingest_federations.py [--sources pza,pzkol,pzm]
"""

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from difflib import SequenceMatcher

import anthropic
from supabase import create_client, Client

# Add scripts/ to path so `sources` package is importable
sys.path.insert(0, os.path.dirname(__file__))

from sources.base import FederationAthlete
from sources import pza_climbing, pzkol, pzm_motocross

HAIKU_MODEL = "claude-haiku-4-5-20251001"

# Fuzzy name match threshold: 0.85 = very close, allows minor spelling diffs
NAME_SIMILARITY_THRESHOLD = 0.85

# Discovery status for federation-created athletes
DISCOVERY_STATUS_FEDERATION = {
    "pza": "confirmed",       # national license = definitive
    "pzkol_mtb": "confirmed",
    "pzkol_bmx": "confirmed",
    "pzm_motocross": "auto_detected",  # LLM-filtered, not license-verified
}


# ─── Environment ─────────────────────────────────────────────────────────────

def load_env() -> None:
    env_file = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    if not os.path.exists(env_file):
        return
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                if k not in os.environ:
                    os.environ[k] = v


def get_supabase() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


# ─── Athlete matching ─────────────────────────────────────────────────────────

def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def find_athlete_by_name(sb: Client, name: str) -> str | None:
    """
    Fuzzy-match athlete name against athletes table.
    Returns athlete_id if match >= threshold, else None.
    """
    # Exact match first (case-insensitive)
    result = sb.table("athletes").select("id,name").ilike("name", name).limit(1).execute()
    if result.data:
        return result.data[0]["id"]

    # Broader fuzzy: fetch athletes with any word from the name
    words = [w for w in name.split() if len(w) > 3]
    if not words:
        return None

    for word in words[:2]:
        candidates = (
            sb.table("athletes")
            .select("id,name")
            .ilike("name", f"%{word}%")
            .limit(20)
            .execute()
        )
        for row in candidates.data or []:
            if _similarity(name, row["name"]) >= NAME_SIMILARITY_THRESHOLD:
                return row["id"]

    return None


# ─── Federation profile upsert ────────────────────────────────────────────────

def upsert_federation_profile(
    sb: Client,
    athlete: FederationAthlete,
    athlete_id: str | None,
) -> None:
    """Insert or update federation_profiles row (dedup on unique index)."""
    data = {
        "athlete_id": athlete_id,
        "federation": athlete.federation,
        "external_name": athlete.external_name,
        "discipline": athlete.discipline,
        "ranking_category": athlete.ranking_category,
        "season": athlete.season,
        "ranking_position": athlete.ranking_position,
        "points": athlete.points,
        "club": athlete.club,
        "extra": {
            **athlete.extra,
            "nationality_confirmed": athlete.nationality_confirmed,
        },
        "last_scraped_at": datetime.now(timezone.utc).isoformat(),
    }
    if athlete.external_id:
        data["external_id"] = athlete.external_id

    # Upsert on unique constraint: (federation, external_name, ranking_category, season)
    sb.table("federation_profiles").upsert(
        data,
        on_conflict="federation,external_name,ranking_category,season",
    ).execute()


# ─── Athlete creation ─────────────────────────────────────────────────────────

def create_athlete(sb: Client, athlete: FederationAthlete) -> str:
    """Create new athletes row from federation data. Returns new ID."""
    discovery_status = DISCOVERY_STATUS_FEDERATION.get(athlete.federation, "auto_detected")

    birth_date = None
    birth_year = athlete.extra.get("birth_year")
    if birth_year and isinstance(birth_year, int) and 1950 <= birth_year <= 2015:
        birth_date = f"{birth_year}-01-01"

    result = (
        sb.table("athletes")
        .insert({
            "name": athlete.external_name,
            "discipline": athlete.discipline or "unknown",
            "discovery_status": discovery_status,
            "red_bull_status": "unknown",
            "social_status": "not_found",
            "birth_date": birth_date,
        })
        .execute()
    )
    return result.data[0]["id"]


# ─── Main processing loop ─────────────────────────────────────────────────────

def process_athletes(
    sb: Client,
    athletes: list[FederationAthlete],
    source_name: str,
) -> dict:
    stats = {"linked": 0, "created": 0, "updated": 0, "errors": 0}

    for a in athletes:
        try:
            athlete_id = find_athlete_by_name(sb, a.external_name)
            action = "linked"

            if athlete_id is None:
                athlete_id = create_athlete(sb, a)
                action = "created"
                print(f"  + {a.external_name} ({a.ranking_category})")

            upsert_federation_profile(sb, a, athlete_id)
            stats[action] += 1

            # Update birth_date on existing athlete if we have it and they don't
            birth_year = a.extra.get("birth_year")
            if athlete_id and birth_year and isinstance(birth_year, int):
                existing = (
                    sb.table("athletes")
                    .select("birth_date")
                    .eq("id", athlete_id)
                    .single()
                    .execute()
                )
                if existing.data and not existing.data.get("birth_date"):
                    sb.table("athletes").update({
                        "birth_date": f"{birth_year}-01-01"
                    }).eq("id", athlete_id).execute()

        except Exception as e:
            print(f"  [ERR] {a.external_name}: {e}")
            stats["errors"] += 1

        time.sleep(0.05)  # mild rate-limit guard for Supabase

    return stats


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main() -> None:
    load_env()

    parser = argparse.ArgumentParser(description="Ingest federation athlete data")
    parser.add_argument(
        "--sources",
        default="pza,pzkol,pzm",
        help="Comma-separated list of sources to run (pza, pzkol, pzm)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Fetch only, don't write to DB")
    args = parser.parse_args()

    sources_to_run = {s.strip() for s in args.sources.split(",")}
    sb = get_supabase()
    claude = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    # Log run start
    run_resp = sb.table("ingestion_runs").insert({
        "source": "federation_ingest",
        "status": "running",
        "items_processed": 0,
    }).execute()
    run_id = run_resp.data[0]["id"]

    all_athletes: list[FederationAthlete] = []
    errors: list[str] = []
    total_stats = {"linked": 0, "created": 0, "updated": 0, "errors": 0}

    # ── Fetch phase ───────────────────────────────────────────────────────────

    if "pza" in sources_to_run:
        print("\n[1/3] PZA Climbing...")
        try:
            found = pza_climbing.fetch()
            all_athletes.extend(found)
            print(f"  → {len(found)} athletes fetched")
        except Exception as e:
            msg = f"pza fetch failed: {e}"
            print(f"  [ERR] {msg}")
            errors.append(msg)

    if "pzkol" in sources_to_run:
        print("\n[2/3] PZKol MTB...")
        try:
            found = pzkol.fetch()
            all_athletes.extend(found)
            print(f"  → {len(found)} athletes fetched")
        except Exception as e:
            msg = f"pzkol fetch failed: {e}"
            print(f"  [ERR] {msg}")
            errors.append(msg)

    if "pzm" in sources_to_run:
        print("\n[3/3] PZM Motocross...")
        try:
            found = pzm_motocross.fetch(claude)
            all_athletes.extend(found)
            print(f"  → {len(found)} athletes fetched")
        except Exception as e:
            msg = f"pzm fetch failed: {e}"
            print(f"  [ERR] {msg}")
            errors.append(msg)

    print(f"\nFetch complete: {len(all_athletes)} athletes total across all sources")

    if args.dry_run:
        print("[DRY RUN] Skipping database writes.")
        sb.table("ingestion_runs").update({
            "status": "success",
            "items_processed": len(all_athletes),
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "error_log": "dry_run",
        }).eq("id", run_id).execute()
        return

    # ── Write phase ───────────────────────────────────────────────────────────

    print("\nWriting to database...")
    by_source: dict[str, list[FederationAthlete]] = {}
    for a in all_athletes:
        by_source.setdefault(a.federation, []).append(a)

    for source, athletes in by_source.items():
        print(f"  Processing {source} ({len(athletes)} athletes)...")
        stats = process_athletes(sb, athletes, source)
        print(f"    linked={stats['linked']} created={stats['created']} errors={stats['errors']}")
        for k, v in stats.items():
            total_stats[k] += v

    # ── Finalize ──────────────────────────────────────────────────────────────

    sb.table("ingestion_runs").update({
        "status": "error" if errors else "success",
        "items_processed": total_stats["linked"] + total_stats["created"],
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "error_log": "\n".join(errors) if errors else None,
    }).eq("id", run_id).execute()

    print(f"\n{'='*60}")
    print(f"DONE — linked={total_stats['linked']} created={total_stats['created']} "
          f"errors={total_stats['errors']}")
    if errors:
        print(f"ERRORS: {errors}")
        sys.exit(1)


if __name__ == "__main__":
    main()
