"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

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
