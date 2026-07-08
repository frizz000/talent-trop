"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* Minimal 24px stroke icons (lucide-style paths) */
function Icon({ d, extra }: { d: string; extra?: React.ReactNode }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d={d} />
      {extra}
    </svg>
  );
}

const ICONS: Record<string, React.ReactNode> = {
  search: (
    <Icon d="m21 21-4.34-4.34" extra={<circle cx="11" cy="11" r="8" />} />
  ),
  news: (
    <Icon d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0V7M18 14h-8M15 18h-5M10 6h8v4h-8V6Z" />
  ),
  athletes: (
    <Icon d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  ),
  gaps: (
    <Icon
      d=""
      extra={
        <>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </>
      }
    />
  ),
  radar: (
    <Icon d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
  ),
  calendar: (
    <Icon
      d="M16 2v4M8 2v4M3 10h18"
      extra={<rect x="3" y="4" width="18" height="18" rx="2" />}
    />
  ),
  watchlist: (
    <Icon d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
  ),
  admin: (
    <Icon d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />
  ),
};

const NAV_ITEMS = [
  { href: "/search",         label: "Wyszukiwanie",   icon: "search" },
  { href: "/news-hub",       label: "News Hub",       icon: "news" },
  { href: "/athlete-hub",    label: "Athlete Hub",    icon: "athletes" },
  { href: "/gap-analysis",   label: "Gap Analysis",   icon: "gaps" },
  { href: "/breakout-radar", label: "Breakout Radar", icon: "radar" },
  { href: "/calendar",       label: "Kalendarz",      icon: "calendar" },
  { href: "/watchlist",      label: "Watchlist",      icon: "watchlist" },
] as const;

const ADMIN_ITEMS = [
  { href: "/admin", label: "Admin / Pipeline", icon: "admin" },
] as const;

function NavLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium"
      style={{
        backgroundColor: active
          ? "color-mix(in srgb, var(--color-accent) 10%, transparent)"
          : "transparent",
        color: active ? "var(--color-text)" : "var(--color-muted)",
        transition: "background-color .18s ease, color .18s ease, transform .18s ease",
      }}
    >
      {/* Active accent bar */}
      <span
        aria-hidden
        className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: "3px",
          height: active ? "18px" : "0px",
          backgroundColor: "var(--color-accent)",
          boxShadow: active ? "0 0 8px rgba(230,13,63,.6)" : "none",
          transition: "height .22s var(--ease-out)",
        }}
      />
      <span
        className="transition-transform duration-200 group-hover:scale-110"
        style={{ color: active ? "var(--color-accent)" : "inherit" }}
      >
        {ICONS[icon]}
      </span>
      <span
        className="transition-colors duration-150 group-hover:text-[var(--color-text)]"
        style={{ fontFamily: "var(--font-body)" }}
      >
        {label}
      </span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-surface) 82%, transparent)",
        borderRight: "1px solid var(--color-border)",
        backdropFilter: "blur(8px)",
      }}
      className="flex flex-col w-56 shrink-0 h-screen sticky top-0 overflow-y-auto"
    >
      {/* Logo / wordmark */}
      <Link
        href="/news-hub"
        className="flex items-center gap-3 px-4 py-5 border-b"
        style={{ borderColor: "var(--color-border)", textDecoration: "none" }}
      >
        {/* Monogram */}
        <span
          className="flex items-center justify-center shrink-0"
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "9px",
            background: "linear-gradient(135deg, var(--color-accent), #9f0b2e)",
            boxShadow: "0 4px 14px -4px rgba(230,13,63,.55)",
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontStyle: "italic",
            fontSize: "17px",
            color: "#fff",
            letterSpacing: "-0.04em",
          }}
        >
          TT
        </span>
        <span className="leading-none">
          <span
            className="block text-lg font-extrabold uppercase tracking-tight"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          >
            Talent<span style={{ color: "var(--color-accent)" }}>Trop</span>
          </span>
          <span
            className="block mt-1 text-[9px] uppercase"
            style={{
              color: "var(--color-muted)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.28em",
            }}
          >
            Scout Terminal
          </span>
        </span>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        <p
          className="px-4 mb-2 text-[9px] uppercase"
          style={{
            color: "var(--color-muted)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.24em",
            opacity: 0.7,
          }}
        >
          Moduły
        </p>
        <ul className="space-y-0.5 px-2">
          {NAV_ITEMS.map(({ href, label, icon }) => (
            <li key={href}>
              <NavLink
                href={href}
                label={label}
                icon={icon}
                active={pathname.startsWith(href)}
              />
            </li>
          ))}
        </ul>
      </nav>

      {/* Admin section */}
      <div
        className="px-2 pb-2 pt-2"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        {ADMIN_ITEMS.map(({ href, label, icon }) => (
          <NavLink
            key={href}
            href={href}
            label={label}
            icon={icon}
            active={pathname.startsWith(href)}
          />
        ))}
      </div>

      {/* Footer */}
      <div
        className="flex items-center gap-2 px-4 py-4 text-[10px] border-t"
        style={{
          borderColor: "var(--color-border)",
          color: "var(--color-muted)",
          fontFamily: "var(--font-mono)",
        }}
      >
        <span className="live-dot" />
        <span style={{ letterSpacing: "0.08em" }}>PIPELINE ONLINE</span>
      </div>
    </aside>
  );
}
