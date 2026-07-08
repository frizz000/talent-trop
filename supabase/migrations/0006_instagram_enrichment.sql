-- ============================================================
-- 0006 — Instagram enrichment via Apify Instagram Profile Scraper
--
-- Enrichment lifecycle for social_profiles: pending → enriched | failed.
-- profile_pic_url holds a Supabase Storage URL (bucket 'athlete-avatars'),
-- NOT the Instagram CDN URL — Meta CDN links expire within days, so the
-- enrichment script downloads the image and re-hosts it.
-- ============================================================

alter table social_profiles
  add column if not exists enrichment_status text not null default 'pending'
    check (enrichment_status in ('pending', 'enriched', 'failed')),
  add column if not exists profile_pic_url text,
  add column if not exists enriched_at timestamptz;

create index if not exists social_profiles_enrichment_status_idx
  on social_profiles (enrichment_status);
