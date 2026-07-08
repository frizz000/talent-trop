"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

type Props = {
  disciplines: string[];
  discipline?: string;
  importance?: string;
  total: number;
};

const IMPORTANCE_LABELS: Record<string, string> = {
  major: "Major",
  international: "Intl",
  national: "Kraj",
  minor: "Minor",
};

export function CalendarFilters({ disciplines, discipline, importance, total }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  const hasFilters = !!(discipline || importance);

  return (
    <div className="flex items-center gap-3 mb-6 flex-wrap">
      <select
        value={discipline ?? ""}
        onChange={(e) => update("discipline", e.target.value)}
        className="select"
        style={{ color: discipline ? "var(--color-text)" : "var(--color-muted)" }}
      >
        <option value="">Wszystkie dyscypliny</option>
        {disciplines.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      <select
        value={importance ?? ""}
        onChange={(e) => update("importance", e.target.value)}
        className="select"
        style={{ color: importance ? "var(--color-text)" : "var(--color-muted)" }}
      >
        <option value="">Wszystkie rangi</option>
        {Object.entries(IMPORTANCE_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>

      {hasFilters && (
        <button onClick={() => router.push(pathname)} className="btn-ghost">
          × wyczyść
        </button>
      )}

      <span className="stat text-xs ml-1" style={{ color: "var(--color-muted)" }}>
        {total} wydarzeń
      </span>
    </div>
  );
}
