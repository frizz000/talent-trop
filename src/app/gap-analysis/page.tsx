import { PlaceholderPage } from "@/components/PlaceholderPage";

export const metadata = { title: "Gap Analysis — Talent Trop" };

export default function GapAnalysisPage() {
  return (
    <PlaceholderPage
      icon="🗺"
      title="Gap Analysis"
      description="Red Bull Heatmap — macierz dyscyplina × pokrycie. Wizualnie pokazuje gdzie Red Bull jest mocny w Polsce, a gdzie jest luka na tle innych krajów."
      items={[
        "Macierz: wiersze = dyscypliny, kolumny = kraje (Polska + komparatory)",
        "Kolory: strong / partial / weak / none — wartości z discipline_gaps.poland_coverage_status",
        "Priorytet komórki: discipline_gaps.priority_score (im wyższy, tym ważniejszy gap)",
        "Klik w komórkę → lista zawodników z tej dyscypliny bez Red Bull deal",
        "Dane z tabel: discipline_gaps, redbull_roster, athletes",
      ]}
    />
  );
}
