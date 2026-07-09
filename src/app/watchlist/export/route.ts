import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  recommended: "Rekomendowany",
  contacted: "Kontakt nawiązany",
  watching: "Obserwuję",
};

const RB_LABELS: Record<string, string> = {
  signed: "Red Bull Signed",
  unsigned: "No Deal",
  unknown: "Unknown",
};

function csvField(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  // Semicolon separator (Polish Excel locale) — quote when needed
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** GET /watchlist/export — watched athletes + latest note as CSV (Excel-friendly: BOM + semicolons). */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const supabase = await createClient();

  const { data: athletes, error } = await supabase
    .from("athletes")
    .select("id, name, discipline, birth_date, talent_score, red_bull_status, watchlist_status")
    .not("watchlist_status", "is", null)
    .order("talent_score", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = athletes ?? [];
  const ids = rows.map((a) => a.id);

  const latestNoteByAthlete = new Map<string, { note_text: string; created_at: string }>();
  const brandFitByAthlete = new Map<string, number>();
  if (ids.length > 0) {
    const [notesRes, brandRes] = await Promise.all([
      supabase
        .from("scout_notes")
        .select("athlete_id, note_text, created_at")
        .in("athlete_id", ids)
        .order("created_at", { ascending: false }),
      supabase.from("brand_fit_scores").select("athlete_id, score").in("athlete_id", ids),
    ]);
    for (const n of notesRes.data ?? []) {
      if (!latestNoteByAthlete.has(n.athlete_id)) latestNoteByAthlete.set(n.athlete_id, n);
    }
    for (const b of brandRes.data ?? []) {
      brandFitByAthlete.set(b.athlete_id, Number(b.score));
    }
  }

  const header = [
    "Imię i nazwisko",
    "Dyscyplina",
    "Data urodzenia",
    "Talent Score",
    "Brand Fit",
    "Status watchlisty",
    "Status Red Bull",
    "Ostatnia notatka",
    "Data notatki",
    "Profil",
  ];

  const origin = request.nextUrl.origin;
  const lines = [header.join(";")];
  for (const a of rows) {
    const note = latestNoteByAthlete.get(a.id);
    lines.push(
      [
        csvField(a.name),
        csvField(a.discipline),
        csvField(a.birth_date),
        csvField(a.talent_score != null ? Number(a.talent_score).toFixed(1) : null),
        csvField(
          brandFitByAthlete.has(a.id) ? brandFitByAthlete.get(a.id)!.toFixed(0) : null
        ),
        csvField(STATUS_LABELS[a.watchlist_status] ?? a.watchlist_status),
        csvField(RB_LABELS[a.red_bull_status] ?? a.red_bull_status),
        csvField(note?.note_text ?? null),
        csvField(note ? new Date(note.created_at).toLocaleDateString("pl-PL") : null),
        csvField(`${origin}/athlete-hub/${a.id}`),
      ].join(";")
    );
  }

  // BOM so Excel opens UTF-8 Polish characters correctly
  const csv = "\uFEFF" + lines.join("\r\n");
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="watchlist_${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
