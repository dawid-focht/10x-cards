---
title: Anti-Corruption Layer — izolacja node:sqlite od domeny, API i UI
created: 2026-08-10
type: refactor-plan
---

# Anti-Corruption Layer — plan refaktoru

> **To jest PLAN, nie implementacja.** Żaden plik produkcyjny nie został zmieniony.
> Wszystkie cytaty `plik:linia` zweryfikowane przez otwarcie plików; liczności
> policzone `ast-grep` 0.45.1 i `grep`, nie oszacowane.

---

## KROK 0 — Kontekst odkryty z dokumentów bazowych

**Stack** (`context/foundation/tech-stack.md:22–33`): Astro (`output: server`, adapter
node, `astro.config.mjs:10–15`) + React 19 (wyspy) + TypeScript, baza
**SQLite przez `node:sqlite`**, własne sesje (scrypt), AI przez OpenRouter/Mock,
Vitest + Playwright.
*(Uwaga uboczna, poza zakresem tego planu: `tech-stack.md:24` mówi „Astro 5", a
`package.json` i zainstalowana wersja to 7.1.1 — dokument jest nieaktualny.)*

**Zależności zewnętrzne (manifest `package.json`)** — `dependencies`: `@astrojs/node`,
`@astrojs/react`, `@tailwindcss/vite`, `astro`, `react`, `react-dom`, `tailwindcss`.
`devDependencies`: `@playwright/test`, `eslint`, `prettier`, `typescript`, `vitest`, `@types/node`.
**W manifeście nie ma ani jednego sterownika bazy** — baza jest zależnością wbudowaną
w runtime (`node:sqlite`), więc żaden audyt oparty na `package.json` jej nie zobaczy.
To pierwsza przesłanka, żeby przyjrzeć się jej osobno.

**Warstwy kodu (2628 linii `src/` + testy):**

| Warstwa | Katalog | Pliki |
| --- | --- | --- |
| Persystencja | `src/db/` | `index.ts`, `flashcards.ts`, `generations.ts`, `reviews.ts`, `schema.sql` |
| Domena / logika | `src/lib/` | `srs.ts`, `auth.ts`, `validation.ts`, `http.ts`, `ai/*` |
| API (wire) | `src/pages/api/**` | 7 endpointów |
| SSR / routing | `src/pages/*.astro`, `src/layouts/`, `src/middleware.ts` | — |
| UI (klient) | `src/components/*.tsx` | 3 wyspy React |

### Deklaracje wymienialności — dwie, obie znalezione w dokumentach

1. **AI — deklaracja dotrzymana.** `context/foundation/prd.md:104`: „architektura musi
   pozwalać na podmianę modelu"; `tech-stack.md:40`: „interfejs `AiProvider` z
   implementacjami `OpenRouterProvider` […] i `MockProvider`". Kod to realizuje:
   port `AiProvider` (`src/lib/ai/provider.ts:9–13`), fabryka `getAiProvider()`
   (`src/lib/ai/provider.ts:26–32`), dwa adaptery, kształt HTTP OpenAI-compatible
   zamknięty w jednym pliku (`src/lib/ai/openrouter.ts`).

2. **Baza — deklaracja NIEdotrzymana.** `context/foundation/tech-stack.md:59`:
   „warstwa repozytoriów **izoluje SQL na wypadek migracji do Postgresa**".
   `context/foundation/infrastructure.md:20`: „**SQLite przez `node:sqlite` nie działa na
   Workers** (wymaga D1 = zmiana warstwy DB)"; `infrastructure.md:22–23`: „Kursowa
   rekomendacja (Cloudflare) odpada bez zmiany warstwy bazy".
   `AGENTS.md:23–26` dokłada regułę: „SQL trzymaj w plikach `src/db/*.ts` (repozytoria),
   nigdy w endpointach ani komponentach", a `context/foundation/code-review.md:16`
   podnosi ją do bramki review: „SQL tylko w repozytoriach `src/db/*.ts`".

Rozjazd intencja-vs-kod jest więc **udokumentowany i wymierny**: projekt sam napisał,
że baza ma być wymienialna, i sam ustanowił regułę, której kod nie dotrzymuje.

---

## KROK 1 — IDENTYFIKACJA przeciekających zależności

Pięć osi. Dla każdej pełna lista plików, które **dziś** znają zależność.

### Oś A — `node:sqlite` (sterownik + dialekt + kształt wiersza + kodowanie czasu)

Import literału `'node:sqlite'` jest tylko w jednym pliku — i właśnie dlatego audyt
„po nazwie pakietu" niczego nie wykrywa. Przecieka **kształt**, nie string importu.

| # | Plik:linia | Co dokładnie przecieka |
| --- | --- | --- |
| A1 | `src/db/index.ts:1` | `import { DatabaseSync } from 'node:sqlite'` |
| A2 | `src/db/index.ts:6`, `src/db/index.ts:8` | **typ sterownika w sygnaturze eksportu**: `getDb(): DatabaseSync` |
| A3 | `src/db/index.ts:15`, `src/db/index.ts:17` | `PRAGMA foreign_keys = ON`, `PRAGMA journal_mode = WAL` — DDL wyłącznie SQLite'owy |
| A4 | `src/db/index.ts:10`, `src/db/index.ts:12` | `DATABASE_FILE` + `mkdirSync(dirname(file))` — założenie „baza to plik na dysku" wpisane w konfigurację |
| A5 | `src/db/index.ts:4`, `src/types.d.ts:1–4` | `schema.sql?raw` — cały schemat w dialekcie SQLite wciągany jako moduł |
| A6 | `src/lib/auth.ts:2` | `import { getDb } from '../db'` — **poza `src/db/`** |
| A7 | `src/lib/auth.ts:31`, `:44`, `:52`, `:59`, `:73` | **5 surowych zapytań SQL w `src/lib/`** (łamie `AGENTS.md:25–26` i `code-review.md:16`) |
| A8 | `src/lib/auth.ts:35` | `err.message.includes('UNIQUE')` — wykrywanie duplikatu przez **podciąg komunikatu błędu sterownika** |
| A9 | `src/db/flashcards.ts:61`, `src/db/generations.ts:15`, `src/lib/auth.ts:33` | `Number(result.lastInsertRowid)` — **3 pliki** rekonstruują ten sam kontrakt typu |
| A10 | `src/db/flashcards.ts:88`, `:96`, `src/db/generations.ts:31` | `Number(result.changes)` — 3 wystąpienia w 2 plikach |
| A11 | `src/db/flashcards.ts:41`, `:68`, `src/db/reviews.ts:20` | `as unknown as …` — podwójne rzutowanie nietypowanego wyjścia sterownika, powtórzone w każdym repozytorium |
| A12 | `src/db/flashcards.ts:54`, `:69`, `:72` | `db.exec('BEGIN')` / `'COMMIT'` / `'ROLLBACK'` — transakcje sterownika inline w repozytorium |
| A13 | `src/db/flashcards.ts:17–23`, `src/db/reviews.ts:33`, `src/lib/auth.ts:42`, `:45`, `:63` | kształty wierszy snake_case (`created_at`, `interval_days`, `password_hash`, `expires_at`) odtworzone w **3 modułach** |
| A14 | `src/lib/auth.ts:40–46` → `src/pages/api/auth/login.ts:14` | `findUserByEmail()` zwraca pole **`password_hash`** — nazwa kolumny bazy w sygnaturze `src/lib/` i konsumowana w endpoincie |
| A15 | `src/db/reviews.ts:20` → `src/pages/api/reviews.ts:14` → `src/components/ReviewSession.tsx:45` | **surowy wiersz SQLite rzutowany na DTO** i podany prosto do wyspy React |
| A16 | `src/db/schema.sql:8`, `:27`, `:36`, `:46`, `:47` + `src/db/flashcards.ts:84` | `datetime('now')` — zegar bazy i format tekstowy SQLite |
| A17 | `src/db/flashcards.ts:65`, `src/db/reviews.ts:44`, `src/lib/auth.ts:53` | `.toISOString()` — **drugi**, niekompatybilny format tego samego typu danych |
| A18 | `src/db/flashcards.ts:11`, `:26` → `src/pages/api/flashcards.ts:16` | `Flashcard.createdAt: string` w kontrakcie wire niesie format SQLite, nie ISO |
| A19 | `src/db/reviews.ts:17` | `rs.due_at <= ?` — porównanie **leksykograficzne tekstu** udające porównanie chwil |
| A20 | `src/pages/api/flashcards.ts:9`, `src/pages/api/reviews.ts:12`, `src/pages/api/flashcards/[id].ts:30`, `src/middleware.ts:8` | handlery **synchroniczne**, bo `node:sqlite` jest synchroniczny — model wykonania sterownika w sygnaturach HTTP |
| A21 | `tests/unit/auth.test.ts:2`, `:13`, `:68–69` | test ustawia `DATABASE_FILE`, importuje `getDb` i **pisze surowy SQL**, żeby podmienić `expires_at` |

**Pliki, które dziś znają oś A (7):**
`src/db/index.ts`, `src/db/flashcards.ts`, `src/db/generations.ts`, `src/db/reviews.ts`,
`src/db/schema.sql`, `src/lib/auth.ts`, `tests/unit/auth.test.ts`.

Wpływ pośredni (konsumują kształt, nie wiedząc o tym):
`src/pages/api/flashcards.ts`, `src/pages/api/flashcards/[id].ts`, `src/pages/api/reviews.ts`,
`src/pages/api/generations.ts`, `src/pages/api/auth/login.ts`, `src/middleware.ts`,
`src/components/ReviewSession.tsx`, `src/components/CardList.tsx`.

### Oś B — kodowanie czasu (`Date` ↔ TEXT)

Formalnie podzbiór osi A (SQLite **nie ma typu daty**, więc aplikacja musi wybrać
kodowanie — i wybrała dwa razy, niezgodnie), ale rozpisana osobno, bo to najostrzejszy
objaw. Pliki: `src/db/schema.sql`, `src/db/flashcards.ts`, `src/db/reviews.ts`,
`src/lib/auth.ts`, `src/lib/srs.ts`, `src/pages/api/reviews.ts`,
`tests/unit/auth.test.ts`, `tests/unit/srs.test.ts` — **8 plików**.
`ast-grep -p 'new Date($$$A)'` → 10 wystąpień w 6 plikach; `-p '$X.toISOString()'` → 5 w 4.

### Oś C — Astro (framework)

`import type { APIRoute } from 'astro'` w 7 endpointach, `AstroCookies` w
`src/lib/http.ts:1`, `astro:middleware` w `src/middleware.ts:1` — **9 plików**.
Jedyny realny zapach: typ frameworka w `src/lib/`. Żaden dokument nie deklaruje
wymienialności Astro; framework przy granicy HTTP to normalna sytuacja, nie korupcja.

### Oś D — OpenRouter / kształt HTTP OpenAI-compatible

**Już poprawnie odizolowana** (kontrola pozytywna). `fetch`, nagłówki, kształt
`choices[0].message.content`, timeout i parsowanie — wyłącznie w
`src/lib/ai/openrouter.ts`. Domena widzi port `AiProvider` (`src/lib/ai/provider.ts:9–13`)
i błąd domenowy `AiProviderError` (`src/lib/ai/provider.ts:16–24`). **1 plik.**

### Oś E — kontrakt wire zduplikowany po stronie klienta

Nie jest to obca biblioteka, ale ta sama choroba: kształt przecieka bez właściciela.

| Typ | Kopie |
| --- | --- |
| `Grade` | `src/lib/srs.ts:4`, `src/pages/api/reviews.ts:5–6`, `src/components/ReviewSession.tsx:11` — **3×** |
| `Flashcard` | `src/db/flashcards.ts:6–12` vs `src/components/CardList.tsx:5–10` — **2×, z dryfem** (kopia w UI nie ma `createdAt`) |
| `Proposal` | `src/lib/ai/provider.ts:4–7` vs `src/components/GenerateView.tsx:55–58` — **2×** |
| `DueCard` / `ReviewCard` | `src/db/reviews.ts:6–10` vs `src/components/ReviewSession.tsx:5–9` — **2×** |
| `readError(res, fallback)` | `src/components/CardList.tsx:28–35`, `src/components/GenerateView.tsx:33–40`, `src/components/ReviewSession.tsx:28–35` — **3× dosłownie** |

Dodatkowo UI **zgaduje kształt odpowiedzi własnego serwera**:
`src/components/CardList.tsx:71–72` (`Flashcard | { item: Flashcard }`) i
`src/components/ReviewSession.tsx:45–46` (`ReviewCard[] | { items: ReviewCard[] }`).

---

## KROK 2 — KLASYFIKACJA i wybór #1

| Oś | (a) warstwy / pliki | (b) koszt wymiany dziś | (c) dokument deklaruje wymienialność? | Werdykt |
| --- | --- | --- | --- | --- |
| **A `node:sqlite`** | 5 warstw (db, lib, api, wire, UI) / **7 plików wprost + 8 pośrednio** | **wysoki** — zmiana dotyka typów w `src/lib/`, sygnatur endpointów (sync→async), DTO i UI | **TAK, dwukrotnie** (`tech-stack.md:59`, `infrastructure.md:20`) — i regułę architektoniczną (`AGENTS.md:25`, `code-review.md:16`) | **#1** |
| B czas (podzbiór A) | 4 warstwy / 8 plików | wysoki (aktywna wada) | pośrednio (ryzyko off-by-one: `context/changes/s04-review/plan.md:32`) | wchłonięta do A |
| C Astro | 2 warstwy / 9 plików | wysoki, ale to host aplikacji | nie | poza zakresem |
| D OpenRouter | 1 warstwa / 1 plik | **niski** | tak — **i dotrzymana** | wzorzec do naśladowania |
| E kontrakt wire | 2 warstwy / 6 plików | średni | nie | naprawa uboczna w fazie 4 |

**Wybór: oś A — `node:sqlite`.**

Uzasadnienie, trzy niezależne argumenty:

1. **Zasięg.** Jedyna oś dotykająca wszystkich pięciu warstw. Oś D dowodzi, że zespół
   umie budować ACL — baza po prostu nie dostała tego samego traktowania. Kontrast
   `src/lib/ai/provider.ts` (port + 2 adaptery) vs `src/db/index.ts:8`
   (`getDb(): DatabaseSync` — typ sterownika **jako kontrakt publiczny**) jest wprost
   widoczny w tym samym repo.
2. **Rozjazd intencja-vs-kod.** `tech-stack.md:59` obiecuje izolację SQL „na wypadek
   migracji do Postgresa", a `infrastructure.md:20` wprost wskazuje `node:sqlite` jako
   blokadę wdrożenia na Cloudflare. Obietnica jest fałszywa: SQL wyciekł do `src/lib/`,
   typ sterownika do sygnatury, a jego synchroniczność do handlerów HTTP.
   Dodatkowo `context/changes/s01-auth/plan.md:15` zapisał `Contract: getDb(): DatabaseSync`
   — przeciek został **zaplanowany jako kontrakt** w fazie 1 i nikt go potem nie cofnął.
3. **Aktywna wada, nie tylko dług.** W bazie leżą **dwa niekompatybilne formaty czasu**
   naraz (dowód niżej). To nie jest hipoteza — to zweryfikowane dane w `data/e2e.db`.

---

## KROK 3 — DIAGNOZA

### 3.1 Dowód rzeczowy: dwa formaty czasu w jednej bazie

Odczyt (read-only) z realnej bazy E2E `data/e2e.db`:

```
flashcards:   { "created_at": "2026-07-19 18:19:01",  "updated_at": "2026-07-19 18:19:01" }
users:        { "created_at": "2026-07-19 18:19:01" }
review_state: { "due_at":     "2026-07-20T18:19:01.920Z" }
sessions:     { "expires_at": "2026-08-18T18:19:01.549Z" }
```

Dwa kodowania tej samej wielkości fizycznej, wynikające z dwóch różnych źródeł zapisu:

| Źródło | Kod | Format | Zegar |
| --- | --- | --- | --- |
| SQLite `datetime('now')` | `src/db/schema.sql:8`, `:27`, `:36`, `:46`, `:47`; `src/db/flashcards.ts:84` | `YYYY-MM-DD HH:MM:SS` (UTC, **bez znacznika strefy**, precyzja 1 s) | zegar bazy |
| JS `toISOString()` | `src/db/flashcards.ts:65`, `src/db/reviews.ts:44`, `src/lib/auth.ts:53` | `YYYY-MM-DDTHH:MM:SS.sssZ` | zegar procesu |

Trzy skutki, każdy zweryfikowany empirycznie na `node:sqlite` (Node 25.9.0):

**(a) Zły instant po stronie klienta.** `new Date('2026-08-10 12:30:27').toISOString()`
→ `'2026-08-10T10:30:27.000Z'` (TZ procesu: `Europe/Warsaw`). Wartość zapisana przez
SQLite jako **UTC** jest przez JS odczytana jako **czas lokalny** — przesunięcie do ±14 h.
ECMA-262 §21.4.3.2 gwarantuje parsowanie tylko formatu ISO; reszta jest
implementation-defined. Ten łańcuch prowadzi wprost do UI:

```
src/db/flashcards.ts:26     createdAt: row.created_at         // "2026-07-19 18:19:01"
src/db/flashcards.ts:11     createdAt: string                 // typ domenowy = tekst z bazy
src/pages/api/flashcards.ts:16   return jsonResponse(listFlashcards(...))   // ten sam tekst na wire
src/components/CardList.tsx:5–10  interface Flashcard { … }                  // pole PORZUCONE
```

UI ratuje się przez **odrzucenie pola**, nie przez jego zrozumienie. Kontrakt wire
przenosi dane, których żaden konsument nie może bezpiecznie użyć.

**(b) Sortowanie tekstowe zależne od formatu.** `src/db/reviews.ts:17` porównuje
`rs.due_at <= ?` — czyli **leksykograficznie**. Działa wyłącznie dlatego, że oba wejścia
są dziś ISO-Z. Zweryfikowane: `'2026-08-10 12:30:27' < '2026-08-10T12:30:27.829Z'` → `true`,
bo spacja (0x20) < `'T'` (0x54). Gdyby `due_at` kiedykolwiek został zapisany idiomem
schematu (`datetime('now')` — dokładnie tym, którego używa **każda pozostała** kolumna
czasowa w `src/db/schema.sql`), taki wiersz sortowałby się **przed każdym** wierszem ISO,
czyli byłby zawsze „wymagalny". Cicha awaria FR-010 bez żadnego wyjątku.
`context/changes/s04-review/plan.md:32` przewidział to ryzyko („off-by-one w datach"),
ale nie miał gdzie zakodować odpowiedzi.

**(c) Dwa zegary, jeden nietestowalny.** `createFlashcard` bierze czas z procesu
(`src/db/flashcards.ts:65`), `updateFlashcard` z bazy (`src/db/flashcards.ts:84`).
`src/lib/srs.ts` jest czysty i przyjmuje `now: Date` (`srs.ts:40`), `src/pages/api/reviews.ts:14`
i `:26` wstrzykują `new Date()` — ale `updated_at` **nie da się zamrozić w teście**,
bo tyka po stronie SQLite.

### 3.2 Duplikacja rekonstrukcji kontraktu sterownika

`node_modules/@types/node/sqlite.d.ts` deklaruje:
`changes: number | bigint` (`:820`), `lastInsertRowid: number | bigint` (`:826`),
`all(): Record<string, SQLOutputValue>[]` (`:853`), `get(): Record<string, SQLOutputValue> | undefined` (`:885`).

Ta unia i ten nietypowany wiersz to **cały powód istnienia** poniższych linii — każdy
plik radzi sobie z nimi na własną rękę:

```
src/db/flashcards.ts:61     const id = Number(result.lastInsertRowid);
src/db/generations.ts:15    return Number(result.lastInsertRowid);
src/lib/auth.ts:33          return Number(result.lastInsertRowid);

src/db/flashcards.ts:88     return Number(result.changes) > 0;
src/db/flashcards.ts:96     return Number(result.changes) > 0;
src/db/generations.ts:31    return Number(result.changes) > 0;

src/db/flashcards.ts:41     .all(userId, limit, offset) as unknown as FlashcardRow[];
src/db/flashcards.ts:68     .get(id) as unknown as FlashcardRow;
src/db/reviews.ts:20        .all(userId, now.toISOString(), limit) as unknown as DueCard[];
```

Liczności (`ast-grep`): `$DB.prepare($$$)` → **19 wystąpień w 5 plikach**;
`getDb()` → **15 wywołań w 5 plikach**; `Number($X.lastInsertRowid)` → **3 pliki**;
`Number($X.changes)` → **2 pliki**; `$DB.exec($S)` → **6 w 2 plikach**.

### 3.3 Przecieki przez granice — te groźne

**(i) SQL poza repozytoriami — złamana własna reguła.**
`AGENTS.md:25–26`: „SQL trzymaj w plikach `src/db/*.ts` (repozytoria)".
`context/foundation/code-review.md:16` czyni z tego kryterium PASS/FAIL wymiaru
**Architecture**. Tymczasem `src/lib/auth.ts` — plik **poza `src/db/`** — zawiera
5 zapytań (`:31`, `:44`, `:52`, `:59`, `:73`) i 5 wywołań `getDb()`. Bieżące review
tego wymiaru powinno dać FAIL.

**(ii) Nazwa kolumny bazy w API.** `src/lib/auth.ts:42` i `:45` deklarują
`{ id; email; password_hash }`; `src/pages/api/auth/login.ts:14` czyta
`user.password_hash`. Snake_case persystencji dociera do warstwy HTTP.

**(iii) Surowy wiersz jako DTO dla wyspy React.** Najkrótsza droga od sterownika do
przeglądarki w tym repo:

```
src/db/reviews.ts:20            .all(...) as unknown as DueCard[]   // wiersz SQLite = DueCard
src/pages/api/reviews.ts:14     jsonResponse({ items: listDue(...) })
src/components/ReviewSession.tsx:45   (await res.json()) as ReviewCard[] | { items: ReviewCard[] }
```

Nie ma tu ani jednego mapowania. `DueCard` **jest** wierszem bazy; UI dostaje go
niezmienionego i — nie mając kontraktu — zgaduje jeszcze, czy dostał tablicę czy obiekt
(`ReviewSession.tsx:46`). To dokładnie sytuacja „warstwa UI konsumuje surowy obiekt
zależności".

**(iv) Model wykonania sterownika w sygnaturach HTTP.** `node:sqlite` udostępnia
`DatabaseSync`/`StatementSync` — API **synchroniczne**. Dlatego trzy handlery są
niasync (`src/pages/api/flashcards.ts:9`, `src/pages/api/reviews.ts:12`,
`src/pages/api/flashcards/[id].ts:30`), a `src/middleware.ts:8` synchronicznie woła
`getSessionUser`. Każdy sterownik sieciowy (Postgres, D1) jest asynchroniczny, więc jego
podstawienie zmienia **sygnatury endpointów i middleware** — czyli dokładnie to, czego
`tech-stack.md:59` obiecywał uniknąć.

**(v) Semantyka błędu jako podciąg komunikatu.** `src/lib/auth.ts:35`:
`err.message.includes('UNIQUE')`. Zweryfikowane zachowanie `node:sqlite`:
`message = "UNIQUE constraint failed: q.e"`, `code = "ERR_SQLITE_ERROR"`,
**`errcode = 2067`** (`SQLITE_CONSTRAINT_UNIQUE`). Dopasowanie po podciągu łapie też
inne naruszenia UNIQUE (nie tylko `users.email`) i rozsypuje się przy zmianie
sterownika (Postgres: SQLSTATE `23505`).

**(vi) Test przyspawany do sterownika.** `tests/unit/auth.test.ts:68–69` sięga przez
`getDb()` po surowy `UPDATE sessions SET expires_at = ?`, żeby zasymulować wygaśnięcie.
Test bada domenę, ale zna dialekt, nazwę tabeli, nazwę kolumny i format tekstu.

### 3.4 Podsumowanie rozjazdu intencja-vs-kod

| Deklaracja | Plik:linia | Stan kodu |
| --- | --- | --- |
| „warstwa repozytoriów izoluje SQL na wypadek migracji do Postgresa" | `context/foundation/tech-stack.md:59` | SQL jest też w `src/lib/auth.ts` (5 zapytań); typ `DatabaseSync` w publicznej sygnaturze; synchroniczność w endpointach |
| „`node:sqlite` nie działa na Workers (wymaga D1 = zmiana warstwy DB)" | `context/foundation/infrastructure.md:20` | „zmiana warstwy DB" oznacza dziś także zmianę `src/lib/`, `src/pages/api/**` i DTO |
| „SQL trzymaj w plikach `src/db/*.ts`, nigdy w endpointach ani komponentach" | `AGENTS.md:25–26` | `src/lib/auth.ts` nie jest `src/db/*.ts` |
| „SQL tylko w repozytoriach `src/db/*.ts`" (bramka review) | `context/foundation/code-review.md:16` | wymiar Architecture = FAIL |
| „Contract: `getDb(): DatabaseSync`" | `context/changes/s01-auth/plan.md:15` | przeciek zapisany jako kontrakt w fazie 1 |

---

## KROK 4 — PROJEKT ACL

Podział odpowiedzialności — świadomy i wąski:

- **`Instant` (value object domenowy)** — JEDYNE miejsce wiedzy o tym, jak chwila w czasie
  przekracza granicę persystencji i granicę wire: kodowanie, tolerancyjne parsowanie
  formatów legacy, konwersja do/z runtime'owego `Date`, operacje domenowe.
- **`SqliteClient` (jądro adaptera)** — JEDYNE miejsce wiedzy o `node:sqlite`: `DatabaseSync`,
  PRAGMA, `number | bigint`, `Record<string, SQLOutputValue>`, transakcje, `errcode`.

VO posiada **decyzję o kodowaniu**, adapter posiada **mechanikę sterownika**. Reszta kodu
nie zna żadnej z nich.

### 4.1 Docelowa struktura katalogów

```
src/domain/
  instant.ts        # VO czasu — ACL kodowania (czysty, bezpieczny dla bundla klienta)
  ids.ts            # branded UserId / FlashcardId / GenerationId
  model.ts          # Flashcard, DueCard, ReviewState, Credentials, CardContent
  ports.ts          # WĄSKIE porty + Clock + błędy domenowe
  wire.ts           # DTO + mappery domena→DTO (jedyny kontrakt HTTP)
src/db/
  index.ts          # composition root: zwraca PORTY, nigdy DatabaseSync
  sqlite/
    client.ts       # JEDYNY `import ... from 'node:sqlite'`
    schema.sql      # DDL dialektu SQLite
    flashcards.ts   # implements FlashcardStore
    reviews.ts      # implements ReviewStore
    generations.ts  # implements GenerationStore
    identity.ts     # implements IdentityStore  (SQL wyprowadzony z src/lib/auth.ts)
    system-clock.ts # implements Clock
```

### 4.2 Value object `Instant` — sygnatury

```ts
// src/domain/instant.ts
// Jedyne miejsce w projekcie, które wie:
//  - jak chwila jest kodowana w kolumnie TEXT (SQLite nie ma typu daty),
//  - że legacy datetime('now') to UTC BEZ znacznika strefy,
//  - jaki kształt idzie na wire.
export class Instant {
  private constructor(private readonly epochMs: number) {}

  // ---- konstrukcja ----
  static fromEpochMs(ms: number): Instant;
  static fromDate(d: Date): Instant;            // konwersja Z typu runtime
  static fromStorage(text: string): Instant;    // ACL odczytu: toleruje OBA formaty legacy
  static fromWire(text: string): Instant;

  // ---- konwersja ----
  toDate(): Date;                               // konwersja DO typu runtime (dla src/lib/srs.ts)
  toStorage(): string;                          // ACL zapisu: jeden kanoniczny kształt
  toWire(): string;                             // RFC 3339 dla DTO
  toEpochMs(): number;

  // ---- operacje domenowe ----
  plusDays(n: number): Instant;
  plusMinutes(n: number): Instant;
  minusDays(n: number): Instant;
  isBefore(other: Instant): boolean;
  isAfterOrEqual(other: Instant): boolean;      // reguła „due" z FR-010: due_at <= now
  compare(other: Instant): -1 | 0 | 1;
}
```

Pseudokod dwóch krytycznych metod:

```
static fromStorage(text):
    # kanoniczny: '2026-07-20T18:19:01.920Z'
    if ISO_UTC.test(text):
        return new Instant(Date.parse(text))

    # legacy z datetime('now'): '2026-07-19 18:19:01'
    # SQLite zapisuje UTC, ale bez 'Z'; ECMA-262 §21.4.3.2 nie gwarantuje parsowania
    # tego kształtu, a V8 czyta go jako czas LOKALNY (zweryfikowane: przesunięcie 2 h
    # w Europe/Warsaw). Dopisujemy 'T' i 'Z' PRZED oddaniem do Date.parse.
    if SQLITE_DATETIME.test(text):
        return new Instant(Date.parse(text.replace(' ', 'T') + 'Z'))

    throw new StorageFormatError('nierozpoznany format chwili', text)

toStorage():
    # INWARIANT: stała długość i stały kształt ⇒ porównanie tekstowe w SQL
    # ('due_at <= ?') jest równoważne porównaniu chronologicznemu.
    # Pilnuje tego test kontraktowy (patrz Faza 1).
    return new Date(this.epochMs).toISOString()
```

`fromStorage` toleruje format legacy, bo `AGENTS.md:23–25` zabrania migracji
destrukcyjnych — istniejące `created_at` w kształcie SQLite muszą pozostać czytelne
bez `ALTER TABLE`.

### 4.3 Wąskie porty

```ts
// src/domain/ports.ts — domena nie wie, czy pod spodem jest SQLite, Postgres czy D1.

export interface Clock { now(): Instant }

export interface FlashcardStore {
  list(owner: UserId, page: Page): Promise<Paged<Flashcard>>;
  add(owner: UserId, draft: FlashcardDraft, at: Instant): Promise<Flashcard>;
  rewrite(owner: UserId, id: FlashcardId, content: CardContent, at: Instant): Promise<boolean>;
  remove(owner: UserId, id: FlashcardId): Promise<boolean>;
}

export interface ReviewStore {
  due(owner: UserId, at: Instant, limit: number): Promise<DueCard[]>;
  stateOf(owner: UserId, id: FlashcardId): Promise<ReviewState | undefined>;
  save(owner: UserId, id: FlashcardId, state: ReviewState, dueAt: Instant): Promise<boolean>;
}

export interface GenerationStore {
  open(owner: UserId, meta: GenerationMeta, at: Instant): Promise<GenerationId>;
  closeWithCounts(owner: UserId, id: GenerationId, counts: GateCounts): Promise<boolean>;
  logError(owner: UserId, model: string, code: string, message: string, at: Instant): Promise<void>;
  countSince(owner: UserId, since: Instant): Promise<number>;      // rate limiting (PRD:105)
  pruneErrorsOlderThan(cutoff: Instant): Promise<number>;          // retencja  (PRD:106)
}

export interface IdentityStore {
  createUser(email: Email, hash: PasswordHash, at: Instant): Promise<UserId>;  // → DuplicateEmailError
  credentialsFor(email: Email): Promise<Credentials | undefined>;              // BEZ nazw kolumn
  openSession(user: UserId, token: SessionToken, expiresAt: Instant): Promise<void>;
  sessionOwner(token: SessionToken, at: Instant): Promise<SessionUser | null>; // `at` wstrzykiwane
  closeSession(token: SessionToken): Promise<void>;
  pruneSessionsExpiredBefore(at: Instant): Promise<number>;
}

// Błędy domenowe — adapter tłumaczy na nie błędy sterownika.
export class DuplicateEmailError extends Error {}
export class StorageError extends Error {}
```

Trzy decyzje projektowe warte nazwania:

1. **Porty są asynchroniczne (`Promise<T>`)** mimo że `node:sqlite` jest synchroniczny.
   Port synchroniczny wpuściłby model wykonania sterownika z powrotem do domeny
   (przeciek A20) i uniemożliwił implementację przez Postgres/D1.
2. **`Credentials` zamiast `{ password_hash }`.** Nazwa kolumny nie opuszcza adaptera.
3. **`Instant` w każdej sygnaturze zamiast `Date`/`string`.** Żaden konsument nie musi
   wiedzieć, czy pod spodem jest tekst, epoch, czy `TIMESTAMPTZ`.

### 4.4 Adapter — jądro (jedyne miejsce z `node:sqlite`)

```ts
// src/db/sqlite/client.ts
import { DatabaseSync } from 'node:sqlite';

const SQLITE_CONSTRAINT_UNIQUE = 2067;   // errcode; stabilniejszy niż podciąg komunikatu

export class SqliteClient {
  private readonly db: DatabaseSync;
  constructor(file: string) { /* mkdir, PRAGMA foreign_keys, PRAGMA journal_mode=WAL, exec(schema) */ }

  rows<T>(sql: string, ...params: SqlParam[]): T[];                    // pochłania `as unknown as`
  row<T>(sql: string, ...params: SqlParam[]): T | undefined;
  mutate(sql: string, ...params: SqlParam[]): { affected: number; insertedId: number };
  inTransaction<T>(fn: () => T): T;                                    // BEGIN IMMEDIATE / COMMIT / ROLLBACK
  maintenance(): void;                                                  // wal_checkpoint + VACUUM (no-op poza SQLite)
}
```

```
mutate(sql, ...params):
    try:
        res = this.db.prepare(sql).run(...params)
    catch err:
        throw translate(err)
    # @types/node/sqlite.d.ts:820,826 → `number | bigint`; normalizacja RAZ, tutaj.
    return { affected: Number(res.changes), insertedId: Number(res.lastInsertRowid) }

translate(err):
    if err.errcode == SQLITE_CONSTRAINT_UNIQUE: return new DuplicateEmailError(...)
    return new StorageError(err.message)

inTransaction(fn):
    # BEGIN IMMEDIATE, nie gołe BEGIN: w trybie WAL deferred BEGIN może przy eskalacji
    # do zapisu polec z SQLITE_BUSY już po wykonaniu części odczytów.
    this.db.exec('BEGIN IMMEDIATE')
    try:    r = fn(); this.db.exec('COMMIT'); return r
    catch:  this.db.exec('ROLLBACK'); throw
```

### 4.5 Adapter — mapowanie agregatu (przykład)

```ts
// src/db/sqlite/flashcards.ts — implements FlashcardStore
interface FlashcardRow {          // snake_case NIE opuszcza tego pliku
  id: number; front: string; back: string;
  source: CardSource; created_at: string; updated_at: string;
}

function toDomain(r: FlashcardRow): Flashcard {
  return {
    id: r.id as FlashcardId,
    content: CardContent.of(r.front, r.back),
    source: r.source,
    createdAt: Instant.fromStorage(r.created_at),   // jedyne przejście przez granicę kodowania
    updatedAt: Instant.fromStorage(r.updated_at),
  };
}
```

```
add(owner, draft, at):
    return Promise.resolve(this.client.inTransaction(() => {
        ins = client.mutate(
            'INSERT INTO flashcards (user_id, front, back, source, generation_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)',
            owner, draft.front, draft.back, draft.source, draft.generationId ?? null,
            at.toStorage(), at.toStorage())          # zegar aplikacji, nie datetime('now')
        client.mutate(
            'INSERT INTO review_state (flashcard_id, due_at, interval_days, ease, reps, lapses)
             VALUES (?, ?, 0, ?, 0, 0)',
            ins.insertedId, at.toStorage(), EASE_START)
        return toDomain(client.row<FlashcardRow>(SELECT_ONE, ins.insertedId))
    }))
```

```ts
// src/db/sqlite/reviews.ts — koniec „surowy wiersz = DTO"
due(owner, at, limit) {
  const rows = this.client.rows<DueRow>(
    `SELECT f.id, f.front, f.back FROM flashcards f
     JOIN review_state rs ON rs.flashcard_id = f.id
     WHERE f.user_id = ? AND rs.due_at <= ?      -- porównanie tekstu bezpieczne,
     ORDER BY rs.due_at ASC LIMIT ?`,            -- bo Instant.toStorage() gwarantuje kształt
    owner, at.toStorage(), limit,
  );
  return Promise.resolve(rows.map(toDueCard));   // MAPOWANIE, nie rzutowanie
}
```

### 4.6 Kontrakt wire — jedno źródło dla serwera i klienta

```ts
// src/domain/wire.ts — czysty, zero importów `node:*`; klient importuje `import type`.
export type CardSource = 'ai-full' | 'ai-edited' | 'manual';
export type GradeDto   = 'again' | 'hard' | 'good' | 'easy';   // zastępuje 3 kopie typu Grade

export interface FlashcardDto { id: number; front: string; back: string; source: CardSource; createdAt: string }
export interface DueCardDto   { id: number; front: string; back: string }
export interface ProposalDto  { front: string; back: string }

export interface FlashcardListDto { items: FlashcardDto[]; total: number }
export interface DueListDto       { items: DueCardDto[] }       // koniec zgadywania kształtu w UI
export interface ErrorDto         { error: string }

export const toFlashcardDto = (c: Flashcard): FlashcardDto => ({
  id: c.id, front: c.content.front, back: c.content.back,
  source: c.source,
  createdAt: c.createdAt.toWire(),               // ZAWSZE ISO — niezależnie od tego, co leży w bazie
});
```

---

## KROK 5 — DOWÓD IZOLACJI + BEFORE/AFTER

### 5.1 Co dotyka wymiana biblioteki (SQLite → Postgres / D1)

| Element | Zmienia się? | Dlaczego |
| --- | --- | --- |
| `src/db/sqlite/client.ts` | **TAK — nowy plik adaptera** | jedyne `node:sqlite`, PRAGMA, `number\|bigint`, `errcode` |
| `src/db/sqlite/*.ts` (4 adaptery) | **TAK — dialekt SQL** | `?`→`$1`, `AUTOINCREMENT`→`GENERATED`, `RETURNING id` zamiast `lastInsertRowid` |
| `src/db/sqlite/schema.sql` | **TAK — DDL** | typy kolumn, `datetime('now')`→`now()` |
| `src/db/index.ts` (composition root) | **TAK — 1 linia wyboru adaptera** | wybór implementacji portów |
| **nazwy tabel i kolumn** | **NIE** | ACL nie zmienia schematu; mapuje go |
| `src/domain/instant.ts` | **NIE** | `toStorage()` to ISO-8601 — poprawne w TEXT, `TIMESTAMPTZ` i D1 |
| `src/domain/ports.ts`, `model.ts`, `wire.ts`, `ids.ts` | **NIE** | zero wiedzy o sterowniku; porty już asynchroniczne |
| `src/lib/auth.ts` | **NIE** | zostaje kryptografia; persystencja przez `IdentityStore` |
| `src/lib/srs.ts` | **NIE** | już czysty (`srs.ts:1–2`) |
| `src/lib/validation.ts`, `src/lib/ai/**` | **NIE** | nigdy nie dotykały bazy |
| `src/pages/api/**` (7 plików) | **NIE** | mówią portami i DTO |
| `src/middleware.ts` | **NIE** | `IdentityStore.sessionOwner()` |
| `src/components/*.tsx` (3 wyspy) | **NIE** | mówią DTO |
| `tests/unit/**` | **NIE** | fake'i portów zamiast `:memory:` + surowego SQL |

Warunkiem tej tabeli jest jedno: **porty muszą być asynchroniczne od pierwszej fazy**.
Gdyby zostały synchroniczne, wiersze „API" i „middleware" zmieniłyby się na TAK — czyli
odtworzylibyśmy dokładnie dzisiejszy przeciek A20.

### 5.2 Before / after — zduplikowane miejsca

| Duplikacja dziś (`plik:linia`) | Po refaktorze |
| --- | --- |
| `Number(res.lastInsertRowid)` — `src/db/flashcards.ts:61`, `src/db/generations.ts:15`, `src/lib/auth.ts:33` | 1× w `SqliteClient.mutate()` |
| `Number(res.changes)` — `src/db/flashcards.ts:88`, `:96`, `src/db/generations.ts:31` | 1× w `SqliteClient.mutate()` |
| `as unknown as …` — `src/db/flashcards.ts:41`, `:68`, `src/db/reviews.ts:20` | 1× w `SqliteClient.rows/row<T>()` |
| `db.exec('BEGIN'/'COMMIT'/'ROLLBACK')` — `src/db/flashcards.ts:54`, `:69`, `:72` | `client.inTransaction()` (+ `BEGIN IMMEDIATE`) |
| **dwa formaty czasu** — zapis: `src/db/schema.sql:8`,`:27`,`:36`,`:46`,`:47`, `src/db/flashcards.ts:84` vs `src/db/flashcards.ts:65`, `src/db/reviews.ts:44`, `src/lib/auth.ts:53` | zapis: `Instant.toStorage()`; odczyt: `Instant.fromStorage()` (toleruje legacy) |
| odczyt czasu — `src/lib/auth.ts:65` (`new Date(row.expires_at)`) | `Instant.fromStorage(...).isBefore(at)` |
| kształty wierszy snake_case — `src/db/flashcards.ts:17–23`, `src/db/reviews.ts:33`, `src/lib/auth.ts:42`,`:45`,`:63` | typy `*Row` wyłącznie w `src/db/sqlite/` |
| `password_hash` w sygnaturze — `src/lib/auth.ts:42`,`:45` → `src/pages/api/auth/login.ts:14` | `Credentials { id, email, hash }` |
| wykrywanie duplikatu — `src/lib/auth.ts:35` (`message.includes('UNIQUE')`) | `errcode === 2067` → `DuplicateEmailError` (1×, w adapterze) |
| SQL w `src/lib/` — `src/lib/auth.ts:31`,`:44`,`:52`,`:59`,`:73` | `src/db/sqlite/identity.ts` (zgodnie z `AGENTS.md:25`) |
| `Grade` ×3 — `src/lib/srs.ts:4`, `src/pages/api/reviews.ts:5–6`, `src/components/ReviewSession.tsx:11` | `GradeDto` w `src/domain/wire.ts` |
| `Flashcard` ×2 z dryfem — `src/db/flashcards.ts:6–12` vs `src/components/CardList.tsx:5–10` | `FlashcardDto` |
| `Proposal` ×2 — `src/lib/ai/provider.ts:4–7` vs `src/components/GenerateView.tsx:55–58` | `ProposalDto` |
| `DueCard`/`ReviewCard` ×2 — `src/db/reviews.ts:6–10` vs `src/components/ReviewSession.tsx:5–9` | `DueCardDto` |
| `readError()` ×3 — `src/components/CardList.tsx:28–35`, `GenerateView.tsx:33–40`, `ReviewSession.tsx:28–35` | `src/lib/api-client.ts` (typowany `ErrorDto`) |
| zgadywanie kształtu — `src/components/CardList.tsx:71–72`, `ReviewSession.tsx:45–46` | znika — DTO jest jednoznaczne |
| test przez surowy SQL — `tests/unit/auth.test.ts:68–69` | fake `Clock` przesuwa czas; zero SQL w teście |

### 5.3 UI dostaje dane domenowe, nie surowy obiekt biblioteki

**Before** — wiersz SQLite przechodzi bez mapowania do przeglądarki:

```
src/db/reviews.ts:20             .all(...) as unknown as DueCard[]      // wiersz sterownika
src/pages/api/reviews.ts:14      jsonResponse({ items: listDue(...) })
src/components/ReviewSession.tsx:45   as ReviewCard[] | { items: ReviewCard[] }   // zgadywanie
```

**After** — dwa jawne przejścia granic, oba w ACL:

```
src/db/sqlite/reviews.ts     rows<DueRow>(...).map(toDueCard)   // wiersz  → domena
src/pages/api/reviews.ts     jsonResponse({ items: cards.map(toDueCardDto) } satisfies DueListDto)
src/components/ReviewSession.tsx   import type { DueListDto } from '../domain/wire'   // typ, nie zgadywanie
```

Analogicznie dla listy fiszek: dziś `createdAt` na wire to `"2026-07-19 18:19:01"`
(`src/db/flashcards.ts:26` → `src/pages/api/flashcards.ts:16`), po refaktorze
`toFlashcardDto()` zwraca `Instant.toWire()`, czyli zawsze ISO — również dla wierszy
zapisanych wcześniej przez `datetime('now')`. UI przestaje musieć porzucać to pole
(`src/components/CardList.tsx:5–10`).

### 5.4 Otwarte pytania zależne od kontraktu SQLite — rozstrzygnięcia

| Pytanie | Rozstrzygnięcie (na podstawie kontraktu SQLite / Node) | Gdzie zakodować |
| --- | --- | --- |
| Format kanoniczny chwili | SQLite nie ma typu daty (przechowuje TEXT/REAL/INTEGER), `datetime('now')` → `YYYY-MM-DD HH:MM:SS` UTC bez strefy. ISO-8601 z `Z` jest sortowalny leksykograficznie i **jedynym** kształtem, którego parsowanie gwarantuje ECMA-262 §21.4.3.2. **Kanon: `toISOString()`.** | `Instant.toStorage()` |
| Co z istniejącymi wierszami w formacie SQLite | `AGENTS.md:23–25` zabrania migracji destrukcyjnych ⇒ bez `ALTER`. Odczyt tolerancyjny, zapis zawsze kanoniczny. | `Instant.fromStorage()` |
| Czy `DEFAULT (datetime('now'))` zostaje | Tak — zmiana `DEFAULT` wymagałaby przebudowy tabeli. Zostaje jako siatka bezpieczeństwa, ale **nigdy nie jest źródłem prawdy**: adapter zawsze przekazuje `at.toStorage()`. | adaptery `src/db/sqlite/*.ts` |
| Który zegar jest źródłem prawdy | Jeden: `Clock` (proces). Zegar bazy jest niezamrażalny w testach (dziś `src/db/flashcards.ts:84`). | port `Clock` + `system-clock.ts` |
| Czy `due_at <= ?` jest poprawne | Tak, **warunkowo**: tylko przy stałym kształcie tekstu. Inwariant należy do VO, nie do SQL-a. | `Instant.toStorage()` + test kontraktowy |
| Granica „dokładnie due = now" (`context/changes/s04-review/plan.md:32`) | FR-010 mówi `due_at ≤ teraz` ⇒ włącznie. | `Instant.isAfterOrEqual()` + `<=` w adapterze |
| Wykrywanie duplikatu e-maila | `node:sqlite` daje `code = ERR_SQLITE_ERROR`, `errcode = 2067` (`SQLITE_CONSTRAINT_UNIQUE`) — zweryfikowane empirycznie. Numeryczny `errcode` > podciąg komunikatu. | `translate()` w `client.ts` |
| Typ `lastInsertRowid` / `changes` | `@types/node/sqlite.d.ts:820`,`:826` → `number \| bigint` (bigint po `setReadBigInts`). Normalizacja jednorazowa. | `SqliteClient.mutate()` |
| Transakcja: `BEGIN` czy `BEGIN IMMEDIATE` | W trybie WAL (`src/db/index.ts:17`) deferred `BEGIN` może polec z `SQLITE_BUSY` przy eskalacji do zapisu. `BEGIN IMMEDIATE` bierze blokadę od razu. | `SqliteClient.inTransaction()` |
| Retencja `generation_errors` (`context/foundation/prd.md:106`) | `DELETE` w SQLite nie zwalnia miejsca w pliku bez `VACUUM`, a WAL rośnie do checkpointu. Polityka (ile dni) jest domenowa, `VACUUM`/`wal_checkpoint` — sterownikowa. **Nie w endpoincie.** | stała w `src/domain/`, `GenerationStore.pruneErrorsOlderThan(Instant)`, `SqliteClient.maintenance()` |
| Rate limiting generacji (`context/foundation/prd.md:105`) | Wymaga okna czasowego i zliczania — czyli `Instant` + zapytania do store'u, nie licznika w handlerze. | `GenerationStore.countSince(owner, since)` |
| Sync vs async | `node:sqlite` jest z założenia synchroniczny (`DatabaseSync`/`StatementSync`); Postgres i D1 nie są. Port musi być asynchroniczny, inaczej sterownik dyktuje sygnatury HTTP (`src/pages/api/flashcards.ts:9` itd.). | `src/domain/ports.ts` |

---

## KROK 6 — WERYFIKACJA I PLAN

### 6.1 Kryterium sukcesu — komenda weryfikująca

Grep po samej nazwie pakietu **nie nadaje się** na kryterium: `grep -rl 'node:sqlite' src`
zwraca dziś 1 plik i fałszywie sugeruje, że izolacja już istnieje. Kryterium musi łapać
**kształt** zależności:

```sh
grep -rlE "node:sqlite|DatabaseSync|getDb\(|\.prepare\(|lastInsertRowid|\.changes\b|datetime\('now'\)|UNIQUE" \
  --include='*.ts' --include='*.tsx' --include='*.astro' --include='*.sql' src tests e2e
```

**Wynik DZIŚ — 7 plików** (uruchomione, nie oszacowane):

```
src/db/flashcards.ts
src/db/generations.ts
src/db/index.ts
src/db/reviews.ts
src/db/schema.sql
src/lib/auth.ts          ← poza katalogiem adaptera
tests/unit/auth.test.ts  ← poza katalogiem adaptera
```

**Wynik OCZEKIWANY po refaktorze — wyłącznie `src/db/sqlite/`:**

```
src/db/sqlite/client.ts
src/db/sqlite/flashcards.ts
src/db/sqlite/generations.ts
src/db/sqlite/identity.ts
src/db/sqlite/reviews.ts
src/db/sqlite/schema.sql
```

Kryterium przechodzi wtedy i tylko wtedy, gdy **każda** ścieżka w wyniku zaczyna się od
`src/db/sqlite/`. Warto dopiąć to jako krok CI przed `npm test`
(`context/foundation/test-plan.md:60–66`) — jednolinijkowiec `... | grep -v '^src/db/sqlite/' && exit 1`.

Kryterium uzupełniające dla osi czasu:

```sh
ast-grep run -p '$X.toISOString()' -l ts src        # oczekiwane: tylko src/domain/instant.ts
grep -rn "datetime('now')" src                      # oczekiwane: tylko src/db/sqlite/schema.sql
```

### 6.2 Kto dziś zna zależność, a kto po refaktorze nie

| Plik | Dziś | Po refaktorze | Co dostaje w zamian |
| --- | --- | --- | --- |
| `src/db/index.ts` | zna (`DatabaseSync` w sygnaturze) | **nie** — composition root | zwraca porty |
| `src/db/flashcards.ts` | zna | → `src/db/sqlite/flashcards.ts` | zostaje adapterem (w katalogu ACL) |
| `src/db/generations.ts` | zna | → `src/db/sqlite/generations.ts` | jw. |
| `src/db/reviews.ts` | zna | → `src/db/sqlite/reviews.ts` | jw. |
| `src/db/schema.sql` | zna | → `src/db/sqlite/schema.sql` | jw. |
| **`src/lib/auth.ts`** | **zna** (5 zapytań SQL, `getDb`, `UNIQUE`) | **NIE** | `IdentityStore` + `Clock`; zostaje scrypt/`timingSafeEqual` |
| **`tests/unit/auth.test.ts`** | **zna** (`DATABASE_FILE`, `getDb`, surowy `UPDATE`) | **NIE** | fake `IdentityStore` + fake `Clock` |
| `src/pages/api/flashcards.ts` | zna kształt (sync, `createdAt` SQLite) | nie | porty + `FlashcardListDto` |
| `src/pages/api/flashcards/[id].ts` | zna kształt (sync) | nie | porty |
| `src/pages/api/reviews.ts` | zna kształt (sync, surowy wiersz jako DTO) | nie | porty + `DueListDto` |
| `src/pages/api/generations.ts` | zna kształt | nie | `GenerationStore` |
| `src/pages/api/auth/login.ts` | zna kształt (`password_hash`) | nie | `Credentials` |
| `src/middleware.ts` | zna kształt (sync auth) | nie | `IdentityStore.sessionOwner()` |
| `src/components/ReviewSession.tsx` | konsumuje surowy wiersz | nie | `DueListDto`, `GradeDto` |
| `src/components/CardList.tsx` | konsumuje `createdAt` w formacie SQLite | nie | `FlashcardDto` |
| `src/lib/srs.ts` | nie | nie | (opcjonalnie `Instant` zamiast `Date`) |

### 6.3 Plan faz — konwencja `context/changes/<change-id>/plan.md`

Change ID: **`s05-acl-persistence`**. Format zgodny z `context/changes/s0*/plan.md`
(Fazy → Success criteria → Risks → Progress). Fazy 1–3 są czysto addytywne — nic nie
usuwają, więc każda kończy się zielonym `npm run lint && npm run check && npm test`.

**Faza 1 — value object czasu (bez zmian w wywołaniach).**
`src/domain/instant.ts` + `tests/unit/instant.test.ts`. Wyrocznia asercji: tabela
rozstrzygnięć z §5.4, nie implementacja (`AGENTS.md:41–43`, `test-plan.md:84–87`).
Testy graniczne: parsowanie obu formatów legacy, `fromStorage('2026-07-19 18:19:01')`
= dokładnie ta sama chwila co `'2026-07-19T18:19:01.000Z'` (niezależnie od TZ procesu),
monotoniczność `toStorage()` względem `compare()` (inwariant sortowania z §3.1b),
`isAfterOrEqual` dokładnie w punkcie `due = now` (`context/changes/s04-review/plan.md:32`).

**Faza 2 — porty, model i jądro adaptera.**
`src/domain/{ids,model,ports}.ts`, `src/db/sqlite/client.ts`, `src/db/sqlite/system-clock.ts`.
Dotychczasowe `src/db/*.ts` **zostają nietknięte** — nic ich jeszcze nie woła.
Test: `errcode 2067` → `DuplicateEmailError`; `inTransaction` cofa zapis przy wyjątku.

**Faza 3 — adaptery agregatów.**
`src/db/sqlite/{flashcards,reviews,generations,identity}.ts` implementujące porty; SQL
przeniesiony 1:1 z `src/db/*.ts` i z `src/lib/auth.ts:31,44,52,59,73`, wzbogacony o jawne
kolumny czasowe (`at.toStorage()` zamiast polegania na `DEFAULT`). Testy repozytoriów per
`userId` — pokrycie R-01 z `context/foundation/test-plan.md:51`, dziś zapisane jako
„przy rozbudowie".

**Faza 4 — kontrakt wire i przełączenie konsumentów.**
`src/domain/wire.ts` + `src/lib/api-client.ts`; przepięcie 7 endpointów, `src/middleware.ts`
i 3 wysp na porty i DTO. Endpointy `GET /api/flashcards`, `GET|POST /api/reviews`,
`DELETE /api/flashcards/[id]` stają się `async`. Usunięcie duplikatów typów z §5.2.
Wyspy importują DTO przez `import type` (kasowane w kompilacji — bundel klienta bez zmian).

**Faza 5 — odchudzenie `src/lib/auth.ts` i testów.**
`src/lib/auth.ts` traci `import { getDb }` i całe SQL; zostają scrypt, `timingSafeEqual`,
`SESSION_COOKIE`, `SESSION_DAYS`. `tests/unit/auth.test.ts` przechodzi na fake'i portów
(znika `DATABASE_FILE = ':memory:'` z `:2` i surowy `UPDATE` z `:69`). Usunięcie
`getDb()`/`closeDbForTests()` z powierzchni publicznej.

**Faza 6 — bramka weryfikacyjna i domknięcie Open Questions.**
Komendy z §6.1 jako krok CI (`.github/workflows/ci.yml`, przed `npm test`).
Implementacja `pruneErrorsOlderThan` i `countSince` (PRD `:105`, `:106`).
Aktualizacja `context/foundation/tech-stack.md:59` i `AGENTS.md:23–26` tak, by opisywały
stan faktyczny (`src/db/sqlite/` = adapter, `src/domain/` = porty i ACL).
Wpis do `context/foundation/lessons.md` (append-only): „typ sterownika w sygnaturze
kontraktu (`getDb(): DatabaseSync`, `context/changes/s01-auth/plan.md:15`) unieważnia
deklarację wymienialności — kontrakt planu ma nazywać port, nie klasę biblioteki".

**Success criteria (zachowanie, nie implementacja)**
- Komenda z §6.1 zwraca wyłącznie ścieżki `src/db/sqlite/**`.
- `GET /api/flashcards` zwraca `createdAt` w ISO-8601 **także dla wierszy zapisanych
  wcześniej przez `datetime('now')`** (weryfikacja na istniejącym `data/e2e.db`).
- E2E `e2e/core-flow.spec.ts` przechodzi bez zmian w spec-u — kontrakt użytkownika
  nietknięty.
- `tests/unit/auth.test.ts` nie zawiera ani jednego stringa SQL.
- Fiszka z `due_at` zapisanym w formacie legacy nie jest fałszywie „wymagalna".

**Risks**
- **Zmiana sync→async w endpointach (Faza 4)** — największy pojedynczy diff. Mitygacja:
  faza wykonywana po zielonych fazach 1–3; `npm run check` wyłapuje każdy niepokryty `await`.
- **Regresja izolacji danych (FR-013)** przy przenoszeniu SQL. Mitygacja: przenosimy
  zapytania **dosłownie**, `WHERE user_id = ?` bez modyfikacji; testy per `userId` w Fazie 3
  przed przepięciem konsumentów.
- **Rozjazd DTO ↔ domena.** Mitygacja: `satisfies <Dto>` przy każdym `jsonResponse`,
  jeden plik `src/domain/wire.ts`.
- **Zakres.** Zmiana dotyka plików spoza jednego slice'a, co koliduje z wymiarem *Scope*
  z `context/foundation/code-review.md:14` — dlatego jest osobnym change ID
  (`s05-acl-persistence`), a nie refaktorem „przy okazji".

**Progress**
- [ ] Faza 1 — `Instant`
- [ ] Faza 2 — porty + `SqliteClient`
- [ ] Faza 3 — adaptery agregatów
- [ ] Faza 4 — wire + konsumenci
- [ ] Faza 5 — `src/lib/auth.ts` i testy
- [ ] Faza 6 — bramka CI + Open Questions
