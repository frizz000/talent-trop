"""
PZM Motocross source — scrapes motoresults.pl season standings.

Covers Polish National Championship categories for the current season.
Foreign riders compete in Polish championships, so we use LLM (Claude Haiku)
to filter non-Polish athletes based on name + club heuristics.

Source: https://wyniki.motoresults.pl/en/2025/Motocross/AMIC
"""

from __future__ import annotations

import json
import re
import time
from typing import Optional
import anthropic
from bs4 import BeautifulSoup

from .base import FederationAthlete, safe_get

BASE_URL = "https://wyniki.motoresults.pl"
FEDERATION = "pzm_motocross"
SEASON = "2025"

# Classes to scrape — format: (display_name, ranking_category, standings_url_path)
# URL pattern: /en/2025/Motocross/AMIC/{CLASS}/klasyfikacja-indywidualna-sezonu/z_{ID}_200
AMIC_CATEGORIES = [
    ("MX Kobiet",     "mx_women",    "/en/2025/Motocross/AMIC/MX-Kobiet/klasyfikacja-indywidualna-sezonu/z_10136_200"),
    ("MX65",          "mx65",        "/en/2025/Motocross/AMIC/MX65/klasyfikacja-indywidualna-sezonu/z_53_200"),
    ("MX85",          "mx85",        "/en/2025/Motocross/AMIC/MX85/klasyfikacja-indywidualna-sezonu/z_54_200"),
    ("MX Junior",     "mx_junior",   "/en/2025/Motocross/AMIC/MX-Junior/klasyfikacja-indywidualna-sezonu/z_10221_200"),
    ("MX2",           "mx2",         "/en/2025/Motocross/AMIC/MX2/klasyfikacja-indywidualna-sezonu/z_56_200"),
    ("MX Open",       "mx_open",     "/en/2025/Motocross/AMIC/MX-Open/klasyfikacja-indywidualna-sezonu/z_10094_200"),
    ("MX1 B",         "mx1b",        "/en/2025/Motocross/AMIC/MX1-B/klasyfikacja-indywidualna-sezonu/z_10545_200"),
    ("MX2 B",         "mx2b",        "/en/2025/Motocross/AMIC/MX2-B/klasyfikacja-indywidualna-sezonu/z_10546_200"),
    ("MX Masters",    "mx_masters",  "/en/2025/Motocross/AMIC/MX-Masters/klasyfikacja-indywidualna-sezonu/z_10131_200"),
    ("MX Masters 50+","mx_masters50","/en/2025/Motocross/AMIC/MX-Masters-50%2B/klasyfikacja-indywidualna-sezonu/z_10302_200"),
]


def _normalize_name(raw: str) -> str:
    """
    Convert motoresults name format to 'Firstname Surname'.
    Input: 'Dawid ZAREMBA' or 'ZAREMBA Dawid' → 'Dawid Zaremba'
    """
    parts = raw.strip().split()
    normalized = []
    for p in parts:
        if p.isupper():
            normalized.append(p.capitalize())
        else:
            normalized.append(p.capitalize())
    return " ".join(normalized)


def _parse_standings_table(html: str, category_name: str) -> list[dict]:
    """
    Extract athlete rows from motoresults.pl standings HTML.

    Table layout (20 cols per data row):
      [0]  position
      [1]  race number
      [2]  competitor name ('Firstname SURNAME')
      [3-5] empty (colspan merge)
      [6]  club
      [7]  make (bike brand)
      [8-10] empty
      [11-18] race heat results ('score#place' or '-' or 'DNS')
      [19] total season points
    """
    soup = BeautifulSoup(html, "lxml")
    rows = []

    for table in soup.find_all("table"):
        # Find the data table by checking header row has 'Competitor' column
        headers_text = table.get_text()
        if "Competitor" not in headers_text and "Zawodnik" not in headers_text:
            continue

        trs = table.find_all("tr")
        # Skip header rows (those with non-integer first cell)
        for tr in trs:
            cells = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
            if len(cells) < 7:
                continue
            if not re.match(r"^\d+$", cells[0]):
                continue  # header or sub-header row

            pos_str = cells[0]
            name_raw = cells[2] if len(cells) > 2 else ""
            club = cells[6] if len(cells) > 6 else ""
            # Total points in last cell
            points_str = cells[-1] if cells else ""

            if not name_raw or len(name_raw) < 3:
                continue

            pos = int(pos_str)
            name = _normalize_name(name_raw)
            try:
                points = float(points_str)
            except (ValueError, TypeError):
                points = None

            rows.append({
                "pos": pos,
                "name": name,
                "club": club or None,
                "points": points,
            })
        break  # use first matching table

    return rows


def _filter_polish_riders(
    claude: anthropic.Anthropic,
    riders: list[dict],
    category_name: str,
) -> list[dict]:
    """
    Use Claude Haiku to identify non-Polish riders.
    On JSON parse failure: keep all riders (conservative — never miss Polish athletes).
    """
    if not riders:
        return []

    rider_list = "\n".join(
        f"{i+1}. {r['name']} — klub: {r.get('club', 'unknown')}"
        for i, r in enumerate(riders)
    )

    prompt = f"""Classify riders in a Polish motocross championship ({category_name}).
Most are Polish; some foreign riders enter. Identify the NON-Polish ones.

For each rider: is_polish = true (clearly Polish name+club), false (clearly foreign), null (uncertain).
Polish clubs: Motocross, KM, WKM, AK, CAMK, Automobilklub, MX, Pit Lane, etc.
Non-Polish clues: Baltic/Latvian letters (š,ž,ņ,ķ), Slavic non-Polish patterns, Western European names.

Riders:
{rider_list}

Respond with JSON array ONLY, no explanation, no markdown fences:
[{{"i":1,"p":true}},{{"i":2,"p":false}}]"""

    try:
        response = claude.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        # Strip markdown fences if present
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()
        # Ensure the JSON is complete — truncated responses end with incomplete objects
        if raw and not raw.endswith("]"):
            # Try to repair: close last incomplete object and array
            last_complete = raw.rfind("}")
            if last_complete > 0:
                raw = raw[: last_complete + 1] + "]"

        results = json.loads(raw)
        # Support both {"id_index":N,"is_polish":...} and {"i":N,"p":...}
        polish_set: set[int] = set()
        for r in results:
            idx = r.get("id_index", r.get("i", 0)) - 1
            val = r.get("is_polish", r.get("p"))
            if val is True or val is None:
                polish_set.add(idx)

        return [riders[i] for i in range(len(riders)) if i in polish_set]

    except (json.JSONDecodeError, Exception) as e:
        print(f"    [WARN] LLM filter failed ({e}), keeping all riders (conservative)")
        return riders


def fetch(claude: anthropic.Anthropic) -> list[FederationAthlete]:
    """Scrape all AMIC categories and return Polish riders."""
    athletes: list[FederationAthlete] = []

    for display_name, category, path in AMIC_CATEGORIES:
        url = BASE_URL + path
        print(f"  [motocross] {display_name}...")
        try:
            resp = safe_get(url)
            rows = _parse_standings_table(resp.text, display_name)
            if not rows:
                print(f"    → no rows found, skipping")
                continue
            print(f"    → {len(rows)} riders scraped, filtering Polish...")

            # Filter in batches of 10 (keep small to avoid LLM token cutoff)
            polish_rows: list[dict] = []
            batch_size = 10
            for i in range(0, len(rows), batch_size):
                batch = rows[i:i + batch_size]
                polish_rows.extend(_filter_polish_riders(claude, batch, display_name))
                time.sleep(0.3)

            print(f"    → {len(polish_rows)} Polish riders kept")

            for r in polish_rows:
                athletes.append(FederationAthlete(
                    federation=FEDERATION,
                    external_name=r["name"],
                    ranking_category=category,
                    season=SEASON,
                    discipline="motocross",
                    ranking_position=r.get("pos"),
                    points=r.get("points"),
                    club=r.get("club"),
                    nationality_confirmed=False,  # LLM-based, not license-based
                    extra={
                        "source_url": url,
                        "category_display": display_name,
                    },
                ))

        except Exception as e:
            print(f"    [ERR] {display_name}: {e}")

        time.sleep(0.5)

    return athletes
