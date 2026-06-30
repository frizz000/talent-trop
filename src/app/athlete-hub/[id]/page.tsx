import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";
import { ScoutNoteForm } from "./ScoutNoteForm";
import { WatchlistStatusSelect } from "./WatchlistStatusSelect";
import { updateDiscoveryStatus } from "./actions";

export const revalidate = 60;

type Props = { params: Promise<{ id: string }> };

function Sparkline({ scores }: { scores: number[] }) {
  if (scores.length < 2) return null;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;
  const W = 200, H = 44;
  const pts = scores
    .map((s, i) => {
      const x = (i / (scores.length - 1)) * W;
      const y = H - ((s - min) / range) * (H * 0.85) - H * 0.075;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <polyline
        points={pts}
        fill="none"
        stroke="var(--color-trend-up)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

const RB_LABELS: Record<string, string> = {
  signed: "Red Bull Signed",
  unsigned: "No Deal",
  unknown: "Status Unknown",
};
const RB_COLORS: Record<string, string> = {
  signed: "#e8351a",
  unsigned: "#6b6b6b",
  unknown: "#2a2a2a",
};
const IMPORTANCE_COLORS: Record<string, string> = {
  major: "#e8351a",
  international: "#f59e0b",
  national: "#84cc16",
  minor: "#6b6b6b",
};
const PLACEMENT_COLORS = (p: number | null) => {
  if (p === 1) return "#f59e0b";
  if (p === 2) return "#9ca3af";
  if (p === 3) return "#92400e";
  return "var(--color-muted)";
};

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  if (!isSupabaseConfigured()) return { title: "Zawodnik — Talent Trop" };
  const supabase = await createClient();
  const { data } = await supabase.from("athletes").select("name").eq("id", id).single();
  return { title: data ? `${data.name} — Talent Trop` : "Zawodnik — Talent Trop" };
}

export default async function AthleteProfilePage({ params }: Props) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <div className="p-8">
        <Link href="/athlete-hub" className="text-xs" style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>
          ← Athlete Hub
        </Link>
        <p className="mt-6 text-sm" style={{ color: "var(--color-muted)" }}>
          Supabase nie jest skonfigurowany.
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  const { data: athlete } = await supabase
    .from("athletes")
    .select("*")
    .eq("id", id)
    .single();

  if (!athlete) notFound();

  const [historyRes, brandFitRes, notesRes, eventsRes, newsRes] = await Promise.all([
    supabase
      .from("talent_score_history")
      .select("score, computed_at, factors")
      .eq("athlete_id", id)
      .order("computed_at", { ascending: true })
      .limit(30),
    supabase
      .from("brand_fit_scores")
      .select("score, factors, computed_at")
      .eq("athlete_id", id)
      .maybeSingle(),
    supabase
      .from("scout_notes")
      .select("id, note_text, created_at")
      .eq("athlete_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("event_results")
      .select("placement, score, notes, events(name, discipline, start_date, importance_level)")
      .eq("athlete_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("news_articles")
      .select("id, title, source, published_at, url, summary, sentiment")
      .eq("athlete_id", id)
      .order("published_at", { ascending: false })
      .limit(6),
  ]);

  const history = historyRes.data ?? [];
  const brandFit = brandFitRes.data;
  const notes = notesRes.data ?? [];
  const eventResults = eventsRes.data ?? [];
  const news = newsRes.data ?? [];

  const scores = history.map((h) => Number(h.score));
  const latestFactors =
    history.length > 0
      ? (history[history.length - 1].factors as Record<string, number> | null)
      : null;

  const age = athlete.birth_date
    ? Math.floor(
        (Date.now() - new Date(athlete.birth_date).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000)
      )
    : null;

  const brandFitFactors = brandFit?.factors as Record<string, unknown> | null;

  return (
    <div className="p-6 lg:p-8" style={{ maxWidth: "1100px" }}>
      {/* Back */}
      <Link
        href="/athlete-hub"
        className="text-xs uppercase tracking-wider mb-6 inline-block"
        style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}
      >
        ← Athlete Hub
      </Link>

      {/* Verification banner — auto_detected athletes only */}
      {athlete.discovery_status === "auto_detected" && (
        <div
          className="mb-6 p-4 flex items-center gap-4 flex-wrap"
          style={{
            border: "1px solid var(--color-accent)66",
            borderRadius: "8px",
            backgroundColor: "var(--color-accent)11",
          }}
        >
          <div className="flex-1 min-w-0">
            <p
              className="text-xs font-bold uppercase tracking-wider"
              style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent)" }}
            >
              NOWY KANDYDAT — WYKRYTY AUTOMATYCZNIE
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
              Zawodnik został odkryty przez pipeline z newsa. Zweryfikuj, czy to prawdziwy sportowiec.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <form action={updateDiscoveryStatus}>
              <input type="hidden" name="athlete_id" value={athlete.id} />
              <input type="hidden" name="status" value="confirmed" />
              <button
                type="submit"
                className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 cursor-pointer"
                style={{
                  fontFamily: "var(--font-display)",
                  backgroundColor: "var(--color-trend-up)22",
                  color: "var(--color-trend-up)",
                  border: "1px solid var(--color-trend-up)66",
                  borderRadius: "6px",
                }}
              >
                Potwierdź
              </button>
            </form>
            <form action={updateDiscoveryStatus}>
              <input type="hidden" name="athlete_id" value={athlete.id} />
              <input type="hidden" name="status" value="rejected" />
              <button
                type="submit"
                className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 cursor-pointer"
                style={{
                  fontFamily: "var(--font-display)",
                  backgroundColor: "var(--color-border)",
                  color: "var(--color-muted)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "6px",
                }}
              >
                Odrzuć
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="flex gap-6 mb-8 flex-wrap">
        {/* Photo */}
        <div
          className="shrink-0 flex items-center justify-center overflow-hidden"
          style={{
            width: "180px",
            height: "220px",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "10px",
          }}
        >
          {athlete.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={athlete.photo_url}
              alt={athlete.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span
              className="text-5xl font-bold uppercase"
              style={{ fontFamily: "var(--font-display)", color: "var(--color-muted)" }}
            >
              {athlete.name
                .split(" ")
                .map((p: string) => p[0])
                .slice(0, 2)
                .join("")}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <h1
            className="text-5xl font-bold uppercase leading-tight"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          >
            {athlete.name}
          </h1>

          {/* Meta */}
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="text-sm font-bold uppercase tracking-wider"
              style={{ fontFamily: "var(--font-display)", color: "var(--color-muted)" }}
            >
              {athlete.discipline}
            </span>
            {athlete.sub_discipline && (
              <>
                <span style={{ color: "var(--color-border)" }}>·</span>
                <span className="text-sm" style={{ color: "var(--color-muted)" }}>
                  {athlete.sub_discipline}
                </span>
              </>
            )}
            {athlete.hometown && (
              <>
                <span style={{ color: "var(--color-border)" }}>·</span>
                <span className="text-sm" style={{ color: "var(--color-muted)" }}>
                  {athlete.hometown}
                </span>
              </>
            )}
            {age && (
              <>
                <span style={{ color: "var(--color-border)" }}>·</span>
                <span className="stat text-sm" style={{ color: "var(--color-muted)" }}>
                  {age} lat
                </span>
              </>
            )}
          </div>

          {/* Badges + watchlist */}
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="text-xs font-bold uppercase tracking-wider px-2 py-0.5"
              style={{
                fontFamily: "var(--font-display)",
                backgroundColor: `${RB_COLORS[athlete.red_bull_status]}22`,
                color: RB_COLORS[athlete.red_bull_status],
                border: `1px solid ${RB_COLORS[athlete.red_bull_status]}44`,
                borderRadius: "4px",
              }}
            >
              {RB_LABELS[athlete.red_bull_status]}
            </span>
            <Suspense>
              <WatchlistStatusSelect athleteId={id} currentStatus={athlete.watchlist_status ?? null} />
            </Suspense>
          </div>

          {/* Score + sparkline */}
          <div className="flex items-end gap-8 flex-wrap">
            <div>
              <p
                className="text-xs uppercase tracking-wider mb-1 stat"
                style={{ color: "var(--color-muted)" }}
              >
                Talent Score
              </p>
              <p
                className="stat leading-none"
                style={{
                  fontSize: "60px",
                  fontWeight: 700,
                  color:
                    athlete.talent_score != null
                      ? "var(--color-trend-up)"
                      : "var(--color-muted)",
                }}
              >
                {athlete.talent_score != null
                  ? Number(athlete.talent_score).toFixed(0)
                  : "—"}
              </p>
            </div>

            {scores.length >= 2 && (
              <div>
                <p
                  className="text-xs uppercase tracking-wider mb-2 stat"
                  style={{ color: "var(--color-muted)" }}
                >
                  Trend ({scores.length} pkt)
                </p>
                <Sparkline scores={scores} />
              </div>
            )}

            {brandFit?.score != null && (
              <div>
                <p
                  className="text-xs uppercase tracking-wider mb-1 stat"
                  style={{ color: "var(--color-muted)" }}
                >
                  Brand Fit
                </p>
                <p
                  className="stat leading-none"
                  style={{ fontSize: "60px", fontWeight: 700, color: "#f59e0b" }}
                >
                  {Number(brandFit.score).toFixed(0)}
                </p>
              </div>
            )}
          </div>

          {/* Bio */}
          {athlete.bio_summary && (
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--color-muted)", maxWidth: "640px" }}
            >
              {athlete.bio_summary}
            </p>
          )}
        </div>
      </div>

      {/* Score breakdown */}
      {latestFactors && Object.keys(latestFactors).length > 0 && (
        <div className="card p-4 mb-6">
          <h2
            className="text-xs uppercase tracking-wider mb-3 stat"
            style={{ color: "var(--color-muted)" }}
          >
            Score Breakdown
          </h2>
          <div className="flex gap-8 flex-wrap">
            {Object.entries(latestFactors).map(([k, v]) => (
              <div key={k}>
                <p className="text-xs stat" style={{ color: "var(--color-muted)" }}>
                  {k.replace(/_/g, " ")}
                </p>
                <p className="stat text-lg font-bold" style={{ color: "var(--color-text)" }}>
                  {typeof v === "number" ? v.toFixed(2) : String(v)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Brand fit factors */}
      {brandFitFactors && Object.keys(brandFitFactors).length > 0 && (
        <div className="card p-4 mb-6">
          <h2
            className="text-xs uppercase tracking-wider mb-3 stat"
            style={{ color: "var(--color-muted)" }}
          >
            Brand Fit Factors
          </h2>
          <div className="flex gap-8 flex-wrap">
            {Object.entries(brandFitFactors)
              .filter(([, v]) => typeof v === "number")
              .map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs stat" style={{ color: "var(--color-muted)" }}>
                    {k.replace(/_/g, " ")}
                  </p>
                  <p
                    className="stat text-lg font-bold"
                    style={{ color: "#f59e0b" }}
                  >
                    {(v as number).toFixed(1)}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Bottom 3-col grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Event Results */}
        <div className="card p-4">
          <h2
            className="text-sm font-bold uppercase tracking-wider mb-3"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          >
            Wyniki zawodów
          </h2>
          {eventResults.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              Brak wyników.
            </p>
          ) : (
            <ul className="space-y-3">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {eventResults.map((er: any, i: number) => (
                <li
                  key={i}
                  className="flex items-start gap-3 pb-3"
                  style={{ borderBottom: "1px solid var(--color-border)" }}
                >
                  <span
                    className="stat text-xl font-bold w-8 text-center shrink-0 mt-0.5"
                    style={{ color: PLACEMENT_COLORS(er.placement) }}
                  >
                    {er.placement ?? "—"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-xs font-bold uppercase leading-tight truncate"
                      style={{
                        fontFamily: "var(--font-display)",
                        color: "var(--color-text)",
                      }}
                    >
                      {er.events?.name ?? "—"}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span
                        className="stat text-xs"
                        style={{ color: "var(--color-muted)" }}
                      >
                        {er.events?.start_date ?? ""}
                      </span>
                      {er.events?.importance_level && (
                        <span
                          className="stat text-xs"
                          style={{
                            color: IMPORTANCE_COLORS[er.events.importance_level],
                          }}
                        >
                          {er.events.importance_level.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* News */}
        <div className="card p-4">
          <h2
            className="text-sm font-bold uppercase tracking-wider mb-3"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          >
            Wzmianki medialne
          </h2>
          {news.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              Brak wzmianek powiązanych.
            </p>
          ) : (
            <ul className="space-y-3">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {news.map((article: any) => (
                <li
                  key={article.id}
                  className="pb-3"
                  style={{ borderBottom: "1px solid var(--color-border)" }}
                >
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover-underline text-sm font-medium leading-snug"
                    style={{ color: "var(--color-text)", textDecoration: "none" }}
                  >
                    {article.title}
                  </a>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="stat text-xs" style={{ color: "var(--color-muted)" }}>
                      {article.source}
                    </span>
                    <span className="stat text-xs" style={{ color: "var(--color-muted)" }}>
                      {new Date(article.published_at).toLocaleDateString("pl-PL")}
                    </span>
                    {article.sentiment && (
                      <span
                        className="text-xs"
                        style={{
                          color:
                            article.sentiment === "positive"
                              ? "var(--color-trend-up)"
                              : article.sentiment === "negative"
                                ? "var(--color-accent)"
                                : "var(--color-muted)",
                        }}
                      >
                        {article.sentiment === "positive"
                          ? "+"
                          : article.sentiment === "negative"
                            ? "–"
                            : "·"}
                      </span>
                    )}
                  </div>
                  {article.summary && (
                    <p
                      className="text-xs mt-1 leading-relaxed line-clamp-2"
                      style={{ color: "var(--color-muted)" }}
                    >
                      {article.summary}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Scout Notes */}
        <div className="card p-4">
          <h2
            className="text-sm font-bold uppercase tracking-wider mb-3"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          >
            Scout Notes
          </h2>
          {notes.length === 0 && (
            <p className="text-xs mb-3" style={{ color: "var(--color-muted)" }}>
              Brak notatek.
            </p>
          )}
          {notes.length > 0 && (
            <ul className="space-y-3 mb-4">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {notes.map((note: any) => (
                <li
                  key={note.id}
                  className="pb-3"
                  style={{ borderBottom: "1px solid var(--color-border)" }}
                >
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--color-text)" }}
                  >
                    {note.note_text}
                  </p>
                  <p className="stat text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                    {new Date(note.created_at).toLocaleString("pl-PL", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <ScoutNoteForm athleteId={id} />
        </div>
      </div>
    </div>
  );
}
