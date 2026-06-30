import { PlaceholderPage } from "@/components/PlaceholderPage";

export const metadata = { title: "Watchlist — Talent Trop" };

export default function WatchlistPage() {
  return (
    <PlaceholderPage
      icon="🔖"
      title="Watchlist / Scout Notes"
      description="Prywatna warstwa CRM: oznaczasz zawodnika jako 'do obserwacji', 'kontakt nawiązany', 'rekomendowany'. Dopisujesz notatki chronologicznie."
      items={[
        "Lista obserwowanych athletes z ostatnią notatką i datą",
        "Statusy CRM: watching / contacted / recommended",
        "Formularz dodawania notatki przy każdym zawodniku",
        "Eksport do PDF/CSV (opcjonalnie — tydzień 7+)",
        "Dane z tabel: scout_notes, athletes",
      ]}
    />
  );
}
