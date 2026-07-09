-- 0008: Pipeline on/off switches, sterowane z /admin.
-- GitHub Actions workflows odpytują GET /api/pipeline-status?workflow=<id>
-- na początku joba i kończą się natychmiast gdy should_run=false.
--
-- Mapowanie workflow_id → plik .github/workflows/:
--   ingest               → ingest.yml               (RSS co 3h)
--   process              → process.yml              (LLM processing, 06:00+18:00 UTC)
--   compute              → compute.yml              (talent score, 07:00 UTC)
--   backup               → backup.yml               (pg_dump, niedziela 03:00 UTC)
--   social_discovery     → social_discovery.yml     (Serper + brand fit, pon 08:00 UTC)
--   instagram_enrichment → instagram_enrichment.yml (Apify, pon 10:00 UTC)
--   ingest_federations   → ingest_federations.yml   (federacje, 05:00 UTC daily)
--   ingest_events        → ingest_events.yml        (kalendarze imprez, pon 04:00 UTC)

-- Singleton (id zawsze = 1): globalny master switch, nadrzędny nad workflow_settings
create table pipeline_settings (
  id int primary key check (id = 1),
  is_enabled boolean not null default true,
  disabled_by_reason text,
  updated_at timestamptz not null default now()
);

-- Przełączniki per workflow
create table workflow_settings (
  workflow_id text primary key,
  is_enabled boolean not null default true,
  disabled_by_reason text,
  updated_at timestamptz not null default now()
);

insert into pipeline_settings (id, is_enabled) values (1, true);

insert into workflow_settings (workflow_id) values
  ('ingest'),
  ('process'),
  ('compute'),
  ('backup'),
  ('social_discovery'),
  ('instagram_enrichment'),
  ('ingest_federations'),
  ('ingest_events');

alter table pipeline_settings enable row level security;
alter table workflow_settings enable row level security;

-- Odczyt publiczny (jak pozostałe tabele dashboardu); zapis tylko service role
create policy "public read pipeline_settings" on pipeline_settings for select using (true);
create policy "public read workflow_settings" on workflow_settings for select using (true);
