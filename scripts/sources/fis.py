"""
FIS (International Ski Federation) source — FIS points lists, Polish athletes.

Athletes have nationality_confirmed=True: Nationcode=POL in the FIS points
list = registered as representing Poland.

Endpoint (legacy data.fis-ski.com, still live after the Next.js redesign):
  https://data.fis-ski.com/fis_athletes/ajax/fispointslistfunctions/
      export_fispointslist.html?export_csv=true&sectorcode=AL&seasoncode=2027&listid=451

Quirks discovered 2026-07:
  - Omitting listid returns the season's Base List (published in June, stale
    mid-season). listid probing finds the newest published list.
  - listid sequence is shared across sectors but each id belongs to exactly one
    sector — probing must be done per sector.
  - Sector CC (cross-country) returns nothing from this endpoint at all.
    JP / NK have no FIS points lists (header-only CSV, ~40 bytes).
  - Working sectors: AL (alpine), SB (snowboard), FS (freestyle/park&pipe).
"""

from __future__ import annotations

import csv
import io
from datetime import date
from typing import Optional

import requests

from .base import FederationAthlete, HEADERS

FEDERATION = "fis"

EXPORT_URL = (
    "https://data.fis-ski.com/fis_athletes/ajax/fispointslistfunctions/"
    "export_fispointslist.html"
)

# Sector → discipline; 'snowboarding' matches the discipline_gaps seed naming
SECTORS = {
    "AL": "alpine_skiing",
    "SB": "snowboarding",
    "FS": "freestyle_ski",
}

# listid probing: start below the newest known id (451 in July 2026) and scan
# upward; stop after this many consecutive empty responses.
LISTID_FLOOR = 440
LISTID_MAX_MISSES = 25

GENDER_LABEL = {"M": "men", "W": "women", "F": "women"}


def current_fis_season() -> str:
    """FIS season code = calendar year the season ends in; new season starts in June."""
    today = date.today()
    return str(today.year + 1) if today.month >= 6 else str(today.year)


def _probe_latest_listid(sector: str, season: str) -> Optional[int]:
    """Scan listids upward from LISTID_FLOOR; return newest with data for sector."""
    latest = None
    misses = 0
    lid = LISTID_FLOOR
    while misses < LISTID_MAX_MISSES:
        try:
            with requests.get(
                EXPORT_URL,
                params={"export_csv": "true", "sectorcode": sector,
                        "seasoncode": season, "listid": str(lid)},
                headers=HEADERS, timeout=30, stream=True,
            ) as r:
                chunk = next(r.iter_content(2048), b"")
            # header-only responses are ~40 bytes; real lists start way bigger
            if len(chunk) > 200:
                latest = lid
                misses = 0
            else:
                misses += 1
        except requests.RequestException:
            misses += 1
        lid += 1
    return latest


def _best_event(row: dict) -> tuple[Optional[float], Optional[int], Optional[str]]:
    """Across all <EVENT>points/<EVENT>pos column pairs pick best (lowest) position."""
    best_points, best_pos, best_event = None, None, None
    for col, val in row.items():
        if not col.endswith("pos") or not val:
            continue
        try:
            pos = int(val)
        except ValueError:
            continue
        event = col[:-3]
        points_raw = row.get(f"{event}points") or ""
        try:
            points = float(points_raw)
        except ValueError:
            points = None
        if best_pos is None or pos < best_pos:
            best_points, best_pos, best_event = points, pos, event
    return best_points, best_pos, best_event


def _parse_csv(text: str, sector: str, discipline: str, season: str) -> list[FederationAthlete]:
    athletes: list[FederationAthlete] = []
    reader = csv.DictReader(io.StringIO(text))

    for row in reader:
        if (row.get("Nationcode") or "").strip() != "POL":
            continue

        lastname = (row.get("Lastname") or "").strip()
        firstname = (row.get("Firstname") or "").strip()
        if not lastname or not firstname or lastname == ".":
            continue
        name = f"{firstname} {lastname.title()}"

        gender = GENDER_LABEL.get((row.get("Gender") or "").strip().upper(), "unknown")
        birth_year = None
        if (row.get("Birthyear") or "").strip().isdigit():
            birth_year = int(row["Birthyear"].strip())

        points, pos, event = _best_event(row)

        athletes.append(FederationAthlete(
            federation=FEDERATION,
            external_name=name,
            ranking_category=f"{sector.lower()}_{gender}",
            season=season,
            discipline=discipline,
            external_id=(row.get("Fiscode") or "").strip() or None,
            ranking_position=pos,
            points=points,
            club=(row.get("Skiclub") or "").strip() or None,
            nationality_confirmed=True,
            extra={
                "birth_year": birth_year,
                "birth_date": (row.get("Birthdate") or "").strip() or None,
                "best_event": event,
                "fis_list": (row.get("Listname") or "").strip() or None,
                "sector": sector,
                "source": f"fis_points_list_{season}",
            },
        ))

    return athletes


def fetch() -> list[FederationAthlete]:
    """Fetch Polish athletes from the newest FIS points list per sector."""
    season = current_fis_season()
    athletes: list[FederationAthlete] = []

    for sector, discipline in SECTORS.items():
        print(f"  [fis] {sector} ({discipline}) season={season}: probing latest list...")
        try:
            listid = _probe_latest_listid(sector, season)
            params = {"export_csv": "true", "sectorcode": sector, "seasoncode": season,
                      "listid": str(listid) if listid else ""}
            resp = requests.get(EXPORT_URL, params=params, headers=HEADERS, timeout=120)
            resp.raise_for_status()
            if len(resp.text) < 200:
                print(f"    [WARN] {sector}: empty list (listid={listid})")
                continue
            found = _parse_csv(resp.text, sector, discipline, season)
            print(f"    → listid={listid or 'base'}, {len(found)} POL athletes")
            athletes.extend(found)
        except Exception as e:
            print(f"    [ERR] {sector}: {e}")

    return athletes
