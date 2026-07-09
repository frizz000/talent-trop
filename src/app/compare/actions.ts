"use server";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

export type AthleteSearchResult = {
  id: string;
  name: string;
  discipline: string;
  talent_score: number | null;
};

/** Name search for the comparator picker — excludes rejected records. */
export async function searchAthletes(query: string): Promise<AthleteSearchResult[]> {
  const q = query.trim();
  if (q.length < 2 || !isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("athletes")
    .select("id, name, discipline, talent_score")
    .ilike("name", `%${q}%`)
    .neq("discovery_status", "rejected")
    .order("talent_score", { ascending: false, nullsFirst: false })
    .limit(8);

  if (error) {
    console.error("[compare/searchAthletes]:", error.message);
    return [];
  }
  return (data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    discipline: a.discipline,
    talent_score: a.talent_score != null ? Number(a.talent_score) : null,
  }));
}
