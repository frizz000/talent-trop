import { relativeTime } from "@/lib/utils";

export interface Article {
  id: string;
  title: string;
  summary?: string | null;
  url: string;
  image_url?: string | null;
  image_credit?: string | null;
  source: string;
  published_at: string;
  region: string;
  discipline_tag?: string | null;
  is_featured?: boolean;
}

export function ArticleHero({ article }: { article: Article }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block group"
      style={{ height: "400px" }}
    >
      <div
        className="card overflow-hidden relative h-full"
        style={{ borderRadius: "10px" }}
      >
        {/* Background image */}
        {article.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.image_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: "brightness(0.45)" }}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                "repeating-linear-gradient(45deg, #1a1a1a 0, #1a1a1a 10px, #0f0f0f 10px, #0f0f0f 20px)",
            }}
          />
        )}

        {/* Gradient overlay for text legibility */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(15,15,15,0.95) 0%, rgba(15,15,15,0.3) 60%, transparent 100%)",
          }}
        />

        {/* Content */}
        <div className="absolute inset-0 p-6 flex flex-col justify-end">
          <div className="flex items-center gap-2 mb-3">
            {article.discipline_tag && (
              <span className="badge-accent">{article.discipline_tag}</span>
            )}
            <span
              className="text-xs"
              style={{ color: "rgba(240,240,240,0.5)", fontFamily: "var(--font-mono)" }}
            >
              {relativeTime(article.published_at)}
            </span>
          </div>

          <h2
            className="text-3xl font-bold uppercase leading-tight group-hover:opacity-90 transition-opacity"
            style={{ fontFamily: "var(--font-display)", color: "#f0f0f0" }}
          >
            {article.title}
          </h2>

          {article.summary && (
            <p
              className="mt-2 text-sm line-clamp-2 leading-relaxed"
              style={{ color: "rgba(240,240,240,0.65)" }}
            >
              {article.summary}
            </p>
          )}

          <p
            className="mt-3 text-xs"
            style={{ color: "rgba(240,240,240,0.4)", fontFamily: "var(--font-mono)" }}
          >
            {article.source}
            {article.image_credit && article.image_credit !== article.source
              ? ` · foto: ${article.image_credit}`
              : ""}
          </p>
        </div>
      </div>
    </a>
  );
}
