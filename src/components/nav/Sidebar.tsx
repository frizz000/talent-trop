"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/news-hub",       label: "News Hub",         icon: "📰", short: "NEWS" },
  { href: "/athlete-hub",    label: "Athlete Hub",      icon: "🏅", short: "ATHLETES" },
  { href: "/gap-analysis",   label: "Gap Analysis",     icon: "🗺",  short: "GAPS" },
  { href: "/breakout-radar", label: "Breakout Radar",   icon: "📡", short: "RADAR" },
  { href: "/calendar",       label: "Kalendarz",        icon: "📅", short: "CAL" },
  { href: "/watchlist",      label: "Watchlist",        icon: "🔖", short: "WATCH" },
] as const;

const ADMIN_ITEMS = [
  { href: "/admin", label: "Admin / Pipeline", icon: "⚙", short: "ADMIN" },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{ backgroundColor: "var(--color-surface)", borderRight: "1px solid var(--color-border)" }}
      className="flex flex-col w-56 shrink-0 h-screen sticky top-0 overflow-y-auto"
    >
      {/* Logo / wordmark */}
      <div
        className="px-5 py-5 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        <span
          className="text-2xl font-bold tracking-tight uppercase leading-none"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-accent)" }}
        >
          Talent
        </span>
        <span
          className="text-2xl font-bold tracking-tight uppercase leading-none"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Trop
        </span>
        <p
          className="text-xs mt-1 uppercase tracking-widest"
          style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}
        >
          Scout Dashboard
        </p>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 py-4">
        <ul className="space-y-0.5 px-2">
          {NAV_ITEMS.map(({ href, label, icon }) => {
            const active = pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: active ? "var(--color-bg)" : "transparent",
                    color: active ? "var(--color-text)" : "var(--color-muted)",
                    borderLeft: active ? `2px solid var(--color-accent)` : "2px solid transparent",
                  }}
                >
                  <span className="text-base leading-none">{icon}</span>
                  <span style={{ fontFamily: "var(--font-body)" }}>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Admin section */}
      <div className="px-2 pb-2" style={{ borderTop: "1px solid var(--color-border)", paddingTop: "8px" }}>
        {ADMIN_ITEMS.map(({ href, label, icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2 rounded-[8px] text-sm font-medium transition-colors"
              style={{
                backgroundColor: active ? "var(--color-bg)" : "transparent",
                color: active ? "var(--color-text)" : "var(--color-muted)",
                borderLeft: active ? `2px solid var(--color-accent)` : "2px solid transparent",
              }}
            >
              <span className="text-base leading-none">{icon}</span>
              <span style={{ fontFamily: "var(--font-body)", fontSize: "13px" }}>{label}</span>
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div
        className="px-5 py-4 text-xs border-t"
        style={{ borderColor: "var(--color-border)", color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}
      >
        <div>Pipeline: —</div>
        <div className="mt-0.5">Last run: —</div>
      </div>
    </aside>
  );
}
