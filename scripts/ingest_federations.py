#!/usr/bin/env python3
"""
Federation data ingestion pipeline.

Pulls athlete data from Polish national federation sources and external
competition databases, then upserts into athletes + federation_profiles tables.

Sources enabled:
  - pza_climbing   PZA (Polski Związek Alpinizmu) — Google Sheet + PDF
  - pzkol_mtb      PZKol MTB XCO — classification PDF
  - pzm_motocross  PZM Motocross — motoresults.pl HTML tables
  - pzla           PZLA athletics — statystyka.pzla.pl season leaders U16/U18/U20
  - fis            FIS points lists (alpine, snowboard, freestyle) — POL athletes
  - ifsc           IFSC Combined World Ranking — POL climbers
  - speedskating   speedskatingresults.com national top-N per distance — POL

Disabled (future, require JS rendering or block scrapers):
  - itra           ITRA trail running
  - worldskate     World Skate / skateboarding
  - swimrankings   swimming (Cloudflare 403)
  - procyclingstats road cycling (Cloudflare 403)

Discovery status: athletes created from federation data get
  discovery_status='confirmed' (national federation = definitive Polish identity).
  Athletes from pzm_motocross get discovery_status='auto_detected'
  (LLM-filtered, not license-verified).

Run:
  python3 scripts/ingest_federations.py [--sources pza,pzkol,pzm,pzla,fis,ifsc]
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
from sources import pza_climbing, pzkol, pzm_motocross, pzla, fis, ifsc, speedskating

HAIKU_MODEL = "claude-haiku-4-5-20251001"

# Fuzzy name match threshold: 0.85 = very close, allows minor spelling diffs
NAME_SIMILARITY_THRESHOLD = 0.85

# Discovery status for federation-created athletes
DISCOVERY_STATUS_FEDERATION = {
    "pza": "confirmed",       # national license = definitive
    "pzkol_mtb": "confirmed",
    "pzkol_bmx": "confirmed",
    "pzm_motocross": "auto_detected",  # LLM-filtered, not license-verified
    "pzla": "confirmed",      # PZLA license = Polish registration
    "fis": "confirmed",       # Nationcode=POL in FIS points list
    "ifsc": "confirmed",      # country=POL in IFSC world ranking
    "speed_skating_isu": "confirmed",  # country=POL in ISU results archive
}

# CLI source key → (fetch callable, needs_claude)
SOURCE_REGISTRY = {
    "pza":   (pza_climbing.fetch, False),
    "pzkol": (pzkol.fetch, False),
    "pzm":   (pzm_motocross.fetch, True),
    "pzla":  (pzla.fetch, False),
    "fis":   (fis.fetch, False),
    "ifsc":  (ifsc.fetch, False),
    "speedskating": (speedskating.fetch, False),
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


# ─── Athlete matching (in-memory index — one DB read, no per-row queries) ─────

def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


class AthleteIndex:
    """In-memory index of the athletes table for exact + fuzzy name matching."""

    def __init__(self, sb: Client):
        self.rows: list[dict] = []
        offset = 0
        while True:
            batch = (
                sb.table("athletes")
                .select("id,name,birth_date")
                .range(offset, offset + 999)
                .execute()
            ).data or []
            self.rows.extend(batch)
            if len(batch) < 1000:
                break
            offset += 1000

        self.by_name: dict[str, dict] = {}
        self.by_word: dict[str, list[dict]] = {}
        for row in self.rows:
            self._index(row)
        print(f"  Athlete index loaded: {len(self.rows)} records")

    def _index(self, row: dict) -> None:
        self.by_name[row["name"].lower().strip()] = row
        for word in row["name"].lower().split():
            if len(word) > 3:
                self.by_word.setdefault(word, []).append(row)

    def add(self, row: dict) -> None:
        self.rows.append(row)
        self._index(row)

    def find(self, name: str) -> dict | None:
        """Exact (case-insensitive) match first, then fuzzy over shared words."""
        exact = self.by_name.get(name.lower().strip())
        if exact:
            return exact
        for word in [w for w in name.lower().split() if len(w) > 3][:2]:
            for row in self.by_word.get(word, []):
                if _similarity(name, row["name"]) >= NAME_SIMILARITY_THRESHOLD:
                    return row
        return None


# ─── Bulk write helpers ───────────────────────────────────────────────────────

def _birth_date_from(athlete: FederationAthlete) -> str | None:
    birth_year = athlete.extra.get("birth_year")
    if birth_year and isinstance(birth_year, int) and 1950 <= birth_year <= 2015:
        return f"{birth_year}-01-01"
    return None


def _profile_row(athlete: FederationAthlete, athlete_id: str | None) -> dict:
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
    return data


def _chunks(items: list, size: int):
    for i in range(0, len(items), size):
        yield items[i:i + size]


# ─── Main processing loop (bulk: batched inserts/upserts, in-memory matching) ──

def process_athletes(
    sb: Client,
    index: AthleteIndex,
    athletes: list[FederationAthlete],
    source_name: str,
) -> dict:
    stats = {"linked": 0, "created": 0, "updated": 0, "errors": 0}

    # 1. Split into matched / new (dedup new by name — same person appears in
    #    multiple events/categories within one fetch)
    matched: list[tuple[FederationAthlete, dict]] = []
    to_create: dict[str, FederationAthlete] = {}
    for a in athletes:
        row = index.find(a.external_name)
        if row:
            matched.append((a, row))
        else:
            to_create.setdefault(a.external_name.lower().strip(), a)

    # 2. Batch-create new athletes
    created_by_name: dict[str, dict] = {}
    for chunk in _chunks(list(to_create.values()), 100):
        payload = [{
            "name": a.external_name,
            "discipline": a.discipline or "unknown",
            "discovery_status": DISCOVERY_STATUS_FEDERATION.get(a.federation, "auto_detected"),
            "red_bull_status": "unknown",
            "social_status": "not_found",
            "birth_date": _birth_date_from(a),
        } for a in chunk]
        try:
            result = sb.table("athletes").insert(payload).execute()
            for row in result.data or []:
                created_by_name[row["name"].lower().strip()] = row
                index.add(row)
                stats["created"] += 1
        except Exception as e:
            print(f"  [ERR] batch create ({len(chunk)} athletes): {e}")
            stats["errors"] += len(chunk)
        time.sleep(0.1)

    # 3. Backfill birth_date on matched athletes that lack it
    for a, row in matched:
        birth_date = _birth_date_from(a)
        if birth_date and not row.get("birth_date"):
            try:
                sb.table("athletes").update({"birth_date": birth_date}).eq(
                    "id", row["id"]
                ).execute()
                row["birth_date"] = birth_date
                stats["updated"] += 1
            except Exception as e:
                print(f"  [ERR] birth_date update {a.external_name}: {e}")

    # 4. Batch-upsert federation profiles (dedup by conflict key within batch —
    #    Postgres rejects ON CONFLICT hitting the same row twice per statement)
    profile_rows: dict[tuple, dict] = {}
    for a in athletes:
        row = index.find(a.external_name)
        athlete_id = row["id"] if row else None
        key = (a.federation, a.external_name, a.ranking_category, a.season)
        profile_rows[key] = _profile_row(a, athlete_id)
        if row and not created_by_name.get(a.external_name.lower().strip()):
            stats["linked"] += 1

    for chunk in _chunks(list(profile_rows.values()), 200):
        try:
            sb.table("federation_profiles").upsert(
                chunk,
                on_conflict="federation,external_name,ranking_category,season",
            ).execute()
        except Exception as e:
            print(f"  [ERR] batch profile upsert ({len(chunk)} rows): {e}")
            stats["errors"] += len(chunk)
        time.sleep(0.1)

    return stats


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main() -> None:
    load_env()

    parser = argparse.ArgumentParser(description="Ingest federation athlete data")
    parser.add_argument(
        "--sources",
        default=",".join(SOURCE_REGISTRY),
        help=f"Comma-separated list of sources to run ({', '.join(SOURCE_REGISTRY)})",
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

    enabled = [s for s in SOURCE_REGISTRY if s in sources_to_run]
    unknown = sources_to_run - set(SOURCE_REGISTRY)
    if unknown:
        print(f"[WARN] Unknown sources ignored: {', '.join(sorted(unknown))}")

    for i, source in enumerate(enabled, 1):
        fetch_fn, needs_claude = SOURCE_REGISTRY[source]
        print(f"\n[{i}/{len(enabled)}] {source}...")
        try:
            found = fetch_fn(claude) if needs_claude else fetch_fn()
            all_athletes.extend(found)
            print(f"  → {len(found)} athletes fetched")
        except Exception as e:
            msg = f"{source} fetch failed: {e}"
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
    index = AthleteIndex(sb)
    by_source: dict[str, list[FederationAthlete]] = {}
    for a in all_athletes:
        by_source.setdefault(a.federation, []).append(a)

    for source, athletes in by_source.items():
        print(f"  Processing {source} ({len(athletes)} athletes)...")
        stats = process_athletes(sb, index, athletes, source)
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
