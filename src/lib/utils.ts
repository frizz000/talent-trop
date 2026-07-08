/** Format ISO timestamp as relative time (Polish locale). */
export function relativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffD = Math.floor(diffMs / 86_400_000);

  if (diffMin < 60) return `${diffMin}m temu`;
  if (diffH < 24) return `${diffH}h temu`;
  if (diffD === 1) return "wczoraj";
  return date.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

/** True when both Supabase env vars are present. */
export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
