import { PlaceholderPage } from "@/components/PlaceholderPage";

export const metadata = { title: "News Hub — Talent Trop" };

export default function NewsHubPage() {
  return (
    <PlaceholderPage
      icon="📰"
      title="News Hub"
      description="Magazynowa siatka artykułów z polskich i światowych portali sportowych. Przełącznik Polska / Świat + filtr dyscypliny."
      items={[
        "Hero article (duże zdjęcie + nagłówek) + sidebar grid",
        "Regiony: Polska (Przegląd Sportowy, Sport.pl, Polsat Sport) i Świat (BBC Sport, ESPN, Sky Sports)",
        "Zdjęcia z og:image / media:content RSS — hotlinkowane ze źródła",
        "Filtr dyscypliny, filtr regionu, oznaczenie is_featured",
        "Dane z tabeli: news_articles (region, discipline_tag, image_url, summary)",
      ]}
    />
  );
}
