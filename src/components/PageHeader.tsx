interface PageHeaderProps {
  kicker: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

/** Unified page header — mono kicker, condensed display title with red slash, optional actions slot. */
export function PageHeader({ kicker, title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
      <div>
        <p className="kicker">/ {kicker}</p>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0 pb-1">{actions}</div>}
    </header>
  );
}
