-- Seed data for discipline_gaps (Poland + comparator countries)
-- Based on public Red Bull athlete roster analysis (redbull.com/pl-pl/athletes + DE/CZ/FR/AT).
-- ⚠ Verify manually before presenting to a client — these are starting estimates.
--
-- Discipline keys are aligned with `athletes.discipline` values where we track
-- athletes (mtb_xco, motocross, bouldering, lead, speed, BMX) so the talent-score
-- gap multiplier applies to real records. Other keys are canonical English names.
--
-- Sections: Red Bull core action sports, Olympic disciplines, motorsport/other.

INSERT INTO discipline_gaps
  (discipline, poland_coverage_status, comparator_countries_coverage, priority_score)
VALUES
  -- ── Red Bull core: bike & moto ─────────────────────────────────────────
  ('mtb_xco',          'none',    '{"germany":"strong","czech_republic":"strong","france":"strong","austria":"strong","uk":"partial"}', 90),
  ('mountain biking',  'partial', '{"germany":"strong","czech_republic":"strong","france":"strong","austria":"strong","uk":"strong"}',  55),
  ('BMX',              'partial', '{"germany":"weak","czech_republic":"none","france":"strong","austria":"partial","uk":"strong"}',     60),
  ('motocross',        'weak',    '{"germany":"partial","czech_republic":"strong","france":"strong","austria":"partial","uk":"partial"}', 85),
  ('speedway',         'partial', '{"germany":"weak","czech_republic":"partial","france":"none","austria":"none","uk":"strong"}',       40),

  -- ── Red Bull core: climbing (Olympic since 2020) ───────────────────────
  ('bouldering',       'none',    '{"germany":"partial","czech_republic":"strong","france":"strong","austria":"strong","uk":"partial"}', 80),
  ('lead',             'none',    '{"germany":"partial","czech_republic":"strong","france":"strong","austria":"strong","uk":"partial"}', 75),
  ('speed',            'partial', '{"germany":"none","czech_republic":"none","france":"partial","austria":"none","uk":"none"}',          50),

  -- ── Red Bull core: board & urban (skateboarding + breaking are Olympic) ─
  ('skateboarding',    'none',    '{"germany":"partial","czech_republic":"partial","france":"strong","austria":"partial","uk":"strong"}', 85),
  ('breaking',         'none',    '{"germany":"partial","czech_republic":"weak","france":"strong","austria":"partial","uk":"partial"}',  85),
  ('parkour',          'partial', '{"germany":"weak","czech_republic":"weak","france":"strong","austria":"partial","uk":"strong"}',      45),

  -- ── Red Bull core: winter (Olympic) ────────────────────────────────────
  ('snowboarding',     'weak',    '{"germany":"strong","czech_republic":"strong","france":"strong","austria":"strong","uk":"partial"}',  70),
  ('freestyle skiing', 'weak',    '{"germany":"partial","czech_republic":"partial","france":"strong","austria":"strong","uk":"partial"}', 75),
  ('ski jumping',      'none',    '{"germany":"strong","czech_republic":"partial","france":"none","austria":"strong","uk":"none"}',      65),
  ('ski mountaineering','weak',   '{"germany":"partial","czech_republic":"weak","france":"strong","austria":"strong","uk":"none"}',      60),
  ('biathlon',         'none',    '{"germany":"strong","czech_republic":"partial","france":"strong","austria":"partial","uk":"none"}',   40),

  -- ── Red Bull core: water & air ─────────────────────────────────────────
  ('surfing',          'none',    '{"germany":"none","czech_republic":"none","france":"strong","austria":"none","uk":"partial"}',        35),
  ('kitesurfing',      'none',    '{"germany":"partial","czech_republic":"none","france":"partial","austria":"none","uk":"partial"}',    55),
  ('windsurfing',      'weak',    '{"germany":"partial","czech_republic":"none","france":"strong","austria":"none","uk":"strong"}',      60),
  ('wakeboarding',     'none',    '{"germany":"weak","czech_republic":"weak","france":"weak","austria":"partial","uk":"partial"}',       45),
  ('cliff diving',     'none',    '{"germany":"partial","czech_republic":"strong","france":"partial","austria":"strong","uk":"partial"}', 50),
  ('canoe slalom',     'weak',    '{"germany":"strong","czech_republic":"strong","france":"strong","austria":"partial","uk":"strong"}',  55),
  ('wingsuit',         'none',    '{"germany":"partial","czech_republic":"none","france":"partial","austria":"partial","uk":"partial"}', 40),
  ('paragliding',      'weak',    '{"germany":"partial","czech_republic":"weak","france":"partial","austria":"strong","uk":"weak"}',     45),

  -- ── Olympic core (Red Bull signs individual stars) ─────────────────────
  ('athletics',        'none',    '{"germany":"strong","czech_republic":"partial","france":"partial","austria":"partial","uk":"strong"}', 75),
  ('swimming',         'none',    '{"germany":"partial","czech_republic":"weak","france":"strong","austria":"weak","uk":"strong"}',      55),
  ('boxing',           'weak',    '{"germany":"partial","czech_republic":"weak","france":"partial","austria":"weak","uk":"strong"}',     60),
  ('gymnastics',       'none',    '{"germany":"weak","czech_republic":"weak","france":"partial","austria":"weak","uk":"strong"}',        45),
  ('tennis',           'partial', '{"germany":"partial","czech_republic":"partial","france":"partial","austria":"partial","uk":"partial"}', 30),
  ('basketball 3x3',   'none',    '{"germany":"partial","czech_republic":"weak","france":"strong","austria":"weak","uk":"weak"}',        35),

  -- ── Motorsport / digital / endurance ───────────────────────────────────
  ('drifting',         'weak',    '{"germany":"partial","czech_republic":"weak","france":"partial","austria":"partial","uk":"strong"}',  45),
  ('sim racing',       'partial', '{"germany":"strong","czech_republic":"partial","france":"partial","austria":"strong","uk":"strong"}', 50),
  ('trail running',    'weak',    '{"germany":"partial","czech_republic":"partial","france":"strong","austria":"strong","uk":"strong"}', 60)
ON CONFLICT (discipline) DO UPDATE SET
  poland_coverage_status        = EXCLUDED.poland_coverage_status,
  comparator_countries_coverage = EXCLUDED.comparator_countries_coverage,
  priority_score                = EXCLUDED.priority_score,
  updated_at                    = now();

-- Retired keys (replaced by finer-grained disciplines above)
DELETE FROM discipline_gaps WHERE discipline IN ('rock climbing', 'extreme sports');
