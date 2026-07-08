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
5. **social_profiles** — IG/TikTok handles with confidence score + engagement metrics. `enrichment_status` text+check (`pending`|`enriched`|`failed`, migration `0006`); `profile_pic_url` holds a **Supabase Storage URL** (bucket `athlete-avatars`), never the Instagram CDN URL (Meta links expire in days)
6. **brand_fit_scores** — Red Bull brand fit score 0–100 with `factors` jsonb breakdown
7. **talent_score_history** — time series of scores with `factors` jsonb breakdown
8. **redbull_roster** — known Red Bull athletes (reference for gap analysis). `name` text (migration `0007`) for entries without an `athletes` record; Polish entries link `athlete_id`. Names verified against live redbull.com `/athlete/` profiles (2026-07-07); rendered as links in the gap-analysis heatmap cells
9. **discipline_gaps** — precomputed gap analysis per discipline
10. **scout_notes** — private CRM notes per athlete
11. **social_signals** — time-series social metrics (engagement spikes etc.)
12. **ingestion_runs** — pipeline observability (cron run status, item counts, errors)

Migration: `supabase/migrations/0001_initial_schema.sql`

## Modules

| Route | Module | Status |
|---|---|---|
| `/search` | Wyszukiwanie — ad-hoc live research zawodnika (Serper + Claude Haiku + Apify, `POST /api/search-athlete`); narzędzie ręczne, NIE podlega pipeline switches; wymaga `SERPER_API_KEY`/`ANTHROPIC_API_KEY`/`APIFY_API_TOKEN` w env Vercela | Done |
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

### Color palette — Red Bull DNA (deep navy + racing red + gold), redesign 2026-07

All defined as CSS vars in `globals.css`:

- Background: `#0a0d17` (navy-black) + subtle fixed radial glows (red top-right, navy bottom-left)
- Surface: `#111525` (cards, sidebar), elevated/hover: `#191f33` (`--color-surface-2`)
- Border: `#232a42`, strong: `#333d5f`
- Text primary: `#eef1f8`, muted: `#8a92ab`
- **Accent**: `#e60d3f` (racing red), hover: `#ff3564` (`--color-accent-hover`)
- **Gold**: `#ffc906` (`--color-gold`) — priority, brand fit, "partial" coverage, 1st place
- **Orange**: `#fb923c` — "weak" coverage
- **Trend up**: `#a3e635` (lime — rising talent score, "strong" coverage)

### Layout & motion rules

- Cards: `.card` (surface, 1px border, radius 12px); interactive cards add `.hover-border-accent` (lift -2px + red edge + soft glow on hover)
- Reusable classes in `globals.css`: `.chip` (tinted pill via currentColor), `.select` (styled dropdown), `.segmented` (toggle), `.btn-ghost`, `.score-bar`, `.zoom-media` (image scale on hover), `.stagger` (staggered fade-up entrance for grids), `.kicker`/`.page-title`/`.page-subtitle`
- Shared `PageHeader` component (`src/components/PageHeader.tsx`) — kicker + display title with skewed red underline + optional actions slot; use on every page
- Page transitions: `src/app/template.tsx` fades each navigation in; `prefers-reduced-motion` respected
- **Asymmetric layouts** in News Hub (hero + sidebar) and Breakout Radar — never uniform equal-width card grids everywhere
- Higher information density than typical SaaS — this is a work tool, not a marketing page
- Photography-led; sidebar uses inline SVG stroke icons (no emoji)
- Gradients only as subtle ambience (body glow, hero image overlay, score bar) — never purple-blue SaaS gradients

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
| PZA Climbing | `pza` | bouldering / lead / speed | PDF 2024: `pza.org.pl/wp-content/uploads/2024/12/rankingi-PP-se.pdf`; Sheet 2025: Google Sheets gviz CSV, **one tab per age category** (senior / u23 / junior / u18 / u16 — gids hardcoded in `SHEET_2025_TABS`) | pdfplumber + CSV | `True` — PZA license |
| PZKol MTB XCO | `pzkol_mtb` | mtb_xco | `pzkol.pl/pobierz/12489/...` (34-page PDF, 14 age categories) | pdfplumber | `True` — PZKol license |
| PZM Motocross | `pzm_motocross` | motocross | `wyniki.motoresults.pl/en/2025/Motocross/AMIC/` (10 AMIC categories) | BeautifulSoup + Claude Haiku filter | `False` — LLM-filtered |
| PZLA Athletics | `pzla` | athletics | `statystyka.pzla.pl/stat.php` — season leaders per event, U16/U18/U20 × M/K, top 12/event. **Season format `2025L` (summer) / `2026Z` (indoor)** — plain year returns empty. Current season can 500 before PZLA generates it → auto-fallback to previous. `verify=False` (broken cert) | BeautifulSoup | `True` — PZLA license |
| FIS Ski/Snowboard | `fis` | alpine_skiing / snowboarding / freestyle_ski | `data.fis-ski.com/fis_athletes/ajax/fispointslistfunctions/export_fispointslist.html` (legacy endpoint, survives the Next.js redesign). Latest listid found by upward probing from floor 440; empty `listid` = season Base List. Sector CC broken server-side; JP/NK have no points lists | CSV, filter `Nationcode=POL` | `True` — FIS registration for POL |
| IFSC World Ranking | `ifsc` | bouldering / lead / speed | `ifsc.results.info/api/v1/cuwr/{dcat}` (dcat 1-3,5-7), **requires `Referer: https://ifsc.results.info/`** | JSON, filter `country=POL` | `True` — competes for POL |
| Speed Skating ISU | `speed_skating_isu` | speed_skating | `speedskatingresults.com/api/json/topn.php` — national top-50 per distance (500–10000 m). Age category (C/B/A/N) enriched from `skater_lookup.php`, which caps at 20 rows/query → recursive familyname-prefix enumeration. Season param = start year (Nov) | JSON | `True` — POL in ISU archive |

**Discovery status from federation sources:**
- `pza` / `pzkol_mtb` / `pzla` / `fis` / `ifsc` / `speed_skating_isu` → `confirmed` (license/registration = Polish, no LLM needed)
- `pzm_motocross` → `auto_detected` (LLM nationality filter, requires scout review)

**Blocked sources (tried 2026-07-06):** swimrankings.net i procyclingstats.com — Cloudflare 403 na wszystkie żądania bez przeglądarki; UCI DataRide — ASP.NET WebForms z VIEWSTATE, wymaga sesji przeglądarkowej.

**Fuzzy name matching:** `SequenceMatcher` threshold 0.85. Exact ilike first, then word-by-word fuzzy on first 2 words > 3 chars.

**Relay/team filter:** `sources/base.py is_multi_person_name()` (5+ tokens or 2+ ALL-CAPS tokens) drops team rosters masquerading as one athlete — applied in `ingest_federations.process_athletes` (all sources) and PZLA relay event sections (`4 x` / `sztafet*`) are skipped in the scraper. One-time DB cleanup: `scripts/cleanup_team_names.py` (rejected 123 PZLA relays, 2026-07-07).

**Scheduled:** `.github/workflows/ingest_federations.yml` — monthly on 1st at 05:00 UTC.

**Future source — PZLA (athletics), research notes (2026-07-02):** `https://statystyka.pzla.pl/` works only with `verify=False` (broken cert chain; plain http redirects to https). Age-category leader lists: query params `?Wojew=&Sezon=&Plec=K|M&kat=3` (U20), `kat=4` (U18), `kat=5` (U16) — but adding `Sezon=2025&Wojew=ALL` returns an empty 2.5 KB page; the leaders view likely needs a session cookie or a POST from the homepage form (old Domtel-Sport system). DMP classification pages exist at `index2.php?co=3&t=1|2&s=<year>&r=<n>`.

## Automation workflows (GitHub Actions)

1. `ingest.yml` — cron 2–4h: RSS + GDELT + sports API → `news_articles`, `event_results`
2. `process.yml` — twice daily 06:00 + 18:00: LLM summaries + tagging (batch `PROCESS_BATCH_SIZE`, default 120); auto-creates `athletes` records (see Auto-discovery filters above)
3. `compute.yml` — daily 07:00: `compute_talent_score.py` → `talent_score` + `talent_score_history` (logs to `ingestion_runs` as `compute_scores`)
4. `backup.yml` — weekly: `pg_dump` → GitHub Releases or Cloudflare R2
5. `social_discovery.yml` — weekly Mon 08:00: IG handle discovery via **Serper.dev** (`https://google.serper.dev/search`, POST z `X-API-KEY`; wyniki w polu `organic`; zastąpił Google CSE, które Google zamknął dla nowych klientów. Skipped when `SERPER_API_KEY` unset — no LLM handle guessing. Free tier 2500 zapytań jednorazowo, pipeline zużywa ~40/tydzień) + optional Apify validation (`APIFY_API_TOKEN`) + Brand Fit Score via Haiku for top `BRAND_FIT_LIMIT` (150) prospects, recomputed after `BRAND_FIT_MAX_AGE_DAYS` (14)
6. `ingest_federations.yml` — **daily 05:00 UTC**: PZA + PZKol MTB + PZM Motocross + PZLA + FIS + IFSC + speed skating → `athletes` + `federation_profiles` (bulk writes: in-memory `AthleteIndex` + batched upserts, no per-row queries)
7. `ingest_events.yml` — weekly Mon 04:00: PZA + PZKol + PZM (motoresults.pl) event calendars → `events` (script `ingest_events.py`, dedup by name+start_date in-script). Gotchas: PZKol detail pages list *other* events' `Miejsce:`/`Dyscyplina:` in a sidebar — parser must keep only the first occurrence; motoresults is a results site (played events only — future rounds come from curated inserts); event date lives in the detail page `<title>`. One-time curated batch (2026-07-07) added 39 verified 2026 events: PZLA champs + ME Birmingham + Diamond League Silesia, Speedway GP rounds, IFSC World Cups, UCI DH/enduro/XCO World Cups + MŚ, iXS EDC, MP 4X/pump track, MXMP rounds, ski jumping LGP Wisła + PŚ openers
8. `instagram_enrichment.yml` — weekly Mon 10:00 (2h after social_discovery): `enrich_instagram_profiles.py` — one batched Apify `instagram-profile-scraper` run (async: start → poll → dataset) for pending `social_profiles` of confirmed/manual athletes (or auto_detected with confidence ≥ `ENRICH_MIN_CONFIDENCE` 0.6), max `ENRICH_LIMIT` (60)/run. Writes followers/posts/verified/private/bio/engagement_rate, re-hosts avatar in Storage bucket `athlete-avatars` (auto-created), fills `athletes.photo_url` when null. Per-profile failures → `enrichment_status='failed'`, batch failure leaves rows `pending`. Cost: $2.60/1000 results ≈ $0.16/week max — well within Apify's $5/month free credit

## Talent Score algorithm

`scripts/compute_talent_score.py` — bulk-fetches all data upfront (no per-athlete queries), skips `discovery_status='rejected'`. Weighted sum, max 100:
- (a) `age_factor` 0–25 — younger = higher; when `birth_date` is missing, falls back to federation `ranking_category` age band (u13/u15/u17/mx65/mx85 → 25, junior/mx_junior → 22, masters/cyklosport → 5)
- (b) `federation_rank_factor` 0–15 — best `ranking_position` across `federation_profiles` (#1 → 15, top3 → 12, top5 → 9, top10 → 6, ranked → 3)
- (c) `mention_spike_factor` 0–20 — log scale of tagged articles last 30d
- (d) `sentiment_factor` 0–15 — positive vs negative ratio (neutral 7.5 when no articles)
- (e) `social_signal_factor` 0–15 — engagement spike from `social_signals`
- (f) `breakthrough_factor` 0–10 — LLM-detected debut/podium/record/title last 90d
- × `discipline_gap_multiplier` 1.0–1.5 from `discipline_gaps.priority_score` (1.25 default when discipline unseeded)

Breakdown stored in `talent_score_history.factors` jsonb — shown in UI so score isn't a black box.
Note: supabase-py uses snake_case (`maybe_single()`, not `maybeSingle()`).

## Budget

~5–13$/month. Main cost: LLM API. Vercel/Supabase/GitHub Actions all on free tiers.

## Roadmap

- [x] Week 1–2: Next.js skeleton + Supabase schema + UI navigation scaffolding
- [x] Week 3–4: LLM layer (summaries + tagging), first talent_score, basic Athlete Hub with real data
- [x] Week 5–6: Gap Analysis Heatmap, Breakout Radar, seed redbull_roster + discipline_gaps
- [ ] Week 7+: Scout Notes, athlete comparison, admin/pipeline panel, social signals via Apify

## Env vars

See `.env.example`. Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
