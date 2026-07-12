"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EnrichResponse } from "@/app/api/enrich-athlete/route";
import { applyEnrichment, type ApplyEnrichmentInput } from "./actions";

/**
 * Research AI na profilu zawodnika: odpala /api/enrich-athlete
 * (Serper + Haiku z kotwicą tożsamości), pokazuje propozycje jako diff
 * do zaznaczenia i zapisuje TYLKO zaakceptowane przez server action.
 */

type AthleteProps = {
  id: string;
  name: string;
  discipline: string;
  sub_discipline: string | null;
  birth_date: string | null;
  hometown: string | null;
  bio_summary: string | null;
  instagram: string | null;
  photo_url: string | null;
};

type Phase = "idle" | "loading" | "review" | "done" | "error";

type FieldProposal = {
  field: "birth_date" | "hometown" | "sub_discipline" | "bio_summary";
  label: string;
  current: string | null;
  displayValue: string;
  /** wartość zapisywana do athletes */
  applyValue: string;
  evidence: string | null;
};

const checkboxStyle: React.CSSProperties = {
  accentColor: "var(--color-accent)",
  width: 15,
  height: 15,
  flexShrink: 0,
  marginTop: 3,
  cursor: "pointer",
};

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function AIResearchPanel({ athlete }: { athlete: AthleteProps }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EnrichResponse | null>(null);
  const [checkedFields, setCheckedFields] = useState<Set<string>>(new Set());
  const [checkedArticles, setCheckedArticles] = useState<Set<string>>(new Set());
  const [igChecked, setIgChecked] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [isApplying, startApplying] = useTransition();
  // Blokada podwójnego odpalenia (kredyty Serper/Claude)
  const inFlight = useRef(false);

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!athlete.birth_date) m.push("wiek");
    if (!athlete.hometown) m.push("miasto");
    if (!athlete.bio_summary) m.push("bio");
    if (!athlete.instagram) m.push("Instagram");
    if (!athlete.photo_url) m.push("zdjęcie");
    return m;
  }, [athlete]);

  const proposals: FieldProposal[] = useMemo(() => {
    if (!data) return [];
    const u = data.updates;
    const out: FieldProposal[] = [];
    const currentYear = athlete.birth_date
      ? String(new Date(athlete.birth_date).getFullYear())
      : null;
    if (u.birth_date || u.birth_year) {
      out.push({
        field: "birth_date",
        label: "Data urodzenia",
        current: athlete.birth_date ?? (currentYear ? `rocznik ${currentYear}` : null),
        displayValue: u.birth_date ?? `rocznik ${u.birth_year}`,
        applyValue: u.birth_date ?? `${u.birth_year}-01-01`,
        evidence: data.evidence.birth_date ?? data.evidence.birth_year ?? null,
      });
    }
    if (u.hometown) {
      out.push({
        field: "hometown",
        label: "Miasto",
        current: athlete.hometown,
        displayValue: u.hometown,
        applyValue: u.hometown,
        evidence: data.evidence.hometown ?? null,
      });
    }
    if (u.sub_discipline) {
      out.push({
        field: "sub_discipline",
        label: "Subdyscyplina",
        current: athlete.sub_discipline,
        displayValue: u.sub_discipline,
        applyValue: u.sub_discipline,
        evidence: data.evidence.sub_discipline ?? null,
      });
    }
    if (u.bio_summary) {
      out.push({
        field: "bio_summary",
        label: "Bio",
        current: athlete.bio_summary,
        displayValue: u.bio_summary,
        applyValue: u.bio_summary,
        evidence: data.evidence.bio_summary ?? null,
      });
    }
    return out;
  }, [data, athlete]);

  async function runResearch(opts?: { ignoreBirthDate?: boolean }) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase("loading");
    setError(null);
    setDoneMsg(null);

    try {
      const resp = await fetch("/api/enrich-athlete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId: athlete.id,
          ignoreBirthDate: opts?.ignoreBirthDate === true,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error ?? `Błąd ${resp.status}`);
      const result = json as EnrichResponse;
      setData(result);

      // Domyślnie zaznaczone tylko przy potwierdzonej tożsamości
      const preselect = result.identity_match === "confirmed";
      const u = result.updates;
      const fields = new Set<string>();
      if (preselect) {
        if (u.birth_date || u.birth_year) fields.add("birth_date");
        if (u.hometown) fields.add("hometown");
        if (u.sub_discipline) fields.add("sub_discipline");
        if (u.bio_summary) fields.add("bio_summary");
      }
      setCheckedFields(fields);
      setCheckedArticles(
        preselect ? new Set(result.articles.map((a) => a.url)) : new Set()
      );
      setIgChecked(preselect && !!u.instagram_handle);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nieznany błąd");
      setPhase("error");
    } finally {
      inFlight.current = false;
    }
  }

  function toggle(set: Set<string>, key: string): Set<string> {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }

  function handleApply() {
    if (!data) return;
    const input: ApplyEnrichmentInput = {
      athlete_id: athlete.id,
      updates: Object.fromEntries(
        proposals
          .filter((p) => checkedFields.has(p.field))
          .map((p) => [p.field, p.applyValue])
      ),
      instagram:
        igChecked && data.updates.instagram_handle
          ? {
              handle: data.updates.instagram_handle,
              followers: data.instagram?.followersCount ?? null,
              following: data.instagram?.followingCount ?? null,
              posts: data.instagram?.postsCount ?? null,
              verified: data.instagram?.isVerified ?? false,
              is_private: data.instagram?.isPrivate ?? false,
              bio: data.instagram?.bioText ?? null,
              profile_pic_url: data.instagram?.profilePicUrl ?? null,
            }
          : null,
      articles: data.articles
        .filter((a) => checkedArticles.has(a.url))
        .map((a) => ({
          url: a.url,
          title: a.title,
          source: a.source,
          summary: a.summary,
          sentiment: a.sentiment,
          published_date: a.published_date,
        })),
    };

    startApplying(async () => {
      const result = await applyEnrichment(input);
      if (result.ok) {
        const parts: string[] = [];
        const fieldCount = Object.keys(input.updates).length + (input.instagram ? 1 : 0);
        if (fieldCount > 0) parts.push(`zaktualizowane pola: ${fieldCount}`);
        if (result.articles_added > 0) parts.push(`nowe artykuły: ${result.articles_added}`);
        if (result.articles_linked > 0) parts.push(`podpięte artykuły: ${result.articles_linked}`);
        if (result.new_score != null) parts.push(`talent score przeliczony: ${result.new_score.toFixed(0)}`);
        setDoneMsg(parts.length > 0 ? parts.join(" · ") : "brak zmian do zapisania");
        setPhase("done");
        router.refresh();
      } else {
        setError(result.error);
        setPhase("error");
      }
    });
  }

  const nothingSelected =
    checkedFields.size === 0 && checkedArticles.size === 0 && !igChecked;
  const nothingFound =
    data &&
    proposals.length === 0 &&
    data.articles.length === 0 &&
    !data.updates.instagram_handle;

  return (
    <div className="card p-4 mb-6">
      {/* Nagłówek + przycisk */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2
            className="text-sm font-bold uppercase tracking-wider"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          >
            Research AI
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            {missing.length > 0
              ? `Brakujące dane: ${missing.join(", ")} — przeszukaj internet i uzupełnij profil.`
              : "Przeszukaj internet: świeże artykuły i weryfikacja danych profilu."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => runResearch()}
          disabled={phase === "loading"}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider shrink-0"
          style={{
            fontFamily: "var(--font-display)",
            borderRadius: 8,
            border: "none",
            backgroundColor:
              phase === "loading" ? "var(--color-surface-2)" : "var(--color-accent)",
            color: phase === "loading" ? "var(--color-muted)" : "#fff",
            cursor: phase === "loading" ? "wait" : "pointer",
            transition: "background-color .15s ease",
          }}
        >
          <SparkleIcon />
          {phase === "loading"
            ? "Szukam…"
            : phase === "review" || phase === "done"
              ? "Szukaj ponownie"
              : "Przeszukaj internet"}
        </button>
      </div>

      {/* Loading */}
      {phase === "loading" && (
        <div className="flex items-center gap-3 mt-4">
          <span className="live-dot" />
          <p className="stat text-xs" style={{ color: "var(--color-muted)" }}>
            PRZESZUKUJĘ SIEĆ… Google → weryfikacja tożsamości → ekstrakcja LLM
          </p>
        </div>
      )}

      {/* Błąd */}
      {phase === "error" && error && (
        <div
          className="px-3 py-2 mt-4"
          style={{
            borderRadius: 8,
            border: "1px solid var(--color-accent)",
            backgroundColor: "rgba(230, 13, 63, 0.12)",
          }}
        >
          <p className="text-xs font-bold" style={{ color: "var(--color-accent-hover)" }}>
            {error}
          </p>
        </div>
      )}

      {/* Sukces */}
      {phase === "done" && doneMsg && (
        <div
          className="px-3 py-2 mt-4"
          style={{
            borderRadius: 8,
            border: "1px solid var(--color-trend-up)",
            backgroundColor: "rgba(163, 230, 53, 0.08)",
          }}
        >
          <p className="text-xs font-bold" style={{ color: "var(--color-trend-up)" }}>
            Zapisano — {doneMsg}
          </p>
        </div>
      )}

      {/* Wyniki researchu */}
      {phase === "review" && data && (
        <div className="mt-4">
          {/* Status tożsamości */}
          <div
            className="px-3 py-2 mb-4"
            style={{
              borderRadius: 8,
              border: `1px solid ${
                data.identity_match === "confirmed"
                  ? "color-mix(in srgb, var(--color-trend-up) 45%, transparent)"
                  : data.identity_match === "uncertain"
                    ? "color-mix(in srgb, var(--color-gold) 45%, transparent)"
                    : "var(--color-accent)"
              }`,
              backgroundColor:
                data.identity_match === "confirmed"
                  ? "rgba(163, 230, 53, 0.06)"
                  : data.identity_match === "uncertain"
                    ? "rgba(255, 201, 6, 0.06)"
                    : "rgba(230, 13, 63, 0.1)",
            }}
          >
            <p
              className="stat text-xs font-bold uppercase tracking-wider"
              style={{
                color:
                  data.identity_match === "confirmed"
                    ? "var(--color-trend-up)"
                    : data.identity_match === "uncertain"
                      ? "var(--color-gold)"
                      : "var(--color-accent-hover)",
              }}
            >
              {data.identity_match === "confirmed"
                ? `Tożsamość potwierdzona · pewność ${Math.round(data.confidence * 100)}%`
                : data.identity_match === "uncertain"
                  ? "Tożsamość niepewna — sprawdź propozycje ręcznie"
                  : "Wyniki dotyczą innych osób — nic nie zostanie zapisane"}
            </p>
            {data.identity_note && (
              <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                {data.identity_note}
              </p>
            )}
            {data.identity_match !== "confirmed" && athlete.birth_date && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => runResearch({ ignoreBirthDate: true })}
                  className="btn-ghost px-3 py-1.5 text-xs"
                  title="Wiek w bazie bywa błędny (dane z pipeline'u) — powtórz research traktując go jako nieznany"
                >
                  Wiek w bazie może być błędny — szukaj ponownie bez niego
                </button>
              </div>
            )}
          </div>

          {nothingFound && data.identity_match !== "mismatch" && (
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              Nie znaleziono nowych, zweryfikowanych informacji — profil wygląda na
              aktualny ({data.results_count} wyników przejrzanych).
            </p>
          )}

          {/* Propozycje pól */}
          {proposals.length > 0 && (
            <div className="mb-4">
              <p
                className="text-[10px] uppercase tracking-wider stat mb-2"
                style={{ color: "var(--color-muted)" }}
              >
                Proponowane zmiany profilu
              </p>
              {proposals.map((p) => (
                <label
                  key={p.field}
                  className="flex items-start gap-3 py-2.5"
                  style={{ borderBottom: "1px solid var(--color-border)", cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={checkedFields.has(p.field)}
                    onChange={() => setCheckedFields((s) => toggle(s, p.field))}
                    style={checkboxStyle}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[10px] uppercase tracking-wider stat"
                      style={{ color: "var(--color-muted)" }}
                    >
                      {p.label}
                    </p>
                    <p className="text-sm leading-relaxed">
                      {p.current && (
                        <>
                          <span
                            style={{
                              color: "var(--color-muted)",
                              textDecoration: "line-through",
                            }}
                          >
                            {p.current}
                          </span>{" "}
                          <span style={{ color: "var(--color-muted)" }}>→</span>{" "}
                        </>
                      )}
                      <span style={{ color: "var(--color-trend-up)", fontWeight: 600 }}>
                        {p.displayValue}
                      </span>
                    </p>
                    {p.evidence && (
                      <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                        Dowód: {p.evidence}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Instagram */}
          {data.updates.instagram_handle && (
            <div className="mb-4">
              <p
                className="text-[10px] uppercase tracking-wider stat mb-2"
                style={{ color: "var(--color-muted)" }}
              >
                Znaleziony Instagram
              </p>
              <label
                className="flex items-start gap-3 py-2.5"
                style={{ borderBottom: "1px solid var(--color-border)", cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={igChecked}
                  onChange={() => setIgChecked((v) => !v)}
                  style={checkboxStyle}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <a
                      href={data.instagram_url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="stat font-bold hover-underline"
                      style={{ color: "var(--color-accent-hover)" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      @{data.updates.instagram_handle}
                    </a>
                    {data.instagram?.followersCount != null && (
                      <span className="stat text-xs ml-2" style={{ color: "var(--color-muted)" }}>
                        {data.instagram.followersCount.toLocaleString("pl-PL")} obserwujących
                        {data.instagram.isVerified && " · zweryfikowane"}
                      </span>
                    )}
                  </p>
                  {data.instagram?.bioText && (
                    <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--color-muted)" }}>
                      {data.instagram.bioText}
                    </p>
                  )}
                </div>
              </label>
            </div>
          )}

          {/* Artykuły */}
          {data.articles.length > 0 && (
            <div className="mb-4">
              <p
                className="text-[10px] uppercase tracking-wider stat mb-2"
                style={{ color: "var(--color-muted)" }}
              >
                Znalezione artykuły do podpięcia ({data.articles.length})
              </p>
              {data.articles.map((a) => (
                <label
                  key={a.url}
                  className="flex items-start gap-3 py-2.5"
                  style={{ borderBottom: "1px solid var(--color-border)", cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={checkedArticles.has(a.url)}
                    onChange={() => setCheckedArticles((s) => toggle(s, a.url))}
                    style={checkboxStyle}
                  />
                  <div className="flex-1 min-w-0">
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium hover-underline leading-snug"
                      style={{ color: "var(--color-text)" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {a.title}
                    </a>
                    <p className="stat text-[11px] mt-0.5" style={{ color: "var(--color-accent-hover)" }}>
                      {a.source}
                      {a.published_date && (
                        <span style={{ color: "var(--color-muted)" }}> · {a.published_date}</span>
                      )}
                      <span
                        style={{
                          color:
                            a.sentiment === "positive"
                              ? "var(--color-trend-up)"
                              : a.sentiment === "negative"
                                ? "var(--color-accent)"
                                : "var(--color-muted)",
                        }}
                      >
                        {" "}
                        · {a.sentiment === "positive" ? "+" : a.sentiment === "negative" ? "–" : "·"}
                      </span>
                    </p>
                    {a.summary && (
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--color-muted)" }}>
                        {a.summary}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Zastosuj */}
          {!nothingFound && data.identity_match !== "mismatch" && (
            <div className="flex items-center gap-3 flex-wrap mt-2">
              <button
                type="button"
                onClick={handleApply}
                disabled={isApplying || nothingSelected}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider"
                style={{
                  fontFamily: "var(--font-display)",
                  borderRadius: 8,
                  border: "none",
                  backgroundColor:
                    isApplying || nothingSelected
                      ? "var(--color-surface-2)"
                      : "var(--color-accent)",
                  color: isApplying || nothingSelected ? "var(--color-muted)" : "#fff",
                  cursor: isApplying ? "wait" : nothingSelected ? "not-allowed" : "pointer",
                }}
              >
                {isApplying ? "Zapisuję…" : "Zastosuj zaznaczone"}
              </button>
              <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                {checkedFields.size + (igChecked ? 1 : 0)} pól ·{" "}
                {checkedArticles.size} artykułów
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
