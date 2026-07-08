import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { FilterBar } from "./FilterBar";
import { ArticleHero } from "./ArticleHero";
import { ArticleCard } from "./ArticleCard";
import type { Article } from "./ArticleHero";

export const metadata = { title: "News Hub — Talent Trop" };
export const revalidate = 300; // ISR: revalidate every 5 minutes

type PageProps = {
  searchParams: Promise<{ region?: string; discipline?: string }>;
};

async function fetchArticles(region: string, discipline?: string): Promise<Article[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  let query = supabase
    .from("news_articles")
    .select(
      "id,title,summary,url,image_url,image_credit,source,published_at,region,discipline_tag,is_featured"
    )
    .order("published_at", { ascending: false })
    .limit(24);

  if (region !== "all") query = query.eq("region", region);
  if (discipline) query = query.eq("discipline_tag", discipline);

  const { data, error } = await query;
  if (error) {
    console.error("news_articles:", error.message);
    return [];
  }
  return (data ?? []) as Article[];
}

export default async function NewsHubPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const region = params.region ?? "all";
  const discipline = params.discipline;

  const articles = await fetchArticles(region, discipline);
  const hero = articles.find((a) => a.is_featured) ?? articles[0] ?? null;
  const rest = hero ? articles.filter((a) => a.id !== hero.id) : articles;

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        kicker="Media monitor"
        title="News Hub"
        subtitle="Polskie i światowe wiadomości sportowe"
      />

      {/* Filters — client component needs Suspense for useSearchParams */}
      <Suspense fallback={<div style={{ height: "36px" }} />}>
        <FilterBar region={region} discipline={discipline} />
      </Suspense>

      {/* Supabase not configured */}
      {!isSupabaseConfigured() && (
        <div className="card p-6 max-w-lg">
          <p className="stat text-xs mb-2" style={{ color: "var(--color-accent)" }}>
            SUPABASE NOT CONNECTED
          </p>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Uzupełnij <code>.env.local</code> kluczami Supabase (patrz{" "}
            <code>SETUP.md</code> — Krok 3), a artykuły pojawią się po
            pierwszym uruchomieniu <code>ingest.yml</code>.
          </p>
        </div>
      )}

      {/* Connected but no articles yet */}
      {isSupabaseConfigured() && articles.length === 0 && (
        <div className="card p-6 max-w-lg">
          <p className="stat text-xs mb-2" style={{ color: "var(--color-muted)" }}>
            BRAK ARTYKUŁÓW
          </p>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Uruchom <strong>Actions → Ingest RSS Feeds → Run workflow</strong>{" "}
            na GitHubie, żeby zasilić bazę.
          </p>
        </div>
      )}

      {/* Main layout: hero (2/3 width) + sidebar (1/3) */}
      {articles.length > 0 && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 stagger">
            {hero && (
              <div className="lg:col-span-2">
                <ArticleHero article={hero} />
              </div>
            )}
            <div className="flex flex-col gap-3">
              {rest.slice(0, 5).map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          </div>

          {/* Secondary grid below */}
          {rest.length > 5 && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 stagger">
              {rest.slice(5).map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
