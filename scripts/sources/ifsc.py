"""
IFSC (International Federation of Sport Climbing) source — Combined World
Ranking (CUWR), Polish athletes.

Athletes have nationality_confirmed=True: country=POL in IFSC rankings =
competing for Poland. Complements domestic PZA rankings with world-level
positions — key signal for scouting (a Pole ranked in the CUWR is competing
internationally, not just in the Polish Cup).

API (public JSON, requires Referer header):
  https://ifsc.results.info/api/v1/            → seasons, leagues, dcat ids
  https://ifsc.results.info/api/v1/cuwr/<dcat> → world ranking for a category
"""

from __future__ import annotations

import requests

from .base import FederationAthlete, HEADERS

FEDERATION = "ifsc"

API_BASE = "https://ifsc.results.info/api/v1"

IFSC_HEADERS = {**HEADERS, "Referer": "https://ifsc.results.info/"}

# CUWR dcat ids (stable for years): lead/speed/boulder × men/women.
# Combined (4/8) skipped — derived from the other three.
DCATS = {
    1: ("lead", "men"),
    2: ("speed", "men"),
    3: ("bouldering", "men"),
    5: ("lead", "women"),
    6: ("speed", "women"),
    7: ("bouldering", "women"),
}


def _get(url: str) -> dict:
    r = requests.get(url, headers=IFSC_HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()


def fetch() -> list[FederationAthlete]:
    """Fetch Polish athletes from IFSC Combined World Rankings."""
    athletes: list[FederationAthlete] = []

    # Season label from API root (e.g. '2026')
    season = "current"
    try:
        root = _get(f"{API_BASE}/")
        season = str(root.get("current", {}).get("season") or "current")
    except Exception as e:
        print(f"  [ifsc] [WARN] season lookup failed: {e}")

    for dcat_id, (discipline, gender) in DCATS.items():
        print(f"  [ifsc] CUWR {discipline} {gender}...")
        try:
            data = _get(f"{API_BASE}/cuwr/{dcat_id}")
            ranking = data.get("ranking") or []
            pol = [r for r in ranking if (r.get("country") or "").upper() == "POL"]
            print(f"    → {len(pol)} POL / {len(ranking)} ranked")

            for r in pol:
                firstname = (r.get("firstname") or "").strip()
                lastname = (r.get("lastname") or "").strip()
                if not firstname or not lastname:
                    continue
                name = f"{firstname} {lastname.title()}"

                score = None
                try:
                    score = float(r.get("score"))
                except (TypeError, ValueError):
                    pass

                athletes.append(FederationAthlete(
                    federation=FEDERATION,
                    external_name=name,
                    ranking_category=f"cuwr_{discipline}_{gender}",
                    season=season,
                    discipline=discipline,
                    external_id=str(r.get("athlete_id")) if r.get("athlete_id") else None,
                    ranking_position=r.get("rank"),
                    points=score,
                    club=None,
                    nationality_confirmed=True,
                    extra={
                        "photo_url": r.get("photo_url"),
                        "ranking_name": data.get("ranking_name"),
                        "source": f"ifsc_cuwr_{season}",
                    },
                ))
        except Exception as e:
            print(f"    [ERR] dcat {dcat_id}: {e}")

    return athletes
