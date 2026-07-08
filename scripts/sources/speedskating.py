"""
Speed skating source — speedskatingresults.com open JSON API, Polish skaters.

Athletes have nationality_confirmed=True: country=POL in the ISU results
archive = licensed for Poland.

Primary data: national top-N per distance per season (rank + time) via
topn.php — only skaters with actual results, no dead archive entries.
Each skater is enriched with their ISU age category (C=13-14, B=15-16,
A=17-18 junior, N=19-22 neo-senior) via one skater_lookup.php call per
unique surname appearing in the top-N lists. (Full-directory enumeration
by prefix expansion was tried first and explodes into thousands of
requests — skater_lookup caps at 20 rows with no pagination.)

Season numbering: the season param is the year the season starts in
(Nov 2025 – Mar 2026 → season=2025).

API: https://speedskatingresults.com/index.php?p=200
"""

from __future__ import annotations

import re
import time
from datetime import date

from .base import FederationAthlete, safe_get

FEDERATION = "speed_skating_isu"

API_BASE = "https://speedskatingresults.com/api/json"

_YOUTH_CATEGORY_RE = re.compile(r"^([ABCN])\d?$", re.IGNORECASE)

# distance (m) → genders to fetch
DISTANCES = {
    500: ("m", "f"),
    1000: ("m", "f"),
    1500: ("m", "f"),
    3000: ("m", "f"),
    5000: ("m", "f"),
    10000: ("m",),
}

TOP_N = 50

GENDER_LABEL = {"m": "men", "f": "women"}


def current_season_start_year() -> int:
    """Season starts in November: Jul 2026 → 2025 (the 2025/26 season)."""
    today = date.today()
    return today.year if today.month >= 11 else today.year - 1


def _lookup_categories(surnames: set[str]) -> dict[int, str]:
    """skater id → ISU category, one lookup per unique top-N surname."""
    categories: dict[int, str] = {}
    for surname in sorted(surnames):
        try:
            resp = safe_get(
                f"{API_BASE}/skater_lookup.php?country=POL&familyname={surname}",
                timeout=30,
            )
            for s in resp.json().get("skaters") or []:
                if s.get("id") and s.get("category"):
                    categories[s["id"]] = str(s["category"]).strip()
        except Exception:
            pass
        time.sleep(0.15)
    print(f"    (category lookup: {len(surnames)} surnames, {len(categories)} categorized)")
    return categories


def _fetch_topn(season: int, distance: int, gender: str) -> list[dict]:
    resp = safe_get(
        f"{API_BASE}/topn.php?season={season}&country=POL"
        f"&distance={distance}&gender={gender}&top={TOP_N}",
        timeout=30,
    )
    return resp.json().get("topn") or []


def fetch() -> list[FederationAthlete]:
    """Fetch nationally ranked Polish speed skaters (top-N per distance)."""
    season_year = current_season_start_year()
    season = f"{season_year}-{season_year + 1}"
    athletes: list[FederationAthlete] = []

    # 1. Top-N lists per distance
    print(f"  [speedskating] Fetching top-{TOP_N} lists, season {season}...")
    topn_lists: list[tuple[int, str, list[dict]]] = []
    surnames: set[str] = set()
    for distance, genders in DISTANCES.items():
        for g in genders:
            gender = GENDER_LABEL[g]
            try:
                rows = _fetch_topn(season_year, distance, g)
            except Exception as e:
                print(f"    [ERR] topn {distance}m {gender}: {e}")
                continue
            print(f"    {distance}m {gender}: {len(rows)} ranked")
            topn_lists.append((distance, gender, rows))
            for row in rows:
                familyname = ((row.get("skater") or {}).get("familyname") or "").strip()
                if familyname:
                    surnames.add(familyname)
            time.sleep(0.2)

    # 2. Age categories for the surnames that actually appear
    categories = _lookup_categories(surnames)

    # 3. Build records
    for distance, gender, rows in topn_lists:
        for row in rows:
            skater = row.get("skater") or {}
            givenname = (skater.get("givenname") or "").strip()
            familyname = (skater.get("familyname") or "").strip()
            if not givenname or not familyname:
                continue

            skater_id = skater.get("id")
            isu_category = categories.get(skater_id, "")
            is_youth = bool(_YOUTH_CATEGORY_RE.match(isu_category))
            cat_prefix = f"cat_{isu_category.lower()}_" if is_youth else ""

            athletes.append(FederationAthlete(
                federation=FEDERATION,
                external_name=f"{givenname} {familyname}",
                ranking_category=f"{cat_prefix}{distance}m_{gender}",
                season=season,
                discipline="speed_skating",
                external_id=str(skater_id) if skater_id else None,
                ranking_position=row.get("rank"),
                points=None,
                club=None,
                nationality_confirmed=True,
                extra={
                    "time": row.get("time"),
                    "isu_category": isu_category or None,
                    "result_date": row.get("date"),
                    "location": row.get("location"),
                    "event": row.get("event"),
                    "source": "speedskatingresults_topn",
                },
            ))

    return athletes
