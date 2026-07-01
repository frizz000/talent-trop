"""
PZKol (Polski Związek Kolarski) source — MTB XCO classification PDFs.

Athletes have nationality_confirmed=True: PZKol license = Polish registration.
Parses the Annual General Classification PDF which covers all age categories
in one document.

Source: https://pzkol.pl/101,klasyfikacje.html
"""

from __future__ import annotations

import io
import re
import time
from typing import Optional

import pdfplumber

from .base import FederationAthlete, safe_get

FEDERATION = "pzkol_mtb"

# 2024 Polish Cup MTB XCO — final general classification (all categories, 34 pages)
PDF_2024_XCO_URL = (
    "https://pzkol.pl/pobierz/12489/s/12489_koncowa_klasyfikacja_generalna_pu.pdf"
)

# Categories worth importing for Talent Scout purposes
# Maps PDF section header keywords → our ranking_category label
CATEGORY_MAP = {
    "Elite Men":              "elite_men",
    "Elita / Elite Men":      "elite_men",
    "Elita Kobiety":          "elite_women",
    "Elite Women":            "elite_women",
    "Junior / Junior Men":    "junior_men",
    "Junior Men":             "junior_men",
    "Juniorka / Junior Women":"junior_women",
    "Junior Women":           "junior_women",
    "Junior Młodszy / U17":   "u17_men",
    "Juniorka Młodsza / U17": "u17_women",
    "Młodzik / U15 Men":      "u15_men",
    "Młodziczka / U15 Women": "u15_women",
    "Żak / U13 Men":          "u13_men",
    "Żakini / U13 Women":     "u13_women",
    "Masters I / Men 30-39":  "masters_m30",
    "Masters II / Men 40+":   "masters_m40",
    "Cyklosport Mężczyźni":   "cyklosport_men",
}

# Section header detection regex — matches category lines in PZKol PDFs
_SECTION_RE = re.compile(
    r"^("
    r"Elite (Men|Women)"
    r"|Elita(?: Kobiety| / Elite Men)?"
    r"|Junior(?:ka)?(?:ka Młodsza| Młodszy)?(?: / (?:Junior|U17) (?:Men|Women))?"
    r"|Młodzik(?:zka)?(?: / U15 (?:Men|Women))?"
    r"|Żak(?:ini)?(?: / U13 (?:Men|Women))?"
    r"|Masters [I]+(?: / Men \d+[-+]\d*)"
    r"|Cyklosport (?:Mężczyźni|Kobiety)"
    r")"
)

# Line with UCI ID: position + 4 number groups + 4-digit year
# e.g.: "1 100 036 958 82 1985 GŁOWA Albert NOWOTARSKI KLUB..."
_ROW_RE = re.compile(
    r"^(\d+)\s+"                        # position
    r"\d{3}\s+\d{3}\s+\d{3}\s+\d{2}\s+"  # UCI ID (skip)
    r"(\d{4})\s+"                       # year of birth
    r"([A-ZĄĆĘŁŃÓŚŹŻ-]+)\s+"           # SURNAME (all caps, may have diacritics)
    r"([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+)?)\s+"  # Firstname(s)
    r"(.+?)\s+"                         # club (non-greedy before trailing numbers)
    r"(\d+)\s*$"                        # total points
)


def _to_float(s: str) -> Optional[float]:
    try:
        return float(s.replace(",", ".").strip())
    except (ValueError, AttributeError):
        return None


def _match_category(line: str) -> Optional[str]:
    """Return our category label if line matches a known section header."""
    line = line.strip()
    for key, label in CATEGORY_MAP.items():
        if key.lower() in line.lower():
            return label
    if _SECTION_RE.match(line):
        return "other"
    return None


def _parse_pdf(content: bytes, season: str) -> list[FederationAthlete]:
    athletes: list[FederationAthlete] = []
    current_category: Optional[str] = None

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if not text:
                continue
            for line in text.split("\n"):
                line = line.strip()
                if not line:
                    continue

                # Check for category section header
                cat = _match_category(line)
                if cat is not None:
                    current_category = cat
                    continue

                if current_category is None:
                    continue

                m = _ROW_RE.match(line)
                if m:
                    pos_str, yob, surname, firstname, club, points_str = m.groups()
                    # Strip trailing 1-3 digit numbers (round scores) from club field.
                    # 4-digit numbers (e.g. "KS Korona 1919") are preserved.
                    club = re.sub(r"(\s+\d{1,3})+$", "", club.strip())
                    # Normalize name: titlecase surname + firstname
                    full_name = f"{firstname.strip()} {surname.title()}"
                    athletes.append(FederationAthlete(
                        federation=FEDERATION,
                        external_name=full_name,
                        ranking_category=current_category,
                        season=season,
                        discipline="mtb_xco",
                        ranking_position=int(pos_str),
                        points=_to_float(points_str),
                        club=club.strip(),
                        nationality_confirmed=True,
                        extra={
                            "birth_year": int(yob),
                            "source": f"pzkol_xco_pdf_{season}",
                        },
                    ))

    return athletes


def fetch() -> list[FederationAthlete]:
    """Fetch Polish MTB athletes from PZKol classification PDF."""
    athletes: list[FederationAthlete] = []

    print("  [pzkol] Downloading MTB XCO 2024 general classification PDF...")
    try:
        resp = safe_get(PDF_2024_XCO_URL)
        found = _parse_pdf(resp.content, season="2024")
        print(f"    → {len(found)} athletes parsed")
        athletes.extend(found)
    except Exception as e:
        print(f"    [ERR] MTB PDF 2024: {e}")

    return athletes
