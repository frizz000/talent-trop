import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

export const metadata = { title: "Watchlist — Talent Trop" };
export const revalidate = 60;

const STATUS_ORDER = ["recommended", "contacted", "watching"] as const;
type WatchlistStatus = (typeof STATUS_ORDER)[number];

const STATUS_CONFIG: Record<
  WatchlistStatus,
  { label: string; color: string; bg: string }
> = {
  recommended: { label: "Rekomendowany", color: "#84cc16", bg: "#84cc1618" },
  contacted:   { label: "Kontakt nawiązany", color: "#f59e0b", bg: "#f59e0b18" },
  watching:    { label: "Obserwuję", color: "#6b6b6b", bg: "#6b6b6b15" },
};

type WatchedAthlete = {
  id: string;
  name: string;
  discipline: string;
  talent_score: number | null;
  watchlist_status: WatchlistStatus;
  photo_url: string | null;
};

type ScoutNote = {
  athlete_id: string;
  note_text: string;
  created_at: string;
};

export default async function WatchlistPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="p-6 lg:p-8">
        <h1
          className="text-5xl font-bold uppercase tracking-tight leading-none mb-4"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Watchlist
        </h1>
        <div className="card p-6 max-w-lg">
          <p className="stat text-xs mb-2" style={{ color: "var(--color-accent)" }}>
            SUPABASE NOT CONNECTED
          </p>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Uzupełnij <code>.env.local</code> żeby korzystać z Watchlisty.
          </p>
        </div>
      </div>
    );
  }

  const supabase = await createClient();

  const { data: athletes } = await supabase
    .from("athletes")
    .select("id, name, discipline, talent_score, watchlist_status, photo_url")
    .not("watchlist_status", "is", null)
    .order("talent_score", { ascending: false });

  const watchedAthletes: WatchedAthlete[] = (athletes ?? []) as WatchedAthlete[];
  const athleteIds = watchedAthletes.map((a) => a.id);

  let latestNotes: ScoutNote[] = [];
  if (athleteIds.length > 0) {
    const { data: notes } = await supabase
      .from("scout_notes")
      .select("athlete_id, note_text, created_at")
      .in("athlete_id", athleteIds)
      .order("created_at", { ascending: false });
    latestNotes = (notes ?? []) as ScoutNote[];
  }

  const latestNoteByAthlete = new Map<string, ScoutNote>();
  for (const note of latestNotes) {
    if (!latestNoteByAthlete.has(note.athlete_id)) {
      latestNoteByAthlete.set(note.athlete_id, note);
    }
  }

  const grouped = STATUS_ORDER.reduce(
    (acc, s) => {
      acc[s] = watchedAthletes.filter((a) => a.watchlist_status === s);
      return acc;
    },
    {} as Record<WatchlistStatus, WatchedAthlete[]>
  );

  const total = watchedAthletes.length;

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-5xl font-bold uppercase tracking-tight leading-none"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Watchlist
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>
          Prywatna warstwa CRM — {total} zawodnik{total === 1 ? "" : "ów"} obserwowanych
        </p>
      </div>

      {total === 0 ? (
        <div className="card p-6 max-w-lg">
          <p className="stat text-xs mb-2" style={{ color: "var(--color-muted)" }}>
            BRAK OBSERWOWANYCH
          </p>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Otwórz profil zawodnika w{" "}
            <Link href="/athlete-hub" style={{ color: "var(--color-accent)" }}>
              Athlete Hub
            </Link>{" "}
            i zmień status Watchlisty.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {STATUS_ORDER.map((status) => {
            const list = grouped[status];
            if (list.length === 0) return null;
            const cfg = STATUS_CONFIG[status];

            return (
              <section key={status}>
                {/* Section header */}
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className="text-xs font-bold uppercase tracking-wider px-2 py-0.5"
                    style={{
                      backgroundColor: cfg.bg,
                      color: cfg.color,
                      border: `1px solid ${cfg.color}44`,
                      borderRadius: "4px",
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    {cfg.label}
                  </span>
                  <span className="stat text-xs" style={{ color: "var(--color-muted)" }}>
                    {list.length}
                  </span>
                </div>

                {/* Athletes */}
                <div className="card overflow-hidden">
                  {list.map((athlete, i) => {
                    const lastNote = latestNoteByAthlete.get(athlete.id);
                    const isLast = i === list.length - 1;

                    return (
                      <Link
                        key={athlete.id}
                        href={`/athlete-hub/${athlete.id}`}
                        style={{ textDecoration: "none", display: "block" }}
                      >
                        <div
                          className="flex items-center gap-4 px-4 py-3"
                          style={{
                            borderBottom: isLast
                              ? "none"
                              : "1px solid var(--color-border)",
                            transition: "background-color 0.1s",
                          }}
                          onMouseEnter={(e) =>
                            ((e.currentTarget as HTMLElement).style.backgroundColor =
                              "var(--color-surface)")
                          }
                          onMouseLeave={(e) =>
                            ((e.currentTarget as HTMLElement).style.backgroundColor =
                              "transparent")
                          }
                        >
                          {/* Photo / initials */}
                          <div
                            className="shrink-0 flex items-center justify-center overflow-hidden text-sm font-bold uppercase"
                            style={{
                              width: "40px",
                              height: "40px",
                              borderRadius: "6px",
                              backgroundColor: "var(--color-bg)",
                              border: "1px solid var(--color-border)",
                              fontFamily: "var(--font-display)",
                              color: "var(--color-muted)",
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
                              athlete.name
                                .split(" ")
                                .map((p) => p[0])
                                .slice(0, 2)
                                .join("")
                            )}
                          </div>

                          {/* Name + last note */}
                          <div className="flex-1 min-w-0">
                            <p
                              className="font-bold uppercase text-sm leading-tight"
                              style={{
                                fontFamily: "var(--font-display)",
                                color: "var(--color-text)",
                              }}
                            >
                              {athlete.name}
                            </p>
                            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                              {athlete.discipline}
                            </p>
                            {lastNote && (
                              <p
                                className="text-xs mt-1 truncate"
                                style={{ color: "var(--color-muted)", maxWidth: "440px" }}
                              >
                                <span
                                  className="stat mr-1"
                                  style={{ color: "var(--color-border)" }}
                                >
                                  {new Date(lastNote.created_at).toLocaleDateString("pl-PL")}
                                </span>
                                {lastNote.note_text}
                              </p>
                            )}
                          </div>

                          {/* Score */}
                          <div className="text-right shrink-0">
                            <p
                              className="stat text-xl font-bold leading-none"
                              style={{
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
                            <p
                              className="stat text-xs mt-0.5"
                              style={{ color: "var(--color-muted)" }}
                            >
                              score
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
