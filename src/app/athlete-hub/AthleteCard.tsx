import Link from "next/link";
import { relativeTime } from "@/lib/utils";

export interface Athlete {
  id: string;
  name: string;
  discipline: string;
  talent_score?: number | null;
  red_bull_status: "signed" | "unsigned" | "unknown";
  social_status: "verified" | "pending_review" | "not_found";
  discovery_status?: "manual" | "auto_detected" | "confirmed" | "rejected" | null;
  photo_url?: string | null;
  bio_summary?: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  signed: "#e8351a",
  unsigned: "#6b6b6b",
  unknown: "#2a2a2a",
};

const STATUS_LABELS: Record<string, string> = {
  signed: "Red Bull",
  unsigned: "No deal",
  unknown: "Unknown",
};

const SOCIAL_ICONS: Record<string, string> = {
  verified: "●",
  pending_review: "◐",
  not_found: "○",
};

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(" ");
  const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return (
    <div
      className="flex items-center justify-center text-2xl font-bold uppercase"
      style={{
        width: "100%",
        height: "100%",
        fontFamily: "var(--font-display)",
        color: "var(--color-muted)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      {letters}
    </div>
  );
}

export function AthleteCard({ athlete }: { athlete: Athlete }) {
  const score = athlete.talent_score;

  return (
    <Link href={`/athlete-hub/${athlete.id}`} style={{ textDecoration: "none", display: "block", height: "100%" }}>
    <div
      className="card hover-border-accent overflow-hidden flex flex-col h-full"
    >
      {/* Photo / initials */}
      <div style={{ height: "140px", backgroundColor: "var(--color-bg)" }}>
        {athlete.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={athlete.photo_url}
            alt={athlete.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <Initials name={athlete.name} />
        )}
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        {/* Name */}
        <h3
          className="text-xl font-bold uppercase leading-tight"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          {athlete.name}
        </h3>

        {/* Discovery badge */}
        {athlete.discovery_status === "auto_detected" && (
          <span
            className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 self-start"
            style={{
              fontFamily: "var(--font-mono)",
              backgroundColor: "var(--color-accent)22",
              color: "var(--color-accent)",
              border: "1px solid var(--color-accent)44",
              borderRadius: "4px",
            }}
          >
            NOWY — do weryfikacji
          </span>
        )}

        {/* Discipline */}
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          {athlete.discipline}
        </p>

        {/* Scores row */}
        <div className="flex items-center gap-3 mt-1">
          {/* Talent score */}
          <div>
            <p
              className="text-xs uppercase tracking-wider mb-0.5"
              style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}
            >
              Score
            </p>
            <p
              className="text-2xl font-bold leading-none stat"
              style={{
                color: score != null ? "var(--color-trend-up)" : "var(--color-muted)",
              }}
            >
              {score != null ? score.toFixed(0) : "—"}
            </p>
          </div>

          <div style={{ flex: 1 }} />

          {/* Red Bull status badge */}
          <span
            className="text-xs font-bold uppercase tracking-wider px-2 py-0.5"
            style={{
              fontFamily: "var(--font-display)",
              backgroundColor: `${STATUS_COLORS[athlete.red_bull_status]}22`,
              color: STATUS_COLORS[athlete.red_bull_status],
              border: `1px solid ${STATUS_COLORS[athlete.red_bull_status]}44`,
              borderRadius: "4px",
            }}
          >
            {STATUS_LABELS[athlete.red_bull_status]}
          </span>
        </div>

        {/* Bio */}
        {athlete.bio_summary && (
          <p
            className="text-xs line-clamp-2 leading-relaxed mt-1"
            style={{ color: "var(--color-muted)" }}
          >
            {athlete.bio_summary}
          </p>
        )}

        {/* Footer */}
        <div
          className="flex items-center gap-2 mt-auto pt-2"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          <span
            className="text-xs"
            style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}
            title={`Social: ${athlete.social_status}`}
          >
            {SOCIAL_ICONS[athlete.social_status]} IG
          </span>
          <span
            className="ml-auto text-xs"
            style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}
          >
            {relativeTime(athlete.created_at)}
          </span>
        </div>
      </div>
    </div>
    </Link>
  );
}
