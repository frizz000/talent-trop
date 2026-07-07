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

// Federation age-category prefixes matching each filter — catches athletes
// whose only age signal is their federation category (no birth_date on record)
const AGE_CATEGORY_PREFIXES: Record<string, string[]> = {
  u16: ["u13", "u14", "u15", "u16", "mx65", "mx85"],
  u18: ["u13", "u14", "u15", "u16", "u17", "u18", "mx65", "mx85"],
  u21: ["u13", "u14", "u15", "u16", "u17", "u18", "junior", "mx65", "mx85", "mx_junior"],
  u23: ["u13", "u14", "u15", "u16", "u17", "u18", "u23", "junior", "mx65", "mx85", "mx_junior"],
};

function birthDateCutoff(maxAge: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - maxAge);
  return d.toISOString().slice(0, 10);
}

const ATHLETE_COLUMNS =
  "id,name,discipline,birth_date,talent_score,red_bull_status,social_status,discovery_status,photo_url,bio_summary,created_at";

/* eslint-disable @typescript-eslint/no-explicit-any */
function applyCommonFilters(
  query: any,
  discipline?: string,
  red_bull_status?: string,
  discovery_status?: string,
) {
  if (discipline) query = query.eq("discipline", discipline);
  if (red_bull_status) query = query.eq("red_bull_status", red_bull_status);

  if (discovery_status === "confirmed") {
    query = query.in("discovery_status", ["confirmed", "manual"]);
  } else if (discovery_status) {
    query = query.eq("discovery_status", discovery_status);
  } else {
    // Default: hide rejected
    query = query.neq("discovery_status", "rejected");
  }
  return query;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function fetchAthletes(
  discipline?: string,
  red_bull_status?: string,
  sort: SortCol = "talent_score",
  discovery_status?: string,
  age?: string,
): Promise<Athlete[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const ascending = sort === "name";

  let query = supabase
    .from("athletes")
    .select(
      `${ATHLETE_COLUMNS},federation_profiles(federation,ranking_category,ranking_position),social_profiles(profile_pic_url)`
    )
    .limit(60);
  query = applyCommonFilters(query, discipline, red_bull_status, discovery_status);
  if (age && AGE_FILTERS[age]) {
    query = query.gte("birth_date", birthDateCutoff(AGE_FILTERS[age]));
  }
  query = query.order(sort, { ascending, nullsFirst: false });

  const { data, error } = await query;
  if (error) {
    console.error("athletes:", error.message);
    return [];
  }
  let athletes = (data ?? []) as Athlete[];

  // Age filter, part 2: athletes without birth_date whose federation age
  // category matches (e.g. PZA "u16_men_bouldering" entries have no birth year)
  if (age && AGE_CATEGORY_PREFIXES[age]) {
    const orExpr = AGE_CATEGORY_PREFIXES[age]
      .map((p) => `ranking_category.like.${p}*`)
      .join(",");
    let catQuery = supabase
      .from("athletes")
      .select(
        `${ATHLETE_COLUMNS},federation_profiles!inner(federation,ranking_category,ranking_position),social_profiles(profile_pic_url)`
      )
      .is("birth_date", null)
      .or(orExpr, { referencedTable: "federation_profiles" })
      .limit(60);
    catQuery = applyCommonFilters(catQuery, discipline, red_bull_status, discovery_status);
    catQuery = catQuery.order(sort, { ascending, nullsFirst: false });

    const { data: catData, error: catError } = await catQuery;
    if (catError) {
      console.error("athletes by category:", catError.message);
    } else if (catData) {
      const seen = new Set(athletes.map((a) => a.id));
      for (const a of catData as Athlete[]) {
        if (!seen.has(a.id)) athletes.push(a);
      }
      athletes = athletes
        .sort((a, b) => {
          if (sort === "name") return a.name.localeCompare(b.name);
          const av = sort === "talent_score" ? a.talent_score ?? -1 : Date.parse(a.created_at);
          const bv = sort === "talent_score" ? b.talent_score ?? -1 : Date.parse(b.created_at);
          return bv - av;
        })
        .slice(0, 60);
    }
  }

  return athletes;
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
