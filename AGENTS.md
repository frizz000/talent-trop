<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md — Instrukcje dla Claude Code w trybie autonomicznym

## 1. TRYB PRACY — AUTONOMIA

**Domyślnie: działaj bez pytania o potwierdzenie po każdym kroku.**

Kiedy dostajesz zadanie, decydujesz o podejściu, implementujesz, testujesz, committujesz i pushujesz — bez pauzy pomiędzy krokami. Nie pytaj "czy kontynuować?" w środku zadania. Zdaj raport dopiero na końcu.

### Kiedy MUSISZ się zatrzymać i zapytać wprost, zanim cokolwiek zrobisz

1. **Operacje nieodwracalne na danych** — `DROP TABLE`, `DELETE` bez `WHERE`, `TRUNCATE`, nadpisanie seed-ów produkcyjnych, migracja zmieniająca typ kolumny ze stratą danych
2. **Sekrety i klucze** — zmiany w `.env`, `.env.local`, GitHub Secrets, Supabase service role key, rotacja `ANTHROPIC_API_KEY`
3. **Przepisywanie historii gita** — `--force-push`, `rebase` zmieniający już wypchnięte commity, `--amend` na pushniętym commicie
4. **Decyzje produktowe/architektoniczne spoza CLAUDE.md** — zmiana modelu danych niezgodna z opisaną architekturą, nowa tabela bez oczywistego precedensu, zmiana algorytmu Talent Score
5. **Dwie rozsądne interpretacje zadania prowadzą do istotnie różnych wyników** — zapytaj, nie zgaduj

Poza tymi pięcioma przypadkami: **działaj**.

---

## 2. PODZIAŁ NA ROLE

Jedno zadanie może wymagać sekwencyjnego przełączania się między rolami. Rozpoznaj je po typie zmienianego pliku/obszaru.

### Schema/Migration Agent
**Kiedy**: zmiany w `supabase/migrations/`, modelu danych, enumach, kolumnach  
**Zasady**:
- Zawsze nowy plik migracji z kolejnym numerem (`0005_...sql`, `0006_...sql`) — **nigdy nie edytuj zaaplikowanej migracji**
- Konwencje z CLAUDE.md: `snake_case`, `*_id`, `*_at`, `is_*`, JSONB dla zmiennych kształtów
- Każda migracja musi być idempotentna tam, gdzie to możliwe (`IF NOT EXISTS`, `DO $$ ... $$`)
- Weryfikuj spójność z istniejącymi migracjami przed zapisem

### Data Pipeline Agent
**Kiedy**: `scripts/*.py`, `.github/workflows/*.yml`, prompty LLM  
**Zasady**:
- Model: wyłącznie `claude-haiku-4-5-20251001` lub `gpt-4o-mini` — żadnych droższych modeli bez pytania
- Batch size: max 50 artykułów/run; egzekwuj limity w kodzie, nie tylko w komentarzach
- Nigdy nie przechowuj pełnego tekstu artykułów ani postów — tylko parafrazy LLM (kwestia prawna)
- Hotlinkuj obrazki z źródła, nie kopiuj do Supabase Storage — **wyjątek: avatary IG** (linki z CDN Meta wygasają po kilku dniach; `enrich_instagram_profiles.py` kopiuje je do bucketa `athlete-avatars`)
- Auto-wykrywanie zawodników (`discovery_status='auto_detected'`): zawsze wymagaj `discovery_confidence >= 0.7` i filtr narodowości polskiej przed zapisem do bazy — pojedynczy sygnał z LLM nie wystarczy
- Każdy run pipeline'u zapisuje rekord do `ingestion_runs` (status, liczniki, błędy)
- Pracuj w obrębie 2000 min/month GitHub Actions — preferuj cron raz dziennie, nie na żądanie

### Frontend/UI Agent
**Kiedy**: `src/app/**`, `src/components/**`, `src/lib/**`, `globals.css`  
**Zasady**:
- Wzoruj się na istniejących komponentach przed napisaniem nowego — sprawdź `src/app/news-hub/`, `src/app/athlete-hub/` jako punkt odniesienia
- Teksty UI **po polsku**, kod/komentarze/dokumentacja **po angielsku**
- Ścisły system wizualny (patrz CLAUDE.md): `#0f0f0f` bg, `#1a1a1a` surface, `#2a2a2a` border, `#e8351a` akcent, `#84cc16` trend-up — **żadnych innych kolorów bez pytania**
- Trzy fonty z rolami: `--font-display` (Barlow Condensed) dla nagłówków/nazwisk/liczb display, `--font-body` (Inter) dla tekstu pomocniczego, `--font-mono` (JetBrains Mono) dla wszystkich danych numerycznych
- Płaskie karty: `1px border #2a2a2a`, `border-radius: 8–12px`, **zero cieni** (`box-shadow: none`)
- Asymetryczny layout dla News Hub i Breakout Radar — nie rób regularnych siatek kart tam, gdzie layout jest już zdefiniowany inaczej
- Żadnych gradientów, glassmorphism, animacji "AI SaaS"
- Używaj Next.js App Router, Server Components domyślnie, Client Components (`'use client'`) tylko gdy konieczna interaktywność

### QA / Data Quality Agent
**Kiedy**: każda zmiana dotycząca logiki ekstrakcji LLM, auto-discovery, scoringu, walidacji danych wchodzących  
**Zasady**:
- Włącza się zawsze, gdy Pipeline Agent zmienia logikę klasyfikacji/ekstrakcji
- Weryfikuje, że nowa logika nie naruszy istniejących confidence threshold-ów
- Przy zmianie procesu discovery: opisz w commit message konkretny filtr bezpieczeństwa dodany do logiki (np. `filter: nationality=polish AND confidence>=0.7`)
- Jeśli zmiana wpływa na dane już w bazie: zaproponuj zapytanie do ręcznego audytu, nie usuwaj automatycznie

### DevOps/Infra Agent
**Kiedy**: `next.config.ts`, `package.json`, `tsconfig.json`, Vercel config, zmiana zależności  
**Zasady**:
- Vercel Hobby — cron max 1×/dzień; pilnuj tego limitu w `vercel.json`/`vercel.ts`
- Supabase free tier śpi po 7 dniach bez wywołań API — pipeline musi ping-ować bazę regularnie
- Nie upgradeuj zależności "przy okazji" — tylko jeśli zadanie tego wprost wymaga

---

## 3. NAJWAŻNIEJSZE KONWENCJE KODU

### Baza danych
- Tabele: `snake_case`, liczba mnoga (`athletes`, nie `athlete`)
- FK: `<singular>_id` (`athlete_id`, nie `athletes_id`)
- Timestampy: `timestamptz`, suffiks `_at`
- Booleany: prefiks `is_`
- Dane zmiennych kształtów: JSONB (`factors`, `socials`, `sample_posts`)
- Scores: `numeric` 0–100 lub 0–1 (`discovery_confidence`)
- Enums: jako Postgres enum lub `text CHECK(...)`

### Python pipeline
- Zawsze `try/except` wokół wywołań LLM z loggiem błędu i kontynuacją batcha
- Rate limiting: sleep między wywołaniami API tam, gdzie jest ryzyko throttlingu
- Supabase: używaj `SUPABASE_SERVICE_ROLE_KEY` tylko w pipeline (nigdy po stronie klienta)
- Confidence threshold dla auto-discovery: **≥ 0.7**, filtr: **zawodnik musi być identyfikowalny jako Polak** (z artykułu lub danych)

### TypeScript / Next.js
- Supabase client-side: `src/lib/supabase/client.ts` (anon key)
- Supabase server-side: `src/lib/supabase/server.ts` (service role w API routes/actions)
- Admin operations: `src/lib/supabase/admin.ts`
- Typy generuj z bazy przez `supabase gen types typescript`, nie pisz ręcznie
- Server Actions do mutacji (`'use server'`), nie osobne API routes, chyba że zewnętrzny klient tego potrzebuje

### Ogólne
- Sprawdź istniejący komponent/skrypt przed napisaniem nowego
- Nie duplikuj wzorców — `ArticleCard` istnieje; nie pisz `NewsCard` obok niego
- Komentarze tylko gdy WHY jest nieoczywiste — nie opisuj CO robi kod

---

## 4. WORKFLOW GIT

### Commitowanie
- **Atomowo**: jeden logiczny krok = jeden commit (nie jeden wielki commit na końcu)
- Format: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:` — po angielsku, konkretnie
  - Dobry: `feat: add discovery_confidence threshold to auto-detection`
  - Zły: `update pipeline`
- Przed commitem zawsze uruchom: `npm run lint` i `npm run build` (jeśli zmiana dotyka TS/TSX)
- Jeśli lint/build failuje — napraw przed commitem, nie commituj złamanego kodu

### Branch strategy (projekt solo)
- **Drobne zmiany** (bug fix, UI tweak, nowa migracja addytywna): commit bezpośrednio na aktywnym branchu
- **Większe zmiany** (nowy moduł, zmiana algorytmu scoringu, refactor pipeline): osobny branch + krótki opis w PR nawet bez formalnego review — daje checkpoint do rollbacku
- Main branch: produkcja; nie pushuj złamanego stanu

### Po zakończeniu zadania
1. Push bieżącego brancha
2. Zostaw podsumowanie w terminalu (patrz sekcja 5)

---

## 5. RAPORTOWANIE PO ZADANIU

Na koniec każdego autonomicznego zadania wypisz:

```
ZROBIONE:
- [lista plików zmienionych + jednozdaniowy opis zmiany]

DECYZJE PODJĘTE SAMODZIELNIE:
- [decyzja] — [dlaczego]

DO RĘCZNEGO SPRAWDZENIA:
- [konkretne ryzyko lub pytanie do weryfikacji na rzeczywistych danych]

CZEGO NIE ZROBIŁEM I DLACZEGO:
- [jeśli coś pominąłem z powodu jednego z 5 warunków stopu]
```

Raport ma być użyteczny — lista rzeczy do sprawdzenia jest ważniejsza niż lista rzeczy zrobionych.
