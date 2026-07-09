"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { WORKFLOW_IDS } from "@/lib/workflows";

export async function setPipelineEnabled(
  isEnabled: boolean,
  reason: string | null
) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("pipeline_settings").upsert({
    id: 1,
    is_enabled: isEnabled,
    disabled_by_reason: isEnabled ? null : reason?.trim() || null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}

export async function setWorkflowEnabled(
  workflowId: string,
  isEnabled: boolean
) {
  if (!WORKFLOW_IDS.includes(workflowId)) {
    throw new Error(`Unknown workflow_id: ${workflowId}`);
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("workflow_settings").upsert({
    workflow_id: workflowId,
    is_enabled: isEnabled,
    disabled_by_reason: null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}
