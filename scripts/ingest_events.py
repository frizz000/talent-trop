#!/usr/bin/env python3
"""
Ingest upcoming competition events from Polish federation calendars into `events`.

Sources:
  pza    — pza.org.pl climbing calendar table (Puchar/Mistrzostwa Polski,
           junior categories J/JM/Mł in event names)
  pzkol  — pzkol.pl/kalendarz "upcoming events" widget + detail pages
           (all cycling disciplines incl. MTB XCO with youth categories)

Dedup: by (name, start_date) — checked in-script, no unique constraint needed.

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
Run: python3 scripts/ingest_events.py [--sources pza,pzkol] [--dry-run]
"""

import argparse
import os
import re
import sys
import time
from datetime import date, datetime, timezone

import requests
from bs4 import BeautifulSoup
from supabase import create_client, Client

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    )
}

PZA_HUB_URL = "https://pza.org.pl/zawody"
PZKOL_CALENDAR_URL = "https://pzkol.pl/kalendarz"

# PZKol "Dyscyplina" field → our discipline label (aligned with athletes table)
PZKOL_DISCIPLINE_MAP = {
    "MTB": "mtb_xco",
    "BMX": "BMX",
    "Szosa": "road cycling",
    "Tor": "track cycling",
    "Przełaj": "cyclocross",
    "Trial": "trial",
}


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


def importance_from_name(text: str) -> str:
    t = text.lower()
    if "mistrzostwa świata" in t or "world championship" in t or "igrzyska" in t:
        return "major"
    if "mistrzostwa europy" in t or "puchar świata" in t or "uci" in t or "ifsc" in t:
        return "international"
    if "mistrzostwa polski" in t or "puchar polski" in t:
        return "national"
    return "minor"


# ---------------------------------------------------------------------------
# PZA climbing calendar
# ---------------------------------------------------------------------------

def _pza_calendar_url() -> str | None:
    """The calendar URL has a stale year slug — resolve it from the zawody hub."""
    resp = requests.get(PZA_HUB_URL, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    for a in soup.find_all("a", href=True):
        if re.search(r"kalendarz\s*20\d\d", a.get_text(" ", strip=True), re.IGNORECASE):
            return a["href"]
    return None


def _parse_pza_date(raw: str) -> tuple[str, str | None] | None:
    """'2026-03-07/08' → ('2026-03-07', '2026-03-08'); '2026-03-29' → single."""
    raw = raw.strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})(?:/(\d{2}))?$", raw)
    if not m:
        return None
    year, month, day, end_day = m.groups()
    start = f"{year}-{month}-{day}"
    end = f"{year}-{month}-{end_day}" if end_day else None
    return start, end


def fetch_pza_events() -> list[dict]:
    url = _pza_calendar_url()
    if not url:
        print("  [pza] calendar link not found on hub page")
        return []
    print(f"  [pza] calendar: {url}")

    resp = requests.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    table = soup.find("table")
    if not table:
        print("  [pza] no table on calendar page")
        return []

    events: list[dict] = []
    for row in table.find_all("tr")[1:]:
        tds = row.find_all("td")
        if len(tds) < 3:
            continue
        name_parts = [
            s.strip()
            for s in tds[1].get_text("\n", strip=True).split("\n")
            if s.strip() and not s.strip().startswith("|")
        ]
        if not name_parts:
            continue
        name = name_parts[0]
        location = name_parts[1] if len(name_parts) > 1 else None

        parsed = _parse_pza_date(tds[2].get_text(" ", strip=True))
        if not parsed:
            continue
        start, end = parsed

        # Sub-discipline letter code: (B) bouldering, (P) prowadzenie, (C) czas
        disc = "climbing"
        codes = set(re.findall(r"\(([BPC])\)", name))
        if codes == {"B"}:
            disc = "bouldering"
        elif codes == {"P"}:
            disc = "lead climbing"
        elif codes == {"C"}:
            disc = "speed climbing"

        events.append({
            "name": name,
            "discipline": disc,
            "location": location,
            "start_date": start,
            "end_date": end,
            "importance_level": importance_from_name(name),
        })

    return events


# ---------------------------------------------------------------------------
# PZKol cycling calendar
# ---------------------------------------------------------------------------

def _parse_pzkol_range(raw: str) -> tuple[str, str | None] | None:
    """
    '3-5.07.2026'    → ('2026-07-03', '2026-07-05')
    '31.03-2.04.2026' → ('2026-03-31', '2026-04-02')
    '05.07.2026'     → ('2026-07-05', None)
    """
    raw = raw.strip()
    m = re.match(r"^(\d{1,2})\.(\d{1,2})-(\d{1,2})\.(\d{1,2})\.(\d{4})$", raw)
    if m:
        d1, m1, d2, m2, y = m.groups()
        return f"{y}-{int(m1):02d}-{int(d1):02d}", f"{y}-{int(m2):02d}-{int(d2):02d}"
    m = re.match(r"^(\d{1,2})-(\d{1,2})\.(\d{1,2})\.(\d{4})$", raw)
    if m:
        d1, d2, mo, y = m.groups()
        return f"{y}-{int(mo):02d}-{int(d1):02d}", f"{y}-{int(mo):02d}-{int(d2):02d}"
    m = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$", raw)
    if m:
        d, mo, y = m.groups()
        return f"{y}-{int(mo):02d}-{int(d):02d}", None
    return None


def _pzkol_detail(url: str) -> dict:
    """Fetch Miejsce / Ranga / Dyscyplina from a PZKol event detail page."""
    out: dict = {}
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        resp.raise_for_status()
        text = BeautifulSoup(resp.text, "html.parser").get_text("\n", strip=True)
        lines = text.split("\n")
        for i, line in enumerate(lines):
            if line in ("Miejsce:", "Ranga:", "Dyscyplina:") and i + 1 < len(lines):
                out[line.rstrip(":").lower()] = lines[i + 1].strip()
    except Exception as e:
        print(f"    [WARN] detail {url}: {e}")
    return out


def fetch_pzkol_events() -> list[dict]:
    print(f"  [pzkol] calendar: {PZKOL_CALENDAR_URL}")
    resp = requests.get(PZKOL_CALENDAR_URL, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    events: list[dict] = []
    for item in soup.find_all("div", class_="callendar-item"):
        span = item.find("span")
        link = item.find("a", href=True)
        if not span or not link:
            continue
        parsed = _parse_pzkol_range(span.get_text(" ", strip=True))
        if not parsed:
            continue
        start, end = parsed
        name = link.get_text(" ", strip=True)

        detail = _pzkol_detail(link["href"])
        time.sleep(0.3)

        ranga = detail.get("ranga", "")
        importance = importance_from_name(f"{name} {ranga}")
        discipline = PZKOL_DISCIPLINE_MAP.get(detail.get("dyscyplina", ""), "cycling")

        events.append({
            "name": name,
            "discipline": discipline,
            "location": detail.get("miejsce"),
            "start_date": start,
            "end_date": end,
            "importance_level": importance,
        })

    return events


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def upsert_events(sb: Client, events: list[dict]) -> tuple[int, int]:
    inserted = skipped = 0
    for ev in events:
        existing = (
            sb.table("events")
            .select("id")
            .eq("name", ev["name"])
            .eq("start_date", ev["start_date"])
            .limit(1)
            .execute()
        )
        if existing.data:
            skipped += 1
            continue
        sb.table("events").insert(ev).execute()
        inserted += 1
        print(f"  + {ev['start_date']}  {ev['name'][:60]}  [{ev['importance_level']}]")
    return inserted, skipped


def main() -> None:
    load_env()

    parser = argparse.ArgumentParser(description="Ingest federation event calendars")
    parser.add_argument("--sources", default="pza,pzkol")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    sources = {s.strip() for s in args.sources.split(",")}

    sb = get_supabase()
    run_resp = sb.table("ingestion_runs").insert({
        "source": "events_calendar",
        "status": "running",
        "items_processed": 0,
    }).execute()
    run_id = run_resp.data[0]["id"]

    all_events: list[dict] = []
    errors: list[str] = []

    if "pza" in sources:
        print("\n[1/2] PZA climbing calendar...")
        try:
            found = fetch_pza_events()
            print(f"  → {len(found)} events")
            all_events.extend(found)
        except Exception as e:
            errors.append(f"pza: {e}")
            print(f"  [ERR] {e}")

    if "pzkol" in sources:
        print("\n[2/2] PZKol cycling calendar...")
        try:
            found = fetch_pzkol_events()
            print(f"  → {len(found)} events")
            all_events.extend(found)
        except Exception as e:
            errors.append(f"pzkol: {e}")
            print(f"  [ERR] {e}")

    # Keep only current + future events (calendar view is forward-looking)
    today = date.today().isoformat()
    upcoming = [e for e in all_events if (e["end_date"] or e["start_date"]) >= today]
    print(f"\nFetched {len(all_events)} events, {len(upcoming)} upcoming")

    inserted = skipped = 0
    if args.dry_run:
        for ev in upcoming:
            print(f"  [DRY] {ev['start_date']}  {ev['name'][:60]}")
    else:
        inserted, skipped = upsert_events(sb, upcoming)

    sb.table("ingestion_runs").update({
        "status": "error" if errors else "success",
        "items_processed": inserted,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "error_log": "\n".join(errors) if errors else ("dry_run" if args.dry_run else None),
    }).eq("id", run_id).execute()

    print(f"\nDone. Inserted: {inserted}, duplicates skipped: {skipped}, errors: {len(errors)}")
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
