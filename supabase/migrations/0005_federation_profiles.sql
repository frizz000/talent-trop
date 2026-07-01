-- federation_profiles: links athletes to external federation databases.
-- Each row = one athlete's record in one federation's ranking for one season.
-- Pattern follows social_profiles: external profiles linked to internal athletes.
--
-- discovery_status='confirmed' is set on athletes created from federation data
-- (national federation membership = definitive proof of Polish identity).

create table if not exists federation_profiles (
  id                uuid primary key default gen_random_uuid(),
  athlete_id        uuid references athletes (id) on delete set null,
  -- null when federation athlete not yet matched to our athletes table

  federation        text not null,
  -- 'pza'           Polish Alpinism Association (sport climbing)
  -- 'pzkol_mtb'     Polish Cycling Union — Mountain Bike
  -- 'pzkol_bmx'     Polish Cycling Union — BMX Freestyle
  -- 'pzm_motocross' Polish Motor Union — Motocross (via motoresults.pl)
  -- 'itra'          International Trail Running Association (future)
  -- 'worldskate'    World Skate / Wyldata (future)

  external_name     text not null,      -- athlete name as scraped from source
  external_id       text,               -- federation's own ID if available
  discipline        text,               -- specific sub-discipline
  ranking_category  text not null default 'general',
  -- 'senior_elite', 'u23', 'junior', 'mx2', 'mx_open', 'lead', 'boulder', etc.
  season            text not null,      -- '2024', '2025', '2024-2025'
  ranking_position  integer,
  points            numeric,
  club              text,               -- team/club affiliation from source
  extra             jsonb default '{}',
  -- shape varies by source; common keys:
  --   birth_year: integer
  --   license_number: text
  --   nationality_confirmed: boolean (true for federation-based sources)
  --   source_url: text
  --   rounds: [{round, position, points}]

  last_scraped_at   timestamptz default now(),
  created_at        timestamptz default now()
);

create index if not exists federation_profiles_athlete_id_idx
  on federation_profiles (athlete_id);
create index if not exists federation_profiles_federation_idx
  on federation_profiles (federation);
create index if not exists federation_profiles_season_idx
  on federation_profiles (season);
create index if not exists federation_profiles_ranking_position_idx
  on federation_profiles (ranking_position)
  where ranking_position is not null;

-- Dedup index: same athlete in same federation/category/season = one record
create unique index if not exists federation_profiles_dedup_idx
  on federation_profiles (federation, external_name, ranking_category, season);

alter table federation_profiles enable row level security;
create policy "public read federation_profiles"
  on federation_profiles for select using (true);
