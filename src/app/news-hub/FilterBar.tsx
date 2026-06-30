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
      <div
        className="flex overflow-hidden"
        style={{ border: "1px solid var(--color-border)", borderRadius: "8px" }}
      >
        {tabs.map((tab, i) => {
          const active = region === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setParam("region", tab.value === "all" ? null : tab.value)}
              className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
              style={{
                fontFamily: "var(--font-display)",
                backgroundColor: active ? "var(--color-accent)" : "transparent",
                color: active ? "#fff" : "var(--color-muted)",
                borderRight:
                  i < tabs.length - 1 ? "1px solid var(--color-border)" : "none",
              }}
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
        className="text-xs px-3 py-1.5 outline-none cursor-pointer"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          color: discipline ? "var(--color-text)" : "var(--color-muted)",
          borderRadius: "8px",
          fontFamily: "var(--font-body)",
        }}
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
        <button
          onClick={() => {
            const params = new URLSearchParams();
            router.push(pathname);
          }}
          className="text-xs px-3 py-1.5 transition-colors"
          style={{
            color: "var(--color-muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          × wyczyść filtry
        </button>
      )}
    </div>
  );
}
