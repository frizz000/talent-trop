import { PlaceholderPage } from "@/components/PlaceholderPage";

export const metadata = { title: "Kalendarz — Talent Trop" };

export default function CalendarPage() {
  return (
    <PlaceholderPage
      icon="📅"
      title="Kalendarz Wydarzeń"
      description="Nadchodzące zawody pogrupowane wg dyscypliny, z możliwością oznaczenia 'obserwuj' przy konkretnym evencie."
      items={[
        "Timeline / lista: events pogrupowane po tygodniach",
        "Filtr dyscypliny, filtr importance_level",
        "Klik w event → lista athletes z event_results (wyniki z przeszłości)",
        "Badge importance: minor / national / international / major",
        "Dane z tabel: events, event_results, athletes",
      ]}
    />
  );
}
