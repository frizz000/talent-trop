#!/usr/bin/env python3
"""
Compute talent scores for all athletes and write results to talent_score_history.
Updates athletes.talent_score with the latest computed value.

Algorithm (weighted sum, max 100):
  a) age_factor              — 0–25 pts  (younger = higher; falls back to
                                          federation age category when birth_date missing)
  b) federation_rank_factor  — 0–15 pts  (best ranking position in federation classification)
  c) mention_spike_factor    — 0–20 pts  (log scale of recent article count)
  d) sentiment_factor        — 0–15 pts  (positive vs negative article ratio)
  e) social_signal_factor    — 0–15 pts  (engagement rate / viral signal)
  f) breakthrough_factor     — 0–10 pts  (debut / podium / record / title from LLM)
  × discipline_gap_multiplier — 1.0–1.5× (undercovered discipline = boost)

Skips athletes with discovery_status='rejected'.

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

PAGE_SIZE = 1000
HISTORY_INSERT_BATCH = 500
ATHLETE_UPDATE_BATCH = 500

# Federation ranking_category prefix → assumed age band when birth_date is missing.
# Youth categories are the core scouting target (14–17), so they score max.
# Prefix match covers per-discipline variants (e.g. u16_women_bouldering).
CATEGORY_AGE_PREFIXES = [
    ("u13", 25.0), ("u14", 25.0), ("u15", 25.0), ("u16", 25.0), ("u17", 25.0),
    ("u18", 25.0),
    ("u20", 22.0),
    ("junior", 22.0),
    ("u23", 18.0),
    ("mx65", 25.0), ("mx85", 25.0), ("mx_junior", 22.0),
    # ISU speed skating: C=13-14, B=15-16, A=17-18, N=neo-senior 19-22
    ("cat_c", 25.0), ("cat_b", 25.0), ("cat_a", 25.0), ("cat_n", 18.0),
    ("masters", 5.0), ("cyklosport", 5.0),
]


def category_age_points(category: str) -> float | None:
    for prefix, points in CATEGORY_AGE_PREFIXES:
        if category.startswith(prefix):
            return points
    return None


def fetch_all(table: str, columns: str, filters=None) -> list[dict]:
    """Fetch all rows with pagination (PostgREST caps a single response at 1000)."""
    rows: list[dict] = []
    offset = 0
    while True:
        q = db.from_(table).select(columns)
        if filters:
            q = filters(q)
        res = q.range(offset, offset + PAGE_SIZE - 1).execute()
        page = res.data or []
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
        offset += PAGE_SIZE


def age_factor(birth_date_str: str | None, categories: set[str]) -> float:
    """Younger athletes score higher. Max 25 pts."""
    if not birth_date_str:
        # No birth date — estimate from federation age category if available
        cat_points = [p for p in (category_age_points(c) for c in categories) if p is not None]
        if cat_points:
            return max(cat_points)
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


def federation_rank_factor(positions: list[int]) -> float:
    """Best classification position across federation profiles. Max 15 pts."""
    if not positions:
        return 0.0
    best = min(positions)
    if best == 1:
        return 15.0
    if best <= 3:
        return 12.0
    if best <= 5:
        return 9.0
    if best <= 10:
        return 6.0
    return 3.0


def mention_spike_factor(article_count: int) -> float:
    """Multi-source mention count, log scale. Max 20 pts."""
    if article_count == 0:
        return 0.0
    return min(20.0, 8.0 * math.log(article_count + 1))


def sentiment_factor(sentiments: list[str]) -> float:
    """Positive vs negative article ratio. Max 15 pts, neutral 7.5 if no data."""
    if not sentiments:
        return 7.5
    positive = sum(1 for s in sentiments if s == "positive")
    negative = sum(1 for s in sentiments if s == "negative")
    ratio = (positive - negative * 0.5) / len(sentiments)
    return max(0.0, min(15.0, 7.5 + ratio * 7.5))


def social_signal_factor(signals: list[dict]) -> float:
    """Engagement spikes and viral posts from social_signals. Max 15 pts."""
    best = 0.0
    for s in signals:
        mt = s.get("metric_type", "")
        val = s.get("value")
        if mt == "engagement_rate" and val is not None:
            # engagement_rate as decimal, e.g. 0.05 = 5%
            best = max(best, min(15.0, float(val) * 200))
        elif mt == "viral_post":
            best = max(best, 15.0)
        elif mt == "followers_delta" and val is not None:
            best = max(best, min(8.0, float(val) / 1000))
    return best


def breakthrough_factor(breakthrough_types: list[str]) -> float:
    """Recent debut/podium/record/title detected by LLM. Max 10 pts."""
    if not breakthrough_types:
        return 0.0
    weights = {"title": 10.0, "record": 10.0, "podium": 7.0, "debut": 5.0}
    return max(weights.get(bt, 5.0) for bt in breakthrough_types)


def main() -> None:
    now = datetime.now(timezone.utc)
    print(f"[{now.isoformat()}] Starting talent score computation...")

    run_resp = db.from_("ingestion_runs").insert({
        "source": "compute_scores",
        "status": "running",
        "items_processed": 0,
    }).execute()
    run_id = run_resp.data[0]["id"]

    # ── Bulk fetch phase ──────────────────────────────────────────────────
    athletes = fetch_all(
        "athletes",
        "id, name, discipline, birth_date",
        lambda q: q.neq("discovery_status", "rejected"),
    )
    print(f"  Athletes to score (rejected excluded): {len(athletes)}")

    cutoff_30d = (now - timedelta(days=30)).isoformat()
    cutoff_90d = (now - timedelta(days=90)).isoformat()

    articles = fetch_all(
        "news_articles",
        "athlete_id, published_at, sentiment, is_breakthrough, breakthrough_type",
        lambda q: q.not_.is_("athlete_id", "null").gte("published_at", cutoff_90d),
    )
    signals = fetch_all(
        "social_signals",
        "athlete_id, value, metric_type",
        lambda q: q.gte("captured_at", cutoff_30d),
    )
    fed_profiles = fetch_all(
        "federation_profiles",
        "athlete_id, ranking_category, ranking_position",
        lambda q: q.not_.is_("athlete_id", "null"),
    )
    gaps_res = db.from_("discipline_gaps").select("discipline, priority_score").execute()
    gap_multipliers = {
        g["discipline"]: 1.0 + (float(g.get("priority_score") or 50) / 100) * 0.5
        for g in (gaps_res.data or [])
    }
    default_multiplier = 1.25  # priority 50
    print(
        f"  Loaded: {len(articles)} tagged articles (90d), {len(signals)} social signals (30d), "
        f"{len(fed_profiles)} federation profiles, {len(gap_multipliers)} discipline gaps"
    )

    # ── Group per athlete in memory ───────────────────────────────────────
    articles_30d: dict[str, list[dict]] = {}
    breakthroughs_90d: dict[str, list[str]] = {}
    for a in articles:
        aid = a["athlete_id"]
        if (a.get("published_at") or "") >= cutoff_30d:
            articles_30d.setdefault(aid, []).append(a)
        if a.get("is_breakthrough") and a.get("breakthrough_type"):
            breakthroughs_90d.setdefault(aid, []).append(a["breakthrough_type"])

    signals_by_athlete: dict[str, list[dict]] = {}
    for s in signals:
        signals_by_athlete.setdefault(s["athlete_id"], []).append(s)

    fed_categories: dict[str, set[str]] = {}
    fed_positions: dict[str, list[int]] = {}
    for fp in fed_profiles:
        aid = fp["athlete_id"]
        if fp.get("ranking_category"):
            fed_categories.setdefault(aid, set()).add(fp["ranking_category"])
        if fp.get("ranking_position") is not None:
            fed_positions.setdefault(aid, []).append(int(fp["ranking_position"]))

    # ── Compute phase ─────────────────────────────────────────────────────
    history_rows: list[dict] = []
    athlete_updates: list[dict] = []

    for athlete in athletes:
        aid = athlete["id"]
        recent = articles_30d.get(aid, [])

        af = age_factor(athlete.get("birth_date"), fed_categories.get(aid, set()))
        ff = federation_rank_factor(fed_positions.get(aid, []))
        mf = mention_spike_factor(len(recent))
        sf = sentiment_factor([a.get("sentiment") for a in recent if a.get("sentiment")])
        ssf = social_signal_factor(signals_by_athlete.get(aid, []))
        bf = breakthrough_factor(breakthroughs_90d.get(aid, []))
        raw = af + ff + mf + sf + ssf + bf
        mult = gap_multipliers.get(athlete.get("discipline", ""), default_multiplier)
        final = round(min(100.0, raw * mult), 2)

        factors = {
            "age_factor": round(af, 2),
            "federation_rank_factor": round(ff, 2),
            "mention_spike_factor": round(mf, 2),
            "sentiment_factor": round(sf, 2),
            "social_signal_factor": round(ssf, 2),
            "breakthrough_factor": round(bf, 2),
            "discipline_gap_multiplier": round(mult, 3),
            "raw_score": round(raw, 2),
        }
        history_rows.append({
            "athlete_id": aid,
            "score": final,
            "factors": factors,
            "computed_at": now.isoformat(),
        })
        athlete_updates.append({
            "id": aid,
            # name/discipline included so the upsert's INSERT arm passes NOT NULL
            # checks (rows always exist, so only the UPDATE arm actually runs)
            "name": athlete["name"],
            "discipline": athlete["discipline"],
            "talent_score": final,
            "last_updated": now.isoformat(),
        })

    # ── Write phase (batched) ─────────────────────────────────────────────
    ok = 0
    errors: list[str] = []
    for i in range(0, len(history_rows), HISTORY_INSERT_BATCH):
        batch = history_rows[i:i + HISTORY_INSERT_BATCH]
        try:
            db.from_("talent_score_history").insert(batch).execute()
        except Exception as exc:
            msg = f"history batch {i}: {exc}"
            print(f"  ✗ {msg}", file=sys.stderr)
            errors.append(msg)

    for i in range(0, len(athlete_updates), ATHLETE_UPDATE_BATCH):
        batch = athlete_updates[i:i + ATHLETE_UPDATE_BATCH]
        try:
            # Upsert on id: all rows exist, so this only updates the given columns
            db.from_("athletes").upsert(batch, on_conflict="id").execute()
            ok += len(batch)
        except Exception as exc:
            msg = f"athletes batch {i}: {exc}"
            print(f"  ✗ {msg}", file=sys.stderr)
            errors.append(msg)

    db.from_("ingestion_runs").update({
        "status": "error" if errors else "success",
        "items_processed": ok,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "error_log": "\n".join(errors) if errors else None,
    }).eq("id", run_id).execute()

    top = sorted(history_rows, key=lambda r: r["score"], reverse=True)[:10]
    names = {a["id"]: a["name"] for a in athletes}
    print("\n  Top 10:")
    for r in top:
        print(f"    {names.get(r['athlete_id'], '?'):40s} {r['score']:6.1f}")

    print(f"\n[{datetime.now(timezone.utc).isoformat()}] Done — {ok}/{len(athletes)} scored.")
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
