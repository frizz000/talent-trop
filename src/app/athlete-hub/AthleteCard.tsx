import Image from "next/image";
import Link from "next/link";
import { relativeTime } from "@/lib/utils";

export interface FederationProfile {
  federation: string;
  ranking_category: string | null;
  ranking_position: number | null;
}

export interface SocialProfile {
  profile_pic_url: string | null;
}

export interface Athlete {
  id: string;
  name: string;
  discipline: string;
  birth_date?: string | null;
  talent_score?: number | null;
  red_bull_status: "signed" | "unsigned" | "unknown";
  social_status: "verified" | "pending_review" | "not_found";
  discovery_status?: "manual" | "auto_detected" | "confirmed" | "rejected" | null;
  photo_url?: string | null;
  bio_summary?: string | null;
  created_at: string;
  federation_profiles?: FederationProfile[];
  social_profiles?: SocialProfile[];
}

function isSupabaseStorageUrl(url: string): boolean {
  return url.includes("/storage/v1/object/public/");
}

const FEDERATION_LABELS: Record<string, string> = {
  pza: "PZA",
  pzkol_mtb: "PZKol",
  pzm_motocross: "PZM",
};

// Prefix-based so per-discipline variants (u16_women_bouldering) resolve too
const CATEGORY_LABEL_PREFIXES: [string, string][] = [
  ["u13", "U13"], ["u14", "U14"], ["u15", "U15"], ["u16", "U16"],
  ["u17", "U17"], ["u18", "U18"], ["u23", "U23"],
  ["mx_junior", "MX Junior"], ["mx65", "MX65"], ["mx85", "MX85"],
  ["junior", "Junior"], ["elite", "Elita"], ["senior", "Senior"],
  ["masters", "Masters"],
];

function categoryLabel(category: string): string {
  const match = CATEGORY_LABEL_PREFIXES.find(([p]) => category.startsWith(p));
  return match ? match[1] : category;
}

function ageFromBirthDate(birthDate: string): number {
  return Math.floor(
    (Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  );
}

function bestFederationBadge(profiles?: FederationProfile[]): string | null {
  if (!profiles || profiles.length === 0) return null;
  const best = [...profiles].sort(
    (a, b) => (a.ranking_position ?? 999) - (b.ranking_position ?? 999)
  )[0];
  const fed = FEDERATION_LABELS[best.federation] ?? best.federation.toUpperCase();
  const cat = best.ranking_category ? categoryLabel(best.ranking_category) : null;
  const pos = best.ranking_position != null ? `#${best.ranking_position}` : null;
  return [fed, cat, pos].filter(Boolean).join(" ");
}

const STATUS_COLORS: Record<string, string> = {
  signed: "#e60d3f",
  unsigned: "#8a92ab",
  unknown: "#4a5372",
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
  const age = athlete.birth_date ? ageFromBirthDate(athlete.birth_date) : null;
  const fedBadge = bestFederationBadge(athlete.federation_profiles);
  const avatarUrl =
    athlete.photo_url ??
    athlete.social_profiles?.find((p) => p.profile_pic_url)?.profile_pic_url ??
    null;

  return (
    <Link href={`/athlete-hub/${athlete.id}`} style={{ textDecoration: "none", display: "block", height: "100%" }}>
    <div
      className="card hover-border-accent overflow-hidden flex flex-col h-full"
    >
      {/* Photo / initials */}
      <div
        className="relative zoom-media"
        style={{ height: "150px", backgroundColor: "var(--color-bg)" }}
      >
        {avatarUrl && isSupabaseStorageUrl(avatarUrl) ? (
          <Image
            src={avatarUrl}
            alt={athlete.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 20vw"
            className="object-cover"
          />
        ) : avatarUrl ? (
          // Arbitrary external hosts can't be allowlisted in next.config —
          // fall back to a plain <img> for non-Storage photo URLs
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
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
          <span className="chip self-start" style={{ color: "var(--color-gold)" }}>
            NOWY — do weryfikacji
          </span>
        )}

        {/* Discipline + age */}
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          {athlete.discipline}
          {age != null && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                color: age < 18 ? "var(--color-trend-up)" : "var(--color-muted)",
              }}
            >
              {" • "}{age} lat
            </span>
          )}
        </p>

        {/* Federation ranking badge */}
        {fedBadge && (
          <span className="chip self-start" style={{ color: "var(--color-muted)" }}>
            {fedBadge}
          </span>
        )}

        {/* Scores row */}
        <div className="flex items-end gap-3 mt-1">
          {/* Talent score */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between mb-1">
              <p
                className="text-[10px] uppercase tracking-wider"
                style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}
              >
                Score
              </p>
              <span
                className="chip"
                style={{ color: STATUS_COLORS[athlete.red_bull_status] }}
              >
                {STATUS_LABELS[athlete.red_bull_status]}
              </span>
            </div>
            <p
              className="text-2xl font-bold leading-none stat"
              style={{
                color: score != null ? "var(--color-trend-up)" : "var(--color-muted)",
              }}
            >
              {score != null ? score.toFixed(0) : "—"}
            </p>
            {score != null && (
              <div className="score-bar mt-1.5">
                <span style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
              </div>
            )}
          </div>
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
