"use client";

import { useEffect, useState } from "react";

// Definitions mirror scripts/compute_talent_score.py factor functions and the
// Red Bull criteria prompt in scripts/social_discovery.py compute_brand_fit()
// — keep in sync when the algorithm changes.
const TALENT_FACTORS: { name: string; max: string; desc: string }[] = [
  {
    name: "age factor",
    max: "0–25",
    desc: "Młodszy = wyżej: poniżej 18 lat → 25 pkt, 18–20 → 22, 21–22 → 18, 23–24 → 14, 25–26 → 10, starsi → 5. Gdy brak daty urodzenia, punkty szacowane z kategorii wiekowej federacji (U13–U18 → 25, junior/U20 → 22, U23 → 18, masters → 5; brak danych → 10).",
  },
  {
    name: "federation rank factor",
    max: "0–15",
    desc: "Najlepsza pozycja w klasyfikacjach federacji (PZA, PZKol, PZM, PZLA, FIS, IFSC, ISU): #1 → 15 pkt, top 3 → 12, top 5 → 9, top 10 → 6, dalsze miejsca → 3, brak rankingu → 0.",
  },
  {
    name: "mention spike factor",
    max: "0–20",
    desc: "Liczba otagowanych artykułów z ostatnich 30 dni w skali logarytmicznej (8 × ln(n+1), cap 20) — nagły wzrost wzmianek liczy się bardziej niż pojedyncze newsy.",
  },
  {
    name: "sentiment factor",
    max: "0–15",
    desc: "Stosunek pozytywnych do negatywnych wzmianek z ostatnich 30 dni. Neutralny punkt to 7.5 — tyle dostaje zawodnik bez żadnych artykułów; przewaga pozytywów podnosi, negatywów obniża.",
  },
  {
    name: "social signal factor",
    max: "0–15",
    desc: "Sygnały z social mediów z ostatnich 30 dni: engagement rate × 200 (np. 5% → 10 pkt), viralowy post → od razu 15, przyrost followersów → do 8 pkt (1 pkt / 1000).",
  },
  {
    name: "breakthrough factor",
    max: "0–10",
    desc: "Przełomowe wydarzenie z ostatnich 90 dni wykryte przez LLM w artykułach: tytuł lub rekord → 10 pkt, podium → 7, debiut → 5.",
  },
];

const BRAND_FIT_FACTORS: { name: string; desc: string }[] = [
  {
    name: "content theme",
    desc: "Jak ekstremalny i wizualny jest sport — dyscypliny action/outdoor o dużym potencjale contentowym punktują najwyżej.",
  },
  {
    name: "audience fit",
    desc: "Dopasowanie do widowni Red Bulla: 18–30 lat, przewaga mężczyzn.",
  },
  {
    name: "performance level",
    desc: "Poziom sportowy oceniany po rankingach federacji i kategorii wiekowej — liczy się rosnąca trajektoria, nie tylko obecne wyniki.",
  },
  {
    name: "brand risk",
    desc: "Skala odwrócona: 0 = wysokie ryzyko, 25 = niskie (np. brak kontraktu z konkurencyjną marką energetyków — Monster, Rockstar).",
  },
];

export function ScoreInfoButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Jak liczone są Talent Score i Brand Fit?"
        title="Jak liczone są Talent Score i Brand Fit?"
        className="fixed flex items-center justify-center cursor-pointer hover-border-accent"
        style={{
          bottom: "24px",
          right: "24px",
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          color: "var(--color-muted)",
          fontFamily: "var(--font-mono)",
          fontSize: "16px",
          fontWeight: 700,
          zIndex: 40,
        }}
      >
        ?
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(15, 15, 15, 0.75)", zIndex: 50 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Jak liczone są score'y"
            className="w-full overflow-y-auto"
            style={{
              maxWidth: "660px",
              maxHeight: "85vh",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "12px",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <h2
                className="text-2xl font-bold uppercase tracking-tight leading-none"
                style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
              >
                Jak liczone są score&apos;y
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Zamknij"
                className="cursor-pointer text-lg leading-none px-2 py-1"
                style={{
                  color: "var(--color-muted)",
                  fontFamily: "var(--font-mono)",
                  background: "none",
                  border: "none",
                }}
              >
                ✕
              </button>
            </div>

            <div className="p-5 flex flex-col gap-6">
              {/* Talent Score */}
              <section>
                <h3
                  className="text-xs uppercase tracking-wider mb-1 stat"
                  style={{ color: "var(--color-trend-up)" }}
                >
                  Talent Score (0–100)
                </h3>
                <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--color-muted)" }}>
                  Algorytmiczny, przeliczany codziennie. Suma 6 czynników (max 100 pkt) pomnożona
                  przez mnożnik luki dyscypliny, z sufitem na 100. Rozbicie na czynniki widzisz
                  wyżej w sekcji „Score Breakdown&rdquo;.
                </p>
                <ul className="flex flex-col gap-2.5">
                  {TALENT_FACTORS.map((f) => (
                    <li key={f.name} className="flex gap-3 items-baseline">
                      <span
                        className="stat text-xs font-bold shrink-0 text-right"
                        style={{ color: "var(--color-trend-up)", width: "42px" }}
                      >
                        {f.max}
                      </span>
                      <div>
                        <p
                          className="text-xs font-bold uppercase tracking-wider"
                          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
                        >
                          {f.name}
                        </p>
                        <p className="text-xs leading-relaxed" style={{ color: "var(--color-muted)" }}>
                          {f.desc}
                        </p>
                      </div>
                    </li>
                  ))}
                  <li className="flex gap-3 items-baseline">
                    <span
                      className="stat text-xs font-bold shrink-0 text-right"
                      style={{ color: "var(--color-accent)", width: "42px" }}
                    >
                      ×1.0–1.5
                    </span>
                    <div>
                      <p
                        className="text-xs font-bold uppercase tracking-wider"
                        style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
                      >
                        discipline gap multiplier
                      </p>
                      <p className="text-xs leading-relaxed" style={{ color: "var(--color-muted)" }}>
                        Mnożnik z tabeli luk dyscyplin (Gap Analysis) premiujący sporty, w których
                        Red Bull ma w Polsce „białą plamę&rdquo;: 1 + priority_score/100 × 0.5. Dyscyplina
                        bez wpisu w tabeli dostaje domyślnie ×1.25.
                      </p>
                    </div>
                  </li>
                </ul>
              </section>

              {/* Brand Fit */}
              <section>
                <h3
                  className="text-xs uppercase tracking-wider mb-1 stat"
                  style={{ color: "#f59e0b" }}
                >
                  Brand Fit (0–100)
                </h3>
                <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--color-muted)" }}>
                  Oceniany przez LLM (Claude Haiku), nie sztywny wzór. Model dostaje profil
                  zawodnika (dyscyplina, wiek, rankingi federacji, followersi na IG, status
                  Red Bull) i kryteria Red Bulla: sport ekstremalny/outdoor o wysokiej
                  wizualności, młody wiek (idealnie poniżej 23 — Red Bull podpisuje zawodników
                  już od 14–15 lat), rosnąca trajektoria, potencjał na personal brand i
                  storytelling, start na poziomie krajowym lub międzynarodowym, brak kontraktu
                  z konkurencyjną marką energetyków. Zwraca całościowy score 0–100, cztery
                  podkategorie i krótkie uzasadnienie. Odświeżany co ~14 dni dla top 150
                  prospektów.
                </p>
                <ul className="flex flex-col gap-2.5">
                  {BRAND_FIT_FACTORS.map((f) => (
                    <li key={f.name} className="flex gap-3 items-baseline">
                      <span
                        className="stat text-xs font-bold shrink-0 text-right"
                        style={{ color: "#f59e0b", width: "42px" }}
                      >
                        0–25
                      </span>
                      <div>
                        <p
                          className="text-xs font-bold uppercase tracking-wider"
                          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
                        >
                          {f.name}
                        </p>
                        <p className="text-xs leading-relaxed" style={{ color: "var(--color-muted)" }}>
                          {f.desc}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                <p
                  className="text-xs leading-relaxed mt-3 px-3 py-2"
                  style={{
                    color: "var(--color-muted)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                  }}
                >
                  Uwaga: podkategorie to kontekst i uzasadnienie oceny — finalny score jest
                  całościową oceną modelu, a nie ścisłą sumą czterech pozycji.
                </p>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
