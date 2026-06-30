import { relativeTime } from "@/lib/utils";
import type { Article } from "./ArticleHero";

/** Small card for sidebar and secondary grid. */
export function ArticleCard({ article }: { article: Article }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block group"
    >
      <div
        className="card flex gap-3 p-3 transition-colors"
        style={{ borderColor: "var(--color-border)" }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.borderColor = "var(--color-accent)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.borderColor = "var(--color-border)")
        }
      >
        {/* Thumbnail */}
        {article.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.image_url}
            alt=""
            className="object-cover shrink-0"
            style={{ width: "68px", height: "68px", borderRadius: "6px" }}
          />
        ) : (
          <div
            className="shrink-0 flex items-center justify-center text-lg"
            style={{
              width: "68px",
              height: "68px",
              borderRadius: "6px",
              backgroundColor: "var(--color-bg)",
              border: "1px solid var(--color-border)",
            }}
          >
            📰
          </div>
        )}

        {/* Text */}
        <div className="flex-1 min-w-0">
          {article.discipline_tag && (
            <span className="badge-accent mb-1">{article.discipline_tag}</span>
          )}
          <p
            className="text-sm font-semibold leading-snug line-clamp-2 group-hover:opacity-75 transition-opacity"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          >
            {article.title}
          </p>
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}
          >
            {article.source} · {relativeTime(article.published_at)}
          </p>
        </div>
      </div>
    </a>
  );
}
