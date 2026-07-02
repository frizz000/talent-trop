import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";
import { AthleteFilters } from "./AthleteFilters";
import { AthleteCard } from "./AthleteCard";
import type { Athlete } from "./AthleteCard";

export const metadata = { title: "Athlete Hub — Talent Trop" };
export const revalidate = 300;

type PageProps = {
  searchParams: Promise<{
    discipline?: string;
    red_bull_status?: string;
    sort?: string;
    discovery_status?: string;
    age?: string;
  }>;
};

type SortCol = "talent_score" | "name" | "created_at";

// Max age per filter value — U16 = born less than 16 years ago
const AGE_FILTERS: Record<string, number> = {
  u16: 16,
  u18: 18,
  u21: 21,
  u23: 23,
};

function birthDateCutoff(maxAge: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - maxAge);
  return d.toISOString().slice(0, 10);
}

async function fetchAthletes(
  discipline?: string,
  red_bull_status?: string,
  sort: SortCol = "talent_score",
  discovery_status?: string,
  age?: string,
): Promise<Athlete[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  let query = supabase
    .from("athletes")
    .select(
      "id,name,discipline,birth_date,talent_score,red_bull_status,social_status,discovery_status,photo_url,bio_summary,created_at,federation_profiles(federation,ranking_category,ranking_position)"
    )
    .limit(60);

  if (discipline) query = query.eq("discipline", discipline);
  if (red_bull_status) query = query.eq("red_bull_status", red_bull_status);
  if (age && AGE_FILTERS[age]) {
    query = query.gte("birth_date", birthDateCutoff(AGE_FILTERS[age]));
  }

  if (discovery_status === "confirmed") {
    query = query.in("discovery_status", ["confirmed", "manual"]);
  } else if (discovery_status) {
    query = query.eq("discovery_status", discovery_status);
  } else {
    // Default: hide rejected
    query = query.neq("discovery_status", "rejected");
  }

  const ascending = sort === "name";
  query = query.order(sort, { ascending, nullsFirst: false });

  const { data, error } = await query;
  if (error) {
    console.error("athletes:", error.message);
    return [];
  }
  return (data ?? []) as Athlete[];
}

async function fetchDisciplines(): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("athletes")
    .select("discipline")
    .neq("discovery_status", "rejected")
    .limit(2000);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    if (row.discipline) counts.set(row.discipline, (counts.get(row.discipline) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d);
}

export default async function AthleteHubPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { discipline, red_bull_status, sort, discovery_status, age } = params;
  const sortCol = (sort as SortCol) ?? "talent_score";

  const [athletes, disciplines] = await Promise.all([
    fetchAthletes(discipline, red_bull_status, sortCol, discovery_status, age),
    fetchDisciplines(),
  ]);

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-5">
        <h1
          className="text-5xl font-bold uppercase tracking-tight leading-none"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Athlete Hub
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>
          Baza zawodników — filtruj, sortuj, eksploruj
        </p>
      </div>

      {/* Filters */}
      <Suspense fallback={<div style={{ height: "36px" }} />}>
        <AthleteFilters
          discipline={discipline}
          red_bull_status={red_bull_status}
          sort={sort}
          discovery_status={discovery_status}
          age={age}
          disciplines={disciplines}
          total={athletes.length}
        />
      </Suspense>

      {/* Supabase not configured */}
      {!isSupabaseConfigured() && (
        <div className="card p-6 max-w-lg">
          <p className="stat text-xs mb-2" style={{ color: "var(--color-accent)" }}>
            SUPABASE NOT CONNECTED
          </p>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Uzupełnij <code>.env.local</code> (Krok 3 w <code>SETUP.md</code>),
            potem wstaw pierwszych zawodników przez SQL Editor lub narzędzie
            CLI (patrz Krok 6).
          </p>
        </div>
      )}

      {/* Connected, no athletes */}
      {isSupabaseConfigured() && athletes.length === 0 && (
        <div className="card p-6 max-w-lg">
          <p className="stat text-xs mb-2" style={{ color: "var(--color-muted)" }}>
            BRAK ZAWODNIKÓW
          </p>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Wstaw pierwszych zawodników do tabeli <code>athletes</code> przez
            Supabase SQL Editor (patrz Krok 6 w <code>SETUP.md</code>).
          </p>
        </div>
      )}

      {/* Athletes grid */}
      {athletes.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {athletes.map((athlete) => (
            <AthleteCard key={athlete.id} athlete={athlete} />
          ))}
        </div>
      )}
    </div>
  );
}
