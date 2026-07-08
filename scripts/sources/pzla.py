"""
PZLA (Polski Związek Lekkiej Atletyki) source — season leaders per age category.

Athletes have nationality_confirmed=True: PZLA license = Polish registration.
Scrapes statystyka.pzla.pl "Liderzy sezonu" tables (stat.php) for U16/U18/U20,
men and women, all events.

Notes:
  - Broken cert chain on statystyka.pzla.pl → verify=False required.
  - Season code format: '2025L' (summer / lato) or '2026Z' (winter / hala).
    Plain '2025' returns an empty page — this cost a day of research once.
  - stat.php returns one big <table>; event sections are rows like '100 m M',
    result rows have 15+ cells.

Source: https://statystyka.pzla.pl/
"""

from __future__ import annotations

import re
from datetime import date
from typing import Optional

import requests
import urllib3
from bs4 import BeautifulSoup

from .base import FederationAthlete, HEADERS

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

FEDERATION = "pzla"

STAT_URL = "https://statystyka.pzla.pl/stat.php"

# kat param → age category label
AGE_CATEGORIES = {
    "3": "u20",
    "4": "u18",
    "5": "u16",
}

GENDERS = {"M": "men", "K": "women"}

# Top N per event to import — leaders only, not full depth
MAX_PER_EVENT = 12

# Event header row, e.g. '100 m M', 'Skok w dal K', 'Rzut oszczepem (700g) M'
_EVENT_HEADER_RE = re.compile(r"^(.{2,50}?)\s+(M|K)$")

# Relay events list whole team rosters in the name cell — skip the section
_RELAY_EVENT_RE = re.compile(r"4\s*x|sztafet", re.IGNORECASE)

# Position cell: '1.' / '12.'
_POS_RE = re.compile(r"^(\d+)\.?$")


def season_candidates() -> list[str]:
    """
    PZLA season codes, newest first: April–October = summer '<year>L',
    otherwise indoor '<year>Z'. The current season can 500 server-side before
    PZLA generates it (seen 2026-07: 2026L → HTTP 500, 2025L fine), so the
    previous season is returned as fallback.
    """
    today = date.today()
    if 4 <= today.month <= 10:
        return [f"{today.year}L", f"{today.year - 1}L"]
    year = today.year + 1 if today.month >= 11 else today.year
    return [f"{year}Z", f"{year - 1}Z"]


def _slugify_event(name: str) -> str:
    name = name.lower().strip()
    name = (name.replace("ą", "a").replace("ć", "c").replace("ę", "e")
                .replace("ł", "l").replace("ń", "n").replace("ó", "o")
                .replace("ś", "s").replace("ź", "z").replace("ż", "z"))
    name = re.sub(r"[^a-z0-9]+", "_", name).strip("_")
    return name[:40]


def _normalize_name(raw: str) -> Optional[str]:
    """'POZYCHANIUK Vladyslav' → 'Vladyslav Pozychaniuk'."""
    raw = raw.strip()
    m = re.match(r"^([A-ZĄĆĘŁŃÓŚŹŻ' -]+)\s+([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż' -]+.*)$", raw)
    if not m:
        return None
    surname, firstname = m.groups()
    return f"{firstname.strip()} {surname.strip().title()}"


def _parse_leaders(html: str, season: str, age_cat: str, gender: str) -> list[FederationAthlete]:
    soup = BeautifulSoup(html, "lxml")
    athletes: list[FederationAthlete] = []
    current_event: Optional[str] = None
    count_in_event = 0

    for tr in soup.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
        if not cells or not any(cells):
            continue

        # Event section header: short row whose text ends with gender marker
        if len(cells) <= 3:
            m = _EVENT_HEADER_RE.match(cells[0])
            if m:
                event = m.group(1).strip()
                current_event = None if _RELAY_EVENT_RE.search(event) else event
                count_in_event = 0
            continue

        if current_event is None or count_in_event >= MAX_PER_EVENT:
            continue
        if len(cells) < 12:
            continue

        pos_m = _POS_RE.match(cells[0])
        if not pos_m:
            continue

        name = _normalize_name(cells[4])
        if not name:
            continue

        result = cells[1] or None
        club = cells[5] or None
        birth_year = None
        if cells[7].isdigit() and len(cells[7]) == 4:
            birth_year = int(cells[7])
        license_id = cells[8] or None
        venue = cells[11] if len(cells) > 11 else None
        result_date = cells[12] if len(cells) > 12 else None

        count_in_event += 1
        athletes.append(FederationAthlete(
            federation=FEDERATION,
            external_name=name,
            ranking_category=f"{age_cat}_{gender}_{_slugify_event(current_event)}",
            season=season,
            discipline="athletics",
            external_id=license_id,
            ranking_position=int(pos_m.group(1)),
            points=None,
            club=club,
            nationality_confirmed=True,
            extra={
                "event": current_event,
                "result": result,
                "birth_year": birth_year,
                "venue": venue,
                "result_date": result_date,
                "source": f"pzla_leaders_{season}",
            },
        ))

    return athletes


def _fetch_leaders(season: str, kat: str, plec: str) -> str:
    resp = requests.get(
        STAT_URL,
        params={
            "Res": "0", "Sezon": season, "Wojew": "",
            "Plec": plec, "kat": kat, "All": "1", "Ile": "10",
        },
        headers=HEADERS,
        timeout=60,
        verify=False,  # broken cert chain on statystyka.pzla.pl
    )
    resp.raise_for_status()
    return resp.text


def fetch() -> list[FederationAthlete]:
    """Fetch season leaders for U16/U18/U20 men and women from PZLA."""
    athletes: list[FederationAthlete] = []

    # Pick the newest season the server can actually generate
    season = None
    for candidate in season_candidates():
        try:
            html = _fetch_leaders(candidate, "3", "M")
            if _parse_leaders(html, candidate, "u20", "men"):
                season = candidate
                break
        except Exception as e:
            print(f"  [pzla] season {candidate} unavailable: {e}")
    if season is None:
        print("  [pzla] [ERR] no working season found")
        return athletes

    print(f"  [pzla] using season {season}")
    for kat, age_cat in AGE_CATEGORIES.items():
        for plec, gender in GENDERS.items():
            print(f"  [pzla] {age_cat} {gender} season={season}...")
            try:
                html = _fetch_leaders(season, kat, plec)
                found = _parse_leaders(html, season, age_cat, gender)
                print(f"    → {len(found)} entries")
                athletes.extend(found)
            except Exception as e:
                print(f"    [ERR] {age_cat} {gender}: {e}")

    return athletes
