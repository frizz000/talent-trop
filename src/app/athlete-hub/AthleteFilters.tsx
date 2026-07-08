"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

// Friendly labels for raw discipline values coming from the DB
const DISCIPLINE_LABELS: Record<string, string> = {
  mtb_xco: "MTB XCO",
  motocross: "Motocross",
  bouldering: "Bouldering",
};

const RED_BULL_STATUSES = [
  { value: "unsigned", label: "Bez dealu" },
  { value: "signed",   label: "Red Bull" },
  { value: "unknown",  label: "Nieznany" },
];

const DISCOVERY_OPTIONS = [
  { value: "",             label: "Bez odrzuconych" },
  { value: "auto_detected", label: "Do weryfikacji" },
  { value: "confirmed",    label: "Potwierdzeni" },
  { value: "rejected",     label: "Odrzuceni" },
];

const AGE_OPTIONS = [
  { value: "u16", label: "U16 (do 15 lat)" },
  { value: "u18", label: "U18 (do 17 lat)" },
  { value: "u21", label: "U21 (do 20 lat)" },
  { value: "u23", label: "U23 (do 22 lat)" },
];

const SORT_OPTIONS = [
  { value: "talent_score", label: "Talent Score ↓" },
  { value: "name",         label: "Imię A–Z" },
  { value: "created_at",   label: "Najnowsi" },
];

interface AthleteFiltersProps {
  discipline?: string;
  red_bull_status?: string;
  sort?: string;
  discovery_status?: string;
  age?: string;
  disciplines: string[];
  total: number;
}

export function AthleteFilters({
  discipline,
  red_bull_status,
  sort,
  discovery_status,
  age,
  disciplines,
  total,
}: AthleteFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const hasFilters = !!(discipline || red_bull_status || discovery_status || age);

  return (
    <div className="flex flex-wrap items-center gap-2.5 mb-6">
      {/* Discipline */}
      <select
        value={discipline ?? ""}
        onChange={(e) => setParam("discipline", e.target.value || null)}
        className="select"
        style={{ color: discipline ? "var(--color-text)" : "var(--color-muted)" }}
      >
        <option value="">Dyscyplina</option>
        {disciplines.map((d) => (
          <option key={d} value={d}>{DISCIPLINE_LABELS[d] ?? d}</option>
        ))}
      </select>

      {/* Age category */}
      <select
        value={age ?? ""}
        onChange={(e) => setParam("age", e.target.value || null)}
        className="select"
        style={{ color: age ? "var(--color-trend-up)" : "var(--color-muted)" }}
      >
        <option value="">Wiek</option>
        {AGE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Red Bull status */}
      <select
        value={red_bull_status ?? ""}
        onChange={(e) => setParam("red_bull_status", e.target.value || null)}
        className="select"
        style={{ color: red_bull_status ? "var(--color-text)" : "var(--color-muted)" }}
      >
        <option value="">Status Red Bull</option>
        {RED_BULL_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      {/* Discovery status */}
      <select
        value={discovery_status ?? ""}
        onChange={(e) => setParam("discovery_status", e.target.value || null)}
        className="select"
        style={{ color: discovery_status ? "var(--color-text)" : "var(--color-muted)" }}
      >
        {DISCOVERY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Sort */}
      <select
        value={sort ?? "talent_score"}
        onChange={(e) => setParam("sort", e.target.value)}
        className="select"
      >
        {SORT_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      {/* Count + clear */}
      <span
        className="ml-auto text-xs stat"
        style={{ color: "var(--color-muted)" }}
      >
        {total} zawodników
      </span>

      {hasFilters && (
        <button onClick={() => router.push(pathname)} className="btn-ghost">
          × wyczyść
        </button>
      )}
    </div>
  );
}
