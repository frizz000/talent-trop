import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/pipeline-status?workflow=<workflow_id>
 *
 * Odpytywany przez GitHub Actions na początku każdego joba (zero-cost early
 * exit gdy pipeline wyłączony w /admin). Autoryzacja: header
 * `x-pipeline-check-key` == env PIPELINE_CHECK_SECRET (GitHub secret + Vercel env).
 *
 * workflow_id → plik .yml: patrz supabase/migrations/0008_pipeline_settings.sql
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.PIPELINE_CHECK_SECRET;
  if (!secret || request.headers.get("x-pipeline-check-key") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const workflow = request.nextUrl.searchParams.get("workflow");
  if (!workflow) {
    return NextResponse.json(
      { error: "missing ?workflow= query param" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const [globalRes, workflowRes] = await Promise.all([
    supabase
      .from("pipeline_settings")
      .select("is_enabled")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("workflow_settings")
      .select("is_enabled")
      .eq("workflow_id", workflow)
      .maybeSingle(),
  ]);

  if (globalRes.error || workflowRes.error) {
    const message = globalRes.error?.message ?? workflowRes.error?.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Brak wiersza globalnego (migracja 0008 nie wykonana) → fail-open
  const globalEnabled = globalRes.data?.is_enabled ?? true;

  // Nieznany workflow_id → fail-open, żeby literówka nie zablokowała
  // workflow po cichu — ale logujemy warning
  let workflowEnabled = true;
  if (workflowRes.data == null) {
    console.warn(
      `[pipeline-status] unknown workflow_id "${workflow}" — no row in workflow_settings, defaulting to enabled`
    );
  } else {
    workflowEnabled = workflowRes.data.is_enabled;
  }

  return NextResponse.json({
    global_enabled: globalEnabled,
    workflow_enabled: workflowEnabled,
    should_run: globalEnabled && workflowEnabled,
  });
}
