import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

export const metadata = { title: "Breakout Radar — Talent Trop" };
export const revalidate = 300;

type PageProps = {
  searchParams: Promise<{ window?: string }>;
};

type AthleteWithDelta = {
  id: string;
  name: string;
  discipline: string;
  talent_score: number | null;
  photo_url: string | null;
  delta: number;
  old_score: number;
  factors: Record<string, number> | null;
};

async function fetchBreakouts(windowDays: number): Promise<AthleteWithDelta[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const cutoff = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: history } = await supabase
    .from("talent_score_history")
    .select("athlete_id, score, computed_at, factors")
    .gte("computed_at", cutoff)
    .order("computed_at", { ascending: true });

  if (!history || history.length === 0) return [];

  const byAthlete = new Map<
    string,
    { earliest: number; latest: number; latestFactors: Record<string, number> | null }
  >();

  for (const row of history) {
    const s = Number(row.score);
    const existing = byAthlete.get(row.athlete_id);
    if (!existing) {
      byAthlete.set(row.athlete_id, {
        earliest: s,
        latest: s,
        latestFactors: (row.factors as Record<string, number>) ?? null,
      });
    } else {
      existing.latest = s;
      existing.latestFactors = (row.factors as Record<string, number>) ?? null;
    }
  }

  const athleteIds = [...byAthlete.keys()];
  if (athleteIds.length === 0) return [];

  const { data: athletes } = await supabase
    .from("athletes")
    .select("id, name, discipline, talent_score, photo_url")
    .in("id", athleteIds);

  if (!athletes) return [];

  return athletes
    .map((a) => {
      const h = byAthlete.get(a.id)!;
      return {
        id: a.id,
        name: a.name,
        discipline: a.discipline,
        talent_score: a.talent_score != null ? Number(a.talent_score) : null,
        photo_url: a.photo_url,
        delta: h.latest - h.earliest,
        old_score: h.earliest,
        factors: h.latestFactors,
      };
    })
    .filter((a) => a.delta !== 0)
    .sort((a, b) => b.delta - a.delta);
}

type BreakthroughArticle = {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  breakthrough_type: string | null;
  summary: string | null;
  athletes: {
    id: string;
    name: string;
    discipline: string;
    talent_score: number | null;
  } | null;
};

async function fetchBreakthroughs(windowDays: number): Promise<BreakthroughArticle[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const cutoff = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data } = await supabase
    .from("news_articles")
    .select(
      "id, title, url, source, published_at, breakthrough_type, summary, athletes(id, name, discipline, talent_score)"
    )
    .eq("is_breakthrough", true)
    .gte("published_at", cutoff)
    .order("published_at", { ascending: false })
    .limit(20);

  return (data ?? []) as unknown as BreakthroughArticle[];
}

const BREAKTHROUGH_LABELS: Record<string, string> = {
  debut: "DEBIUT",
  podium: "PODIUM",
  record: "REKORD",
  title: "TYTUŁ",
};

function DeltaBadge({ delta }: { delta: number }) {
  const positive = delta >= 0;
  return (
    <span
      className="stat text-base font-bold"
      style={{
        color: positive ? "var(--color-trend-up)" : "var(--color-accent)",
      }}
    >
      {positive ? "+" : ""}
      {delta.toFixed(1)}
    </span>
  );
}

function HeroCard({ athlete }: { athlete: AthleteWithDelta }) {
  return (
    <Link
      href={`/athlete-hub/${athlete.id}`}
      style={{ textDecoration: "none", display: "block" }}
    >
      <div
        className="card hover-border-accent overflow-hidden flex flex-col"
        style={{ minHeight: "260px" }}
      >
        {/* Photo / initials */}
        <div
          style={{
            height: "120px",
            backgroundColor: "var(--color-bg)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {athlete.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={athlete.photo_url}
              alt={athlete.name}
              className="w-full h-full object-cover"
              style={{ filter: "brightness(0.8)" }}
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
          {/* Delta overlay */}
          <div
            style={{
              position: "absolute",
              top: "8px",
              right: "8px",
              backgroundColor: "#0f0f0fcc",
              padding: "4px 8px",
              borderRadius: "6px",
              border: "1px solid var(--color-border)",
            }}
          >
            <DeltaBadge delta={athlete.delta} />
          </div>
        </div>

        {/* Info */}
        <div className="p-4 flex-1 flex flex-col gap-1">
          <h3
            className="text-xl font-bold uppercase leading-tight"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          >
            {athlete.name}
          </h3>
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            {athlete.discipline}
          </p>
          <div className="flex items-baseline gap-3 mt-auto pt-2">
            <div>
              <span className="stat text-xs" style={{ color: "var(--color-muted)" }}>
                Score{" "}
              </span>
              <span
                className="stat text-2xl font-bold"
                style={{ color: "var(--color-trend-up)" }}
              >
                {athlete.talent_score?.toFixed(0) ?? "—"}
              </span>
            </div>
            <span className="stat text-xs" style={{ color: "var(--color-muted)" }}>
              był {athlete.old_score.toFixed(1)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function CompactRow({
  athlete,
  rank,
}: {
  athlete: AthleteWithDelta;
  rank: number;
}) {
  return (
    <Link
      href={`/athlete-hub/${athlete.id}`}
      style={{ textDecoration: "none", display: "block" }}
    >
      <div
        className="hover-surface flex items-center gap-4 py-3 px-4"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <span
          className="stat text-lg font-bold w-8 text-right shrink-0"
          style={{ color: "var(--color-muted)" }}
        >
          {rank}
        </span>
        <div className="flex-1 min-w-0">
          <p
            className="font-bold uppercase text-sm leading-tight"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          >
            {athlete.name}
          </p>
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            {athlete.discipline}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p
            className="stat text-xl font-bold"
            style={{ color: "var(--color-trend-up)" }}
          >
            {athlete.talent_score?.toFixed(0) ?? "—"}
          </p>
          <DeltaBadge delta={athlete.delta} />
        </div>
      </div>
    </Link>
  );
}

function BreakthroughFeed({ articles }: { articles: BreakthroughArticle[] }) {
  if (articles.length === 0) return null;

  return (
    <div className="card overflow-hidden mb-8">
      <div
        className="px-4 py-3"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <h2
          className="text-xs uppercase tracking-wider stat"
          style={{ color: "var(--color-accent)" }}
        >
          🔥 Sygnały przełomu z newsów (LLM)
        </h2>
      </div>
      {articles.map((a) => (
        <div
          key={a.id}
          className="flex items-start gap-4 py-3 px-4"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <span
            className="stat text-xs font-bold px-2 py-0.5 shrink-0 mt-0.5"
            style={{
              backgroundColor: "var(--color-accent)22",
              color: "var(--color-accent)",
              border: "1px solid var(--color-accent)44",
              borderRadius: "4px",
            }}
          >
            {BREAKTHROUGH_LABELS[a.breakthrough_type ?? ""] ?? "PRZEŁOM"}
          </span>
          <div className="flex-1 min-w-0">
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover-underline text-sm font-medium leading-snug"
              style={{ color: "var(--color-text)", textDecoration: "none" }}
            >
              {a.title}
            </a>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="stat text-xs" style={{ color: "var(--color-muted)" }}>
                {a.source}
              </span>
              <span className="stat text-xs" style={{ color: "var(--color-muted)" }}>
                {new Date(a.published_at).toLocaleDateString("pl-PL")}
              </span>
              {a.athletes && (
                <Link
                  href={`/athlete-hub/${a.athletes.id}`}
                  className="text-xs font-bold uppercase"
                  style={{
                    fontFamily: "var(--font-display)",
                    color: "var(--color-trend-up)",
                    textDecoration: "none",
                  }}
                >
                  → {a.athletes.name}
                  {a.athletes.talent_score != null &&
                    ` (${Number(a.athletes.talent_score).toFixed(0)})`}
                </Link>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

async function BreakoutContent({ windowDays }: { windowDays: number }) {
  const [athletes, breakthroughs] = await Promise.all([
    fetchBreakouts(windowDays),
    fetchBreakthroughs(windowDays),
  ]);

  if (athletes.length === 0 && breakthroughs.length === 0) {
    return (
      <div className="card p-8 max-w-lg">
        <p className="stat text-xs mb-2" style={{ color: "var(--color-muted)" }}>
          BRAK DANYCH
        </p>
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          Brak historii talent_score_history z ostatnich {windowDays} dni.
          Uruchom skrypt{" "}
          <code>scripts/compute_talent_score.py</code> żeby wygenerować dane.
        </p>
      </div>
    );
  }

  const heroes = athletes.slice(0, 3);
  const rest = athletes.slice(3);

  return (
    <div>
      {/* Breakthrough signals from news — available from day one */}
      <BreakthroughFeed articles={breakthroughs} />

      {athletes.length === 0 ? (
        <div className="card p-6 max-w-lg">
          <p className="stat text-xs mb-2" style={{ color: "var(--color-muted)" }}>
            ZMIANY SCORE — W PRZYGOTOWANIU
          </p>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Ranking zmian talent score pojawi się po co najmniej dwóch dziennych
            przeliczeniach (workflow compute.yml, codziennie 07:00 UTC).
          </p>
        </div>
      ) : (
        <>
          {/* Top 3 hero cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {heroes.map((a) => (
              <HeroCard key={a.id} athlete={a} />
            ))}
          </div>

          {/* Rest: compact list */}
          {rest.length > 0 && (
            <div className="card overflow-hidden">
              <div
                className="px-4 py-3"
                style={{ borderBottom: "1px solid var(--color-border)" }}
              >
                <h2
                  className="text-xs uppercase tracking-wider stat"
                  style={{ color: "var(--color-muted)" }}
                >
                  Pozostałe ({rest.length})
                </h2>
              </div>
              {rest.map((a, i) => (
                <CompactRow key={a.id} athlete={a} rank={i + 4} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default async function BreakoutRadarPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const windowDays = params.window === "7" ? 7 : 30;

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1
            className="text-5xl font-bold uppercase tracking-tight leading-none"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          >
            Breakout Radar
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>
            Zawodnicy z największym wzrostem talent score
          </p>
        </div>

        {/* Window toggle */}
        <div
          className="flex gap-1 p-1"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "8px",
          }}
        >
          {[7, 30].map((d) => (
            <a
              key={d}
              href={`?window=${d}`}
              className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider"
              style={{
                borderRadius: "6px",
                fontFamily: "var(--font-mono)",
                backgroundColor:
                  windowDays === d ? "var(--color-accent)" : "transparent",
                color: windowDays === d ? "#fff" : "var(--color-muted)",
                textDecoration: "none",
              }}
            >
              {d}d
            </a>
          ))}
        </div>
      </div>

      {!isSupabaseConfigured() ? (
        <div className="card p-6 max-w-lg">
          <p className="stat text-xs mb-2" style={{ color: "var(--color-accent)" }}>
            SUPABASE NOT CONNECTED
          </p>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Uzupełnij <code>.env.local</code> żeby zobaczyć dane breakout.
          </p>
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="stat text-xs" style={{ color: "var(--color-muted)" }}>
              Ładowanie...
            </div>
          }
        >
          <BreakoutContent windowDays={windowDays} />
        </Suspense>
      )}
    </div>
  );
}
