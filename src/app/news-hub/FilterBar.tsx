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
  "other",
];

interface FilterBarProps {
  region: string;
  discipline?: string;
}

export function FilterBar({ region, discipline }: FilterBarProps) {
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

  const tabs = [
    { value: "all", label: "Wszystkie" },
    { value: "poland", label: "Polska" },
    { value: "world", label: "Świat" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      {/* Region toggle */}
      <div className="segmented">
        {tabs.map((tab) => {
          const active = region === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setParam("region", tab.value === "all" ? null : tab.value)}
              className={active ? "active" : undefined}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Discipline filter */}
      <select
        value={discipline ?? ""}
        onChange={(e) => setParam("discipline", e.target.value || null)}
        className="select"
        style={{ color: discipline ? "var(--color-text)" : "var(--color-muted)" }}
      >
        <option value="">Wszystkie dyscypliny</option>
        {DISCIPLINES.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      {/* Active filters indicator */}
      {(region !== "all" || discipline) && (
        <button onClick={() => router.push(pathname)} className="btn-ghost">
          × wyczyść filtry
        </button>
      )}
    </div>
  );
}
