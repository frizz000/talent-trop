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
          borderRadius: "8px",
          color: "var(--color-text)",
          fontFamily: "var(--font-body)",
          transition: "border-color .15s ease",
        }}
      />
      <button
        type="submit"
        disabled={isPending}
        className="self-end text-xs font-bold uppercase tracking-wider px-3.5 py-1.5"
        style={{
          backgroundColor: isPending ? "var(--color-border)" : "var(--color-accent)",
          color: "#fff",
          borderRadius: "8px",
          fontFamily: "var(--font-display)",
          cursor: isPending ? "not-allowed" : "pointer",
          border: "none",
          boxShadow: isPending ? "none" : "0 2px 12px -3px rgba(230,13,63,.5)",
          transition: "background-color .15s ease, box-shadow .15s ease",
        }}
      >
        {isPending ? "Zapisuję..." : "Dodaj notatkę"}
      </button>
    </form>
  );
}
