"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const DISCIPLINES = [
  "skateboarding",
  "snowboarding",
  "freestyle skiing",
  "mountain biking",
  "BMX",
  "surfing",
  "rock climbing",
  "motocross",
  "trail running",
  "athletics",
  "cycling",
  "extreme sports",
];

const RED_BULL_STATUSES = [
  { value: "unsigned", label: "Bez dealu" },
  { value: "signed",   label: "Red Bull" },
  { value: "unknown",  label: "Nieznany" },
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
  total: number;
}

export function AthleteFilters({
  discipline,
  red_bull_status,
  sort,
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

  const hasFilters = !!(discipline || red_bull_status);

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      {/* Discipline */}
      <select
        value={discipline ?? ""}
        onChange={(e) => setParam("discipline", e.target.value || null)}
        className="text-xs px-3 py-1.5 outline-none cursor-pointer"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          color: discipline ? "var(--color-text)" : "var(--color-muted)",
          borderRadius: "8px",
          fontFamily: "var(--font-body)",
        }}
      >
        <option value="">Dyscyplina</option>
        {DISCIPLINES.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>

      {/* Red Bull status */}
      <select
        value={red_bull_status ?? ""}
        onChange={(e) => setParam("red_bull_status", e.target.value || null)}
        className="text-xs px-3 py-1.5 outline-none cursor-pointer"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          color: red_bull_status ? "var(--color-text)" : "var(--color-muted)",
          borderRadius: "8px",
          fontFamily: "var(--font-body)",
        }}
      >
        <option value="">Status Red Bull</option>
        {RED_BULL_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      {/* Sort */}
      <select
        value={sort ?? "talent_score"}
        onChange={(e) => setParam("sort", e.target.value)}
        className="text-xs px-3 py-1.5 outline-none cursor-pointer"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text)",
          borderRadius: "8px",
          fontFamily: "var(--font-body)",
        }}
      >
        {SORT_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      {/* Count + clear */}
      <span
        className="ml-auto text-xs"
        style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}
      >
        {total} zawodników
      </span>

      {hasFilters && (
        <button
          onClick={() => router.push(pathname)}
          className="text-xs"
          style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}
        >
          × wyczyść
        </button>
      )}
    </div>
  );
}
