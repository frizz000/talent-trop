interface PlaceholderPageProps {
  title: string;
  description: string;
  icon: string;
  items?: string[];
}

export function PlaceholderPage({ title, description, icon, items }: PlaceholderPageProps) {
  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1
          className="text-5xl font-bold uppercase tracking-tight leading-none"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          {icon} {title}
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-muted)" }}>
          {description}
        </p>
      </div>

      {/* Status card */}
      <div className="card p-6 max-w-lg">
        <div className="flex items-center gap-3 mb-4">
          <span
            className="stat text-xs px-2 py-1 rounded"
            style={{
              backgroundColor: "var(--color-bg)",
              color: "var(--color-accent)",
              border: "1px solid var(--color-accent)",
            }}
          >
            COMING SOON
          </span>
          <span className="text-xs" style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>
            Week 3–4 roadmap
          </span>
        </div>
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          Ten moduł zostanie zbudowany po podpięciu Supabase i warstwy LLM.
          Szkielet nawigacji i schemat bazy są już gotowe.
        </p>
        {items && items.length > 0 && (
          <ul className="mt-4 space-y-1">
            {items.map((item) => (
              <li
                key={item}
                className="text-xs flex items-start gap-2"
                style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}
              >
                <span style={{ color: "var(--color-border)" }}>→</span>
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
