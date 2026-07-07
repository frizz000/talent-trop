-- Roster entries for comparator countries have no athletes-table record,
-- so the display name lives directly on the roster row.
alter table redbull_roster add column if not exists name text;
