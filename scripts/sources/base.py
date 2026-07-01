"""
Shared types and utilities for all federation source scrapers.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional
import requests

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.7",
}


@dataclass
class FederationAthlete:
    """One athlete record from a federation source."""
    federation: str
    external_name: str              # name as it appears in source
    ranking_category: str           # 'mx2', 'senior_elite', 'lead', etc.
    season: str                     # '2025', '2024', '2024-2025'
    discipline: Optional[str] = None
    external_id: Optional[str] = None
    ranking_position: Optional[int] = None
    points: Optional[float] = None
    club: Optional[str] = None
    nationality_confirmed: bool = True  # True for PZA/PZKol (license = Polish)
    extra: dict = field(default_factory=dict)


def safe_get(url: str, timeout: int = 15, retries: int = 2, delay: float = 1.0) -> requests.Response:
    """GET with retry, returns Response or raises."""
    for attempt in range(retries + 1):
        try:
            r = requests.get(url, headers=HEADERS, timeout=timeout)
            r.raise_for_status()
            return r
        except requests.RequestException as e:
            if attempt == retries:
                raise
            time.sleep(delay * (attempt + 1))
    raise RuntimeError("unreachable")
