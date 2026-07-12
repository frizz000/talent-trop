import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { serperSearchMany, type SerperResult } from "@/lib/serper";
import { fetchInstagramProfile, type InstagramProfile } from "@/lib/apify";
import { extractJsonObject } from "@/lib/llm";

/**
 * POST /api/enrich-athlete — pogłębiony research ISTNIEJĄCEGO zawodnika
 * (przycisk "Research AI" na profilu w Athlete Hub).
 *
 * Ręczne narzędzie jak /api/search-athlete — NIE podlega pipeline switches.
 * Kluczowa różnica względem search-athlete: profil z bazy jest KOTWICĄ
 * TOŻSAMOŚCI. Zapytania Serper są doprecyzowane dyscypliną, a LLM dostaje
 * znane dane (dyscyplina, rocznik, miasto, bio) i ma bezwzględny zakaz
 * używania wyników o innych osobach (inna dyscyplina / sprzeczny kontekst).
 *
 * Endpoint NICZEGO nie zapisuje — zwraca propozycje (diff pól + artykuły
 * do podpięcia), które skaut zatwierdza w UI; zapis robi server action
 * applyEnrichment.
 *
 * Body: { athleteId: string }
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const HAIKU_MODEL = "claude-haiku-4-5";
const MAX_SNIPPETS_FOR_LLM = 18;
const MAX_ARTICLES = 8;

// Slugi dyscyplin z bazy → polskie frazy do zapytań Google (kotwica tożsamości).
// Fallback: slug z podkreśleniami zamienionymi na spacje.
const DISCIPLINE_QUERY_TERMS: Record<string, string> = {
  bouldering: "wspinaczka sportowa bouldering",
  lead: "wspinaczka sportowa prowadzenie",
  speed: "wspinaczka sportowa na czas",
  mtb_xco: "kolarstwo górskie MTB",
  motocross: "motocross",
  athletics: "lekkoatletyka",
  alpine_skiing: "narciarstwo alpejskie",
  snowboarding: "snowboard",
  freestyle_ski: "narciarstwo freestyle",
  speed_skating: "łyżwiarstwo szybkie",
  inne: "",
};

function disciplineQueryTerm(discipline: string): string {
  return (
    DISCIPLINE_QUERY_TERMS[discipline] ?? discipline.replace(/_/g, " ")
  ).trim();
}

// ---------------------------------------------------------------------------
// Typy odpowiedzi
// ---------------------------------------------------------------------------

export type IdentityMatch = "confirmed" | "uncertain" | "mismatch";

export type ProposedUpdates = {
  /** ISO yyyy-mm-dd gdy znana pełna data, inaczej null (patrz birth_year) */
  birth_date: string | null;
  birth_year: number | null;
  hometown: string | null;
  sub_discipline: string | null;
  /** Zaktualizowane bio 2–3 zdania (scala stare + nowe fakty) */
  bio_summary: string | null;
  instagram_handle: string | null;
};

export type ProposedArticle = {
  url: string;
  title: string;
  source: string;
  /** Parafraza LLM, 1–2 zdania po polsku — nigdy pełny tekst */
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  published_date: string | null;
};

export type EnrichResponse = {
  identity_match: IdentityMatch;
  identity_note: string;
  confidence: number;
  updates: ProposedUpdates;
  /** pole → cytat/dowód ze snippetów */
  evidence: Record<string, string>;
  articles: ProposedArticle[];
  instagram: InstagramProfile | null;
  instagram_url: string | null;
  results_count: number;
};

type AthleteRow = {
  id: string;
  name: string;
  discipline: string;
  sub_discipline: string | null;
  birth_date: string | null;
  hometown: string | null;
  bio_summary: string | null;
  socials: Record<string, string> | null;
};

// ---------------------------------------------------------------------------
// Ekstrakcja LLM z guardem tożsamości
// ---------------------------------------------------------------------------

type LlmEnrichment = {
  identity_match: IdentityMatch;
  identity_note: string;
  confidence: number;
  updates: ProposedUpdates;
  evidence: Record<string, string>;
  articles: Array<{
    result_index: number;
    summary: string;
    sentiment: string;
    published_date: string | null;
  }>;
};

async function enrichWithHaiku(
  athlete: AthleteRow,
  results: SerperResult[]
): Promise<LlmEnrichment> {
  const client = new Anthropic();

  const snippets = results
    .slice(0, MAX_SNIPPETS_FOR_LLM)
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title}\nURL: ${r.link}${r.date ? `\nData: ${r.date}` : ""}\n${r.snippet}`
    )
    .join("\n\n");

  const birthYear = athlete.birth_date
    ? new Date(athlete.birth_date).getFullYear()
    : null;
  const knownInstagram = athlete.socials?.instagram ?? null;

  const profileLines = [
    `- Imię i nazwisko: ${athlete.name}`,
    `- Dyscyplina: ${athlete.discipline}${athlete.sub_discipline ? ` (${athlete.sub_discipline})` : ""}`,
    `- Rocznik: ${birthYear ?? "NIEZNANY"}${athlete.birth_date ? ` (data w bazie: ${athlete.birth_date})` : ""}`,
    `- Miasto: ${athlete.hometown ?? "NIEZNANE"}`,
    `- Instagram: ${knownInstagram ?? "NIEZNANY"}`,
    `- Bio w bazie: ${athlete.bio_summary ?? "brak"}`,
  ].join("\n");

  const prompt = `Jesteś analitykiem skautingu sportowego. W bazie mamy zawodnika o profilu (KOTWICA TOŻSAMOŚCI):
${profileLines}

Poniżej wyniki wyszukiwania Google dla tego zawodnika:
${snippets}

NAJWAŻNIEJSZA ZASADA — TOŻSAMOŚĆ: wyniki mogą dotyczyć INNYCH osób o tym samym imieniu i nazwisku. Wykorzystuj WYŁĄCZNIE wyniki, które na pewno dotyczą zawodnika z profilu powyżej: zgodna dyscyplina, brak sprzeczności wieku / miasta / klubu. Wynik o osobie z innej dyscypliny lub o sprzecznym kontekście POMIŃ całkowicie — lepiej nie zaproponować nic, niż pomieszać dwie osoby.

Zadania:
1. identity_match: "confirmed" gdy przynajmniej część wyników pewnie dotyczy tego zawodnika; "uncertain" gdy nie da się rozstrzygnąć; "mismatch" gdy wyniki dotyczą innych osób. identity_note: 1 zdanie uzasadnienia po polsku.
2. updates — zaproponuj TYLKO pola, dla których znalazłeś nową lub lepszą wartość niż w bazie (wartość zgodna z bazą lub nieznaleziona → null):
   - birth_date (pełna data ISO) lub birth_year (sam rocznik) — WYŁĄCZNIE przy wyraźnym dowodzie w snippetach; jeśli baza ma inny rocznik niż źródła, zaproponuj poprawkę i zacytuj dowód w evidence
   - hometown, sub_discipline (dyscypliny GŁÓWNEJ nie zmieniasz nigdy)
   - bio_summary — jeśli znalazłeś istotne nowe fakty (sukcesy, klub, kadra), napisz zaktualizowane bio 2–3 zdania po polsku scalające dotychczasowe i nowe informacje; własnymi słowami, nie kopiuj zdań ze źródeł
   - instagram_handle (sam handle, bez @) — TYLKO gdy w wynikach jest profil TEJ osoby i w bazie brak Instagrama
3. evidence — dla każdego zaproponowanego pola krótki dowód: cytat ze snippetu + numer wyniku, np. "ur. 2008 w Zakopanem [4]".
4. articles — wskaż maks. ${MAX_ARTICLES} wyników będących wartościowymi materiałami o TYM zawodniku (artykuły, wywiady, relacje z zawodów; pomiń generyczne rankingi, listy startowe, strony klubów). Dla każdego: result_index (numer z listy), summary (1–2 zdania parafrazy po polsku), sentiment, published_date ISO jeśli da się ustalić.

Jeśli identity_match nie jest "confirmed" — wszystkie updates ustaw na null i articles zostaw puste.

Zwróć WYŁĄCZNIE JSON (bez markdown):
{
  "identity_match": "confirmed" | "uncertain" | "mismatch",
  "identity_note": string,
  "confidence": number,               // 0-1
  "updates": {
    "birth_date": string | null,      // "YYYY-MM-DD"
    "birth_year": number | null,
    "hometown": string | null,
    "sub_discipline": string | null,
    "bio_summary": string | null,
    "instagram_handle": string | null
  },
  "evidence": { "<pole>": string },
  "articles": [ { "result_index": number, "summary": string, "sentiment": "positive"|"neutral"|"negative", "published_date": string | null } ]
}`;

  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1500,
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error("Nieoczekiwany typ odpowiedzi LLM");
  }
  const parsed = extractJsonObject(block.text);

  const rawUpdates = (parsed.updates ?? {}) as Record<string, unknown>;
  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const identityMatch: IdentityMatch =
    parsed.identity_match === "confirmed" || parsed.identity_match === "mismatch"
      ? parsed.identity_match
      : "uncertain";

  const updates: ProposedUpdates = {
    birth_date: str(rawUpdates.birth_date)?.match(/^\d{4}-\d{2}-\d{2}$/)
      ? (rawUpdates.birth_date as string)
      : null,
    birth_year:
      typeof rawUpdates.birth_year === "number" &&
      rawUpdates.birth_year > 1940 &&
      rawUpdates.birth_year <= new Date().getFullYear()
        ? rawUpdates.birth_year
        : null,
    hometown: str(rawUpdates.hometown),
    sub_discipline: str(rawUpdates.sub_discipline),
    bio_summary: str(rawUpdates.bio_summary),
    instagram_handle:
      str(rawUpdates.instagram_handle)
        ?.replace(/^@/, "")
        .toLowerCase()
        .match(/^[a-z0-9._]{1,30}$/)?.[0] ?? null,
  };

  const evidence: Record<string, string> = {};
  if (parsed.evidence && typeof parsed.evidence === "object") {
    for (const [k, v] of Object.entries(parsed.evidence as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) evidence[k] = v.trim();
    }
  }

  const articles = Array.isArray(parsed.articles)
    ? (parsed.articles as Array<Record<string, unknown>>)
        .filter(
          (a) =>
            typeof a?.result_index === "number" &&
            typeof a?.summary === "string"
        )
        .map((a) => ({
          result_index: a.result_index as number,
          summary: (a.summary as string).trim(),
          sentiment: typeof a.sentiment === "string" ? a.sentiment : "neutral",
          published_date:
            str(a.published_date)?.match(/^\d{4}-\d{2}-\d{2}/) != null
              ? (a.published_date as string).slice(0, 10)
              : null,
        }))
    : [];

  return {
    identity_match: identityMatch,
    identity_note:
      typeof parsed.identity_note === "string" ? parsed.identity_note : "",
    confidence:
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0,
    updates,
    evidence,
    articles,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const EMPTY_UPDATES: ProposedUpdates = {
  birth_date: null,
  birth_year: null,
  hometown: null,
  sub_discipline: null,
  bio_summary: null,
  instagram_handle: null,
};

export async function POST(request: NextRequest) {
  let body: { athleteId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy JSON" }, { status: 400 });
  }

  const athleteId = (body.athleteId ?? "").trim();
  if (!athleteId) {
    return NextResponse.json({ error: "Brak athleteId" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: athlete, error: athleteError } = await supabase
    .from("athletes")
    .select("id, name, discipline, sub_discipline, birth_date, hometown, bio_summary, socials")
    .eq("id", athleteId)
    .single();
  if (athleteError || !athlete) {
    return NextResponse.json(
      { error: "Nie znaleziono zawodnika" },
      { status: 404 }
    );
  }

  try {
    // Zapytania kotwiczone dyscypliną — pierwsza linia obrony przed
    // pomyleniem osób o tym samym nazwisku
    const term = disciplineQueryTerm(athlete.discipline);
    const queries = [
      `"${athlete.name}" ${term} sylwetka OR wywiad OR kariera`,
      `"${athlete.name}" ${term} wiek OR rocznik OR urodzony OR urodzona`,
      `"${athlete.name}" ${term} instagram`,
    ].map((q) => q.replace(/\s+/g, " ").trim());

    const results = await serperSearchMany(queries);
    if (results.length === 0) {
      return NextResponse.json(
        { error: "Brak wyników wyszukiwania dla tego zawodnika" },
        { status: 404 }
      );
    }

    const llm = await enrichWithHaiku(athlete as AthleteRow, results);

    // Pas bezpieczeństwa: przy mismatch nic nie proponujemy, niezależnie
    // od tego co zwrócił LLM
    const safeUpdates =
      llm.identity_match === "mismatch" ? EMPTY_UPDATES : llm.updates;
    const safeArticles = llm.identity_match === "mismatch" ? [] : llm.articles;

    // Mapowanie articles: indeks 1-based z promptu → wynik Serpera
    const shown = results.slice(0, MAX_SNIPPETS_FOR_LLM);
    const articles: ProposedArticle[] = safeArticles
      .map((a) => {
        const r = shown[a.result_index - 1];
        if (!r) return null;
        let source = r.link;
        try {
          source = new URL(r.link).hostname.replace(/^www\./, "");
        } catch {
          /* zostaw pełny URL */
        }
        return {
          url: r.link,
          title: r.title,
          source,
          summary: a.summary,
          sentiment: (["positive", "neutral", "negative"].includes(a.sentiment)
            ? a.sentiment
            : "neutral") as ProposedArticle["sentiment"],
          published_date: a.published_date,
        };
      })
      .filter((a): a is ProposedArticle => a !== null)
      .slice(0, MAX_ARTICLES);

    // Wzbogacenie IG przez Apify — tylko przy potwierdzonej tożsamości
    let instagram: InstagramProfile | null = null;
    let instagramUrl: string | null = null;
    if (llm.identity_match === "confirmed" && safeUpdates.instagram_handle) {
      instagramUrl = `https://www.instagram.com/${safeUpdates.instagram_handle}/`;
      instagram = await fetchInstagramProfile(safeUpdates.instagram_handle);
    }

    const payload: EnrichResponse = {
      identity_match: llm.identity_match,
      identity_note: llm.identity_note,
      confidence: llm.confidence,
      updates: safeUpdates,
      evidence: llm.evidence,
      articles,
      instagram,
      instagram_url: instagramUrl,
      results_count: results.length,
    };
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[enrich-athlete]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
