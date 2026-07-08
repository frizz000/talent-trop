/**
 * Serper.dev (Google Search API) — ten sam wzorzec autoryzacji co w
 * scripts/social_discovery.py (POST + X-API-KEY, wyniki w polu `organic`).
 * Wyłącznie server-side — klucz nigdy nie trafia do klienta.
 */

const SERPER_ENDPOINT = "https://google.serper.dev/search";

export type SerperResult = {
  title: string;
  link: string;
  snippet: string;
  date?: string;
};

export async function serperSearch(
  query: string,
  num = 8
): Promise<SerperResult[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error("SERPER_API_KEY nie jest skonfigurowany");
  }

  const resp = await fetch(SERPER_ENDPOINT, {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num, gl: "pl", hl: "pl" }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) {
    throw new Error(`Serper HTTP ${resp.status}`);
  }

  const data: {
    organic?: Array<{ title?: string; link?: string; snippet?: string; date?: string }>;
  } = await resp.json();

  return (data.organic ?? [])
    .filter((item) => item.link)
    .map((item) => ({
      title: item.title ?? item.link!,
      link: item.link!,
      snippet: item.snippet ?? "",
      date: item.date,
    }));
}

/** Kilka zapytań równolegle, deduplikacja po URL, zachowuje kolejność. */
export async function serperSearchMany(
  queries: string[],
  numPerQuery = 8
): Promise<SerperResult[]> {
  const settled = await Promise.allSettled(
    queries.map((q) => serperSearch(q, numPerQuery))
  );
  const seen = new Set<string>();
  const merged: SerperResult[] = [];
  for (const res of settled) {
    if (res.status !== "fulfilled") continue;
    for (const item of res.value) {
      if (seen.has(item.link)) continue;
      seen.add(item.link);
      merged.push(item);
    }
  }
  // Jeśli wszystkie zapytania padły, wynieś pierwszy błąd wyżej
  if (merged.length === 0) {
    const firstError = settled.find((r) => r.status === "rejected");
    if (firstError && firstError.status === "rejected") {
      throw firstError.reason instanceof Error
        ? firstError.reason
        : new Error(String(firstError.reason));
    }
  }
  return merged;
}

const IG_HANDLE_BLOCKLIST = new Set([
  "p", "reel", "reels", "stories", "explore", "accounts", "tv", "popular",
  "redbull", "redbullpol", "instagram",
]);

/** Wyciąga handle Instagrama z listy wyników (odpowiednik regexa w social_discovery.py). */
export function extractInstagramHandle(results: SerperResult[]): string | null {
  for (const r of results) {
    const m = r.link.match(/instagram\.com\/([A-Za-z0-9_.]+)\/?/);
    if (!m) continue;
    const handle = m[1].toLowerCase().replace(/\.+$/, "");
    if (IG_HANDLE_BLOCKLIST.has(handle)) continue;
    return handle;
  }
  return null;
}
