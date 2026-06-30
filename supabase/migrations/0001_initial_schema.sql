-- ============================================================
-- Talent Trop Scout Dashboard — Initial Schema
-- Apply via: Supabase SQL Editor or supabase db push
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

create type red_bull_status as enum ('signed', 'unsigned', 'unknown');
create type social_status as enum ('verified', 'pending_review', 'not_found');
create type discovery_method as enum ('auto', 'manual_confirmed');
create type article_region as enum ('poland', 'world');
create type ingestion_status as enum ('running', 'success', 'error');
create type importance_level as enum ('minor', 'national', 'international', 'major');

-- ============================================================
-- athletes — core entity
-- ============================================================

create table athletes (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  discipline      text not null,
  sub_discipline  text,
  birth_date      date,
  hometown        text,
  photo_url       text,
  red_bull_status red_bull_status not null default 'unknown',
  talent_score    numeric(5,2) check (talent_score between 0 and 100),
  bio_summary     text,                        -- LLM-generated, never raw scraped content
  social_status   social_status not null default 'not_found',
  socials         jsonb default '{}',          -- {"instagram": "url", "tiktok": "url", "x": "url"}
  last_updated    timestamptz default now(),
  created_at      timestamptz default now()
);

create index athletes_discipline_idx on athletes (discipline);
create index athletes_talent_score_idx on athletes (talent_score desc nulls last);
create index athletes_social_status_idx on athletes (social_status);
create index athletes_red_bull_status_idx on athletes (red_bull_status);

-- ============================================================
-- news_articles — ingested + LLM-processed articles
-- ============================================================

create table news_articles (
  id              uuid primary key default gen_random_uuid(),
  athlete_id      uuid references athletes (id) on delete set null,
  source          text not null,
  source_logo_url text,
  url             text not null unique,
  title           text not null,
  published_at    timestamptz not null,
  summary         text,                        -- LLM paraphrase only, never full article text
  image_url       text,                        -- hotlinked from og:image or media:content RSS tag
  image_credit    text,                        -- source name for caption
  region          article_region not null,
  sentiment       text,                        -- 'positive' | 'neutral' | 'negative'
  discipline_tag  text,
  is_featured     boolean not null default false,
  created_at      timestamptz default now()
);

create index news_articles_athlete_id_idx on news_articles (athlete_id);
create index news_articles_published_at_idx on news_articles (published_at desc);
create index news_articles_region_idx on news_articles (region);
create index news_articles_discipline_tag_idx on news_articles (discipline_tag);
create index news_articles_is_featured_idx on news_articles (is_featured) where is_featured = true;

-- ============================================================
-- events — competition calendar
-- ============================================================

create table events (
  id               uuid primary key default gen_random_uuid(),
  discipline       text not null,
  name             text not null,
  location         text,
  start_date       date not null,
  end_date         date,
  importance_level importance_level not null default 'national',
  created_at       timestamptz default now()
);

create index events_start_date_idx on events (start_date);
create index events_discipline_idx on events (discipline);

-- ============================================================
-- event_results — athlete placements at events
-- ============================================================

create table event_results (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  placement  integer,
  score      text,
  notes      text,
  created_at timestamptz default now(),
  unique (event_id, athlete_id)
);

create index event_results_athlete_id_idx on event_results (athlete_id);
create index event_results_event_id_idx on event_results (event_id);

-- ============================================================
-- social_profiles — IG / TikTok handles with confidence
-- ============================================================

create table social_profiles (
  id                   uuid primary key default gen_random_uuid(),
  athlete_id           uuid not null references athletes (id) on delete cascade,
  platform             text not null default 'instagram',   -- 'instagram' | 'tiktok'
  handle               text not null,
  discovery_confidence numeric(4,3) check (discovery_confidence between 0 and 1),
  discovery_method     discovery_method not null default 'auto',
  followers_count      integer,
  following_count      integer,
  posts_count          integer,
  is_verified_account  boolean default false,
  is_private           boolean default false,
  bio_text             text,
  business_category    text,
  engagement_rate      numeric(6,4),           -- computed from last ~12 posts
  last_scraped_at      timestamptz,
  created_at           timestamptz default now(),
  unique (athlete_id, platform)
);

create index social_profiles_athlete_id_idx on social_profiles (athlete_id);

-- ============================================================
-- brand_fit_scores — Red Bull brand fit assessment
-- ============================================================

create table brand_fit_scores (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references athletes (id) on delete cascade,
  brand       text not null default 'red_bull',
  score       numeric(5,2) check (score between 0 and 100),
  factors     jsonb default '{}',
  -- factors shape: {
  --   content_theme: number,       -- extreme sport / adrenaline lifestyle alignment
  --   production_quality: number,  -- visual quality of posts
  --   authenticity: number,        -- tone authenticity
  --   engagement_quality: number,  -- quality not quantity (Red Bull prefers smaller+engaged)
  --   posting_regularity: number,
  --   red_flags: string[]          -- controversial content, inactive, private, etc.
  -- }
  sample_posts jsonb default '[]', -- [{url, summary}] — never full post text
  computed_at  timestamptz default now(),
  unique (athlete_id, brand)
);

create index brand_fit_scores_athlete_id_idx on brand_fit_scores (athlete_id);
create index brand_fit_scores_score_idx on brand_fit_scores (score desc nulls last);

-- ============================================================
-- talent_score_history — time series for trend display
-- ============================================================

create table talent_score_history (
  id         uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  score      numeric(5,2) check (score between 0 and 100),
  factors    jsonb default '{}',
  -- factors shape: {
  --   age_factor: number,
  --   breakthrough_factor: number,    -- LLM-detected debut/podium/record
  --   mention_spike_factor: number,   -- multi-source mention count
  --   social_signal_factor: number,   -- engagement spike
  --   discipline_gap_multiplier: number
  -- }
  computed_at timestamptz default now()
);

create index talent_score_history_athlete_id_idx on talent_score_history (athlete_id);
create index talent_score_history_computed_at_idx on talent_score_history (computed_at desc);

-- ============================================================
-- redbull_roster — known Red Bull athletes (gap analysis reference)
-- ============================================================

create table redbull_roster (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid references athletes (id) on delete set null,  -- nullable if not in our DB yet
  country      text not null,
  discipline   text not null,
  status       text not null default 'active',   -- 'active' | 'former' | 'ambassador'
  source_url   text,
  last_verified date,
  created_at   timestamptz default now()
);

create index redbull_roster_discipline_idx on redbull_roster (discipline);
create index redbull_roster_country_idx on redbull_roster (country);

-- ============================================================
-- discipline_gaps — precomputed gap analysis per discipline
-- ============================================================

create table discipline_gaps (
  id                            uuid primary key default gen_random_uuid(),
  discipline                    text not null unique,
  poland_coverage_status        text not null default 'unknown',
  -- 'strong' | 'partial' | 'weak' | 'none' | 'unknown'
  comparator_countries_coverage jsonb default '{}',
  -- {"germany": "strong", "czech_republic": "partial", ...}
  priority_score                numeric(5,2) check (priority_score between 0 and 100),
  updated_at                    timestamptz default now()
);

-- ============================================================
-- scout_notes — private CRM notes per athlete
-- ============================================================

create table scout_notes (
  id         uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  note_text  text not null,
  created_at timestamptz default now()
);

create index scout_notes_athlete_id_idx on scout_notes (athlete_id);
create index scout_notes_created_at_idx on scout_notes (created_at desc);

-- ============================================================
-- social_signals — time-series social metrics (virality detection)
-- ============================================================

create table social_signals (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references athletes (id) on delete cascade,
  platform    text not null,                  -- 'instagram' | 'tiktok' | 'x'
  metric_type text not null,                  -- 'engagement_rate' | 'followers_delta' | 'viral_post'
  value       numeric,
  captured_at timestamptz default now()
);

create index social_signals_athlete_id_idx on social_signals (athlete_id);
create index social_signals_captured_at_idx on social_signals (captured_at desc);

-- ============================================================
-- ingestion_runs — pipeline observability
-- ============================================================

create table ingestion_runs (
  id               uuid primary key default gen_random_uuid(),
  source           text not null,             -- 'rss_poland' | 'rss_world' | 'gdelt' | 'api_sports' | 'llm_process'
  status           ingestion_status not null default 'running',
  items_processed  integer default 0,
  started_at       timestamptz default now(),
  finished_at      timestamptz,
  error_log        text
);

create index ingestion_runs_started_at_idx on ingestion_runs (started_at desc);
create index ingestion_runs_source_idx on ingestion_runs (source);
create index ingestion_runs_status_idx on ingestion_runs (status);

-- ============================================================
-- Row Level Security (scaffold — enable per table as needed)
-- ============================================================

alter table athletes enable row level security;
alter table news_articles enable row level security;
alter table events enable row level security;
alter table event_results enable row level security;
alter table social_profiles enable row level security;
alter table brand_fit_scores enable row level security;
alter table talent_score_history enable row level security;
alter table redbull_roster enable row level security;
alter table discipline_gaps enable row level security;
alter table scout_notes enable row level security;
alter table social_signals enable row level security;
alter table ingestion_runs enable row level security;

-- Public read for non-sensitive tables (dashboard reads without auth)
-- Adjust these policies once you add Supabase Auth roles (scout / admin)
create policy "public read athletes" on athletes for select using (true);
create policy "public read news_articles" on news_articles for select using (true);
create policy "public read events" on events for select using (true);
create policy "public read event_results" on event_results for select using (true);
create policy "public read social_profiles" on social_profiles for select using (true);
create policy "public read brand_fit_scores" on brand_fit_scores for select using (true);
create policy "public read talent_score_history" on talent_score_history for select using (true);
create policy "public read redbull_roster" on redbull_roster for select using (true);
create policy "public read discipline_gaps" on discipline_gaps for select using (true);
create policy "public read social_signals" on social_signals for select using (true);
create policy "public read ingestion_runs" on ingestion_runs for select using (true);

-- scout_notes: private — only service role can write, anon can read (adjust when auth is wired)
create policy "public read scout_notes" on scout_notes for select using (true);
