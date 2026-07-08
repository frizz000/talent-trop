/**
 * Apify Instagram Profile Scraper — synchroniczne pobranie jednego profilu.
 * Ten sam aktor i mapowanie pól co w scripts/enrich_instagram_profiles.py
 * i validate_handle_apify w scripts/social_discovery.py, ale przez endpoint
 * run-sync-get-dataset-items (jeden profil on-demand, bez pollingu).
 */

const APIFY_INSTAGRAM_ACTOR = "apify~instagram-profile-scraper";

export type InstagramProfile = {
  handle: string;
  fullName: string | null;
  followersCount: number | null;
  followingCount: number | null;
  postsCount: number | null;
  isVerified: boolean;
  isPrivate: boolean;
  bioText: string | null;
  /** UWAGA: link CDN Instagrama — wygasa po kilku dniach; nie zapisywać do DB
   *  (avatar re-hostuje cotygodniowy instagram_enrichment.yml). */
  profilePicUrl: string | null;
};

export async function fetchInstagramProfile(
  handle: string,
  timeoutMs = 55_000
): Promise<InstagramProfile | null> {
  const token =
    process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY;
  if (!token) return null;

  const url = `https://api.apify.com/v2/acts/${APIFY_INSTAGRAM_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [handle] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) return null;

    const items: Array<Record<string, unknown>> = await resp.json();
    const p = items?.[0];
    if (!p || !p.username || p.error) return null;

    return {
      handle: String(p.username),
      fullName: (p.fullName as string) || null,
      followersCount: (p.followersCount as number) ?? null,
      followingCount: (p.followsCount as number) ?? null,
      postsCount: (p.postsCount as number) ?? null,
      isVerified: Boolean(p.verified),
      isPrivate: Boolean(p.private),
      bioText: ((p.biography as string) || "").slice(0, 500) || null,
      profilePicUrl:
        (p.profilePicUrlHD as string) || (p.profilePicUrl as string) || null,
    };
  } catch {
    // Timeout / błąd sieci — wynik wyszukiwania pokaże sam link do profilu
    return null;
  }
}
