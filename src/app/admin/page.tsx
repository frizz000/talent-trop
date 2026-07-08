import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import {
  PipelineControls,
  type PipelineSettingsRow,
  type WorkflowSettingsRow,
} from "./PipelineControls";

export const metadata = { title: "Admin — Talent Trop" };
export const revalidate = 60;

type IngestionRun = {
  id: string;
  source: string;
  status: "running" | "success" | "error";
  items_processed: number;
  started_at: string;
  finished_at: string | null;
  error_log: string | null;
};

const STATUS_CONFIG = {
  running: { label: "Running",  color: "#ffc906", dot: "●" },
  success: { label: "Success",  color: "#a3e635", dot: "●" },
  error:   { label: "Error",    color: "#ff3564", dot: "●" },
} as const;

function durationStr(start: string, end: string | null): string {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

export default async function AdminPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="p-6 lg:p-8">
        <h1
          className="text-5xl font-bold uppercase tracking-tight leading-none mb-4"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Admin
        </h1>
        <div className="card p-6 max-w-lg">
          <p className="stat text-xs mb-2" style={{ color: "var(--color-accent)" }}>
            SUPABASE NOT CONNECTED
          </p>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Uzupełnij <code>.env.local</code> żeby zobaczyć panel pipeline.
          </p>
        </div>
      </div>
    );
  }

  const supabase = await createClient();

  const [{ data: runs, error }, pipelineRes, workflowRes] = await Promise.all([
    supabase
      .from("ingestion_runs")
      .select(
        "id, source, status, items_processed, started_at, finished_at, error_log"
      )
      .order("started_at", { ascending: false })
      .limit(30),
    supabase
      .from("pipeline_settings")
      .select("is_enabled, disabled_by_reason, updated_at")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("workflow_settings")
      .select("workflow_id, is_enabled, updated_at"),
  ]);

  const pipelineSettings = (pipelineRes.data ?? null) as PipelineSettingsRow | null;
  const workflowSettings = (workflowRes.data ?? []) as WorkflowSettingsRow[];

  const ingestionRuns: IngestionRun[] = (runs ?? []) as IngestionRun[];

  // Summary stats
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentRuns = ingestionRuns.filter((r) => r.started_at >= last24h);
  const totalProcessed = recentRuns.reduce(
    (sum, r) => sum + (r.items_processed ?? 0),
    0
  );
  const errorCount = recentRuns.filter((r) => r.status === "error").length;
  const lastSuccess = ingestionRuns.find((r) => r.status === "success");

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        kicker="Pipeline observability"
        title="Admin"
        subtitle="Ostatnie 30 uruchomień pipeline'u"
      />

      {/* Kontrola pipeline'u — master switch + per-workflow switches */}
      <PipelineControls global={pipelineSettings} workflows={workflowSettings} />

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 stagger">
        {[
          {
            label: "Uruchomień 24h",
            value: String(recentRuns.length),
            color: "var(--color-text)",
          },
          {
            label: "Przetworzone 24h",
            value: String(totalProcessed),
            color: "var(--color-trend-up)",
          },
          {
            label: "Błędy 24h",
            value: String(errorCount),
            color: errorCount > 0 ? "var(--color-accent)" : "var(--color-muted)",
          },
          {
            label: "Ostatni sukces",
            value: lastSuccess
              ? new Date(lastSuccess.started_at).toLocaleString("pl-PL", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—",
            color: "var(--color-muted)",
          },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4">
            <p
              className="text-xs uppercase tracking-wider mb-1 stat"
              style={{ color: "var(--color-muted)" }}
            >
              {label}
            </p>
            <p
              className="stat text-2xl font-bold leading-none"
              style={{ color }}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="card p-4 mb-4 max-w-lg">
          <p className="stat text-xs" style={{ color: "var(--color-accent)" }}>
            Błąd: {error.message}
          </p>
        </div>
      )}

      {/* Runs table */}
      <div>
        <h2
          className="text-sm font-bold uppercase tracking-wider mb-3"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Historia uruchomień
        </h2>

        {ingestionRuns.length === 0 && !error ? (
          <div className="card p-6 max-w-lg">
            <p className="stat text-xs mb-2" style={{ color: "var(--color-muted)" }}>
              BRAK DANYCH
            </p>
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              Po uruchomieniu GitHub Actions pojawią się tutaj wpisy z tabeli{" "}
              <code>ingestion_runs</code>.
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "640px" }}>
              <thead>
                <tr style={{ backgroundColor: "var(--color-surface)" }}>
                  {["Źródło", "Status", "Items", "Czas", "Rozpoczęto", "Błąd"].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          padding: "10px 14px",
                          textAlign: "left",
                          fontFamily: "var(--font-mono)",
                          fontSize: "11px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "var(--color-muted)",
                          borderBottom: "1px solid var(--color-border)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {ingestionRuns.map((run, i) => {
                  const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.error;
                  const isLast = i === ingestionRuns.length - 1;
                  return (
                    <tr
                      key={run.id}
                      style={{ borderBottom: isLast ? "none" : "1px solid var(--color-border)" }}
                    >
                      <td
                        style={{
                          padding: "10px 14px",
                          fontFamily: "var(--font-mono)",
                          fontSize: "12px",
                          color: "var(--color-text)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {run.source}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span
                          style={{
                            color: cfg.color,
                            fontFamily: "var(--font-mono)",
                            fontSize: "12px",
                            fontWeight: 700,
                          }}
                        >
                          {cfg.dot} {cfg.label}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          fontFamily: "var(--font-mono)",
                          fontSize: "12px",
                          color: "var(--color-text)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {run.items_processed ?? 0}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          fontFamily: "var(--font-mono)",
                          fontSize: "12px",
                          color: "var(--color-muted)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {durationStr(run.started_at, run.finished_at)}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          fontFamily: "var(--font-mono)",
                          fontSize: "12px",
                          color: "var(--color-muted)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {new Date(run.started_at).toLocaleString("pl-PL", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          fontFamily: "var(--font-mono)",
                          fontSize: "11px",
                          color: "var(--color-accent)",
                          maxWidth: "240px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={run.error_log ?? ""}
                      >
                        {run.error_log ? run.error_log.slice(0, 80) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
