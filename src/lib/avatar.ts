/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Re-hosting avatara IG w Supabase Storage — odpowiednik store_avatar()
 * z scripts/enrich_instagram_profiles.py (ten sam bucket i ścieżka
 * {athlete_id}.jpg, żeby cotygodniowy workflow nadpisywał ten sam plik).
 * Linki CDN Instagrama wygasają po kilku dniach, dlatego nigdy nie trafiają
 * bezpośrednio do DB.
 */

const AVATAR_BUCKET = "athlete-avatars";

export async function storeAvatarFromUrl(
  supabase: any,
  athleteId: string,
  picUrl: string
): Promise<string | null> {
  try {
    const resp = await fetch(picUrl, { signal: AbortSignal.timeout(30_000) });
    if (!resp.ok) return null;
    const contentType = (resp.headers.get("content-type") ?? "image/jpeg").split(";")[0];
    if (!contentType.startsWith("image/")) return null;
    const bytes = await resp.arrayBuffer();
    if (bytes.byteLength === 0) return null;

    // Bucket tworzony idempotentnie (publiczny) — jak ensure_avatar_bucket()
    const { error: bucketError } = await supabase.storage.getBucket(AVATAR_BUCKET);
    if (bucketError) {
      await supabase.storage.createBucket(AVATAR_BUCKET, { public: true });
    }

    const path = `${athleteId}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, bytes, { contentType, upsert: true });
    if (uploadError) {
      console.error("[storeAvatar] upload:", uploadError.message);
      return null;
    }

    const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    return data?.publicUrl ?? null;
  } catch (e) {
    console.error("[storeAvatar]", e instanceof Error ? e.message : String(e));
    return null;
  }
}
