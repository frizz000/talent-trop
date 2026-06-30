#!/usr/bin/env python3
"""
Compute talent scores for all athletes and write results to talent_score_history.
Updates athletes.talent_score with the latest computed value.

Algorithm (weighted sum, max 100):
  a) age_factor           — 0–25 pts  (younger = higher)
  b) mention_spike_factor — 0–25 pts  (log scale of recent article count)
  c) sentiment_factor     — 0–20 pts  (positive vs negative article ratio)
  d) social_signal_factor — 0–20 pts  (engagement rate / viral signal)
  × discipline_gap_multiplier — 1.0–1.5× (undercovered discipline = boost)

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
Run: python scripts/compute_talent_score.py
"""

import math
import os
import sys
from datetime import datetime, timedelta, timezone

from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.", file=sys.stderr)
    sys.exit(1)

db = create_client(SUPABASE_URL, SUPABASE_KEY)

# Cache discipline gap multipliers to avoid N queries
_gap_cache: dict[str, float] = {}


def age_factor(birth_date_str: str | None) -> float:
    """Younger athletes score higher. Max 25 pts."""
    if not birth_date_str:
        return 10.0
    try:
        bd = datetime.fromisoformat(birth_date_str)
    except ValueError:
        return 10.0
    age = (datetime.now() - bd).days / 365.25
    if age < 18:
        return 25.0
    if age < 21:
        return 22.0
    if age < 23:
        return 18.0
    if age < 25:
        return 14.0
    if age < 27:
        return 10.0
    return 5.0


def mention_spike_factor(athlete_id: str, since_days: int = 30) -> float:
    """Multi-source mention count, log scale. Max 25 pts."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=since_days)).isoformat()
    res = (
        db.from_("news_articles")
        .select("id", count="exact")
        .eq("athlete_id", athlete_id)
        .gte("published_at", cutoff)
        .execute()
    )
    count = res.count or 0
    if count == 0:
        return 0.0
    return min(25.0, 10.0 * math.log(count + 1))


def sentiment_factor(athlete_id: str, since_days: int = 30) -> float:
    """Positive vs negative article ratio. Max 20 pts, default 10 if no data."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=since_days)).isoformat()
    res = (
        db.from_("news_articles")
        .select("sentiment")
        .eq("athlete_id", athlete_id)
        .gte("published_at", cutoff)
        .execute()
    )
    articles = res.data or []
    if not articles:
        return 10.0
    positive = sum(1 for a in articles if a.get("sentiment") == "positive")
    negative = sum(1 for a in articles if a.get("sentiment") == "negative")
    total = len(articles)
    ratio = (positive - negative * 0.5) / total
    return max(0.0, min(20.0, 10.0 + ratio * 10.0))


def social_signal_factor(athlete_id: str, since_days: int = 30) -> float:
    """Engagement spikes and viral posts from social_signals. Max 20 pts."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=since_days)).isoformat()
    res = (
        db.from_("social_signals")
        .select("value, metric_type")
        .eq("athlete_id", athlete_id)
        .gte("captured_at", cutoff)
        .execute()
    )
    signals = res.data or []
    if not signals:
        return 0.0
    best = 0.0
    for s in signals:
        mt = s.get("metric_type", "")
        val = s.get("value")
        if mt == "engagement_rate" and val is not None:
            # engagement_rate as decimal, e.g. 0.05 = 5%
            best = max(best, min(20.0, float(val) * 250))
        elif mt == "viral_post":
            best = max(best, 20.0)
        elif mt == "followers_delta" and val is not None:
            best = max(best, min(10.0, float(val) / 1000))
    return best


def breakthrough_factor(athlete_id: str, since_days: int = 90) -> float:
    """Recent debut/podium/record/title detected by LLM. Max 10 pts."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=since_days)).isoformat()
    res = (
        db.from_("news_articles")
        .select("breakthrough_type")
        .eq("athlete_id", athlete_id)
        .eq("is_breakthrough", True)
        .gte("published_at", cutoff)
        .execute()
    )
    breakthroughs = res.data or []
    if not breakthroughs:
        return 0.0
    # Title/record = full 10 pts; podium = 7; debut = 5
    weights = {"title": 10.0, "record": 10.0, "podium": 7.0, "debut": 5.0}
    return max(weights.get(b.get("breakthrough_type", ""), 5.0) for b in breakthroughs)


def discipline_gap_multiplier(discipline: str) -> float:
    """Undercovered disciplines earn a 1.0–1.5× multiplier from priority_score."""
    if discipline in _gap_cache:
        return _gap_cache[discipline]
    res = (
        db.from_("discipline_gaps")
        .select("priority_score")
        .eq("discipline", discipline)
        .maybeSingle()
        .execute()
    )
    priority = (res.data or {}).get("priority_score") or 50
    multiplier = 1.0 + (float(priority) / 100) * 0.5
    _gap_cache[discipline] = multiplier
    return multiplier


def compute(athlete: dict) -> tuple[float, dict]:
    aid = athlete["id"]
    discipline = athlete.get("discipline", "")

    af = age_factor(athlete.get("birth_date"))
    mf = mention_spike_factor(aid)
    sf = sentiment_factor(aid)
    ssf = social_signal_factor(aid)
    bf = breakthrough_factor(aid)
    raw = af + mf + sf + ssf + bf
    mult = discipline_gap_multiplier(discipline)
    final = min(100.0, raw * mult)

    factors = {
        "age_factor": round(af, 2),
        "mention_spike_factor": round(mf, 2),
        "sentiment_factor": round(sf, 2),
        "social_signal_factor": round(ssf, 2),
        "breakthrough_factor": round(bf, 2),
        "discipline_gap_multiplier": round(mult, 3),
        "raw_score": round(raw, 2),
    }
    return round(final, 2), factors


def main() -> None:
    now = datetime.now(timezone.utc)
    print(f"[{now.isoformat()}] Starting talent score computation...")

    res = db.from_("athletes").select("id, name, discipline, birth_date").execute()
    athletes = res.data or []
    print(f"  Athletes found: {len(athletes)}")

    ok = 0
    for athlete in athletes:
        try:
            score, factors = compute(athlete)

            db.from_("talent_score_history").insert(
                {
                    "athlete_id": athlete["id"],
                    "score": score,
                    "factors": factors,
                    "computed_at": now.isoformat(),
                }
            ).execute()

            db.from_("athletes").update(
                {
                    "talent_score": score,
                    "last_updated": now.isoformat(),
                }
            ).eq("id", athlete["id"]).execute()

            ok += 1
            mult = factors["discipline_gap_multiplier"]
            print(f"  ✓  {athlete['name']:40s}  score={score:5.1f}  ×{mult:.2f}")
        except Exception as exc:
            print(f"  ✗  {athlete.get('name', athlete['id'])}: {exc}", file=sys.stderr)

    print(f"[{datetime.now(timezone.utc).isoformat()}] Done — {ok}/{len(athletes)} computed.")


if __name__ == "__main__":
    main()
