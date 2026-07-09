"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { searchAthletes, type AthleteSearchResult } from "./actions";

const MAX_ATHLETES = 4;

/** Debounced name search that appends the picked athlete to ?ids= in the URL. */
export function AthletePicker({ selectedIds }: { selectedIds: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AthleteSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  const full = selectedIds.length >= MAX_ATHLETES;

  useEffect(() => {
    const q = query.trim();
    const t = setTimeout(async () => {
      if (q.length < 2) {
        setResults([]);
        return;
      }
      const found = await searchAthletes(q);
      setResults(found.filter((a) => !selectedIds.includes(a.id)));
      setOpen(true);
    }, 250);
    return () => clearTimeout(t);
  }, [query, selectedIds]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function addAthlete(id: string) {
    const ids = [...selectedIds, id].slice(0, MAX_ATHLETES);
    const params = new URLSearchParams(searchParams.toString());
    params.set("ids", ids.join(","));
    setQuery("");
    setResults([]);
    setOpen(false);
    startTransition(() => router.push(`/compare?${params.toString()}`));
  }

  return (
    <div ref={containerRef} className="relative" style={{ maxWidth: "420px" }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={
          full
            ? `Maksymalnie ${MAX_ATHLETES} zawodników — usuń kogoś, by dodać`
            : "Szukaj zawodnika po nazwisku…"
        }
        disabled={full}
        className="w-full text-sm px-3.5 py-2.5"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "8px",
          color: "var(--color-text)",
          fontFamily: "var(--font-body)",
          opacity: full ? 0.6 : 1,
        }}
      />
      {open && results.length > 0 && (
        <ul
          className="absolute z-20 w-full mt-1 overflow-hidden"
          style={{
            backgroundColor: "var(--color-surface-2)",
            border: "1px solid var(--color-border-strong)",
            borderRadius: "10px",
          }}
        >
          {results.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => addAthlete(a.id)}
                className="hover-surface w-full flex items-center gap-3 px-3.5 py-2.5 text-left cursor-pointer"
                style={{
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <span
                  className="flex-1 min-w-0 truncate text-sm font-bold uppercase"
                  style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
                >
                  {a.name}
                </span>
                <span className="text-xs shrink-0" style={{ color: "var(--color-muted)" }}>
                  {a.discipline}
                </span>
                <span
                  className="stat text-sm font-bold shrink-0 w-8 text-right"
                  style={{
                    color:
                      a.talent_score != null ? "var(--color-trend-up)" : "var(--color-muted)",
                  }}
                >
                  {a.talent_score != null ? a.talent_score.toFixed(0) : "—"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
