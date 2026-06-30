import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";
import { CalendarFilters } from "./CalendarFilters";

export const metadata = { title: "Kalendarz — Talent Trop" };
export const revalidate = 3600;

type PageProps = {
  searchParams: Promise<{ discipline?: string; importance?: string }>;
};

const IMPORTANCE_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  major:         { label: "Major", color: "#e8351a", bg: "#e8351a18" },
  international: { label: "Intl",  color: "#f59e0b", bg: "#f59e0b18" },
  national:      { label: "Kraj",  color: "#84cc16", bg: "#84cc1618" },
  minor:         { label: "Minor", color: "#6b6b6b", bg: "#6b6b6b15" },
};

type Event = {
  id: string;
  name: string;
  discipline: string;
  location: string | null;
  start_date: string;
  end_date: string | null;
  importance_level: string;
};

function formatDatePL(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

function formatWeekHeader(isoMonday: string): string {
  const d = new Date(isoMonday);
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${d.toLocaleDateString("pl-PL", opts)} – ${end.toLocaleDateString("pl-PL", opts)}`;
}

function EventRow({ event }: { event: Event }) {
  const cfg = IMPORTANCE_CONFIG[event.importance_level] ?? IMPORTANCE_CONFIG.minor;
  const isMultiDay = event.end_date && event.end_date !== event.start_date;

  return (
    <div
      className="flex items-start gap-4 px-4 py-3"
      style={{ borderBottom: "1px solid var(--color-border)" }}
    >
      {/* Date */}
      <div
        className="shrink-0 text-center"
        style={{ minWidth: "48px" }}
      >
        <p
          className="stat text-lg font-bold leading-none"
          style={{ color: "var(--color-text)" }}
        >
          {new Date(event.start_date).getDate()}
        </p>
        <p
          className="stat text-xs"
          style={{ color: "var(--color-muted)" }}
        >
          {new Date(event.start_date).toLocaleDateString("pl-PL", { month: "short" })}
        </p>
      </div>

      {/* Divider */}
      <div
        style={{
          width: "1px",
          alignSelf: "stretch",
          backgroundColor: "var(--color-border)",
          flexShrink: 0,
        }}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3
            className="font-bold uppercase text-sm leading-tight"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          >
            {event.name}
          </h3>
          <span
            className="text-xs font-bold px-1.5 py-0.5"
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
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            {event.discipline}
          </span>
          {event.location && (
            <>
              <span style={{ color: "var(--color-border)" }}>·</span>
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                {event.location}
              </span>
            </>
          )}
          {isMultiDay && (
            <>
              <span style={{ color: "var(--color-border)" }}>·</span>
              <span
                className="stat text-xs"
                style={{ color: "var(--color-muted)" }}
              >
                do {formatDatePL(event.end_date!)}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function CalendarPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { discipline, importance } = params;

  if (!isSupabaseConfigured()) {
    return (
      <div className="p-6 lg:p-8">
        <h1
          className="text-5xl font-bold uppercase tracking-tight leading-none mb-4"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Kalendarz
        </h1>
        <div className="card p-6 max-w-lg">
          <p className="stat text-xs mb-2" style={{ color: "var(--color-accent)" }}>
            SUPABASE NOT CONNECTED
          </p>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Uzupełnij <code>.env.local</code> żeby zobaczyć kalendarz.
          </p>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  let query = supabase
    .from("events")
    .select("id, name, discipline, location, start_date, end_date, importance_level")
    .gte("start_date", today)
    .order("start_date")
    .limit(100);

  if (discipline) query = query.eq("discipline", discipline);
  if (importance) query = query.eq("importance_level", importance);

  const { data: eventsData, error } = await query;
  const events: Event[] = (eventsData ?? []) as Event[];

  // Group by week
  const weeks = new Map<string, Event[]>();
  for (const event of events) {
    const key = getWeekKey(event.start_date);
    const list = weeks.get(key) ?? [];
    list.push(event);
    weeks.set(key, list);
  }
  const sortedWeeks = [...weeks.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  );

  // Discipline list for filter
  const disciplines = [...new Set(events.map((e) => e.discipline))].sort();

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-5xl font-bold uppercase tracking-tight leading-none"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Kalendarz
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>
          Nadchodzące zawody — {events.length} wydarzeń
        </p>
      </div>

      {/* Filters */}
      <Suspense fallback={<div style={{ height: "36px" }} />}>
        <CalendarFilters
          disciplines={disciplines}
          discipline={discipline}
          importance={importance}
          total={events.length}
        />
      </Suspense>

      {/* Error */}
      {error && (
        <div className="card p-4 mb-4 max-w-lg">
          <p className="stat text-xs" style={{ color: "var(--color-accent)" }}>
            Błąd: {error.message}
          </p>
        </div>
      )}

      {/* No data */}
      {events.length === 0 && !error && (
        <div className="card p-6 max-w-lg">
          <p className="stat text-xs mb-2" style={{ color: "var(--color-muted)" }}>
            BRAK WYDARZEŃ
          </p>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Brak nadchodzących wydarzeń w bazie. Wstaw eventy do tabeli{" "}
            <code>events</code> przez Supabase SQL Editor.
          </p>
        </div>
      )}

      {/* Timeline grouped by week */}
      {sortedWeeks.length > 0 && (
        <div className="space-y-8">
          {sortedWeeks.map(([weekKey, weekEvents]) => (
            <section key={weekKey}>
              <h2
                className="text-xs uppercase tracking-widest mb-3 stat"
                style={{ color: "var(--color-muted)" }}
              >
                {formatWeekHeader(weekKey)}
              </h2>
              <div
                className="card overflow-hidden"
                style={{ borderRadius: "8px" }}
              >
                {weekEvents.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
