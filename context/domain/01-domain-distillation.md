---
title: Destylacja domeny — 10xCards
created: 2026-08-10
type: domain-distillation
---

# Destylacja domeny — 10xCards

> Mapa domeny wydestylowana z dokumentów źródłowych i kodu. Produktem tego
> dokumentu jest **model**, nie kod. Każdy cytat `plik:linia` został zweryfikowany
> otwarciem pliku. Ścieżki są względne wobec korzenia repo `10x-cards/`.

## 0. Kontekst odkrycia

### 0.1 Dokumenty źródłowe (znalezione, nie założone)

| Dokument | Rola w destylacji |
| --- | --- |
| `context/foundation/prd.md` | kontrakt produktowy: wizja, persona, kryteria sukcesu, US-001..009, FR-001..013, reguła biznesowa, model danych, non-goals, open questions |
| `context/foundation/shape-notes.md` | rozszerzona narracja decyzji (sesja planistyczna) — zawiera *dlaczego* odrzucono alternatywy, m.in. autosave propozycji (`shape-notes.md:62`) |
| `context/foundation/tech-stack.md` | stack + powiązanie wyborów z FR |
| `context/foundation/roadmap.md` | slice'y S-01..S-04, wskazanie north star (`roadmap.md:10-12`) |
| `context/foundation/test-plan.md` | mapa ryzyk R-01..R-06 z wpływem i prawdopodobieństwem (`test-plan.md:16-21`) |
| `context/foundation/code-review.md` | standard przeglądu (Definition of Done, `code-review.md:35-45`) |
| `context/foundation/lessons.md` | rejestr incydentów (append-only) |
| `context/changes/s01..s04/plan.md` | plany zmian; `s04-review/plan.md:11-16` jest **wyrocznią reguł SM-2** |
| `AGENTS.md` | konwencje niewywnioskowalne z kodu (`AGENTS.md:21-48`); `CLAUDE.md` to symlink |
| `README.md` | opis dla człowieka + mapowanie wymagań certyfikacyjnych |

Dokumenty wymagań **istnieją i są bogate** — ograniczenie „brak dokumentów, opieram
się na README + kodzie" nie występuje.

### 0.2 Stack i warstwy (gdzie żyje logika biznesowa)

Astro 7 (`output: server`, adapter node) + React 19 (wyspy) + TypeScript strict +
Tailwind 4 + SQLite przez `node:sqlite` (`README.md:9-10`, `tech-stack.md:22-33`).

| Warstwa | Katalog | Co realnie zawiera |
| --- | --- | --- |
| UI (wyspy) | `src/components/` | **stan bramki akceptacji** (`GenerateView.tsx`), kolejka sesji powtórek (`ReviewSession.tsx`), CRUD fiszek (`CardList.tsx`) |
| Strony | `src/pages/*.astro` | wyłącznie osadzenie wysp (`generate.astro:6-9`) |
| API | `src/pages/api/**` | walidacja wejścia, mapowanie błędów na kody, **orkiestracja zapisu zbiorczego** (`api/flashcards.ts:48-88`) |
| Domena (czysta) | `src/lib/srs.ts` | jedyna prawdziwie wydzielona logika domenowa: `schedule()` — czysta funkcja bez I/O (`srs.ts:1-2`) |
| Reguły wejścia | `src/lib/validation.ts` | limity domenowe jako stałe (`validation.ts:2-6`) |
| Granica AI | `src/lib/ai/` | interfejs `AiProvider` + Mock + OpenRouter |
| Persystencja | `src/db/*.ts` + `schema.sql` | repozytoria; **całość SQL** (konwencja `AGENTS.md:23-26`) |

**Obserwacja architektoniczna:** nie ma warstwy „serwisu domenowego". Logika
domenowa jest rozproszona między wyspę React (decyzje akceptacji), endpoint
(orkiestracja) i repozytorium (SQL). Jedynym wyjątkiem jest `srs.ts`. To determinuje
większość rozjazdów z sekcji 4.

### 0.3 Ograniczenia analizy

- Analiza statyczna: nie uruchamiano aplikacji ani testów; statusy niezmienników
  wywnioskowano z kodu i schematu, nie z obserwacji runtime.
- Nie modyfikowano kodu produkcyjnego ani `AGENTS.md`/`CLAUDE.md`.

---

## 1. Ubiquitous Language

Legenda kolumny **Kod**: `plik:linia` = termin ma reprezentację w kodzie;
`BRAK w kodzie` = brak jakiejkolwiek reprezentacji (zweryfikowane `grep` po `src/`).

### 1.A Generacja i bramka akceptacji

| Pojęcie | Definicja (z domeny) | Cytat źródłowy | Kod |
| --- | --- | --- | --- |
| **Tekst źródłowy** | materiał wklejony przez użytkownika, 1 000–10 000 znaków, wejście transformacji | `prd.md:53` „Generowanie propozycji fiszek z wklejonego tekstu o długości 1 000–10 000 znaków" | `src/lib/validation.ts:2-3,13-22`; licznik w UI `GenerateView.tsx:26-28` |
| **Generacja** | pojedyncze wywołanie AI wraz z jego metrykami; jednostka pomiaru sukcesu produktu | `prd.md:83` „generations \| metryki generacji AI" | `src/db/schema.sql:17-28`; `src/db/generations.ts:5-16` |
| **Propozycja fiszki** (kandydat) | para przód/tył zaproponowana przez AI, **nie będąca jeszcze fiszką** | `prd.md:41` „widzi listę propozycji fiszek (przód/tył); żadna nie jest jeszcze zapisana" | `src/lib/ai/provider.ts:4-7`; `GenerateView.tsx:8-14` |
| **Zbiór propozycji generacji** | komplet kandydatów danej generacji — układ odniesienia dla decyzji akceptacji | `prd.md:53` „propozycje istnieją tylko w widoku przeglądu"; `s02-generate/plan.md:43` | **BRAK w kodzie** — serwer zwraca propozycje (`api/generations.ts:30`) i natychmiast o nich zapomina |
| **Bramka akceptacji** | mechanizm, w którym każda propozycja wymaga jawnej decyzji użytkownika; rdzeń tezy produktu | `prd.md:42` US-004 „Bramka akceptacji"; `shape-notes.md:18-19` „wartością jest *bramka akceptacji*" | wyłącznie klient: `GenerateView.tsx:85-91` (filtr po statusie) |
| **Decyzja o propozycji** | akceptuj / edytuj-i-akceptuj / odrzuć (+ stan „nieoceniona") | `prd.md:54` FR-004 „per pozycja akceptuj / edytuj-i-akceptuj / odrzuć" | `GenerateView.tsx:6` `'pending' \| 'accepted' \| 'edited' \| 'rejected'`; serwer widzi tylko `edited: boolean` (`api/flashcards.ts:42-46`) |
| **Zapis zbiorczy** | jednorazowe utrwalenie *wyłącznie* zaakceptowanych propozycji po przeglądzie | `prd.md:55` FR-005 „Zapis zbiorczy wyłącznie zaakceptowanych propozycji" | `src/pages/api/flashcards.ts:48-88` |
| **Dostawca AI** (`AiProvider`) | wymienialna granica do LLM; kontrakt niezależny od dostawcy | `tech-stack.md:40` „interfejs `AiProvider` z implementacjami" | `src/lib/ai/provider.ts:9-13,26-32` |
| **MockProvider** | deterministyczny zamiennik dla dev/testów/CI; granica AI bez sieci i sekretów | `test-plan.md:94-96` „Mock tylko na granicy AI" | `src/lib/ai/mock.ts:10-31` |
| **Model (LLM)** | identyfikator modelu zapisywany przy metrykach generacji | `prd.md:83` „generations … model"; `prd.md:104` „architektura musi pozwalać na podmianę modelu" | `src/lib/ai/openrouter.ts:18`; `mock.ts:11`; zapis `api/generations.ts:25` |
| **Błąd generacji** | awaria granicy AI (timeout / sieć / zła odpowiedź / pusty wynik) z kodem i logiem | `prd.md:62` FR-012 „zapis błędu w `generation_errors`" | `src/lib/ai/provider.ts:16-24`; `src/db/schema.sql:30-37`; `src/db/generations.ts:34-43` |
| **Ponowienie generacji** | możliwość powtórzenia po błędzie bez utraty tekstu | `prd.md:62` „czytelny komunikat, możliwość ponowienia" | `GenerateView.tsx:143-155` |
| **Limit generacji na użytkownika** | ograniczenie liczby generacji (ochrona kosztów) | `prd.md:105` „MVP nie limituje liczby generacji per użytkownik" | **BRAK w kodzie** (świadomie parked, `roadmap.md:58`) |
| **Retencja logów błędów** | polityka czyszczenia `generation_errors` | `prd.md:106` „`generation_errors` bez polityki czyszczenia w MVP" | **BRAK w kodzie** (świadomie, open question) |

### 1.B Fiszka i zestaw

| Pojęcie | Definicja | Cytat źródłowy | Kod |
| --- | --- | --- | --- |
| **Fiszka** | zaakceptowana lub ręcznie stworzona para pytanie–odpowiedź należąca do jednego użytkownika | `prd.md:81` „flashcards \| fiszki użytkownika" | `src/db/schema.sql:39-48`; `src/db/flashcards.ts:6-12` |
| **Przód / Tył** | pytanie (≤ 200 zn.) i odpowiedź (≤ 500 zn.) | `prd.md:56` FR-006 „przód ≤ 200 znaków, tył ≤ 500 znaków — te same limity dla generacji i edycji" | `src/lib/validation.ts:4-5,24-30` |
| **Źródło pochodzenia** (`source`) | ślad, jak fiszka powstała: `ai-full` / `ai-edited` / `manual`; podstawa metryki #2 | `prd.md:81` „source (`ai-full`/`ai-edited`/`manual`)" | `src/db/schema.sql:44` (CHECK); etykiety PL `CardList.tsx:12-16` |
| **Zestaw użytkownika** („zaufany zestaw") | całość fiszek użytkownika jako obiekt zaufania — to, czego pilnuje reguła biznesowa | `prd.md:12` „Zestaw jest jego — bo każdą fiszkę jawnie zaakceptował"; `prd.md:18` „mam zaufany zestaw fiszek" | **BRAK w kodzie** — brak bytu „zestaw/kolekcja"; jest wyłącznie płaska relacja `flashcards.user_id` |
| **Paginacja listy** | stronicowanie „Moich fiszek" | `prd.md:57` FR-007 „Lista fiszek użytkownika z paginacją" | repo + API: `src/db/flashcards.ts:29-46`, `api/flashcards.ts:12-16`; **UI nie korzysta** (`CardList.tsx:41,45-46`) |
| **Usuwanie z potwierdzeniem** | destrukcyjna operacja wymaga potwierdzenia użytkownika | `prd.md:59` FR-009 „Usuwanie fiszki z potwierdzeniem" | `CardList.tsx:102` (`window.confirm`) |

### 1.C Powtórki (SRS)

| Pojęcie | Definicja | Cytat źródłowy | Kod |
| --- | --- | --- | --- |
| **Stan powtórek** (`review_state`) | 1:1 z fiszką: gdzie fiszka jest w harmonogramie | `prd.md:82` „review_state \| stan powtórek (1:1 z fiszką)" | `src/db/schema.sql:51-58`; typ `src/lib/srs.ts:6-11` |
| **Termin wymagalności** (`due_at`) | moment, od którego fiszka wraca do sesji | `prd.md:60` FR-010 „wybór fiszek `due_at ≤ teraz`" | `src/db/schema.sql:53`; `src/db/reviews.ts:12-21` |
| **interval / ease / reps / lapses** | parametry harmonogramu: odstęp w dniach, łatwość, liczba powtórek, liczba wpadek | `prd.md:82`; `s04-review/plan.md:16` „ease start 2.5" | `src/lib/srs.ts:6-11,18-23`; `src/db/schema.sql:54-57` |
| **Ocena** (`Grade`) | Again / Hard / Good / Easy — jedyne wejście użytkownika do harmonogramu | `prd.md:60` „ocena w skali Again/Hard/Good/Easy" | `src/lib/srs.ts:4`; `api/reviews.ts:5-6`; etykiety PL `ReviewSession.tsx:13-18` |
| **Uproszczony SM-2** | algorytm wyznaczający kolejny termin; świadomie prosty | `prd.md:94` non-goal „świadomie uproszczony SM-2"; wyrocznia `s04-review/plan.md:11-16` | `src/lib/srs.ts:40-84`; testy `tests/unit/srs.test.ts` |
| **Sesja powtórek** | przebieg: kolejka fiszek due → odsłonięcie tyłu → ocena | `prd.md:60` FR-010 „Sesja powtórek"; `s04-review/plan.md:3-5` | wyłącznie stan wyspy: `ReviewSession.tsx:20-27`; **brak bytu trwałego** — sesja nie jest nigdzie zapisywana |

### 1.D Konto i dostęp

| Pojęcie | Definicja | Cytat źródłowy | Kod |
| --- | --- | --- | --- |
| **Użytkownik / Konto** | e-mail (unikalny) + hash hasła | `prd.md:79` „users \| konto użytkownika" | `src/db/schema.sql:4-9`; `src/lib/auth.ts:27-46` |
| **Sesja logowania** | token w cookie HttpOnly, ważny 30 dni | `prd.md:52` FR-002 „sesja wygasa po 30 dniach" | `src/db/schema.sql:11-15`; `src/lib/auth.ts:4-5,48-74`; cookie `src/lib/http.ts:24-32` |
| **Rola `user`** | jedyna rola w systemie; brak adminów | `prd.md:88` „jedna rola (`user`), brak adminów w MVP" | **BRAK w kodzie** — brak kolumny/typu roli (spójne z modelem: jedna rola = brak wymiaru) |
| **Izolacja danych / „404 nie 403"** | cudzy zasób jest nieodróżnialny od nieistniejącego | `prd.md:63` FR-013; `prd.md:47` US-009 „otrzymuje 404 bez ujawnienia istnienia zasobu" | `api/flashcards/[id].ts:6-7,24-26,35-37`; filtry `db/flashcards.ts:39,43,86,95`, `db/reviews.ts:17,30`, `db/generations.ts:28` |
| **Ochrona dostępu** | jedno miejsce wymuszające sesję dla widoków i API | `prd.md:89` „middleware wymusza logowanie na wszystkich widokach poza `/login`, `/register`" | `src/middleware.ts:5-21` |
| **Odzyskiwanie hasła** | reset hasła przez e-mail | `prd.md:100` non-goal „brak infrastruktury mailowej w MVP" | **BRAK w kodzie** (świadomie, non-goal) |

### 1.E Pomiar sukcesu

| Pojęcie | Definicja | Cytat źródłowy | Kod |
| --- | --- | --- | --- |
| **Metryki generacji** | `generated` / `accepted_unedited` / `accepted_edited` / `rejected` / `duration_ms` | `prd.md:61` FR-011 | zapis: `src/db/generations.ts:5-32`; schemat `schema.sql:22-26` |
| **Akceptowalność fiszek AI (≥ 75 %)** | `(accepted_unedited + accepted_edited) / generated` — dowód, że bramka akceptacji działa | `prd.md:33` | **BRAK w kodzie** — `grep` po `src/`, `tests/`, `e2e/` pokazuje wyłącznie INSERT/UPDATE na `generations`, ani jednego SELECT/agregatu |
| **Udział AI w tworzeniu (≥ 75 %)** | `flashcards.source ≠ manual / wszystkie` | `prd.md:34` | **BRAK w kodzie** — brak zapytania po `source` |
| **Persona „Dorosły samouk"** | odbiorca: sam dobiera materiały tekstowe, chce fiszek, którym ufa | `prd.md:23-27` | **BRAK w kodzie** (oczekiwane — persona nie jest bytem kodowym) |

**Podsumowanie luk językowych:** 9 pojęć z adnotacją `BRAK w kodzie`, z czego
**4 to realne luki modelu** (zbiór propozycji generacji, zestaw użytkownika,
akceptowalność ≥ 75 %, udział AI ≥ 75 %) i 5 to nieobecności świadome lub
oczekiwane (limit generacji, retencja logów błędów, rola `user`, odzyskiwanie
hasła, persona).

---

## 2. Klasyfikacja subdomen

Rdzeń = to, co stanowi przewagę i sens produktu, czyli — wprost z PRD — dwie
decyzje domenowe: „(1) transformacja tekstu na kandydatów na fiszki z bramką
akceptacji, (2) harmonogramowanie powtórek" (`prd.md:71-73`).

| Obszar | Kategoria | Uzasadnienie (cel produktu) | Gdzie żyje |
| --- | --- | --- | --- |
| **Bramka akceptacji** (generacja → decyzja per propozycja → zapis zbiorczy) | **Core** | `prd.md:71-72` decyzja domenowa (1); `roadmap.md:10-12` north star „najmniejszy przepływ udowadniający tezę produktu"; `shape-notes.md:62` autosave odrzucony jako podważający regułę biznesową | `api/generations.ts`, `api/flashcards.ts:48-88`, `GenerateView.tsx` |
| **Pochodzenie fiszki i akceptowalność** (`source` + liczniki) | **Core** | `prd.md:33-34` — oba kryteria sukcesu produktu liczą się z tych danych; bez nich teza „AI + kontrola jakości" jest nieweryfikowalna | `schema.sql:22-26,44`, `db/generations.ts` |
| **Harmonogramowanie powtórek** (kiedy fiszka wraca) | **Core** (mechanizm) | `prd.md:71-72` decyzja domenowa (2); `prd.md:13` „aplikacja pilnuje harmonogramu powtórek"; `prd.md:68-69` termin wyznacza algorytm, „nie ręczny wybór" | `src/lib/srs.ts`, `src/db/reviews.ts` |
| **Konkretny algorytm SM-2** | **Generic** (świadomy wybór) | `prd.md:94` non-goal „Własny zaawansowany algorytm powtórek (SuperMemo/FSRS) — świadomie uproszczony SM-2". Zdolność jest rdzeniowa, jej implementacja celowo towarowa | `src/lib/srs.ts:40-84` |
| **Zarządzanie fiszkami** (lista, manual, edycja, usuwanie) | **Supporting** | `prd.md:57-59` FR-007..009; `roadmap.md:42` ryzyko „niski" — konieczne, ale niewyróżniające; nośnik wartości rdzenia | `db/flashcards.ts`, `api/flashcards*`, `CardList.tsx` |
| **Abstrakcja dostawcy AI** (podmiana modelu, mock) | **Supporting** | `prd.md:104` „architektura musi pozwalać na podmianę modelu"; `tech-stack.md:40` — wymóg produktowy, nie przewaga sama w sobie | `src/lib/ai/*` |
| **Obsługa i log błędów generacji** | **Supporting** | `prd.md:62` FR-012; `test-plan.md:19` R-04 prawdopodobieństwo **wysokie** — chroni rdzeniowy przepływ przed cichą awarią | `provider.ts:16-24`, `api/generations.ts:31-36` |
| **Izolacja danych właściciela** (404-nie-403) | **Supporting** | `prd.md:63` FR-013 + `prd.md:47` US-009; `test-plan.md:16` R-01 wpływ **wysoki**. Konwencja „404 zamiast 403" (`AGENTS.md:29-30`) to decyzja produktowa, nie standard biblioteczny | konwencja w repozytoriach + `api/flashcards/[id].ts` |
| **Konta, hasła, sesje** | **Generic** | `prd.md:88` jedna rola, brak adminów; `tech-stack.md:59` własny kod wyłącznie jako zamiennik Supabase, nie z powodów domenowych | `src/lib/auth.ts`, `api/auth/*`, `middleware.ts` |
| **Walidacja limitów wejścia** | **Generic** | `test-plan.md:21` R-06 wpływ **niskie**; wartości są parametrem, nie regułą wyróżniającą | `src/lib/validation.ts` |
| **Transport HTTP/JSON + koperta błędu** | **Generic** | `AGENTS.md:36-38` — czysta konwencja techniczna | `src/lib/http.ts` |
| **Persystencja (SQLite, schemat, migracja)** | **Generic** | `tech-stack.md:27` wybór podyktowany „zero natywnych zależności i kompilacji w CI" | `src/db/index.ts`, `schema.sql` |

**Wniosek klasyfikacyjny:** rdzeń domeny (bramka akceptacji + pochodzenie +
harmonogram) ma **najsłabszą reprezentację architektoniczną** ze wszystkich
obszarów — jedyny wydzielony moduł domenowy to `srs.ts`. Obszary generyczne
(auth, walidacja, HTTP, persystencja) są wydzielone wzorowo. To odwrócona
piramida inwestycji strukturalnej.

---

## 3. Kandydaci na agregaty i ich niezmienniki

Status: **egzekwowany** (kod uniemożliwia naruszenie) / **deklarowany** (kod zakłada,
ale nie sprawdza) / **ignorowany** (nic nie pilnuje).

### A-1 Generacja z bramką akceptacji — *root: `generations`*

Granica spójności: jedno wywołanie AI + jego zbiór propozycji + decyzje użytkownika
+ powstałe z nich fiszki + liczniki.

| # | Niezmiennik | Cytat źródłowy | Status | Dowód w kodzie |
| --- | --- | --- | --- | --- |
| I-1.1 | Żadna fiszka nie powstaje z propozycji, której użytkownik jawnie nie zaakceptował | `prd.md:67-68` „Żadna fiszka nie trafia do zestawu użytkownika bez jego jawnej akceptacji" | **ignorowany serwerowo** | serwer przyjmuje dowolne `{front, back, edited}` bez związku z wygenerowanymi propozycjami — `api/flashcards.ts:55-78`; jedyny filtr statusów jest w przeglądarce `GenerateView.tsx:85-91` |
| I-1.2 | `source = ai-edited` ⟺ treść zmieniono względem propozycji; inaczej `ai-full` | `prd.md:54` FR-004 „edycja zmienia oznaczenie na `ai-edited`" | **deklarowany** | serwer ufa fladze klienta: `api/flashcards.ts:66` (`edited === true`) → `:75` wybór `source`; oryginał propozycji nie istnieje po stronie serwera, więc porównanie jest niemożliwe |
| I-1.3 | `generated_count = accepted_unedited + accepted_edited + rejected` | `prd.md:61` FR-011 (cztery liczności); wzór metryki `prd.md:33` | **ignorowany** | `rejected` pochodzi od klienta i domyślnie 0 (`api/flashcards.ts:69`); propozycje `pending` nigdy nie są raportowane (`GenerateView.tsx:6`); porzucona generacja zostaje z zerami (`schema.sql:23-25`) |
| I-1.4 | Generacja należy do jednego użytkownika; tylko jego fiszki mogą się do niej odwoływać | `prd.md:63` FR-013; `AGENTS.md:27-30` | **częściowo egzekwowany** | `updateGenerationCounts` filtruje po `user_id` (`db/generations.ts:28,31`), ale jej `false` jest ignorowane (`api/flashcards.ts:81`); `createFlashcard` wstawia `generation_id` bez sprawdzenia właściciela (`db/flashcards.ts:58-60`) — FK weryfikuje tylko istnienie (`schema.sql:45`) |
| I-1.5 | Propozycje nie istnieją poza widokiem przeglądu (nic nie jest zapisywane przed akceptacją) | `prd.md:53` „propozycje istnieją tylko w widoku przeglądu" | **egzekwowany** | brak tabeli propozycji w `schema.sql`; `api/generations.ts:30` zwraca je i nie utrwala |
| I-1.6 | Zapis zbiorczy jest niepodzielny — albo wszystkie zaakceptowane, albo żadna | `prd.md:55` FR-005 „Zapis **zbiorczy**"; `s02-generate/plan.md:30-32` | **ignorowany** | pętla po pozycjach, każda z osobną transakcją: `api/flashcards.ts:71-78` → `db/flashcards.ts:54,69,72-73` |

### A-2 Fiszka wraz ze stanem powtórek — *root: `flashcards`*

Granica spójności: fiszka + jej `review_state` (encja wewnętrzna, brak własnej tożsamości domenowej).

| # | Niezmiennik | Cytat źródłowy | Status | Dowód w kodzie |
| --- | --- | --- | --- | --- |
| I-2.1 | Każda fiszka ma dokładnie jeden stan powtórek | `prd.md:82` „review_state \| stan powtórek (1:1 z fiszką)" | **deklarowany** | tworzone razem w transakcji `db/flashcards.ts:54-70`, ale schemat dopuszcza fiszkę bez stanu (`schema.sql:51-52` — tylko PK+FK); taka fiszka nigdy nie trafi do sesji (INNER JOIN `db/reviews.ts:15-17`) |
| I-2.2 | Usunięcie fiszki kasuje jej stan powtórek | `prd.md:59` FR-009 „usunięcie kasuje też stan powtórek" | **egzekwowany** | `ON DELETE CASCADE` (`schema.sql:52`) + `PRAGMA foreign_keys = ON` (`db/index.ts:15`) |
| I-2.3 | Edycja treści zachowuje stan powtórek | `prd.md:58` FR-008 „Edycja fiszki (przód/tył) z zachowaniem stanu powtórek" | **egzekwowany** | UPDATE dotyka wyłącznie `front/back/updated_at` (`db/flashcards.ts:84-85`) |
| I-2.4 | Przód ≤ 200, tył ≤ 500, oba niepuste — te same limity dla generacji i edycji | `prd.md:56` FR-006 | **egzekwowany w aplikacji, nie w bazie** | `validation.ts:24-30` wołane w `api/flashcards.ts:35,64` i `api/flashcards/[id].ts:21`; `schema.sql:39-48` nie ma CHECK na długość |
| I-2.5 | `source ∈ {ai-full, ai-edited, manual}` | `prd.md:81` | **egzekwowany w bazie** | `schema.sql:44` `CHECK (source IN (...))` |
| I-2.6 | Fiszka jest dostępna wyłącznie właścicielowi; cudza = nieistniejąca | `prd.md:47` US-009; `prd.md:63` FR-013 | **egzekwowany** | `WHERE user_id = ?` w każdym zapytaniu (`db/flashcards.ts:39,43,86,95`); mapowanie na 404 `api/flashcards/[id].ts:24-26,35-37` |

### A-3 Harmonogram powtórek — *root: `review_state` jednej fiszki*

| # | Niezmiennik | Cytat źródłowy | Status | Dowód w kodzie |
| --- | --- | --- | --- | --- |
| I-3.1 | Termin kolejnej powtórki wyznacza wyłącznie algorytm na podstawie oceny — nigdy ręczny wybór | `prd.md:68-69` „termin każdej powtórki wyznacza algorytm … nie ręczny wybór" | **egzekwowany serwerowo** | API przyjmuje tylko `{flashcardId, grade}` (`api/reviews.ts:20-24`); `applyGrade` odczytuje stan z bazy i przelicza (`db/reviews.ts:27-44`) — klient nie może podać daty |
| I-3.2 | `ease ∈ [1.3, 2.8]` | `s04-review/plan.md:12-15` („min 1.3", „max 2.8") | **egzekwowany z luką** | `srs.ts:20-21,25-27` clamp przy `again/hard/easy`; `good` zwraca `state.ease` bez clampu (`srs.ts:66`), brak CHECK w `schema.sql:55` |
| I-3.3 | Sesja obejmuje wyłącznie fiszki `due_at ≤ teraz`, w kolejności od najdawniej wymagalnych | `prd.md:60` FR-010 | **egzekwowany** | `db/reviews.ts:17-18` `WHERE … rs.due_at <= ? ORDER BY rs.due_at ASC` |
| I-3.4 | `schedule()` jest czystą funkcją i nie mutuje wejścia | `s04-review/plan.md:9-10` „czysta funkcja"; `srs.ts:1-2` | **egzekwowany i przetestowany** | `tests/unit/srs.test.ts:86` „nie mutuje przekazanego stanu" |
| I-3.5 | Ocena cudzej fiszki nie zmienia żadnego stanu | `prd.md:47` US-009; `s04-review/plan.md:29` „Ocena cudzej fiszki → 404, stan nietknięty" | **egzekwowany** | `db/reviews.ts:27-35` → `false` przed jakimkolwiek UPDATE; `api/reviews.ts:26-28` → 404 |

### A-4 Konto i sesja — *root: `users`*

| # | Niezmiennik | Cytat źródłowy | Status | Dowód w kodzie |
| --- | --- | --- | --- | --- |
| I-4.1 | E-mail jest unikalny (case-insensitive) | `prd.md:51` FR-001 „unikalność e-maila" | **egzekwowany w bazie** | `schema.sql:6` UNIQUE + normalizacja `auth.ts:32,45`; konflikt → 409 (`auth.ts:35`, `api/auth/register.ts:17`) |
| I-4.2 | Hasło nigdy nie jest przechowywane jawnie | `prd.md:51` „hasło przechowywane wyłącznie jako hash" | **egzekwowany** | scrypt + losowa sól `auth.ts:12-16`; porównanie `timingSafeEqual` `auth.ts:23` |
| I-4.3 | Sesja wygasa po 30 dniach | `prd.md:52` FR-002 | **egzekwowany** | `auth.ts:5,50`; kontrola wygaśnięcia przy każdym odczycie `auth.ts:65-68` |
| I-4.4 | Każdy widok poza `/login`, `/register` wymaga sesji; API poza auth → 401 | `prd.md:46` US-008; `prd.md:89` | **egzekwowany** | `middleware.ts:5-21` (jedno miejsce) |
| I-4.5 | Odpowiedzi API nie zdradzają, które e-maile istnieją | `test-plan.md:20` R-05 | **naruszony świadomie** | rejestracja zwraca 409 (`api/auth/register.ts:17`) — odnotowane w `s01-auth/plan.md:40` „409 świadomie akceptowane w MVP"; logowanie robi to poprawnie (`api/auth/login.ts:6,14-16`) |

---

## 4. Rozjazdy MODEL vs KOD

Najcenniejsza część mapy: miejsca, w których wiedza domenowa istnieje w dokumentach,
a kod jej nie odwzorowuje.

| # | Dokument mówi | Kod robi | Dowód (`plik:linia`) | Waga |
| --- | --- | --- | --- | --- |
| **D-01** | „Żadna fiszka nie trafia do zestawu użytkownika bez jego jawnej akceptacji" (`prd.md:67-68`); „Zapis zbiorczy **wyłącznie** zaakceptowanych propozycji" (`prd.md:55`) | Serwer nie zna propozycji, które sam wygenerował — przyjmuje dowolną listę `{front, back, edited}` i zapisuje ją jako fiszki AI. Reguła biznesowa jest konwencją interfejsu, nie regułą domeny | `api/generations.ts:30` (propozycje zwrócone i zapomniane) vs `api/flashcards.ts:55-78`; jedyny filtr `GenerateView.tsx:85-91` | **krytyczna** |
| **D-02** | „wszystkie operacje ograniczone do właściciela" (`prd.md:63` FR-013); repozytoria filtrują po `user_id` (`AGENTS.md:27-30`) | `generation_id` z żądania trafia do INSERT bez weryfikacji właściciela; FK sprawdza tylko istnienie wiersza, więc można podpiąć własne fiszki pod cudzą generację. Zwrot `false` z `updateGenerationCounts` jest ignorowany, więc nie ma 404 | `api/flashcards.ts:25-26,76,81`; `db/flashcards.ts:58-60`; `schema.sql:45`; `db/generations.ts:28,31` | **wysoka** |
| **D-03** | „Zapis **zbiorczy**" (`prd.md:55`); plan: „insert fiszek … + aktualizacja liczników" jako jedna operacja (`s02-generate/plan.md:29-32`) | Pętla z osobną transakcją na fiszkę; awaria w połowie zostawia część zestawu zapisaną i liczniki nietknięte. Komentarz w kodzie dowodzi, że atomowość rozważono tylko dla fazy walidacji | `api/flashcards.ts:54,71-78`; `db/flashcards.ts:54,69,72-73` | **wysoka** |
| **D-04** | FR-011 wymaga czterech liczności generacji (`prd.md:61`), a metryka #1 dzieli zaakceptowane przez wygenerowane (`prd.md:33`) | `rejected` przychodzi od klienta i domyślnie 0; propozycje pozostawione bez decyzji nie są raportowane wcale; porzucenie przeglądu zostawia generację jako „0 % akceptacji". Równanie liczności nigdy się nie domyka | `api/flashcards.ts:69,80-85`; `GenerateView.tsx:6,92`; `schema.sql:23-25` | **wysoka** |
| **D-05** | Dwa kryteria sukcesu produktu ze wskazanym źródłem pomiaru (`prd.md:31-35`) | Dane są zapisywane, ale **nigdy odczytywane** — w `src/`, `tests/` i `e2e/` nie ma ani jednego SELECT/agregatu na `generations` ani zapytania po `flashcards.source`. Produkt nie potrafi stwierdzić, czy osiąga własny cel | `db/generations.ts:11,27,41` (wyłącznie INSERT/UPDATE); brak odpowiednika po stronie odczytu | **wysoka** |
| **D-06** | „Lista fiszek użytkownika **z paginacją**" (`prd.md:57` FR-007); plan S-03: „lista z paginacją" (`s03-manage/plan.md:3`) | Paginacja istnieje w repozytorium i endpointcie, ale UI nie wysyła `limit`/`offset` i ignoruje `total` — użytkownik widzi maksymalnie 20 fiszek i nie ma jak dotrzeć do reszty | `db/flashcards.ts:29-46`, `api/flashcards.ts:7,12-16` vs `CardList.tsx:41,45-46` | **średnia** |
| **D-07** | „termin każdej powtórki wyznacza algorytm … nie ręczny wybór" (`prd.md:68-69`); `again` → due za 10 minut (`s04-review/plan.md:12`) | Serwer planuje poprawnie (+10 min), ale wyspa dokleja kartę na koniec kolejki i pokazuje ją natychmiast — o kolejności decyduje stan przeglądarki, nie `due_at` | `srs.ts:44-49` vs `ReviewSession.tsx:77-83` | **średnia** |
| **D-08** | „przód ≤ 200 znaków, tył ≤ 500 znaków — **te same limity dla generacji i edycji**" (`prd.md:56`) | Limit żyje wyłącznie w warstwie aplikacji; baza go nie zna. Dodatkowo obaj providerzy przycinają treść u siebie, więc walidator nigdy nie widzi za długiej propozycji — reguła jest na ścieżce AI martwa | brak CHECK w `schema.sql:39-48`; `validation.ts:24-30`; `openrouter.ts:106-107`; `mock.ts:25-26` | **średnia** |
| **D-09** | „review_state (1:1 z fiszką)" (`prd.md:82`) | Relacja 1:1 jest utrzymywana przez jedną funkcję, nie przez schemat. Fiszka utworzona inną ścieżką nie miałaby stanu i **cicho** nigdy nie stałaby się wymagalna | `db/flashcards.ts:62-65` vs `schema.sql:51-52`; skutek: INNER JOIN `db/reviews.ts:15-17` | **średnia** |
| **D-10** | Metryki mają wymiar `model` (`prd.md:83`), a architektura ma pozwalać na podmianę modelu (`prd.md:104`) | Zapisywana jest nazwa **providera**, nie zawsze identyfikator modelu — dla mocka literał `'mock'`. Sam kod przyznaje się do zlepienia obu pojęć w komentarzu | `api/generations.ts:25`; `provider.ts:10-11`; `mock.ts:11`; `openrouter.ts:18` | **niska** |
| **D-11** | FR-004 wiąże edycję ze zmianą oznaczenia na `ai-edited` (`prd.md:54`); FR-008 milczy o `source` przy edycji zapisanej fiszki (`prd.md:58`) | Edycja zapisanej fiszki nie rusza `source` — `ai-full` sprzed tygodnia pozostaje `ai-full` po przepisaniu treści. To **luka w modelu**, nie błąd kodu: dokument nie rozstrzyga, czy pochodzenie opisuje moment powstania, czy aktualny stan treści | `db/flashcards.ts:84-85` | **niska (do rozstrzygnięcia)** |
| **D-12** | R-05 wskazuje enumerację kont jako ryzyko o wysokim wpływie (`test-plan.md:20`) | Rejestracja zwraca 409 przy duplikacie e-maila, co potwierdza istnienie konta. Rozjazd jest **udokumentowany i zaakceptowany** w planie slice'a, ale mapa ryzyk tego nie odnotowuje — dwa dokumenty mówią co innego | `api/auth/register.ts:17` + `AGENTS.md:37` vs `test-plan.md:20`; akceptacja: `s01-auth/plan.md:40` | **niska (rozjazd dok–dok)** |
| **D-13** | Indeks `idx_sessions_expires` sugeruje sprzątanie wygasłych sesji (`schema.sql:62`) | Brak jakiegokolwiek zadania czyszczącego; wygasłe wiersze znikają wyłącznie leniwie, przy próbie użycia tokenu | `auth.ts:65-68`; brak innego `DELETE FROM sessions` poza `auth.ts:73` | **niska** |

---

## 5. Ranking refaktoru

Kryteria: **wartość** = jak rdzeniowy jest niezmiennik (sekcja 2) ×
**ryzyko** = jak słabo jest dziś egzekwowany (sekcja 3).

| Miejsce | Agregat | Wartość | Ryzyko | Uzasadnienie |
| --- | --- | --- | --- | --- |
| **#1** | **A-1 Generacja z bramką akceptacji** | maks. | maks. | Jedyny niezmiennik nazwany w PRD „regułą biznesową" (`prd.md:65-69`) i jedyny slice oznaczony jako north star (`roadmap.md:10-12`) jest dziś egzekwowany **wyłącznie w przeglądarce**. Cztery z sześciu jego niezmienników mają status *ignorowany* lub *deklarowany* (I-1.1, I-1.2, I-1.3, I-1.6), a piąty jest połowiczny (I-1.4). Rozjazdy D-01..D-05 to jeden i ten sam brak: **generacja nie ma po stronie serwera pamięci własnych propozycji**, więc „akceptacja" nie jest decyzją o czymś znanym, tylko przyjęciem dowolnej treści na słowo klienta |
| **#2** | **A-2 Fiszka + stan powtórek** | wysoka | średnie | Izolacja właściciela (I-2.6) i kaskada usunięcia (I-2.2) są egzekwowane wzorowo, ale dwa niezmienniki opierają się na dyscyplinie jednej funkcji: limity długości poza bazą (I-2.4 / D-08) i relacja 1:1 bez ograniczenia schematu (I-2.1 / D-09). Ryzyko jest odroczone — materializuje się przy pierwszej nowej ścieżce zapisu |
| **#3** | **A-3 Harmonogram powtórek** | wysoka | niskie | Wzorzec do naśladowania: czysta funkcja, wyrocznia w planie zamiast w kodzie (`s04-review/plan.md:11-16`), przeliczanie po stronie serwera, brak możliwości podania daty przez klienta. Do domknięcia zostają drobiazgi: clamp `ease` przy `good` (I-3.2) i kolejka wyspy ignorująca `due_at` (D-07) |
| **#4** | **A-4 Konto i sesja** | średnia (subdomena generyczna) | niskie | Wszystkie niezmienniki egzekwowane w bazie lub w jednym middleware; jedyne odstępstwo (409 przy rejestracji) jest świadome i zapisane. Refaktor nie kupuje tu przewagi produktowej |

### #1 do refaktoru: agregat **Generacja z bramką akceptacji** — dlaczego

Trzy powody, każdy wystarczający samodzielnie:

1. **Naruszony jest niezmiennik nazwany regułą biznesową.** `prd.md:67-69` stawia
   go na równi z sensem produktu, a `shape-notes.md:62` pokazuje, że alternatywę
   (autosave) odrzucono właśnie dlatego, że „podważa regułę biznesową (zaufanie do
   zestawu)". Dziś zaufanie do zestawu opiera się na tym, że przeglądarka
   zachowuje się grzecznie.
2. **To pojedyncza przyczyna pięciu rozjazdów.** D-01 (brak weryfikacji akceptacji),
   D-02 (obca generacja), D-03 (brak atomowości), D-04 (niedomknięte liczniki) i
   D-05 (metryki bez odczytu) znikają w większości, gdy generacja stanie się
   właścicielem swojego zbioru propozycji i jedynym miejscem, przez które fiszki AI
   mogą powstać.
3. **Blokuje pomiar sukcesu produktu.** Dopóki liczniki nie domykają się do
   `generated_count` (I-1.3), metryka „≥ 75 % akceptowalności" (`prd.md:33`) mierzy
   szum. Refaktor #1 jest warunkiem koniecznym, by w ogóle dało się odpowiedzieć na
   pytanie, czy produkt działa.

Kierunek (bez pisania kodu — do rozstrzygnięcia w kolejnym artefakcie): utrwalenie
zbioru propozycji przy generacji, wyprowadzanie flagi `edited` z porównania
z utrwaloną propozycją zamiast ufania klientowi, jedna transakcja obejmująca
wszystkie zaakceptowane fiszki wraz z aktualizacją liczników, weryfikacja
właściciela generacji przed zapisem oraz ścieżka odczytu obu metryk sukcesu.

### Otwarte pytania do decyzji produktowej

- **D-11:** czy `source` opisuje moment powstania fiszki, czy aktualny stan treści?
  Od odpowiedzi zależy, czy edycja zapisanej fiszki AI ma zmieniać oznaczenie —
  i jak liczyć metrykę #2 (`prd.md:34`).
- **„Zestaw"** (`prd.md:12,18`) jest w dokumentach obiektem zaufania, a w kodzie nie
  istnieje jako byt. Czy to celowe uproszczenie (zestaw = wszystkie fiszki
  użytkownika), czy przyszły agregat? Non-goal `prd.md:96` wyklucza tylko
  *współdzielenie* zestawów, nie ich istnienie.
- **D-12:** czy 409 przy rejestracji zostaje (`s01-auth/plan.md:40`), czy R-05
  (`test-plan.md:20`) wygrywa? Dziś dwa dokumenty foundation są niezgodne.
