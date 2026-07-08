-- Add watchlist CRM status to athletes
-- Apply in Supabase SQL Editor after 0001_initial_schema.sql

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS watchlist_status TEXT
  CHECK (watchlist_status IN ('watching', 'contacted', 'recommended'));

CREATE INDEX IF NOT EXISTS athletes_watchlist_status_idx
  ON athletes (watchlist_status)
  WHERE watchlist_status IS NOT NULL;
