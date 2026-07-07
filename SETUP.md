# Talent Trop — Setup Checklist (co robi właściciel projektu)

Ten plik aktualizuj po każdym zakończonym kroku. Programowanie aplikacji leży po stronie Claude — Ty robisz tylko to, co poniżej.

---

## Krok 1 — Supabase (jednorazowo)

1. Wejdź na https://supabase.com i zaloguj się / utwórz konto
2. **New project** → wybierz region `EU (Frankfurt)` lub `EU (Central)`
3. Zapamiętaj hasło do bazy (będzie potrzebne do pg_dump)
4. Po utworzeniu projektu wejdź w **SQL Editor** i wklej całą zawartość pliku:
   `supabase/migrations/0001_initial_schema.sql`
   → kliknij **Run** — powinno zakończyć się bez błędów
5. Wejdź w **Project Settings → API** i skopiuj:
   - `Project URL` → to jest `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → to jest `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role secret` key → to jest `SUPABASE_SERVICE_ROLE_KEY`

- [ ] Projekt Supabase utworzony
- [ ] Migracja zaaplikowana (SQL Editor → Run → brak błędów)
- [ ] Klucze skopiowane

---

## Krok 2 — GitHub Secrets (jednorazowo)

W repozytorium GitHub: **Settings → Secrets and variables → Actions → New repository secret**

Dodaj po kolei:

| Secret name | Wartość |
|---|---|
| `SUPABASE_URL` | `https://xxxx.supabase.co` (Project URL z Supabase) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role secret key |
| `ANTHROPIC_API_KEY` | klucz z https://console.anthropic.com (Models → API Keys) |

- [ ] `SUPABASE_URL` dodany
- [ ] `SUPABASE_SERVICE_ROLE_KEY` dodany
- [ ] `ANTHROPIC_API_KEY` dodany

---

## Krok 3 — .env.local (lokalny dev)

W głównym folderze projektu (obok `.env.example`) utwórz plik `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://twoj-projekt-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
```

Plik `.env.local` jest w `.gitignore` — nigdy nie trafia do repo. Tylko `.env.example` (bez wartości) jest commitowany.

- [ ] `.env.local` utworzony i uzupełniony

---

## Krok 4 — Pierwszy ręczny run pipeline'u

Po ustawieniu Secrets, wejdź w **GitHub → Actions**:

1. Zakładka `Ingest RSS Feeds` → **Run workflow** → Run
   - Poczekaj aż skończy (ok. 2–3 min)
   - Powinien napisać np. "42 total new articles"
2. Zakładka `Process Articles (LLM)` → **Run workflow** → Run
   - Przetwarza artykuły bez podsumowania (pierwsze 50 szt.)
   - Kosztuje ok. $0.01–0.05 za run przy Claude Haiku
   - Powinien napisać "Processed N articles"

Po tych dwóch krokach, dashboard powinien pokazywać prawdziwe artykuły.

- [ ] `ingest.yml` uruchomiony ręcznie — zakończony sukcesem
- [ ] `process.yml` uruchomiony ręcznie — zakończony sukcesem
- [ ] Artykuły widoczne w dashboardzie

---

## Krok 5 — Vercel (opcjonalnie, do hostowania)

1. Wejdź na https://vercel.com → Import git repository → `frizz000/talent-trop`
2. W kroku konfiguracji kliknij **Environment Variables** i dodaj:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Deploy

Pamiętaj: **Vercel Hobby = tylko niekomercyjne użycie**. Jeśli zaczniesz sprzedawać dostęp lub używać w pracy z klientem komercyjnie — przejdź na Pro (20$/mies.).

- [ ] Projekt zdeploy'owany na Vercel

---

## Krok 6 — Pierwsi zawodnicy (seed danych)

Przejdź do Supabase SQL Editor i wstaw ręcznie kilku zawodników z researchu:

```sql
INSERT INTO athletes (name, discipline, birth_date, hometown, red_bull_status, talent_score)
VALUES
  ('Przykład Zawodnik', 'skateboarding', '2003-05-12', 'Warszawa', 'unsigned', 72.5),
  ...;
```

Możesz też poprosić Claude w kolejnej sesji żeby wygenerował seed SQL z Twojej listy ~30 zawodników.

- [ ] Pierwsi zawodnicy wstawieni do bazy

---

## Krok 7 — Następne kroki (stan na 2 lipca 2026)

Pipeline działa: baza ma ~1200 zawodników ze scoringiem, kalendarz imprez, brand fit
dla top 150 prospektów. Poniższe kroki odblokowują resztę funkcji — **tylko Ty możesz
je zrobić** (wymagają Twoich kont).

### 7a. Serper.dev — wyszukiwanie kont Instagram (WAŻNE)

**Uwaga (lipiec 2026):** Google Custom Search JSON API jest **zamknięte dla nowych
klientów** (403 permission denied) — zastąpione przez Serper.dev. Bez klucza pipeline
nie szuka kont IG zawodników (celowo nie zgadujemy nazw kont LLM-em — zmyślał).

1. Załóż konto na https://serper.dev → skopiuj API key z dashboardu
2. Podmień w `.env.local`: `SERPER_API_KEY=...`
3. Dodaj GitHub Secret (Settings → Secrets and variables → Actions): `SERPER_API_KEY`

Free tier: **2500 zapytań jednorazowo** (nie odnawia się — potem płatne).
Pipeline używa max ~40/tydzień (`DISCOVERY_LIMIT`) + 1 probe/run, czyli
darmowa pula starczy na ~rok.

- [ ] Klucz Serper.dev utworzony i wpisany w `.env.local`
- [ ] `SERPER_API_KEY` dodany jako GitHub Secret

### 7b. Apify — walidacja kont IG + liczba followersów (opcjonalne, ale warto)

Obecny token w `.env.local` jest **nieważny**.

1. Załóż konto na https://apify.com (darmowy plan = $5 kredytu/mies. — wystarczy)
2. **Settings → Integrations → API tokens** → skopiuj token
3. Podmień w `.env.local`: `APIFY_API_TOKEN=...`
4. Dodaj GitHub Secret: `APIFY_API_TOKEN`

- [ ] Token Apify podmieniony w `.env.local` i dodany jako Secret

### 7c. Sprawdź, czy workflowy chodzą na zielono

GitHub → zakładka **Actions**. Po ostatnich zmianach masz 7 workflowów:

| Workflow | Harmonogram | Co robi |
|---|---|---|
| Ingest RSS | co 2–4h | newsy → `news_articles` |
| Process Articles (LLM) | 06:00 + 18:00 | podsumowania, tagi, wykrywanie zawodników |
| Compute Talent Scores | 07:00 | przelicza talent score (zasila Breakout Radar) |
| Ingest Federation Event Calendars | pon. 04:00 | kalendarz imprez PZA + PZKol |
| Social Discovery & Brand Fit | pon. 08:00 | konta IG (po kroku 7a) + brand fit |
| Ingest Federations | 1. dzień mies. | rankingi PZA/PZKol/PZM |
| Backup | co tydzień | kopia bazy |

Jak któryś jest czerwony → kliknij → skopiuj log → wklej Claude'owi w sesji.

- [ ] Wszystkie workflowy zielone (albo logi przekazane do naprawy)

### 7d. Weryfikacja kandydatów (Twoja robota jako skauta — na bieżąco)

- W **Athlete Hub** ustaw filtr "Do weryfikacji" → wchodź w profile → **Potwierdź** / **Odrzuć**
- Zawodnicy z PZM Motocross (LLM-filtrowani) też czekają na weryfikację
- Odrzuceni znikają ze scoringu automatycznie

### 7e. Zweryfikuj dane Gap Analysis przed pokazaniem komukolwiek

Statusy pokrycia Polska vs. inne kraje w `discipline_gaps` to **szacunki startowe**.
Przejrzyj https://www.redbull.com/pl-pl/athletes (i wersje DE/CZ/FR/AT) i popraw
statusy w Supabase (Table Editor → `discipline_gaps`) tam, gdzie się nie zgadzają.

- [ ] Statusy pokrycia zweryfikowane z oficjalnym rosterem Red Bull

---

## Koszty miesięczne (przypomnienie)

| Usługa | Koszt |
|---|---|
| Vercel Hobby | $0 |
| Supabase Free | $0 |
| GitHub Actions | $0 (mieścisz się w 2000 min) |
| Claude Haiku API (~100 art./dzień, 30 dni) | ~$3–6 |
| Apify (Instagram, cotygodniowo) | ~$0 (darmowy kredyt $5/mies.) |
| **Razem** | **~$3–6/mies.** |
