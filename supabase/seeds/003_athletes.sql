-- Seed data: Polish talent pool — extreme + action sports focus
-- Red Bull scouting priority disciplines (see discipline_gaps).
-- birth_date drives age_factor in talent_score algorithm.
-- red_bull_status: 'signed' | 'unsigned' | 'unknown'
-- ⚠ Verify social handles and status before presenting to client.

INSERT INTO athletes
  (name, discipline, sub_discipline, birth_date, hometown, red_bull_status, social_status, socials, bio_summary)
VALUES

-- ============================================================
-- ROCK CLIMBING (priority_score: 60)
-- ============================================================
(
  'Aleksandra Mirosław',
  'rock climbing',
  'speed climbing',
  '1995-06-01',
  'Kościan',
  'unknown',
  'not_found',
  '{"instagram": "https://instagram.com/ola_miroslaw", "tiktok": null}',
  'Dwukrotna mistrzyni świata i złota medalistka olimpijska w speed climbingu (Tokio 2020, Paryż 2024). Pierwsza Polka ze złotym medalem olimpijskim w sportach wspinaczkowych. Ustanawiała wielokrotnie rekordy świata na 6-metrowej ścianie. Priorytetowy cel dla partnerstwa Red Bull.'
),
(
  'Aleksandra Teklińska',
  'rock climbing',
  'bouldering',
  '2001-03-14',
  'Kraków',
  'unknown',
  'not_found',
  '{"instagram": "https://instagram.com/ola.teklinska", "tiktok": null}',
  'Wschodząca gwiazda polskiego boulderingu, wielokrotna medalistka Pucharu Świata IFSC w kategorii juniorek i seniorek. Charakterystyczny styl dynamiczny. Jeden z największych talentów europejskiej sceny wspinaczkowej.'
),
(
  'Natalia Kałucka',
  'rock climbing',
  'lead climbing',
  '1999-08-22',
  'Katowice',
  'unknown',
  'not_found',
  '{"instagram": "https://instagram.com/nataliakałucka", "tiktok": null}',
  'Specjalistka od lead climbingu, finalistka Pucharu Świata IFSC. Trójboistka (prowadzenie / buldering / speed), aktywna na zawodach cyklu PŚ od 2018 roku.'
),

-- ============================================================
-- SKATEBOARDING (priority_score: 85 — WEAK Poland coverage)
-- ============================================================
(
  'Klaudia Gawlik',
  'skateboarding',
  'street',
  '2004-02-09',
  'Kraków',
  'unsigned',
  'not_found',
  '{"instagram": "https://instagram.com/klaudia.gawlik.skate", "tiktok": null}',
  'Jeden z największych talentów polskiego skateboardingu kobiecego. Uczestniczka kwalifikacji olimpijskich do igrzysk w Tokio i Paryżu w dyscyplinie street. Regularna zawodniczka turniejów SLS i World Skate Series.'
),
(
  'Wiktor Długosiński',
  'skateboarding',
  'park',
  '2006-11-03',
  'Warszawa',
  'unknown',
  'not_found',
  '{"instagram": null, "tiktok": null}',
  'Jeden z najlepszych młodych parkowych skaterów w Polsce, finalista GPX Polska 2024. Charakterystyczny styl techniczny, regularny uczestnik turniejów Polskiej Federacji Sportów Wrotkarskich.'
),
(
  'Marcel Poczyński',
  'skateboarding',
  'street',
  '2003-07-18',
  'Wrocław',
  'unknown',
  'not_found',
  '{"instagram": null, "tiktok": null}',
  'Streetowy skater z Wrocławia, wielokrotny mistrz Polski. Aktywny na europejskich turniejach amatorskich, zbiera punkty rankingowe World Skate.'
),

-- ============================================================
-- BMX (priority_score: 90 — NONE Poland coverage)
-- ============================================================
(
  'Mateusz Dul',
  'BMX',
  'race',
  '2000-04-27',
  'Rzeszów',
  'unknown',
  'not_found',
  '{"instagram": null, "tiktok": null}',
  'Czołowy polski BMX racer, wielokrotny medalista mistrzostw Polski. Uczestnik kwalifikacji UCI BMX Racing World Cup. Profesjonalna ścieżka kariery, ale brak jeszcze partnera premium.'
),
(
  'Piotr Dzida',
  'BMX',
  'freestyle park',
  '2001-09-12',
  'Bielsko-Biała',
  'unknown',
  'not_found',
  '{"instagram": null, "tiktok": null}',
  'Wschodząca gwiazda polskiego BMX freestyle. Regularny uczestnik turniejów FISE i UCI Urban Cycling, techniczny styl jazdy predystynuje go do kariery na scenie globalnej.'
),

-- ============================================================
-- FREESTYLE SKIING (priority_score: 75 — WEAK Poland coverage)
-- ============================================================
(
  'Filip Kubski',
  'freestyle skiing',
  'slopestyle',
  '1999-12-01',
  'Zakopane',
  'unknown',
  'not_found',
  '{"instagram": null, "tiktok": null}',
  'Reprezentant Polski w slopestyle i big air, uczestnik zawodów Pucharu Świata FIS Freeski. Styl łączący technikę z inwencją — najchętniej skaczący Polak na dużych obiektach.'
),
(
  'Anna Twardosz',
  'freestyle skiing',
  'halfpipe',
  '2003-05-30',
  'Nowy Targ',
  'unknown',
  'not_found',
  '{"instagram": null, "tiktok": null}',
  'Specjalistka halfpipe freestyle skiing, zwyciężczyni mistrzostw Polski w kategorii juniorek. Intensywnie trenuje na obiektach w Europie Zachodniej pod kątem kwalifikacji olimpijskich 2026.'
),

-- ============================================================
-- SNOWBOARDING (priority_score: 55 — PARTIAL Poland coverage)
-- ============================================================
(
  'Oskar Kwiatkowski',
  'snowboarding',
  'slopestyle',
  '2001-02-14',
  'Poronin',
  'unsigned',
  'not_found',
  '{"instagram": null, "tiktok": null}',
  'Jeden z najlepszych polskich snowboardzistów slopestyle ostatnich lat. Medalista Pucharu Europy FIS, regularny uczestnik zawodów PŚ. Brak partnera premium mimo wzrostu wyników.'
),
(
  'Zofia Jabłońska',
  'snowboarding',
  'parallel giant slalom',
  '1998-11-27',
  'Kraków',
  'unsigned',
  'not_found',
  '{"instagram": "https://instagram.com/zofia.jablonska.snb", "tiktok": null}',
  'Specjalistka slalomu równoległego, uczestniczka igrzysk olimpijskich. Najbardziej utytułowana polska snowboardzistka w klasycznych dyscyplinach wyścigowych.'
),

-- ============================================================
-- MOUNTAIN BIKING (priority_score: 50 — PARTIAL Poland coverage)
-- ============================================================
(
  'Maja Włoszczowska',
  'mountain biking',
  'cross-country',
  '1983-12-31',
  'Warszawa',
  'unknown',
  'not_found',
  '{"instagram": "https://instagram.com/majawloszczowska", "tiktok": null}',
  'Legenda polskiego kolarstwa górskiego — 2-krotna medalistka olimpijska (Pekin 2008, Londyn 2012), 2-krotna mistrzyni świata XCO. Ikona dyscypliny w Polsce, potencjalnie ambasadorka marki.'
),
(
  'Stanisław Szczepaniak',
  'mountain biking',
  'enduro',
  '1997-06-10',
  'Nowy Sącz',
  'unknown',
  'not_found',
  '{"instagram": null, "tiktok": null}',
  'Czołowy polski enduro biker, uczestnik Enduro World Series. Rajdowy styl jazdy i umiejętności na trudnym terenie predystynują go do globalnej kariery na trasach EWS.'
),
(
  'Paweł Bernas',
  'mountain biking',
  'downhill',
  '2000-08-15',
  'Wisła',
  'unknown',
  'not_found',
  '{"instagram": null, "tiktok": null}',
  'Downhilowiec, zwycięzca Pucharu Polski DH. Aspiruje do regularnej obecności w UCI Mountain Bike World Cup. Potencjał na karierę globalną przy odpowiednim wsparciu sponsorskim.'
),

-- ============================================================
-- MOTOCROSS (priority_score: 70 — WEAK Poland coverage)
-- ============================================================
(
  'Bartek Wiśniewski',
  'motocross',
  'MX2',
  '2002-03-19',
  'Kielce',
  'unknown',
  'not_found',
  '{"instagram": null, "tiktok": null}',
  'Zawodnik klasy MX2, wielokrotny medalista Mistrzostw Polski w Motocrossie. Przygotowuje się do wejścia na poziom europejskich zawodów EMX250.'
),
(
  'Kamil Rajewski',
  'motocross',
  'enduro',
  '1998-09-05',
  'Lublin',
  'unknown',
  'not_found',
  '{"instagram": null, "tiktok": null}',
  'Specjalista enduro i hard enduro, uczestnik Romaniacs i innych prestiżowych maratonów. Techniczny zawodnik z doświadczeniem w najtrudniejszych zawodach extreme enduro na świecie.'
),

-- ============================================================
-- TRAIL RUNNING (priority_score: 60 — WEAK Poland coverage)
-- ============================================================
(
  'Bartłomiej Przedwojewski',
  'trail running',
  'ultra trail',
  '1993-04-08',
  'Jelenia Góra',
  'unknown',
  'not_found',
  '{"instagram": "https://instagram.com/bart.przedwojewski", "tiktok": null}',
  'Jeden z czołowych polskich ultra-trailowców, finisher i medalista prestiżowych imprez cyklu UTMB. Regularny top-10 w zawodach Golden Trail Series. Bardzo aktywny w mediach społecznościowych.'
),
(
  'Ewelina Pajor',
  'trail running',
  'skyrunning',
  '1999-07-17',
  'Bielsko-Biała',
  'unknown',
  'not_found',
  '{"instagram": "https://instagram.com/ewelina.pajor", "tiktok": null}',
  'Fenomenalna biegaczka górska, mistrzyni serii skyrunning i trailrunning. Wygrana w Sierre Zinal i innych prestiżowych biegach górskich. Jeden z największych talentów europejskiego trail runningu kobiecego.'
),

-- ============================================================
-- PARKOUR (priority_score: 70 — NONE Poland coverage)
-- ============================================================
(
  'Kamil Złotkowski',
  'parkour',
  'freerunning',
  '2000-01-25',
  'Łódź',
  'unknown',
  'not_found',
  '{"instagram": null, "tiktok": null}',
  'Jeden z najbardziej rozpoznawalnych polskich freerunnerów, uczestnik zawodów Red Bull Art of Motion. Znany ze spektakularnych akcji miejskich dokumentowanych w formacie wideo.'
),
(
  'Julia Szymańska',
  'parkour',
  'freestyle',
  '2003-10-04',
  'Poznań',
  'unknown',
  'not_found',
  '{"instagram": null, "tiktok": null}',
  'Młoda freerunnerka, jedna z niewielu Polek aktywnych na zawodach FISE i World Chase Tag. Wyjątkowy talent w środowisku zdominowanym przez mężczyzn.'
),

-- ============================================================
-- KITESURFING (priority_score: 50 — NONE Poland coverage)
-- ============================================================
(
  'Lena Pozdział',
  'kitesurfing',
  'freestyle',
  '2001-06-22',
  'Gdańsk',
  'unknown',
  'not_found',
  '{"instagram": null, "tiktok": null}',
  'Czołowa polska kitesurferka freestyle, uczestniczka zawodów GKA Kite World Tour. Nad Bałtykiem rozwijała się od lat, teraz coraz aktywniejsza na arenie międzynarodowej.'
),

-- ============================================================
-- PARAGLIDING (priority_score: 55)
-- ============================================================
(
  'Katarzyna Łazarczyk',
  'paragliding',
  'acrobatics',
  '1996-03-11',
  'Bielsko-Biała',
  'unknown',
  'not_found',
  '{"instagram": null, "tiktok": null}',
  'Polska pilotka akrobacyjna, uczestniczka mistrzostw świata w akrobatycznym paralotniarstwie. Bielsko-Biała to centrum polskiego paralotniarstwa — Katarzyna jest jedną z jego ambasadorek.'
),

-- ============================================================
-- WINGSUIT / SKYDIVING (priority_score: 65)
-- ============================================================
(
  'Tomasz Kozłowski',
  'wingsuit',
  'proximity flying',
  '1990-08-30',
  'Kraków',
  'unknown',
  'not_found',
  '{"instagram": null, "tiktok": null}',
  'Doświadczony poleski skoczek i wingsuiter, performer proximity flying w Alpach i Dolomitach. Jeden z nielicznych Polaków aktywnych w tej ekstremalnej dyscyplinie na poziomie europejskim.'
)

ON CONFLICT DO NOTHING;
