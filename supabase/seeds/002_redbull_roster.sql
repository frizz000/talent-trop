-- Seed data: known Red Bull Poland athletes + comparison countries
-- ⚠ Verify against https://www.redbull.com/pl-pl/athletes before using in client materials.
-- Status: 'active' | 'former' | 'ambassador'

INSERT INTO redbull_roster (country, discipline, status, source_url)
VALUES
  -- Poland (known / probable — verify!)
  ('poland', 'mountain biking',  'active',      'https://www.redbull.com/pl-pl/athletes'),
  ('poland', 'snowboarding',     'active',      'https://www.redbull.com/pl-pl/athletes'),
  ('poland', 'freestyle skiing', 'active',      'https://www.redbull.com/pl-pl/athletes'),
  ('poland', 'motocross',        'unknown',     NULL),

  -- Germany (strong Red Bull market — reference)
  ('germany', 'skateboarding',    'active',     NULL),
  ('germany', 'snowboarding',     'active',     NULL),
  ('germany', 'mountain biking',  'active',     NULL),
  ('germany', 'BMX',              'active',     NULL),
  ('germany', 'motocross',        'active',     NULL),
  ('germany', 'freestyle skiing', 'active',     NULL),
  ('germany', 'rock climbing',    'active',     NULL),
  ('germany', 'parkour',          'active',     NULL),

  -- Czech Republic
  ('czech_republic', 'mountain biking', 'active', NULL),
  ('czech_republic', 'snowboarding',    'active', NULL),
  ('czech_republic', 'motocross',       'active', NULL),

  -- France
  ('france', 'skateboarding',    'active', NULL),
  ('france', 'surfing',          'active', NULL),
  ('france', 'freestyle skiing', 'active', NULL),
  ('france', 'mountain biking',  'active', NULL),
  ('france', 'parkour',          'active', NULL),
  ('france', 'trail running',    'active', NULL),

  -- Austria (HQ country — most disciplines)
  ('austria', 'snowboarding',     'active', NULL),
  ('austria', 'freestyle skiing', 'active', NULL),
  ('austria', 'rock climbing',    'active', NULL),
  ('austria', 'paragliding',      'active', NULL),
  ('austria', 'mountain biking',  'active', NULL);
