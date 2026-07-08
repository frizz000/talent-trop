"use client";

import { useTransition } from "react";
import { updateWatchlistStatus } from "@/app/watchlist/actions";

type Props = {
  athleteId: string;
  currentStatus: string | null;
};

const STATUSES = [
  { value: "", label: "— Watchlist —" },
  { value: "watching", label: "👁 Obserwuję" },
  { value: "contacted", label: "📨 Kontakt" },
  { value: "recommended", label: "⭐ Rekomendowany" },
];

export function WatchlistStatusSelect({ athleteId, currentStatus }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    const formData = new FormData();
    formData.append("athlete_id", athleteId);
    formData.append("status", value);
    startTransition(async () => {
      await updateWatchlistStatus(formData);
    });
  }

  return (
    <select
      value={currentStatus ?? ""}
      onChange={handleChange}
      disabled={isPending}
      className="select"
      style={{
        color: currentStatus ? "var(--color-text)" : "var(--color-muted)",
        cursor: isPending ? "not-allowed" : "pointer",
        opacity: isPending ? 0.6 : 1,
      }}
    >
      {STATUSES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
