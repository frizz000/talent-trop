"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import type {
  SearchAthleteResponse,
  DisambiguationCandidate,
} from "@/app/api/search-athlete/route";
import { addAthleteFromSearch } from "./actions";

type Phase = "idle" | "loading" | "result" | "error";

function formatCount(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("pl-PL");
}

function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const inputStyle: React.CSSProperties = {
  backgroundColor: "var(--color-surface-2)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  color: "var(--color-text)",
  outline: "none",
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="text-sm font-bold uppercase tracking-wider mb-3"
      style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
    >
      {children}
    </h3>
  );
}

export function SearchClient() {
  const [name, setName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SearchAthleteResponse | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, startAdding] = useTransition();
  // Blokada podwójnego odpalenia tego samego zapytania (kredyty Serper/Claude)
  const inFlight = useRef(false);

  async function runSearch(confirmedContext?: string) {
    if (inFlight.current) return;
    const trimmed = name.trim();
    if (trimmed.length < 3 || !trimmed.includes(" ")) {
      setError("Podaj imię i nazwisko zawodnika");
      setPhase("error");
      return;
    }

    inFlight.current = true;
    setPhase("loading");
    setError(null);
    setAddedId(null);
    setAddError(null);

    try {
      const resp = await fetch("/api/search-athlete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          keyword: keyword.trim() || undefined,
          confirmedContext,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        throw new Error(json.error ?? `Błąd ${resp.status}`);
      }
      setData(json as SearchAthleteResponse);
      setPhase("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nieznany błąd");
      setPhase("error");
    } finally {
      inFlight.current = false;
    }
  }

  function handleAdd() {
    if (!data) return;
    const { extraction, instagram, instagram_url } = data;
    const handle =
      instagram?.handle ??
      extraction.instagram_handle_guess ??
      (instagram_url ? instagram_url.split("/").filter(Boolean).pop() ?? null : null);

    startAdding(async () => {
      const result = await addAthleteFromSearch({
        name: name.trim(),
        discipline: extraction.discipline,
        birth_year: extraction.birth_year,
        nationality: extraction.nationality,
        club: extraction.club,
        summary: extraction.summary,
        instagram_handle: handle,
        instagram_followers: instagram?.followersCount ?? null,
        instagram_following: instagram?.followingCount ?? null,
        instagram_posts: instagram?.postsCount ?? null,
        instagram_verified: instagram?.isVerified ?? false,
        instagram_private: instagram?.isPrivate ?? false,
        instagram_bio: instagram?.bioText ?? null,
      });
      if (result.ok) {
        setAddedId(result.id);
      } else {
        setAddError(result.error);
      }
    });
  }

  const loading = phase === "loading";
  const showDisambiguation =
    phase === "result" && data?.extraction.disambiguation_needed;
  const showResult =
    phase === "result" && data && !data.extraction.disambiguation_needed;

  return (
    <div className="max-w-4xl">
      {/* Formularz */}
      <form
        className="card p-5 mb-6"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
      >
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Imię i nazwisko zawodnika *"
            required
            className="text-sm px-3 py-2.5 flex-1 min-w-[220px]"
            style={inputStyle}
          />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Dyscyplina / słowo kluczowe (opcjonalnie)"
            className="text-sm px-3 py-2.5 flex-1 min-w-[220px]"
            style={inputStyle}
          />
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 text-sm font-bold uppercase tracking-wider"
            style={{
              fontFamily: "var(--font-display)",
              borderRadius: 8,
              border: "none",
              backgroundColor: loading
                ? "var(--color-surface-2)"
                : "var(--color-accent)",
              color: loading ? "var(--color-muted)" : "#fff",
              cursor: loading ? "wait" : "pointer",
              transition: "background-color .15s ease",
            }}
          >
            {loading ? "Szukam…" : "Szukaj"}
          </button>
        </div>
        <p className="text-xs mt-3" style={{ color: "var(--color-muted)" }}>
          Słowo kluczowe (np. &bdquo;skoki narciarskie&rdquo;, &bdquo;CS2&rdquo;,
          &bdquo;BMX&rdquo;) pomaga odróżnić osoby o tym samym nazwisku.
        </p>
      </form>

      {/* Loading */}
      {loading && (
        <div className="card p-8 flex items-center gap-3">
          <span className="live-dot" />
          <p className="stat text-sm" style={{ color: "var(--color-muted)" }}>
            PRZESZUKUJĘ SIEĆ… Google → ekstrakcja LLM → Instagram
          </p>
        </div>
      )}

      {/* Błąd */}
      {phase === "error" && error && (
        <div
          className="px-4 py-3 mb-6"
          style={{
            borderRadius: 12,
            border: "1px solid var(--color-accent)",
            backgroundColor: "rgba(230, 13, 63, 0.12)",
          }}
        >
          <p className="text-sm font-bold" style={{ color: "var(--color-accent-hover)" }}>
            {error}
          </p>
        </div>
      )}

      {/* Baner: zawodnik już w bazie */}
      {phase === "result" && data?.existing_athlete && (
        <div
          className="px-4 py-3 mb-6 flex flex-wrap items-center gap-3"
          style={{
            borderRadius: 12,
            border: "1px solid var(--color-trend-up)",
            backgroundColor: "rgba(163, 230, 53, 0.08)",
          }}
        >
          <p className="text-sm flex-1" style={{ color: "var(--color-text)" }}>
            <strong>{data.existing_athlete.name}</strong> jest już w bazie{" "}
            <span style={{ color: "var(--color-muted)" }}>
              ({data.existing_athlete.discipline}
              {data.existing_athlete.talent_score != null &&
                `, talent score ${Math.round(data.existing_athlete.talent_score)}`}
              )
            </span>
          </p>
          <Link
            href={`/athlete-hub/${data.existing_athlete.id}`}
            className="text-sm font-bold hover-underline"
            style={{ color: "var(--color-trend-up)" }}
          >
            Przejdź do Athlete Hub →
          </Link>
        </div>
      )}

      {/* Disambiguacja — wiele osób o tym samym nazwisku */}
      {showDisambiguation && data && (
        <div>
          <SectionTitle>
            Znaleziono kilka osób o nazwisku &bdquo;{name.trim()}&rdquo; — którą masz na myśli?
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 stagger">
            {data.extraction.disambiguation_candidates.map(
              (c: DisambiguationCandidate, i: number) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => runSearch(`${c.discipline} ${c.keyword}`.trim())}
                  className="card hover-border-accent p-4 text-left"
                  style={{ cursor: "pointer" }}
                >
                  <p
                    className="text-lg font-bold uppercase mb-1"
                    style={{ fontFamily: "var(--font-display)", color: "var(--color-accent)" }}
                  >
                    {c.discipline}
                  </p>
                  <p className="text-sm mb-3" style={{ color: "var(--color-muted)" }}>
                    {c.description}
                  </p>
                  <span
                    className="text-xs font-bold uppercase tracking-wider"
                    style={{ color: "var(--color-text)" }}
                  >
                    To on/ona →
                  </span>
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* Karta wyniku */}
      {showResult && data && (
        <div className="stagger">
          {/* Podstawowe info */}
          <div className="card p-5 mb-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2
                  className="text-3xl font-bold uppercase leading-none mb-3"
                  style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
                >
                  {name.trim()}
                </h2>
                <div className="flex flex-wrap gap-2 mb-3">
                  {data.extraction.discipline && (
                    <span className="chip" style={{ color: "var(--color-accent-hover)" }}>
                      {data.extraction.discipline}
                    </span>
                  )}
                  {data.extraction.birth_year && (
                    <span className="chip" style={{ color: "var(--color-gold)" }}>
                      rocznik {data.extraction.birth_year}
                    </span>
                  )}
                  {data.extraction.nationality && (
                    <span className="chip" style={{ color: "var(--color-text)" }}>
                      {data.extraction.nationality}
                    </span>
                  )}
                  {data.extraction.club && (
                    <span className="chip" style={{ color: "var(--color-muted)" }}>
                      {data.extraction.club}
                    </span>
                  )}
                </div>
                {data.extraction.summary && (
                  <p className="text-sm max-w-xl" style={{ color: "var(--color-muted)" }}>
                    {data.extraction.summary}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="kicker">/ pewność ekstrakcji</p>
                <p
                  className="stat text-3xl font-bold"
                  style={{
                    color:
                      data.extraction.confidence >= 0.7
                        ? "var(--color-trend-up)"
                        : data.extraction.confidence >= 0.4
                          ? "var(--color-gold)"
                          : "var(--color-accent)",
                  }}
                >
                  {Math.round(data.extraction.confidence * 100)}%
                </p>
              </div>
            </div>
          </div>

          {/* Instagram */}
          <div className="card p-5 mb-4">
            <SectionTitle>Konto Instagram</SectionTitle>
            {data.instagram ? (
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <a
                    href={data.instagram_url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="stat text-lg font-bold hover-underline"
                    style={{ color: "var(--color-accent-hover)" }}
                  >
                    @{data.instagram.handle}
                  </a>
                  <div className="flex gap-2 mt-1">
                    {data.instagram.isVerified && (
                      <span className="chip" style={{ color: "var(--color-gold)" }}>
                        zweryfikowane
                      </span>
                    )}
                    {data.instagram.isPrivate && (
                      <span className="chip" style={{ color: "var(--color-muted)" }}>
                        prywatne
                      </span>
                    )}
                  </div>
                </div>
                {(
                  [
                    ["Obserwujący", data.instagram.followersCount],
                    ["Obserwuje", data.instagram.followingCount],
                    ["Posty", data.instagram.postsCount],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
                      {label}
                    </p>
                    <p className="stat text-xl font-bold" style={{ color: "var(--color-text)" }}>
                      {formatCount(value)}
                    </p>
                  </div>
                ))}
                {data.instagram.bioText && (
                  <p className="text-xs w-full mt-1" style={{ color: "var(--color-muted)" }}>
                    {data.instagram.bioText}
                  </p>
                )}
              </div>
            ) : data.instagram_url ? (
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                Znaleziono profil, ale nie udało się pobrać szczegółów —{" "}
                <a
                  href={data.instagram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover-underline font-bold"
                  style={{ color: "var(--color-accent-hover)" }}
                >
                  otwórz na Instagramie →
                </a>
              </p>
            ) : (
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                Nie znaleziono profilu Instagram w wynikach wyszukiwania.
              </p>
            )}
          </div>

          {/* Artykuły i wzmianki */}
          <div className="card p-5 mb-4">
            <SectionTitle>Artykuły i wzmianki w necie</SectionTitle>
            <ul className="space-y-4">
              {data.results.map((r) => (
                <li key={r.link}>
                  <a
                    href={r.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-bold hover-underline"
                    style={{ color: "var(--color-text)" }}
                  >
                    {r.title}
                  </a>
                  <p className="stat text-[11px] mt-0.5" style={{ color: "var(--color-accent-hover)" }}>
                    {sourceDomain(r.link)}
                    {r.date && <span style={{ color: "var(--color-muted)" }}> · {r.date}</span>}
                  </p>
                  {r.snippet && (
                    <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                      {r.snippet}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Dodaj do bazy */}
          {addedId ? (
            <div
              className="px-4 py-3 flex flex-wrap items-center gap-3"
              style={{
                borderRadius: 12,
                border: "1px solid var(--color-trend-up)",
                backgroundColor: "rgba(163, 230, 53, 0.08)",
              }}
            >
              <p className="text-sm flex-1" style={{ color: "var(--color-text)" }}>
                Zawodnik dodany do bazy (status: <strong>manual</strong>)
              </p>
              <Link
                href={`/athlete-hub/${addedId}`}
                className="text-sm font-bold hover-underline"
                style={{ color: "var(--color-trend-up)" }}
              >
                Otwórz profil →
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {!data.existing_athlete ? (
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={isAdding}
                  className="px-5 py-2.5 text-sm font-bold uppercase tracking-wider"
                  style={{
                    fontFamily: "var(--font-display)",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: isAdding ? "var(--color-surface-2)" : "var(--color-accent)",
                    color: isAdding ? "var(--color-muted)" : "#fff",
                    cursor: isAdding ? "wait" : "pointer",
                  }}
                >
                  {isAdding ? "Dodaję…" : "Dodaj do bazy jako nowego zawodnika"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={isAdding}
                  className="btn-ghost px-4 py-2 text-xs"
                  title="Użyj tylko, jeśli to INNA osoba niż ta znaleziona w bazie"
                >
                  {isAdding ? "Dodaję…" : "To inna osoba — dodaj mimo to"}
                </button>
              )}
              {addError && (
                <p className="text-sm font-bold" style={{ color: "var(--color-accent-hover)" }}>
                  {addError}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
