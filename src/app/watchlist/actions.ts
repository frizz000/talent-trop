"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export async function addScoutNote(formData: FormData) {
  const athleteId = formData.get("athlete_id") as string;
  const noteText = (formData.get("note_text") as string)?.trim();

  if (!athleteId || !noteText) return;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("scout_notes")
    .insert({ athlete_id: athleteId, note_text: noteText });
  if (error) throw new Error(error.message);

  revalidatePath(`/athlete-hub/${athleteId}`);
  revalidatePath("/watchlist");
}

export async function updateWatchlistStatus(formData: FormData) {
  const athleteId = formData.get("athlete_id") as string;
  const status = (formData.get("status") as string) || null;

  if (!athleteId) return;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("athletes")
    .update({ watchlist_status: status })
    .eq("id", athleteId);
  if (error) throw new Error(error.message);

  revalidatePath(`/athlete-hub/${athleteId}`);
  revalidatePath("/watchlist");
}
