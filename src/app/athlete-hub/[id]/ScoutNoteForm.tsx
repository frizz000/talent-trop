"use client";

import { useRef, useTransition } from "react";
import { addScoutNote } from "@/app/watchlist/actions";

export function ScoutNoteForm({ athleteId }: { athleteId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await addScoutNote(formData);
      ref.current?.reset();
    });
  }

  return (
    <form ref={ref} action={handleSubmit} className="flex flex-col gap-2 mt-2">
      <input type="hidden" name="athlete_id" value={athleteId} />
      <textarea
        name="note_text"
        rows={3}
        required
        placeholder="Dodaj notatkę skauta..."
        className="w-full resize-none p-2 text-xs leading-relaxed"
        style={{
          backgroundColor: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          borderRadius: "6px",
          color: "var(--color-text)",
          fontFamily: "var(--font-body)",
        }}
      />
      <button
        type="submit"
        disabled={isPending}
        className="self-end text-xs font-bold uppercase tracking-wider px-3 py-1.5"
        style={{
          backgroundColor: isPending ? "var(--color-border)" : "var(--color-accent)",
          color: "#fff",
          borderRadius: "6px",
          fontFamily: "var(--font-display)",
          cursor: isPending ? "not-allowed" : "pointer",
          border: "none",
        }}
      >
        {isPending ? "Zapisuję..." : "Dodaj notatkę"}
      </button>
    </form>
  );
}
