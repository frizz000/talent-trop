import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { AthletePicker } from "./AthletePicker";

export const metadata = { title: "Porównywarka — Talent Trop" };
export const revalidate = 300;

const MAX_ATHLETES = 4;

// Max points per factor — from scripts/compute_talent_score.py
const FACTOR_SPECS: [key: string, label: string, max: number][] = [
  ["age_factor", "Wiek", 25],
  ["federation_rank_factor", "Ranking federacji", 15],
  ["mention_spike_factor", "Wzmianki medialne", 20],
  ["sentiment_factor", "Sentyment", 15],
  ["social_signal_factor", "Social", 15],
  ["breakthrough_factor", "Przełomy", 10],
];

const RB_LABELS: Record<string, string> = {
  signed: "Red Bull Signed",
  unsigned: "No Deal",
  unknown: "Unknown",
};
const RB_COLORS: Record<string, string> = {
  signed: "#e60d3f",
  unsigned: "#8a92ab",
  unknown: "#4a5372",
};

const FEDERATION_LABELS: Record<string, string> = {
  pza: "PZA",
  pzkol_mtb: "PZKol MTB",
  pzm_motocross: "PZM MX",
  pzla: "PZLA",
  fis: "FIS",
  ifsc: "IFSC",
  speed_skating_isu: "ISU",
};

type PageProps = { searchParams: Promise<{ ids?: string }> };

type FederationProfile = {
  federation: string;
  ranking_category: string | null;
  ranking_position: number | null;
  season: string | null;
};

type ComparedAthlete = {
  id: string;
  name: string;
  discipline: string;
  birth_date: string | null;
  talent_score: number | null;
  red_bull_status: string;
  photo_url: string | null;
  watchlist_status: string | null;
  federation_profiles: FederationProfile[];
  social_profiles: { followers_count: number | null; handle: string | null }[];
  brand_fit: number | null;
  factors: Record<string, number> | null;
  delta30d: number | null;
  mentions30d: number;
};

function ageOf(birthDate: string | null): number | null {
  if (!birthDate) return null;
  return Math.floor(
    (Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  );
}

function bestFederation(profiles: FederationProfile[]): FederationProfile | null {
  if (profiles.length === 0) return null;
  return [...profiles].sort(
    (a, b) => (a.ranking_position ?? 9999) - (b.ranking_position ?? 9999)
  )[0];
}

async function fetchCompared(ids: string[]): Promise<ComparedAthlete[]> {
  const supabase = await createClient();
  const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [athletesRes, brandRes, historyRes, newsRes] = await Promise.all([
    supabase
      .from("athletes")
      .select(
        "id, name, discipline, birth_date, talent_score, red_bull_status, photo_url, watchlist_status, federation_profiles(federation, ranking_category, ranking_position, season), social_profiles(followers_count, handle)"
      )
      .in("id", ids),
    supabase.from("brand_fit_scores").select("athlete_id, score").in("athlete_id", ids),
    supabase
      .from("talent_score_history")
      .select("athlete_id, score, computed_at, factors")
      .in("athlete_id", ids)
      .gte("computed_at", cutoff30)
      .order("computed_at", { ascending: true }),
    supabase
      .from("news_articles")
      .select("athlete_id")
      .in("athlete_id", ids)
      .gte("published_at", cutoff30),
  ]);

  const brandByAthlete = new Map<string, number>();
  for (const b of brandRes.data ?? []) {
    brandByAthlete.set(b.athlete_id, Number(b.score));
  }

  const historyByAthlete = new Map<
    string,
    { earliest: number; latest: number; latestFactors: Record<string, number> | null }
  >();
  for (const row of historyRes.data ?? []) {
    const s = Number(row.score);
    const existing = historyByAthlete.get(row.athlete_id);
    if (!existing) {
      historyByAthlete.set(row.athlete_id, {
        earliest: s,
        latest: s,
        latestFactors: (row.factors as Record<string, number>) ?? null,
      });
    } else {
      existing.latest = s;
      existing.latestFactors = (row.factors as Record<string, number>) ?? existing.latestFactors;
    }
  }

  const mentionsByAthlete = new Map<string, number>();
  for (const n of newsRes.data ?? []) {
    if (n.athlete_id) {
      mentionsByAthlete.set(n.athlete_id, (mentionsByAthlete.get(n.athlete_id) ?? 0) + 1);
    }
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const byId = new Map<string, any>((athletesRes.data ?? []).map((a: any) => [a.id, a]));
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Preserve the order from the URL
  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((a) => {
      const h = historyByAthlete.get(a.id);
      return {
        id: a.id,
        name: a.name,
        discipline: a.discipline,
        birth_date: a.birth_date,
        talent_score: a.talent_score != null ? Number(a.talent_score) : null,
        red_bull_status: a.red_bull_status,
        photo_url: a.photo_url,
        watchlist_status: a.watchlist_status ?? null,
        federation_profiles: a.federation_profiles ?? [],
        social_profiles: a.social_profiles ?? [],
        brand_fit: brandByAthlete.get(a.id) ?? null,
        factors: h?.latestFactors ?? null,
        delta30d: h ? h.latest - h.earliest : null,
        mentions30d: mentionsByAthlete.get(a.id) ?? 0,
      };
    });
}

function StatRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-2" style={{ borderTop: "1px solid var(--color-border)" }}>
      <p
        className="text-[10px] uppercase tracking-wider mb-0.5"
        style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

function FactorBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="score-bar flex-1">
        <span style={{ width: `${pct}%` }} />
      </div>
      <span
        className="stat text-xs font-bold w-10 text-right shrink-0"
        style={{ color: "var(--color-text)" }}
      >
        {value.toFixed(1)}
      </span>
    </div>
  );
}

function AthleteColumn({
  athlete,
  allIds,
  bestScore,
}: {
  athlete: ComparedAthlete;
  allIds: string[];
  bestScore: number | null;
}) {
  const age = ageOf(athlete.birth_date);
  const bestFed = bestFederation(athlete.federation_profiles);
  const followers = athlete.social_profiles.find(
    (p) => p.followers_count != null
  )?.followers_count;
  const removeIds = allIds.filter((id) => id !== athlete.id);
  const removeHref =
    removeIds.length > 0 ? `/compare?ids=${removeIds.join(",")}` : "/compare";
  const isTop =
    bestScore != null &&
    athlete.talent_score != null &&
    athlete.talent_score >= bestScore;

  return (
    <div className="card overflow-hidden flex flex-col">
      {/* Photo */}
      <div
        className="relative"
        style={{ height: "140px", backgroundColor: "var(--color-bg)" }}
      >
        {athlete.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={athlete.photo_url}
            alt={athlete.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="flex items-center justify-center w-full h-full text-4xl font-bold uppercase"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-muted)" }}
          >
            {athlete.name
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")}
          </div>
        )}
        <Link
          href={removeHref}
          title="Usuń z porównania"
          className="absolute top-2 right-2 flex items-center justify-center stat text-xs"
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "6px",
            backgroundColor: "rgba(10,13,23,0.82)",
            border: "1px solid var(--color-border)",
            color: "var(--color-muted)",
            textDecoration: "none",
          }}
        >
          ✕
        </Link>
      </div>

      <div className="p-4 flex-1 flex flex-col">
        {/* Name + meta */}
        <Link
          href={`/athlete-hub/${athlete.id}`}
          className="hover-underline text-xl font-bold uppercase leading-tight"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--color-text)",
            textDecoration: "none",
          }}
        >
          {athlete.name}
        </Link>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
          {athlete.discipline}
          {age != null && (
            <span className="stat"> • {age} lat</span>
          )}
        </p>

        {/* Talent score */}
        <div className="flex items-end gap-2 mt-3 mb-1">
          <p
            className="stat leading-none font-bold"
            style={{
              fontSize: "44px",
              color:
                athlete.talent_score != null
                  ? "var(--color-trend-up)"
                  : "var(--color-muted)",
            }}
          >
            {athlete.talent_score != null ? athlete.talent_score.toFixed(0) : "—"}
          </p>
          {isTop && (
            <span className="chip mb-1" style={{ color: "var(--color-gold)" }}>
              TOP
            </span>
          )}
          {athlete.delta30d != null && athlete.delta30d !== 0 && (
            <span
              className="stat text-sm font-bold mb-1"
              style={{
                color:
                  athlete.delta30d > 0
                    ? "var(--color-trend-up)"
                    : "var(--color-accent)",
              }}
            >
              {athlete.delta30d > 0 ? "+" : ""}
              {athlete.delta30d.toFixed(1)} / 30d
            </span>
          )}
        </div>
        {athlete.talent_score != null && (
          <div className="score-bar mb-3">
            <span style={{ width: `${Math.min(100, athlete.talent_score)}%` }} />
          </div>
        )}

        {/* Factor breakdown */}
        {athlete.factors && (
          <div className="mb-1">
            {FACTOR_SPECS.map(([key, label, max]) => {
              const v = athlete.factors?.[key];
              if (typeof v !== "number") return null;
              return (
                <StatRow key={key} label={`${label} (max ${max})`}>
                  <FactorBar value={v} max={max} />
                </StatRow>
              );
            })}
            {typeof athlete.factors["discipline_gap_multiplier"] === "number" && (
              <StatRow label="Mnożnik luki dyscypliny">
                <span
                  className="stat text-sm font-bold"
                  style={{ color: "var(--color-gold)" }}
                >
                  × {athlete.factors["discipline_gap_multiplier"].toFixed(2)}
                </span>
              </StatRow>
            )}
          </div>
        )}

        {/* Brand fit */}
        <StatRow label="Brand Fit (Red Bull)">
          <span
            className="stat text-lg font-bold"
            style={{
              color:
                athlete.brand_fit != null ? "var(--color-gold)" : "var(--color-muted)",
            }}
          >
            {athlete.brand_fit != null ? athlete.brand_fit.toFixed(0) : "—"}
          </span>
        </StatRow>

        {/* Federation */}
        <StatRow label="Najlepszy ranking federacji">
          {bestFed ? (
            <p className="text-xs" style={{ color: "var(--color-text)" }}>
              <span
                className="font-bold uppercase"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {FEDERATION_LABELS[bestFed.federation] ?? bestFed.federation}
              </span>
              {bestFed.ranking_position != null && (
                <span className="stat font-bold" style={{ color: "var(--color-gold)" }}>
                  {" "}#{bestFed.ranking_position}
                </span>
              )}
              {bestFed.ranking_category && (
                <span style={{ color: "var(--color-muted)" }}>
                  {" "}· {bestFed.ranking_category}
                </span>
              )}
            </p>
          ) : (
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>—</span>
          )}
        </StatRow>

        {/* Mentions */}
        <StatRow label="Wzmianki medialne / 30d">
          <span className="stat text-lg font-bold" style={{ color: "var(--color-text)" }}>
            {athlete.mentions30d}
          </span>
        </StatRow>

        {/* Social */}
        <StatRow label="Instagram">
          <span className="stat text-sm" style={{ color: "var(--color-text)" }}>
            {followers != null
              ? `${followers.toLocaleString("pl-PL")} obs.`
              : "—"}
          </span>
        </StatRow>

        {/* Red Bull status */}
        <StatRow label="Status Red Bull">
          <span className="chip" style={{ color: RB_COLORS[athlete.red_bull_status] }}>
            {RB_LABELS[athlete.red_bull_status] ?? athlete.red_bull_status}
          </span>
        </StatRow>
      </div>
    </div>
  );
}

export default async function ComparePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const ids = [...new Set((params.ids ?? "").split(",").filter(Boolean))].slice(
    0,
    MAX_ATHLETES
  );

  const athletes =
    isSupabaseConfigured() && ids.length > 0 ? await fetchCompared(ids) : [];

  const bestScore = athletes.reduce<number | null>(
    (best, a) =>
      a.talent_score != null && (best == null || a.talent_score > best)
        ? a.talent_score
        : best,
    null
  );

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        kicker="Benchmarking"
        title="Porównywarka"
        subtitle="Zestaw do 4 zawodników obok siebie — Talent Score, składowe, Brand Fit, rankingi"
      />

      <div className="mb-6">
        <Suspense>
          <AthletePicker selectedIds={athletes.map((a) => a.id)} />
        </Suspense>
      </div>

      {!isSupabaseConfigured() ? (
        <div className="card p-6 max-w-lg">
          <p className="stat text-xs mb-2" style={{ color: "var(--color-accent)" }}>
            SUPABASE NOT CONNECTED
          </p>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Uzupełnij <code>.env.local</code> żeby korzystać z porównywarki.
          </p>
        </div>
      ) : athletes.length === 0 ? (
        <div className="card p-8 max-w-lg">
          <p className="stat text-xs mb-2" style={{ color: "var(--color-muted)" }}>
            WYBIERZ ZAWODNIKÓW
          </p>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Wyszukaj zawodnika powyżej albo użyj przycisku „Porównaj” na profilu
            zawodnika w Athlete Hub. Możesz zestawić od 2 do 4 osób.
          </p>
        </div>
      ) : (
        <div
          className="grid gap-4 stagger"
          style={{
            gridTemplateColumns: `repeat(${Math.min(athletes.length, MAX_ATHLETES)}, minmax(230px, 1fr))`,
            maxWidth: athletes.length < 3 ? "760px" : undefined,
            overflowX: "auto",
          }}
        >
          {athletes.map((a) => (
            <AthleteColumn
              key={a.id}
              athlete={a}
              allIds={athletes.map((x) => x.id)}
              bestScore={bestScore}
            />
          ))}
        </div>
      )}
    </div>
  );
}
