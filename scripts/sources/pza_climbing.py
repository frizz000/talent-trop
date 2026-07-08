"""
PZA (Polski Związek Alpinizmu) sport climbing source.

Two data feeds:
  2024 — PDF from pza.org.pl  (senior women + men, all disciplines)
  2025 — Google Sheet (partial season, updates throughout year)

All athletes have nationality_confirmed=True: PZA license = Polish citizenship or
residence-based registration. Source is authoritative for Polish climbers.
"""

from __future__ import annotations

import csv
import io
import re
import time
from typing import Optional

import pdfplumber
import requests

from .base import FederationAthlete, safe_get

FEDERATION = "pza"

# 2024 senior ranking PDF
PDF_2024_URL = "https://pza.org.pl/wp-content/uploads/2024/12/rankingi-PP-se.pdf"

# 2025 Google Sheet (gviz CSV export — works for public sheets).
# One tab per age category; each tab holds three sections:
# I. BOULDERING / II. PROWADZENIE / III. NA CZAS
SHEET_2025_ID = "1awEI4hufZosohOHjYvBEDOLjCA9QRFDFBQ1C7jyrzL8"

# (tab label, gid, category base) — u16 = młodzik (14–15) is the core scouting target
SHEET_2025_TABS = [
    ("Seniorki",         "558643199",  "senior_women"),
    ("Seniorzy",         "1888516028", "senior_men"),
    ("Młodzieżowcy K",   "818673912",  "u23_women"),
    ("Młodzieżowcy M",   "1731578676", "u23_men"),
    ("juniorki",         "1589159308", "junior_women"),
    ("juniorzy",         "976938634",  "junior_men"),
    ("juniorki młodsze", "512298903",  "u18_women"),
    ("juniorzy młodsi",  "1940627993", "u18_men"),
    ("młodziczki",       "2087637623", "u16_women"),
    ("młodzicy",         "1473897075", "u16_men"),
]


def _sheet_tab_url(gid: str) -> str:
    return (
        f"https://docs.google.com/spreadsheets/d/{SHEET_2025_ID}"
        f"/gviz/tq?tqx=out:csv&gid={gid}"
    )


# ─── Helpers ────────────────────────────────────────────────────────────────

def _title(name: str) -> str:
    """Title-case a Polish name string."""
    return " ".join(w.capitalize() for w in name.strip().split())


def _to_float(s: str) -> Optional[float]:
    try:
        return float(s.replace(",", ".").strip())
    except (ValueError, AttributeError):
        return None


def _category_from_header(header: str) -> tuple[str, str]:
    """
    Parse a section header from PZA data into (ranking_category, discipline).
    Header examples: 'panowie bouldering czas prowadzenie czas prowadzenie punkty'
                     'panie bouldering czas ...'
    """
    h = header.lower()
    gender = "women" if any(x in h for x in ["panie", "seniorki", "kobiet"]) else "men"
    if "bouldering" in h or "boulder" in h:
        disc = "bouldering"
    elif "prowadzenie" in h or "lead" in h:
        disc = "lead"
    elif "czas" in h or "speed" in h:
        disc = "speed"
    else:
        disc = "combined"
    return f"senior_{gender}_{disc}", disc


# ─── PDF 2024 ────────────────────────────────────────────────────────────────

# PZA PDF line pattern: "POS FIRSTNAME LASTNAME CLUB ... TOTAL"
# e.g.: "1 Zofia Kurz KS Skarpa Bytom 17 205 6 495 1 1000 1700"
_PDF_ROW_RE = re.compile(
    r"^(\d+)\s+"                                          # position
    r"([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+(?:-[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+)?)\s+"  # firstname
    r"([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+(?:-[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+)?)\s+"  # lastname
    r"(.+?)\s+"                                           # club (non-greedy)
    r"(\d+)\s*$"                                          # total points
)

# Category section headers in PDF
_PDF_SECTION_RE = re.compile(
    r"^(panie|panowie)\s+(bouldering|prowadzenie|czas|speed|lead|boul)",
    re.IGNORECASE,
)


def _parse_pdf_2024(content: bytes) -> list[FederationAthlete]:
    athletes: list[FederationAthlete] = []
    current_category = "senior_general"
    current_discipline = "climbing"

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if not text:
                continue
            for line in text.split("\n"):
                line = line.strip()
                if not line:
                    continue

                # Detect section headers
                m_sec = _PDF_SECTION_RE.match(line)
                if m_sec:
                    current_category, current_discipline = _category_from_header(line)
                    continue

                m = _PDF_ROW_RE.match(line)
                if m:
                    pos_str, firstname, lastname, club, points_str = m.groups()
                    # Strip trailing per-round "position score" number pairs from the
                    # club field (e.g. "KS Skarpa Bytom 17 205 6 495 1 1000").
                    # Requires >=2 trailing numbers so club-name years survive.
                    club = re.sub(r"(\s+\d{1,4}){2,}$", "", club.strip())
                    full_name = f"{firstname} {lastname}"
                    athletes.append(FederationAthlete(
                        federation=FEDERATION,
                        external_name=full_name,
                        ranking_category=current_category,
                        season="2024",
                        discipline=current_discipline,
                        ranking_position=int(pos_str),
                        points=_to_float(points_str),
                        club=club.strip(),
                        nationality_confirmed=True,
                        extra={"source": "pza_pdf_2024", "birth_year": None},
                    ))

    return athletes


# ─── Google Sheet 2025 ───────────────────────────────────────────────────────

# Discipline section markers inside each tab
_SHEET_SECTION_RE = re.compile(
    r"(I{1,3})\.\s*(BOULDERING|PROWADZENIE|NA CZAS)", re.IGNORECASE
)
_SECTION_DISCIPLINE = {
    "bouldering": "bouldering",
    "prowadzenie": "lead",
    "na czas": "speed",
}


def _parse_sheet_tab(csv_text: str, category_base: str) -> list[FederationAthlete]:
    """Parse one age-category tab; rows carry a running discipline section."""
    athletes: list[FederationAthlete] = []
    reader = list(csv.reader(io.StringIO(csv_text)))

    current_discipline = "bouldering"  # section I opens every tab

    for row in reader:
        if not row:
            continue

        # Clean whitespace and non-breaking spaces
        row = [cell.replace("\xa0", " ").strip() for cell in row]
        full_text = " ".join(row)

        m_sec = _SHEET_SECTION_RE.search(full_text)
        if m_sec:
            current_discipline = _SECTION_DISCIPLINE[m_sec.group(2).lower()]
            continue

        first = row[0] if row else ""

        # Athlete row: first column is a digit (position)
        if not re.match(r"^\d+$", first) or len(row) < 4:
            continue

        pos = int(first)
        firstname = row[1]
        lastname = row[2]
        club = row[3]

        # Total points: last non-empty numeric cell
        points = None
        for cell in reversed(row[4:]):
            p = _to_float(cell)
            if p is not None:
                points = p
                break

        if not firstname or not lastname:
            continue

        athletes.append(FederationAthlete(
            federation=FEDERATION,
            external_name=_title(f"{firstname} {lastname}"),
            ranking_category=f"{category_base}_{current_discipline}",
            season="2025",
            discipline=current_discipline,
            ranking_position=pos,
            points=points,
            club=club or None,
            nationality_confirmed=True,
            extra={"source": "pza_sheet_2025"},
        ))

    return athletes


# ─── Public entry point ──────────────────────────────────────────────────────

def fetch() -> list[FederationAthlete]:
    """Fetch Polish climbing athletes from PZA (2024 PDF + 2025 Sheet)."""
    athletes: list[FederationAthlete] = []

    # 2024 PDF
    print("  [pza] Downloading 2024 senior ranking PDF...")
    try:
        resp = safe_get(PDF_2024_URL)
        found = _parse_pdf_2024(resp.content)
        print(f"    → {len(found)} athletes parsed from 2024 PDF")
        athletes.extend(found)
    except Exception as e:
        print(f"    [ERR] 2024 PDF: {e}")

    # 2025 Google Sheet — one tab per age category (seniors down to U16)
    for label, gid, category_base in SHEET_2025_TABS:
        time.sleep(0.5)
        print(f"  [pza] Downloading 2025 sheet tab '{label}' ({category_base})...")
        try:
            resp = safe_get(_sheet_tab_url(gid))
            found = _parse_sheet_tab(resp.text, category_base)
            print(f"    → {len(found)} athletes")
            athletes.extend(found)
        except Exception as e:
            print(f"    [ERR] tab {label}: {e}")

    return athletes
