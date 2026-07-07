#!/usr/bin/env python3
"""
One-time cleanup: reject relay/team rosters ingested as single athletes.

PZLA relay events (4 x 100 m etc.) list the whole team in the name column,
which produced "athletes" like:
  'Aleksander LEPIONKA Adrian TABAKA Marcin LIBURA Sebastian Wojtasik'

Detection: sources.base.is_multi_person_name — the same heuristic that now
blocks these at ingest time (ingest_federations.process_athletes).

Sets discovery_status='rejected' (never deletes — preserves dedup trail),
which removes them from talent scoring, brand fit and all default UI views.
Safe to re-run (idempotent — already-rejected rows are skipped).

Usage: python3 scripts/cleanup_team_names.py [--dry-run]
"""

import os
import sys

from supabase import create_client, Client

from sources.base import is_multi_person_name


def load_env_local() -> None:
    """Load .env.local into os.environ if running outside GitHub Actions."""
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
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    return create_client(url, os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    load_env_local()
    sb = get_supabase()

    rows: list[dict] = []
    offset = 0
    while True:
        page = (
            sb.table("athletes")
            .select("id,name,discipline,discovery_status")
            .neq("discovery_status", "rejected")
            .range(offset, offset + 999)
            .execute()
        ).data or []
        rows.extend(page)
        if len(page) < 1000:
            break
        offset += 1000

    teams = [r for r in rows if is_multi_person_name(r["name"])]
    print(f"Athletes checked: {len(rows)}, team/relay rosters found: {len(teams)}")
    for r in teams:
        print(f"  {'[dry-run] ' if dry_run else ''}✗ {r['name']} ({r['discipline']})")

    if dry_run or not teams:
        return

    for i in range(0, len(teams), 100):
        ids = [r["id"] for r in teams[i:i + 100]]
        sb.table("athletes").update({"discovery_status": "rejected"}).in_(
            "id", ids
        ).execute()
    print(f"\nRejected {len(teams)} team/relay records.")


if __name__ == "__main__":
    main()
