import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

export const metadata = { title: "Gap Analysis — Talent Trop" };
export const revalidate = 3600;

const COUNTRIES = ["poland", "germany", "czech_republic", "france", "austria"] as const;
const COUNTRY_LABELS: Record<string, string> = {
  poland: "Polska",
  germany: "DE",
  czech_republic: "CZ",
  france: "FR",
  austria: "AT",
};

const COVERAGE = {
  strong:  { label: "Strong",  color: "#84cc16", bg: "#84cc1618" },
  partial: { label: "Partial", color: "#f59e0b", bg: "#f59e0b18" },
  weak:    { label: "Weak",    color: "#f97316", bg: "#f9731618" },
  none:    { label: "Gap",     color: "#e8351a", bg: "#e8351a18" },
  unknown: { label: "?",       color: "#6b6b6b", bg: "#6b6b6b10" },
} as const;

type CoverageKey = keyof typeof COVERAGE;

function CoverageCell({ status }: { status: string }) {
  const cfg = COVERAGE[(status as CoverageKey) ?? "unknown"] ?? COVERAGE.unknown;
  return (
    <td
      style={{
        backgroundColor: cfg.bg,
        color: cfg.color,
        border: "1px solid var(--color-border)",
        padding: "8px 12px",
        textAlign: "center",
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </td>
  );
}

type DisciplineGap = {
  discipline: string;
  poland_coverage_status: string;
  comparator_countries_coverage: Record<string, string>;
  priority_score: number | null;
};

export default async function GapAnalysisPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="p-6 lg:p-8">
        <h1
          className="text-5xl font-bold uppercase tracking-tight leading-none mb-4"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Gap Analysis
        </h1>
        <div className="card p-6 max-w-lg">
          <p className="stat text-xs mb-2" style={{ color: "var(--color-accent)" }}>
            SUPABASE NOT CONNECTED
          </p>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Uzupełnij <code>.env.local</code> i uruchom seed SQL (<code>supabase/seeds/001_discipline_gaps.sql</code>).
          </p>
        </div>
      </div>
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("discipline_gaps")
    .select("discipline, poland_coverage_status, comparator_countries_coverage, priority_score")
    .order("priority_score", { ascending: false });

  const gaps: DisciplineGap[] = (data ?? []).map((row) => ({
    discipline: row.discipline,
    poland_coverage_status: row.poland_coverage_status ?? "unknown",
    comparator_countries_coverage:
      (row.comparator_countries_coverage as Record<string, string>) ?? {},
    priority_score: row.priority_score,
  }));

  const topOpportunities = gaps.filter(
    (g) => g.poland_coverage_status === "none" || g.poland_coverage_status === "weak"
  );

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-5xl font-bold uppercase tracking-tight leading-none"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Gap Analysis
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>
          Red Bull Heatmap — pokrycie dyscyplin Polska vs. komparatory
        </p>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <span className="text-xs stat" style={{ color: "var(--color-muted)" }}>
          Legenda:
        </span>
        {Object.entries(COVERAGE).map(([key, cfg]) => (
          <span
            key={key}
            className="text-xs font-bold px-2 py-0.5"
            style={{
              backgroundColor: cfg.bg,
              color: cfg.color,
              border: `1px solid ${cfg.color}44`,
              borderRadius: "4px",
              fontFamily: "var(--font-mono)",
            }}
          >
            {cfg.label}
          </span>
        ))}
        <span className="text-xs ml-2" style={{ color: "var(--color-muted)" }}>
          — kolumna{" "}
          <strong style={{ color: "var(--color-accent)" }}>Polska</strong> = priorytety skauta
        </span>
      </div>

      {/* Summary pills */}
      {topOpportunities.length > 0 && (
        <div className="mb-6">
          <p
            className="text-xs uppercase tracking-wider mb-2 stat"
            style={{ color: "var(--color-muted)" }}
          >
            Największe luki w Polsce ({topOpportunities.length} dyscyplin)
          </p>
          <div className="flex gap-2 flex-wrap">
            {topOpportunities.map((g) => (
              <span
                key={g.discipline}
                className="text-xs font-bold uppercase px-2 py-1"
                style={{
                  backgroundColor: "#e8351a18",
                  color: "#e8351a",
                  border: "1px solid #e8351a44",
                  borderRadius: "4px",
                  fontFamily: "var(--font-display)",
                }}
              >
                {g.discipline}
                {g.priority_score != null && (
                  <span className="ml-1 stat" style={{ fontFamily: "var(--font-mono)", opacity: 0.7 }}>
                    {g.priority_score}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="card p-4 mb-4 max-w-lg">
          <p className="text-xs stat" style={{ color: "var(--color-accent)" }}>
            Błąd zapytania: {error.message}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
            Uruchom seed: <code>supabase/seeds/001_discipline_gaps.sql</code>
          </p>
        </div>
      )}

      {/* Heatmap table */}
      {gaps.length === 0 && !error ? (
        <div className="card p-6 max-w-lg">
          <p className="stat text-xs mb-2" style={{ color: "var(--color-muted)" }}>
            BRAK DANYCH
          </p>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Uruchom seed SQL: <code>supabase/seeds/001_discipline_gaps.sql</code>
          </p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              minWidth: "640px",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              overflow: "hidden",
            }}
          >
            <thead>
              <tr style={{ backgroundColor: "var(--color-surface)" }}>
                <th
                  style={{
                    padding: "10px 14px",
                    textAlign: "left",
                    fontFamily: "var(--font-display)",
                    fontSize: "11px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--color-muted)",
                    border: "1px solid var(--color-border)",
                    whiteSpace: "nowrap",
                  }}
                >
                  Dyscyplina
                </th>
                <th
                  style={{
                    padding: "10px 12px",
                    textAlign: "center",
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--color-muted)",
                    border: "1px solid var(--color-border)",
                    whiteSpace: "nowrap",
                  }}
                >
                  Priorytet
                </th>
                {COUNTRIES.map((c) => (
                  <th
                    key={c}
                    style={{
                      padding: "10px 12px",
                      textAlign: "center",
                      fontFamily: "var(--font-display)",
                      fontSize: "12px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: c === "poland" ? "var(--color-accent)" : "var(--color-muted)",
                      border: "1px solid var(--color-border)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {COUNTRY_LABELS[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gaps.map((gap) => (
                <tr
                  key={gap.discipline}
                  style={{ backgroundColor: "var(--color-bg)" }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.backgroundColor =
                      "var(--color-surface)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.backgroundColor =
                      "var(--color-bg)")
                  }
                >
                  {/* Discipline name */}
                  <td
                    style={{
                      padding: "10px 14px",
                      fontFamily: "var(--font-display)",
                      fontSize: "13px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color: "var(--color-text)",
                      border: "1px solid var(--color-border)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {gap.discipline}
                  </td>

                  {/* Priority score */}
                  <td
                    style={{
                      padding: "10px 12px",
                      textAlign: "center",
                      fontFamily: "var(--font-mono)",
                      fontSize: "13px",
                      fontWeight: 700,
                      color:
                        (gap.priority_score ?? 0) >= 80
                          ? "var(--color-accent)"
                          : (gap.priority_score ?? 0) >= 60
                            ? "#f59e0b"
                            : "var(--color-muted)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    {gap.priority_score ?? "—"}
                  </td>

                  {/* Country cells */}
                  {COUNTRIES.map((c) => {
                    const status =
                      c === "poland"
                        ? gap.poland_coverage_status
                        : (gap.comparator_countries_coverage[c] ?? "unknown");
                    return <CoverageCell key={c} status={status} />;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Source note */}
      <p className="mt-4 text-xs stat" style={{ color: "var(--color-muted)" }}>
        Dane: tabela <code>discipline_gaps</code> · Źródło: analiza publicznych rosterów Red Bull ·{" "}
        <span style={{ color: "var(--color-accent)" }}>
          ⚠ Zweryfikuj ręcznie przed prezentacją klientowi
        </span>
      </p>
    </div>
  );
}
