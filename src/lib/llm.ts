/**
 * Wspólne narzędzia do pracy z odpowiedziami LLM (Claude Haiku).
 */

/** Toleruje prozę/fence'y wokół pierwszego obiektu {...} — port _extract_json_object z social_discovery.py. */
export function extractJsonObject(raw: string): Record<string, unknown> {
  let text = raw.trim();
  if (text.startsWith("```")) {
    const parts = text.split("```");
    if (parts.length > 1) text = parts[1];
    if (text.startsWith("json")) text = text.slice(4);
    text = text.trim();
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error(`Brak obiektu JSON w odpowiedzi LLM: ${text.slice(0, 120)}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}
