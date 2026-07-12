"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { storeAvatarFromUrl } from "@/lib/avatar";
import { recomputeTalentScore } from "@/lib/talent-score";

export async function updateDiscoveryStatus(formData: FormData) {
  const athleteId = formData.get("athlete_id") as string;
  const status = formData.get("status") as string;

  if (!athleteId || !["confirmed", "rejected"].includes(status)) return;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("athletes")
    .update({ discovery_status: status })
    .eq("id", athleteId);
  if (error) throw new Error(error.message);

  revalidatePath(`/athlete-hub/${athleteId}`);
  revalidatePath("/athlete-hub");
}

// ---------------------------------------------------------------------------
// Research AI — zapis zatwierdzonych propozycji z /api/enrich-athlete
// ---------------------------------------------------------------------------

export type EnrichmentArticleInput = {
  url: string;
  title: string;
  source: string;
  summary: string | null;
  sentiment: string | null;
  /** ISO yyyy-mm-dd lub null → data zapisu */
  published_date: string | null;
};

export type ApplyEnrichmentInput = {
  athlete_id: string;
  updates: Partial<{
    birth_date: string;
    hometown: string;
    sub_discipline: string;
    bio_summary: string;
  }>;
  instagram: {
    handle: string;
    followers: number | null;
    following: number | null;
    posts: number | null;
    verified: boolean;
    is_private: boolean;
    bio: string | null;
    /** Link CDN Instagrama z Apify — re-hostowany w Storage, nigdy do DB */
    profile_pic_url: string | null;
  } | null;
  articles: EnrichmentArticleInput[];
};

export type ApplyEnrichmentResult =
  | {
      ok: true;
      articles_added: number;
      articles_linked: number;
      /** Świeżo przeliczony talent score (null gdy przeliczenie się nie udało) */
      new_score: number | null;
    }
  | { ok: false; error: string };

const SENTIMENTS = new Set(["positive", "neutral", "negative"]);

/**
 * Zapisuje TYLKO to, co skaut zaznaczył w panelu Research AI:
 * pola profilu → athletes, artykuły → news_articles (dedup po url;
 * istniejące niepodpięte artykuły tylko linkuje), IG → socials jsonb
 * + social_profiles (avatar re-hostuje cotygodniowy instagram_enrichment.yml).
 */
export async function applyEnrichment(
  input: ApplyEnrichmentInput
): Promise<ApplyEnrichmentResult> {
  const supabase = createAdminClient();

  const { data: athlete, error: athleteError } = await supabase
    .from("athletes")
    .select("id, discipline, socials, social_status")
    .eq("id", input.athlete_id)
    .single();
  if (athleteError || !athlete) {
    return { ok: false, error: "Nie znaleziono zawodnika" };
  }

  // 1. Pola profilu
  const patch: Record<string, unknown> = {};
  if (input.updates.birth_date?.match(/^\d{4}-\d{2}-\d{2}$/)) {
    patch.birth_date = input.updates.birth_date;
  }
  if (input.updates.hometown?.trim()) patch.hometown = input.updates.hometown.trim();
  if (input.updates.sub_discipline?.trim()) {
    patch.sub_discipline = input.updates.sub_discipline.trim();
  }
  if (input.updates.bio_summary?.trim()) {
    patch.bio_summary = input.updates.bio_summary.trim();
  }

  const igHandle = input.instagram?.handle
    ?.replace(/^@/, "")
    .toLowerCase()
    .match(/^[a-z0-9._]{1,30}$/)?.[0];
  let avatarUrl: string | null = null;
  if (igHandle) {
    patch.socials = {
      ...((athlete.socials as Record<string, string>) ?? {}),
      instagram: `https://www.instagram.com/${igHandle}/`,
    };
    if (athlete.social_status === "not_found") {
      patch.social_status = "pending_review";
    }
    // Zdjęcie profilowe z IG → Storage (link CDN wygasa, więc re-host od razu);
    // ?v= wymusza odświeżenie w przeglądarce mimo stałej ścieżki pliku
    if (input.instagram?.profile_pic_url) {
      avatarUrl = await storeAvatarFromUrl(
        supabase,
        input.athlete_id,
        input.instagram.profile_pic_url
      );
      if (avatarUrl) patch.photo_url = `${avatarUrl}?v=${Date.now()}`;
    }
  }

  if (Object.keys(patch).length > 0) {
    patch.last_updated = new Date().toISOString();
    const { error } = await supabase
      .from("athletes")
      .update(patch)
      .eq("id", input.athlete_id);
    if (error) return { ok: false, error: error.message };
  }

  // 2. Artykuły — insert nowych, linkowanie istniejących bez athlete_id
  let articlesAdded = 0;
  let articlesLinked = 0;
  if (input.articles.length > 0) {
    const urls = input.articles.map((a) => a.url);
    const { data: existing } = await supabase
      .from("news_articles")
      .select("id, url, athlete_id")
      .in("url", urls);
    const existingByUrl = new Map((existing ?? []).map((r) => [r.url, r]));

    const toInsert = input.articles
      .filter((a) => !existingByUrl.has(a.url))
      .map((a) => {
        let region = "world";
        try {
          if (new URL(a.url).hostname.endsWith(".pl")) region = "poland";
        } catch {
          /* zostaw world */
        }
        return {
          athlete_id: input.athlete_id,
          source: a.source.slice(0, 200),
          url: a.url,
          title: a.title.slice(0, 500),
          published_at: a.published_date?.match(/^\d{4}-\d{2}-\d{2}$/)
            ? `${a.published_date}T12:00:00Z`
            : new Date().toISOString(),
          summary: a.summary?.trim() || null,
          region,
          sentiment: a.sentiment && SENTIMENTS.has(a.sentiment) ? a.sentiment : null,
          discipline_tag: athlete.discipline,
        };
      });
    if (toInsert.length > 0) {
      const { error } = await supabase.from("news_articles").insert(toInsert);
      if (error) return { ok: false, error: `Artykuły: ${error.message}` };
      articlesAdded = toInsert.length;
    }

    const toLink = (existing ?? []).filter((r) => !r.athlete_id).map((r) => r.id);
    if (toLink.length > 0) {
      const { error } = await supabase
        .from("news_articles")
        .update({ athlete_id: input.athlete_id })
        .in("id", toLink);
      if (!error) articlesLinked = toLink.length;
    }
  }

  // 3. social_profiles — insert nowego wiersza IG lub odświeżenie istniejącego
  if (igHandle && input.instagram) {
    const scraped = input.instagram.followers != null;
    const profileRow = {
      handle: igHandle,
      followers_count: input.instagram.followers,
      following_count: input.instagram.following,
      posts_count: input.instagram.posts,
      is_verified_account: input.instagram.verified,
      is_private: input.instagram.is_private,
      bio_text: input.instagram.bio,
      profile_pic_url: avatarUrl,
      enrichment_status: scraped ? "enriched" : "pending",
      last_scraped_at: scraped ? new Date().toISOString() : null,
    };
    const { data: existingProfile } = await supabase
      .from("social_profiles")
      .select("id")
      .eq("athlete_id", input.athlete_id)
      .eq("platform", "instagram")
      .maybeSingle();
    if (existingProfile && !scraped) {
      // Brak świeżych danych z Apify — nie nadpisuj istniejących metryk nullami
    } else {
      const { error: profileError } = existingProfile
        ? await supabase
            .from("social_profiles")
            .update(profileRow)
            .eq("id", existingProfile.id)
        : await supabase.from("social_profiles").insert({
            ...profileRow,
            athlete_id: input.athlete_id,
            platform: "instagram",
            discovery_method: "manual_confirmed",
            discovery_confidence: 0.9,
          });
      if (profileError) {
        console.error("[applyEnrichment] social_profiles:", profileError.message);
      }
    }
  }

  // 4. Świeże dane (wiek, artykuły) → od razu przelicz talent score,
  // zamiast czekać na dzienny cron compute.yml
  let newScore: number | null = null;
  try {
    const recomputed = await recomputeTalentScore(supabase, input.athlete_id);
    newScore = recomputed?.score ?? null;
  } catch (e) {
    console.error(
      "[applyEnrichment] recompute:",
      e instanceof Error ? e.message : String(e)
    );
  }

  revalidatePath(`/athlete-hub/${input.athlete_id}`);
  revalidatePath("/athlete-hub");
  revalidatePath("/news-hub");
  return {
    ok: true,
    articles_added: articlesAdded,
    articles_linked: articlesLinked,
    new_score: newScore,
  };
}
