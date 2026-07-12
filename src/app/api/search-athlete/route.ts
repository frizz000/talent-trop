import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  serperSearchMany,
  extractInstagramHandle,
  type SerperResult,
} from "@/lib/serper";
import { fetchInstagramProfile, type InstagramProfile } from "@/lib/apify";
import { extractJsonObject } from "@/lib/llm";

/**
 * POST /api/search-athlete — ad-hoc research zawodnika po imieniu i nazwisku.
 *
 * Ręczne narzędzie (przycisk w /search), NIE część pipeline'u — nie podlega
 * włącznikom z pipeline_settings. Przepływ:
 *   1. fuzzy match przeciwko tabeli athletes (baner "już w bazie")
 *   2. 3 zapytania Serper.dev równolegle
 *   3. Claude Haiku — strukturalna ekstrakcja z snippetów (+ disambiguation)
 *   4. opcjonalne wzbogacenie profilu IG przez Apify
 *
 * Body: { name: string, keyword?: string, confirmedContext?: string }
 * confirmedContext — ustawiany gdy użytkownik wybrał osobę na ekranie
 * disambiguation; doprecyzowuje zapytania i wyłącza ponowną disambiguację.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const HAIKU_MODEL = "claude-haiku-4-5";
const MAX_SNIPPETS_FOR_LLM = 18;
const MAX_RESULTS_RETURNED = 12;
const FUZZY_THRESHOLD = 0.82;

// ---------------------------------------------------------------------------
// Krok 1 — fuzzy match w tabeli athletes
// ---------------------------------------------------------------------------

export type ExistingAthlete = {
  id: string;
  name: string;
  discipline: string;
  talent_score: number | null;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .trim();
}

/** Współczynnik Dice'a na bigramach — odpowiednik SequenceMatcher (próg jak w ingest_federations: ~0.85). */
function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const bigrams = (s: string) => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      map.set(bg, (map.get(bg) ?? 0) + 1);
    }
    return map;
  };
  const ba = bigrams(na);
  const bb = bigrams(nb);
  let overlap = 0;
  for (const [bg, count] of ba) {
    overlap += Math.min(count, bb.get(bg) ?? 0);
  }
  return (2 * overlap) / (na.length - 1 + nb.length - 1);
}

async function findExistingAthlete(name: string): Promise<ExistingAthlete | null> {
  const supabase = createAdminClient();
  const words = name.split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return null;

  // Zbierz kandydatów po każdym słowie (ilike), potem fuzzy w JS —
  // ten sam dwustopniowy wzorzec co w scripts/ingest_federations.py
  const orFilter = words
    .map((w) => `name.ilike.%${w.replace(/[%,()]/g, "")}%`)
    .join(",");
  const { data, error } = await supabase
    .from("athletes")
    .select("id,name,discipline,talent_score")
    .or(orFilter)
    .neq("discovery_status", "rejected")
    .limit(50);
  if (error || !data) return null;

  let best: { row: ExistingAthlete; score: number } | null = null;
  for (const row of data) {
    const score = similarity(name, row.name);
    if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) {
      best = { row, score };
    }
  }
  return best?.row ?? null;
}

// ---------------------------------------------------------------------------
// Krok 3 — ekstrakcja strukturalna przez Claude Haiku
// ---------------------------------------------------------------------------

export type DisambiguationCandidate = {
  discipline: string;
  description: string;
  keyword: string;
};

export type Extraction = {
  is_athlete: boolean;
  discipline: string | null;
  birth_year: number | null;
  nationality: string | null;
  club: string | null;
  instagram_handle_guess: string | null;
  summary: string;
  confidence: number;
  disambiguation_needed: boolean;
  disambiguation_candidates: DisambiguationCandidate[];
};

async function extractWithHaiku(
  name: string,
  keyword: string | undefined,
  confirmedContext: string | undefined,
  results: SerperResult[]
): Promise<Extraction> {
  const client = new Anthropic();

  const snippets = results
    .slice(0, MAX_SNIPPETS_FOR_LLM)
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.link}${r.date ? `\nData: ${r.date}` : ""}\n${r.snippet}`)
    .join("\n\n");

  const confirmedLine = confirmedContext
    ? `\nUżytkownik POTWIERDZIŁ, że chodzi o tę osobę: "${confirmedContext}". Ekstrahuj dane wyłącznie dla niej i ustaw disambiguation_needed=false.`
    : "";

  const prompt = `Jesteś analitykiem skautingu sportowego. Poniżej wyniki wyszukiwania Google dla osoby "${name}"${keyword ? ` (kontekst podany przez użytkownika: "${keyword}")` : ""}.${confirmedLine}

Wyniki wyszukiwania:
${snippets}

Zadania:
1. Oceń, czy wyniki dotyczą JEDNEJ osoby, czy WIELU RÓŻNYCH osób o tym samym imieniu i nazwisku (różne dyscypliny, sprzeczny wiek/miasto, sport vs nie-sport). Jeśli wielu — ustaw disambiguation_needed=true i wypisz kandydatów (dyscyplina/rola, jedno zdanie kontekstu, krótkie słowo kluczowe odróżniające np. "kolarstwo szosowe").
2. Jeśli jedna osoba (lub użytkownik potwierdził wybór) — wyekstrahuj dane strukturalne. Nie zgaduj: pole, którego nie da się ustalić ze snippetów, ustaw na null. instagram_handle_guess podaj TYLKO jeśli w wynikach jest link/wzmianka o profilu tej konkretnej osoby.

Zwróć WYŁĄCZNIE JSON (bez markdown):
{
  "is_athlete": boolean,
  "discipline": string | null,        // po polsku, np. "skoki narciarskie", "kolarstwo MTB"
  "birth_year": number | null,
  "nationality": string | null,       // np. "Polska"
  "club": string | null,
  "instagram_handle_guess": string | null,  // sam handle, bez @
  "summary": string,                   // 1-2 zdania po polsku o tej osobie
  "confidence": number,                // 0-1, pewność ekstrakcji
  "disambiguation_needed": boolean,
  "disambiguation_candidates": [ { "discipline": string, "description": string, "keyword": string } ]
}`;

  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 900,
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error("Nieoczekiwany typ odpowiedzi LLM");
  }
  const parsed = extractJsonObject(block.text);

  const candidates = Array.isArray(parsed.disambiguation_candidates)
    ? (parsed.disambiguation_candidates as DisambiguationCandidate[]).filter(
        (c) => c && typeof c.description === "string"
      )
    : [];

  return {
    is_athlete: Boolean(parsed.is_athlete),
    discipline: (parsed.discipline as string) || null,
    birth_year: typeof parsed.birth_year === "number" ? parsed.birth_year : null,
    nationality: (parsed.nationality as string) || null,
    club: (parsed.club as string) || null,
    instagram_handle_guess:
      typeof parsed.instagram_handle_guess === "string"
        ? parsed.instagram_handle_guess.replace(/^@/, "").toLowerCase() || null
        : null,
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    confidence:
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0,
    // Disambiguacja tylko gdy są przynajmniej 2 realne opcje
    disambiguation_needed:
      Boolean(parsed.disambiguation_needed) && candidates.length >= 2 && !confirmedContext,
    disambiguation_candidates: candidates,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export type SearchAthleteResponse = {
  existing_athlete: ExistingAthlete | null;
  extraction: Extraction;
  instagram: InstagramProfile | null;
  instagram_url: string | null;
  results: SerperResult[];
};

export async function POST(request: NextRequest) {
  let body: { name?: string; keyword?: string; confirmedContext?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy JSON" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const keyword = (body.keyword ?? "").trim() || undefined;
  const confirmedContext = (body.confirmedContext ?? "").trim() || undefined;
  if (name.length < 3 || !name.includes(" ")) {
    return NextResponse.json(
      { error: "Podaj imię i nazwisko zawodnika" },
      { status: 400 }
    );
  }

  try {
    // Kontekst do zapytań: keyword użytkownika + ew. wybór z disambiguacji
    const ctx = [keyword, confirmedContext].filter(Boolean).join(" ");
    const queries = [
      `"${name}" ${ctx} sportowiec`.replace(/\s+/g, " ").trim(),
      `"${name}" ${ctx} instagram`.replace(/\s+/g, " ").trim(),
      `"${name}" ${ctx} wyniki OR wywiad OR kariera`.replace(/\s+/g, " ").trim(),
    ];

    // Krok 1 + 2 równolegle
    const [existing, results] = await Promise.all([
      findExistingAthlete(name),
      serperSearchMany(queries),
    ]);

    if (results.length === 0) {
      return NextResponse.json(
        { error: "Brak wyników wyszukiwania dla tego zapytania" },
        { status: 404 }
      );
    }

    // Krok 3 — ekstrakcja LLM
    const extraction = await extractWithHaiku(name, keyword, confirmedContext, results);

    // Krok 4 — wzbogacenie IG (pomijane przy disambiguacji — najpierw wybór osoby)
    let instagram: InstagramProfile | null = null;
    let instagramUrl: string | null = null;
    if (!extraction.disambiguation_needed) {
      const handle =
        extraction.instagram_handle_guess ?? extractInstagramHandle(results);
      if (handle) {
        instagramUrl = `https://www.instagram.com/${handle}/`;
        instagram = await fetchInstagramProfile(handle);
      }
    }

    const payload: SearchAthleteResponse = {
      existing_athlete: existing,
      extraction,
      instagram,
      instagram_url: instagramUrl,
      results: results.slice(0, MAX_RESULTS_RETURNED),
    };
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[search-athlete]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
