# Talent Trop — Scout Dashboard

## Project overview

Talent scouting dashboard for Polish sports talent, built for a scout targeting brand partnerships (Red Bull focus). Aggregates news, scores athletes, and surfaces gaps in brand coverage across disciplines.

Source of truth: `skaut_dashboard_architektura3.md` (full architecture brief).

## Stack

| Layer | Tool | Notes |
|---|---|---|
| Frontend + API | Next.js (App Router, TypeScript) on Vercel Hobby | Noncommercial clause; cron max 1×/day on Hobby |
| Database | Supabase (Postgres, free tier) | Sleeps after 7 days of no API calls; no auto-backup |
| Automation | GitHub Actions (cron) | 2000 min/month on private repo |
| LLM | Claude Haiku / GPT-4o-mini (pay-as-you-go) | ~3–8$/month at 50–150 articles/day |
| Storage | Supabase Storage (1 GB free) | Hotlink images from source, don't copy |
| Auth | Supabase Auth (50k MAU free) | Used for scout login + role-based access |

## Database naming conventions

- Tables: `snake_case`, plural not used (e.g. `athletes`, `news_articles`, `scout_notes`)
- FKs: `<table_singular>_id` (e.g. `athlete_id`)
- Enums as Postgres enums or text with `CHECK` constraints
- JSONB columns for variable-shape data: `factors`, `socials`, `sample_posts`, `comparator_countries_coverage`
- All timestamps: `timestamptz`, named `*_at` (e.g. `created_at`, `computed_at`, `started_at`)
- Boolean columns: prefix `is_` (e.g. `is_featured`, `is_private`, `is_verified_account`)
- Score columns: numeric 0–100 (`brand_fit_scores.score`, `talent_score_history.score`) or 0–1 (`discovery_confidence`)

## Database schema — tables

1. **athletes** — core entity. Has `talent_score` (current), `bio_summary` (LLM), `red_bull_status` enum, `social_status` enum, `socials` jsonb, `discovery_status` text+check (`manual`|`auto_detected`|`confirmed`|`rejected`) — pipeline sets `auto_detected`, scout verifies via UI
2. **news_articles** — ingested + LLM-processed articles. `region` enum (`poland`/`world`), `summary` is LLM paraphrase (never full text), `image_url` hotlinked from source
3. **events** — competition calendar
4. **event_results** — athlete placements at events
5. **social_profiles** — IG/TikTok handles with confidence score + engagement metrics
6. **brand_fit_scores** — Red Bull brand fit score 0–100 with `factors` jsonb breakdown
7. **talent_score_history** — time series of scores with `factors` jsonb breakdown
8. **redbull_roster** — known Red Bull athletes (reference for gap analysis)
9. **discipline_gaps** — precomputed gap analysis per discipline
10. **scout_notes** — private CRM notes per athlete
11. **social_signals** — time-series social metrics (engagement spikes etc.)
12. **ingestion_runs** — pipeline observability (cron run status, item counts, errors)

Migration: `supabase/migrations/0001_initial_schema.sql`

## Modules

| Route | Module | Status |
|---|---|---|
| `/news-hub` | News Hub — magazine grid, Poland/World toggle, discipline filter | Skeleton |
| `/athlete-hub` | Athlete Hub — athlete cards grid with filters | Skeleton |
| `/gap-analysis` | Gap Analysis / Red Bull Heatmap — discipline × coverage matrix | Skeleton |
| `/breakout-radar` | Breakout Radar — athletes with biggest score jumps last 7/30d | Skeleton |
| `/calendar` | Events Calendar — upcoming competitions by discipline | Skeleton |
| `/watchlist` | Scout Notes / Watchlist — private CRM layer | Skeleton |

## UX / Visual direction

**Goal**: analytics terminal / sports broadcast aesthetic (ESPN, Opta, Bloomberg), NOT "generic AI SaaS" (no purple-blue gradients, no glassmorphism, no floating cards with soft shadows).

### Typography — three fonts with distinct roles

- **Display/headlines**: Barlow Condensed (Google Fonts) — all module titles, athlete names, big numbers
- **Body/secondary**: Inter — supporting text, labels, descriptions
- **Numbers/stats**: JetBrains Mono — all numeric data (talent score, follower counts, dates, percentages). Makes data feel live and precise.

CSS variables: `--font-display`, `--font-body`, `--font-mono`

### Color palette — narrow, disciplined

- Background: `#0f0f0f` (deep graphite, not pure black)
- Surface: `#1a1a1a` (cards, sidebar)
- Border: `#2a2a2a` (1px, flat — no shadows)
- Text primary: `#f0f0f0`
- Text muted: `#6b6b6b`
- **Accent (CTA / highlights)**: `#e8351a` (electric red — Red Bull nod, not literal)
- **Trend up**: `#84cc16` (lime green — rising talent score only)
- **Trend down**: `#6b6b6b` (muted, not alarming)

### Layout rules

- Flat cards with `1px` border, `border-color: #2a2a2a`, `border-radius: 8–12px`, **no drop-shadow**
- **Asymmetric layouts** in News Hub (hero + sidebar) and Breakout Radar — never uniform equal-width card grids everywhere
- Higher information density than typical SaaS — this is a work tool, not a marketing page
- Photography-led (athlete photos, event images) — no abstract blobs or decorative icons
- No gradients anywhere

## Auto-discovery filters (athletes table)

A new `athletes` row (`discovery_status='auto_detected'`) is created **only when ALL four conditions hold**:

| # | Condition | LLM field | Rationale |
|---|---|---|---|
| 1 | Confident individual athlete | `is_confident_individual_athlete = true` | No teams, squads, or ambiguous references |
| 2 | Polish identity confirmed | `athlete_nationality_poland = true` | Article must unambiguously indicate Polish citizenship or representation; `null` = unknown → skip |
| 3 | Not a global superstar | `is_global_superstar = false` | Top-tier globally famous athletes (Lewandowski, Świątek, LeBron) are not talent gaps for Red Bull |
| 4 | Article from Polish sources | `article_region = 'poland'` | World-region articles (BBC, ESPN, Reuters) tag and summarize but never create new athletes |

Fuzzy-linking to existing athletes (for article tagging) still happens regardless of these filters.

`discovery_status` lifecycle: `auto_detected` → scout reviews in UI → `confirmed` or `rejected`. Pipeline also sets `rejected` directly when cleanup detects non-Polish/superstar records.

## Federation data sources

Primary authoritative data for Polish athletes (bypasses LLM nationality filter — license = confirmed).
Table: `federation_profiles` (migration `0005_federation_profiles.sql`).
Script: `scripts/ingest_federations.py` — CLI `--sources pza,pzkol,pzm [--dry-run]`.
Source scrapers: `scripts/sources/` package.

| Source | Federation | Disciplines | URL | Method | `nationality_confirmed` |
|---|---|---|---|---|---|
| PZA Climbing | `pza` | bouldering / lead / speed | PDF 2024: `pza.org.pl/wp-content/uploads/2024/12/rankingi-PP-se.pdf`; Sheet 2025: Google Sheets gviz CSV | pdfplumber + CSV | `True` — PZA license |
| PZKol MTB XCO | `pzkol_mtb` | mtb_xco | `pzkol.pl/pobierz/12489/...` (34-page PDF, 14 age categories) | pdfplumber | `True` — PZKol license |
| PZM Motocross | `pzm_motocross` | motocross | `wyniki.motoresults.pl/en/2025/Motocross/AMIC/` (10 AMIC categories) | BeautifulSoup + Claude Haiku filter | `False` — LLM-filtered |

**Discovery status from federation sources:**
- `pza` / `pzkol_mtb` → `confirmed` (license = Polish, no LLM needed)
- `pzm_motocross` → `auto_detected` (LLM nationality filter, requires scout review)

**Fuzzy name matching:** `SequenceMatcher` threshold 0.85. Exact ilike first, then word-by-word fuzzy on first 2 words > 3 chars.

**Scheduled:** `.github/workflows/ingest_federations.yml` — monthly on 1st at 05:00 UTC.

## Automation workflows (GitHub Actions)

1. `ingest.yml` — cron 2–4h: RSS + GDELT + sports API → `news_articles`, `event_results`
2. `process.yml` — daily 06:00: LLM summaries + tagging + `talent_score` update; auto-creates `athletes` records (see Auto-discovery filters above)
3. `backup.yml` — weekly: `pg_dump` → GitHub Releases or Cloudflare R2
4. `social_discovery.yml` — weekly: Instagram handle discovery + Brand Fit Score via LLM + Apify
5. `ingest_federations.yml` — monthly 1st at 05:00 UTC: PZA + PZKol MTB + PZM Motocross → `athletes` + `federation_profiles`

## Talent Score algorithm

Weighted sum of:
- (a) Age <23 (younger = higher)
- (b) Recent breakthrough detected by LLM (debut / podium / record)
- (c) Mention spike across multiple sources (from `news_articles`)
- (d) Social signal (engagement spike from `social_signals`)
- (e) Discipline gap multiplier from `discipline_gaps` (undercovered discipline = higher weight)

Breakdown stored in `talent_score_history.factors` jsonb — shown in UI so score isn't a black box.

## Budget

~5–13$/month. Main cost: LLM API. Vercel/Supabase/GitHub Actions all on free tiers.

## Roadmap

- [x] Week 1–2: Next.js skeleton + Supabase schema + UI navigation scaffolding
- [ ] Week 3–4: LLM layer (summaries + tagging), first talent_score, basic Athlete Hub with real data
- [ ] Week 5–6: Gap Analysis Heatmap, Breakout Radar, seed redbull_roster + discipline_gaps
- [ ] Week 7+: Scout Notes, athlete comparison, admin/pipeline panel, social signals via Apify

## Env vars

See `.env.example`. Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
