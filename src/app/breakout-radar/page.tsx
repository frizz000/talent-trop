import { PlaceholderPage } from "@/components/PlaceholderPage";

export const metadata = { title: "Breakout Radar — Talent Trop" };

export default function BreakoutRadarPage() {
  return (
    <PlaceholderPage
      icon="📡"
      title="Breakout Radar"
      description="Lista zawodników z gwałtownym wzrostem talent score w ostatnich 7 lub 30 dniach — sortowana malejąco po skoku. Zastępuje codziennego maila."
      items={[
        "Ranking: delta talent_score w oknie 7d / 30d (przełącznik)",
        "Karta zawodnika: name, dyscyplina, aktualny score (stat mono), delta (trend-up green)",
        "Rozbicie wzrostu: które czynniki z factors jsonb skoczyły najbardziej",
        "Asymetryczny layout: top-3 jako duże hero karty, reszta jako lista",
        "Dane z tabeli: talent_score_history (computed_at, score, factors), athletes",
      ]}
    />
  );
}
