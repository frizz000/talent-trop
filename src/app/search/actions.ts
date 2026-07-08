"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export type AddAthletePayload = {
  name: string;
  discipline: string | null;
  birth_year: number | null;
  nationality: string | null;
  club: string | null;
  summary: string;
  instagram_handle: string | null;
  instagram_followers: number | null;
  instagram_following: number | null;
  instagram_posts: number | null;
  instagram_verified: boolean;
  instagram_private: boolean;
  instagram_bio: string | null;
};

export type AddAthleteResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Tworzy rekord athletes (discovery_status='manual') z danych wyszukiwarki.
 * Jeśli znaleziono handle IG — dokłada wiersz social_profiles; avatar
 * re-hostuje później cotygodniowy instagram_enrichment.yml (dlatego
 * enrichment_status zostaje 'pending', a profile_pic_url pusty — linki CDN
 * Instagrama wygasają).
 */
export async function addAthleteFromSearch(
  payload: AddAthletePayload
): Promise<AddAthleteResult> {
  const name = payload.name.trim();
  if (name.length < 3 || !name.includes(" ")) {
    return { ok: false, error: "Nieprawidłowe imię i nazwisko" };
  }

  const supabase = createAdminClient();

  const bioParts = [payload.summary.trim()];
  if (payload.club) bioParts.push(`Klub: ${payload.club}.`);
  if (payload.birth_year) bioParts.push(`Rocznik ${payload.birth_year}.`);
  const bioSummary = bioParts.filter(Boolean).join(" ") || null;

  const socials = payload.instagram_handle
    ? { instagram: `https://www.instagram.com/${payload.instagram_handle}/` }
    : {};

  const { data: athlete, error } = await supabase
    .from("athletes")
    .insert({
      name,
      discipline: payload.discipline?.trim() || "inne",
      birth_date: payload.birth_year ? `${payload.birth_year}-01-01` : null,
      bio_summary: bioSummary,
      socials,
      discovery_status: "manual",
      social_status: payload.instagram_handle ? "pending_review" : "not_found",
    })
    .select("id")
    .single();

  if (error || !athlete) {
    return { ok: false, error: error?.message ?? "Nie udało się zapisać zawodnika" };
  }

  if (payload.instagram_handle) {
    const { error: profileError } = await supabase.from("social_profiles").insert({
      athlete_id: athlete.id,
      platform: "instagram",
      handle: payload.instagram_handle,
      discovery_method: "manual_confirmed",
      discovery_confidence: 0.9,
      followers_count: payload.instagram_followers,
      following_count: payload.instagram_following,
      posts_count: payload.instagram_posts,
      is_verified_account: payload.instagram_verified,
      is_private: payload.instagram_private,
      bio_text: payload.instagram_bio,
      last_scraped_at: payload.instagram_followers != null ? new Date().toISOString() : null,
    });
    // Nie blokuj dodania zawodnika, gdy sam profil IG się nie zapisał
    if (profileError) {
      console.error("[search/addAthlete] social_profiles:", profileError.message);
    }
  }

  revalidatePath("/athlete-hub");
  return { ok: true, id: athlete.id };
}
