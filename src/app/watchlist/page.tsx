import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";

export const metadata = { title: "Watchlist — Talent Trop" };
export const revalidate = 60;

const STATUS_ORDER = ["recommended", "contacted", "watching"] as const;
type WatchlistStatus = (typeof STATUS_ORDER)[number];

const STATUS_CONFIG: Record<
  WatchlistStatus,
  { label: string; color: string }
> = {
  recommended: { label: "Rekomendowany", color: "#a3e635" },
  contacted:   { label: "Kontakt nawiązany", color: "#ffc906" },
  watching:    { label: "Obserwuję", color: "#8a92ab" },
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
      <PageHeader
        kicker="Scout CRM"
        title="Watchlist"
        subtitle={`Prywatna warstwa CRM — ${total} zawodnik${total === 1 ? "" : "ów"} obserwowanych`}
      />

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
        <div className="space-y-8 stagger">
          {STATUS_ORDER.map((status) => {
            const list = grouped[status];
            if (list.length === 0) return null;
            const cfg = STATUS_CONFIG[status];

            return (
              <section key={status}>
                {/* Section header */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="chip" style={{ color: cfg.color }}>
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
                          className="hover-surface flex items-center gap-4 px-4 py-3"
                          style={{
                            borderBottom: isLast
                              ? "none"
                              : "1px solid var(--color-border)",
                          }}
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
