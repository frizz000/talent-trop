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
        # The sidebar lists other events' Miejsce/Dyscyplina too — the main
        # event's fields come first, so keep only the first occurrence of each.
        for i, line in enumerate(lines):
            key = line.rstrip(":").lower()
            if line in ("Miejsce:", "Ranga:", "Dyscyplina:") and i + 1 < len(lines) and key not in out:
                out[key] = lines[i + 1].strip()
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
# PZM / motoresults.pl — motocross + superenduro calendars
# ---------------------------------------------------------------------------

MOTORESULTS_BASE = "https://wyniki.motoresults.pl"

# (sport path, series code, our discipline, series label for importance)
MOTORESULTS_SERIES = [
    ("Motocross", "MP", "motocross", "Mistrzostwa Polski"),
    ("Motocross", "PP", "motocross", "Puchar Polski"),
    ("Motocross", "AMIC", "motocross", "AMIC Energy Motocross Cup"),
    ("SuperEnduro", "MS", "superenduro", "Mistrzostwa Świata"),
]

_MONTHS_EN = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11,
    "december": 12,
}


def _parse_motoresults_title(title: str, year: int) -> dict | None:
    """
    '<name> - <venue>, 21 June | MP Motocross 2026 | motoresults'
    '<name> - <venue>, 20-21 June | ...' → start/end range.
    """
    head = title.split("|")[0].strip()
    m = re.match(
        r"^(?P<name>.+?)\s*-\s*(?P<venue>[^,]+),\s*"
        r"(?P<d1>\d{1,2})(?:\s*[-–]\s*(?P<d2>\d{1,2}))?\s+(?P<month>[A-Za-z]+)$",
        head,
    )
    if not m:
        return None
    month = _MONTHS_EN.get(m.group("month").lower())
    if not month:
        return None
    start = f"{year}-{month:02d}-{int(m.group('d1')):02d}"
    end = f"{year}-{month:02d}-{int(m.group('d2')):02d}" if m.group("d2") else None
    return {
        "name": m.group("name").strip(),
        "location": m.group("venue").strip(),
        "start_date": start,
        "end_date": end,
    }


def fetch_pzm_events(year: int | None = None) -> list[dict]:
    year = year or date.today().year
    events: list[dict] = []
    for sport, series, discipline, series_label in MOTORESULTS_SERIES:
        index_url = f"{MOTORESULTS_BASE}/en/{year}/{sport}/{series}"
        print(f"  [pzm] {index_url}")
        try:
            resp = requests.get(index_url, headers=HEADERS, timeout=20)
            resp.raise_for_status()
        except Exception as e:
            print(f"    [WARN] {e}")
            continue

        # Event detail links end with /e_<id>; dates live in the detail <title>
        hrefs = sorted(set(re.findall(
            rf"href=\"({re.escape(f'/en/{year}/{sport}/{series}')}/[^\"]*?/e_\d+)\"",
            resp.text,
        )))
        for href in hrefs:
            try:
                detail = requests.get(MOTORESULTS_BASE + href, headers=HEADERS, timeout=20)
                detail.raise_for_status()
                title_m = re.search(r"<title>(.*?)</title>", detail.text, re.S)
                if not title_m:
                    continue
                parsed = _parse_motoresults_title(title_m.group(1).strip(), year)
                if not parsed:
                    continue
                # Generic round names ("Round 1") need the sport for context
                if not re.search(sport.replace("-", ".?"), parsed["name"], re.IGNORECASE):
                    parsed["name"] = f"{sport} {parsed['name']}"
                parsed["name"] = f"{parsed['name']} ({series_label})"
                parsed["discipline"] = discipline
                parsed["importance_level"] = importance_from_name(series_label)
                events.append(parsed)
            except Exception as e:
                print(f"    [WARN] detail {href}: {e}")
            time.sleep(0.3)
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
    parser.add_argument("--sources", default="pza,pzkol,pzm")
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
        print("\n[1/3] PZA climbing calendar...")
        try:
            found = fetch_pza_events()
            print(f"  → {len(found)} events")
            all_events.extend(found)
        except Exception as e:
            errors.append(f"pza: {e}")
            print(f"  [ERR] {e}")

    if "pzkol" in sources:
        print("\n[2/3] PZKol cycling calendar...")
        try:
            found = fetch_pzkol_events()
            print(f"  → {len(found)} events")
            all_events.extend(found)
        except Exception as e:
            errors.append(f"pzkol: {e}")
            print(f"  [ERR] {e}")

    if "pzm" in sources:
        print("\n[3/3] PZM motocross/superenduro (motoresults.pl)...")
        try:
            found = fetch_pzm_events()
            print(f"  → {len(found)} events")
            all_events.extend(found)
        except Exception as e:
            errors.append(f"pzm: {e}")
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
