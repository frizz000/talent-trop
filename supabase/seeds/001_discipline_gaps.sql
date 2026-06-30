-- Seed data for discipline_gaps (Poland + comparator countries)
-- Based on public Red Bull athlete roster analysis.
-- ⚠ Verify manually before presenting to a client — this is a starting estimate.

INSERT INTO discipline_gaps
  (discipline, poland_coverage_status, comparator_countries_coverage, priority_score)
VALUES
  ('skateboarding',    'weak',    '{"germany":"partial","czech_republic":"partial","france":"strong"}',   85),
  ('snowboarding',     'partial', '{"germany":"strong","austria":"strong","france":"strong"}',             55),
  ('freestyle skiing', 'weak',    '{"germany":"partial","austria":"strong","france":"strong"}',            75),
  ('mountain biking',  'partial', '{"germany":"strong","czech_republic":"strong","france":"strong"}',      50),
  ('BMX',             'none',    '{"germany":"weak","czech_republic":"none","france":"partial"}',          90),
  ('surfing',         'none',    '{"germany":"none","france":"strong","portugal":"strong"}',               40),
  ('rock climbing',   'unknown', '{"germany":"partial","austria":"partial","france":"strong"}',            60),
  ('motocross',       'weak',    '{"germany":"partial","czech_republic":"strong","france":"strong"}',      70),
  ('wingsuit',        'none',    '{"germany":"partial","france":"partial","switzerland":"partial"}',       65),
  ('paragliding',     'unknown', '{"germany":"partial","austria":"strong","france":"partial"}',            55),
  ('trail running',   'weak',    '{"germany":"partial","france":"strong","spain":"strong"}',               60),
  ('kitesurfing',     'none',    '{"germany":"partial","france":"partial","netherlands":"partial"}',       50),
  ('wakeboarding',    'none',    '{"germany":"weak","france":"weak","netherlands":"partial"}',             45),
  ('parkour',         'none',    '{"germany":"weak","france":"strong","uk":"strong"}',                     70),
  ('extreme sports',  'unknown', '{"germany":"partial","austria":"partial","france":"partial"}',           50)
ON CONFLICT (discipline) DO UPDATE SET
  poland_coverage_status        = EXCLUDED.poland_coverage_status,
  comparator_countries_coverage = EXCLUDED.comparator_countries_coverage,
  priority_score                = EXCLUDED.priority_score,
  updated_at                    = now();
