/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Przeliczenie talent score dla JEDNEGO zawodnika — wierny port algorytmu
 * z scripts/compute_talent_score.py (wagi, progi i kategorie muszą zostać
 * w synchronizacji z tym skryptem!). Używane po Research AI, żeby zapisane
 * zmiany (data urodzenia, nowe artykuły) od razu odbiły się w score,
 * zamiast czekać na dzienny cron compute.yml.
 *
 * Zapisuje talent_score_history (z factors) i athletes.talent_score.
 */

// Federation ranking_category prefix → punkty wieku, gdy brak birth_date
const CATEGORY_AGE_PREFIXES: Array<[string, number]> = [
  ["u13", 25], ["u14", 25], ["u15", 25], ["u16", 25], ["u17", 25],
  ["u18", 25],
  ["u20", 22],
  ["junior", 22],
  ["u23", 18],
  ["mx65", 25], ["mx85", 25], ["mx_junior", 22],
  ["cat_c", 25], ["cat_b", 25], ["cat_a", 25], ["cat_n", 18],
  ["masters", 5], ["cyklosport", 5],
];

function categoryAgePoints(category: string): number | null {
  for (const [prefix, points] of CATEGORY_AGE_PREFIXES) {
    if (category.startsWith(prefix)) return points;
  }
  return null;
}

function ageFactor(birthDate: string | null, categories: Set<string>): number {
  if (!birthDate) {
    const catPoints = [...categories]
      .map(categoryAgePoints)
      .filter((p): p is number => p !== null);
    if (catPoints.length > 0) return Math.max(...catPoints);
    return 10;
  }
  const bd = new Date(birthDate);
  if (isNaN(bd.getTime())) return 10;
  const age = (Date.now() - bd.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (age < 18) return 25;
  if (age < 21) return 22;
  if (age < 23) return 18;
  if (age < 25) return 14;
  if (age < 27) return 10;
  return 5;
}

function federationRankFactor(positions: number[]): number {
  if (positions.length === 0) return 0;
  const best = Math.min(...positions);
  if (best === 1) return 15;
  if (best <= 3) return 12;
  if (best <= 5) return 9;
  if (best <= 10) return 6;
  return 3;
}

function mentionSpikeFactor(articleCount: number): number {
  if (articleCount === 0) return 0;
  return Math.min(20, 8 * Math.log(articleCount + 1));
}

function sentimentFactor(sentiments: string[]): number {
  if (sentiments.length === 0) return 7.5;
  const positive = sentiments.filter((s) => s === "positive").length;
  const negative = sentiments.filter((s) => s === "negative").length;
  const ratio = (positive - negative * 0.5) / sentiments.length;
  return Math.max(0, Math.min(15, 7.5 + ratio * 7.5));
}

function socialSignalFactor(
  signals: Array<{ metric_type: string | null; value: number | null }>
): number {
  let best = 0;
  for (const s of signals) {
    const mt = s.metric_type ?? "";
    const val = s.value;
    if (mt === "engagement_rate" && val != null) {
      best = Math.max(best, Math.min(15, Number(val) * 200));
    } else if (mt === "viral_post") {
      best = Math.max(best, 15);
    } else if (mt === "followers_delta" && val != null) {
      best = Math.max(best, Math.min(8, Number(val) / 1000));
    }
  }
  return best;
}

function breakthroughFactor(types: string[]): number {
  if (types.length === 0) return 0;
  const weights: Record<string, number> = { title: 10, record: 10, podium: 7, debut: 5 };
  return Math.max(...types.map((t) => weights[t] ?? 5));
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export type RecomputeResult = {
  score: number;
  factors: Record<string, number>;
};

export async function recomputeTalentScore(
  supabase: any,
  athleteId: string
): Promise<RecomputeResult | null> {
  const { data: athlete } = await supabase
    .from("athletes")
    .select("id, name, discipline, birth_date, discovery_status")
    .eq("id", athleteId)
    .single();
  if (!athlete || athlete.discovery_status === "rejected") return null;

  const now = new Date();
  const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [articlesRes, signalsRes, fedRes, gapRes] = await Promise.all([
    supabase
      .from("news_articles")
      .select("published_at, sentiment, is_breakthrough, breakthrough_type")
      .eq("athlete_id", athleteId)
      .gte("published_at", cutoff90d),
    supabase
      .from("social_signals")
      .select("value, metric_type")
      .eq("athlete_id", athleteId)
      .gte("captured_at", cutoff30d),
    supabase
      .from("federation_profiles")
      .select("ranking_category, ranking_position")
      .eq("athlete_id", athleteId),
    supabase
      .from("discipline_gaps")
      .select("priority_score")
      .eq("discipline", athlete.discipline)
      .maybeSingle(),
  ]);

  const articles: any[] = articlesRes.data ?? [];
  const recent = articles.filter((a) => (a.published_at ?? "") >= cutoff30d);
  const breakthroughs = articles
    .filter((a) => a.is_breakthrough && a.breakthrough_type)
    .map((a) => a.breakthrough_type as string);

  const fedProfiles: any[] = fedRes.data ?? [];
  const categories = new Set<string>(
    fedProfiles.map((fp) => fp.ranking_category).filter(Boolean)
  );
  const positions = fedProfiles
    .filter((fp) => fp.ranking_position != null)
    .map((fp) => Number(fp.ranking_position));

  const af = ageFactor(athlete.birth_date, categories);
  const ff = federationRankFactor(positions);
  const mf = mentionSpikeFactor(recent.length);
  const sf = sentimentFactor(
    recent.map((a) => a.sentiment).filter((s): s is string => Boolean(s))
  );
  const ssf = socialSignalFactor(signalsRes.data ?? []);
  const bf = breakthroughFactor(breakthroughs);
  const raw = af + ff + mf + sf + ssf + bf;
  const mult =
    gapRes.data?.priority_score != null
      ? 1 + (Number(gapRes.data.priority_score) / 100) * 0.5
      : 1.25; // priority 50 — jak default_multiplier w skrypcie
  const final = round2(Math.min(100, raw * mult));

  const factors = {
    age_factor: round2(af),
    federation_rank_factor: round2(ff),
    mention_spike_factor: round2(mf),
    sentiment_factor: round2(sf),
    social_signal_factor: round2(ssf),
    breakthrough_factor: round2(bf),
    discipline_gap_multiplier: Math.round(mult * 1000) / 1000,
    raw_score: round2(raw),
  };

  const nowIso = now.toISOString();
  const { error: historyError } = await supabase.from("talent_score_history").insert({
    athlete_id: athleteId,
    score: final,
    factors,
    computed_at: nowIso,
  });
  if (historyError) {
    console.error("[recomputeTalentScore] history:", historyError.message);
  }
  const { error: updateError } = await supabase
    .from("athletes")
    .update({ talent_score: final, last_updated: nowIso })
    .eq("id", athleteId);
  if (updateError) {
    console.error("[recomputeTalentScore] athletes:", updateError.message);
    return null;
  }

  return { score: final, factors };
}
