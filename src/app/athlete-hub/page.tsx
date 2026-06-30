import { PlaceholderPage } from "@/components/PlaceholderPage";

export const metadata = { title: "Athlete Hub — Talent Trop" };

export default function AthleteHubPage() {
  return (
    <PlaceholderPage
      icon="🏅"
      title="Athlete Hub"
      description="Siatka kart zawodników z filtrami. Każda karta prowadzi do pełnego profilu: bio LLM, oś czasu newsów, wyniki, social signals, notatki."
      items={[
        "Filtry: dyscyplina, wiek, status Red Bull, talent score, social_status",
        "Karta zawodnika: zdjęcie, dyscyplina, talent_score (stat mono), red_bull_status badge",
        "Profil: bio_summary (LLM), event_results, social_profiles + brand_fit_score",
        "Sortowanie: talent score malejąco, data dodania, Brand Fit Score",
        "Dane z tabel: athletes, social_profiles, brand_fit_scores, news_articles, scout_notes",
      ]}
    />
  );
}
