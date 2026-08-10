---
title: Niezmiennik domenowy i agregat-strażnik — plan refaktoru bramki akceptacji
created: 2026-08-10
type: refactor-plan
---

# Niezmiennik domenowy i agregat-strażnik

> **To jest PLAN, nie implementacja.** Żaden plik produkcyjny nie został zmieniony
> podczas przygotowania tego dokumentu. Wszystkie cytaty `plik:linia` zweryfikowane
> przez otwarcie plików; wszystkie dowody zachowania runtime zebrane przez odpytanie
> zbudowanego serwera (`dist/server/entry.mjs`) na osobnej bazie roboczej poza repo.

---

## KROK 0 — Kontekst

### Dokumenty wymagań (znalezione)

Repozytorium nie ma `docs/` ani `prd.md` w rootcie — kontrakty żyją w `context/`,
zgodnie z `AGENTS.md:5`:

| Dokument | Rola dla tej analizy |
| --- | --- |
| `context/foundation/prd.md` | FR-001..FR-013, user stories, **reguła biznesowa** (§6, linie 65–73), kryteria sukcesu (linie 31–35) |
| `context/foundation/shape-notes.md` | zapis decyzji + **wyzwania sokratejskie** (linie 60–63) — czemu odrzucono alternatywy |
| `context/foundation/tech-stack.md` | stack i uzasadnienie warstw |
| `context/foundation/roadmap.md` | S-02 jako **north star slice** (linie 11–12, 33–37) |
| `context/foundation/test-plan.md` | mapa ryzyk R-01..R-06, w tym **R-03 = ryzyko złamania bramki akceptacji** (linia 18) |
| `context/changes/s02-generate/plan.md` | kontrakty endpointów generacji i zapisu zbiorczego (linie 24–32, 41–45) |
| `context/changes/s04-review/plan.md` | wyrocznia reguł SM-2 (linie 9–16) |
| `AGENTS.md` | konwencje niewywnioskowalne z kodu (baza, izolacja, AI, walidacja, kody API, testy) |

### Stack i warstwy, w których żyje logika biznesowa

Astro 7 (SSR, adapter node) + React 19 (wyspy) + TypeScript + `node:sqlite`
(`context/foundation/tech-stack.md:22–33`, `package.json:22–32`).

| Warstwa | Pliki | Co dziś zawiera z logiki biznesowej |
| --- | --- | --- |
| UI (klient) | `src/components/GenerateView.tsx`, `CardList.tsx`, `ReviewSession.tsx` | **stan bramki akceptacji**, decyzja o pochodzeniu fiszki, licznik odrzuconych, kolejka powtórek |
| Strony/route'y | `src/pages/api/**` | parsowanie wejścia, walidacja limitów, mapowanie na kody HTTP, **oraz reguły domenowe wplecione w handler** (`saveAcceptedBatch`) |
| „Serwis" | *nie istnieje* | — |
| Domena | `src/lib/srs.ts` (jedyna czysta funkcja domenowa), `src/lib/validation.ts` | SM-2, limity długości |
| Persystencja | `src/db/*.ts` + `src/db/schema.sql` | SQL, izolacja `WHERE user_id = ?`, transakcja per-fiszka |
| Przekrojowo | `src/middleware.ts` | sesja i ochrona dostępu |

**Obserwacja strukturalna:** projekt ma warstwę persystencji i warstwę HTTP, ale
**nie ma warstwy domenowej dla generacji**. Jedyny byt domenowy z własnym modułem
to `schedule()` w `src/lib/srs.ts`. Wszystko, co dotyczy bramki akceptacji, jest
rozdzielone między funkcję pomocniczą w route'cie (`saveAcceptedBatch`,
`src/pages/api/flashcards.ts:48–88`) a stan komponentu React.

---

## KROK 1 — Identyfikacja niezmienników

Reguły, które w tej domenie **muszą być zawsze prawdziwe**. Każda z cytatem źródła
(dokument lub kod).

| ID | Niezmiennik | Źródło (dokument) | Źródło (kod / brak kodu) |
| --- | --- | --- | --- |
| **I-01** | Fiszka o pochodzeniu `ai-full`/`ai-edited` powstaje **wyłącznie** z propozycji wygenerowanej dla tego użytkownika i **wyłącznie** po jego jawnej akceptacji tej konkretnej propozycji | `prd.md:67–69` („Żadna fiszka nie trafia do zestawu użytkownika bez jego jawnej akceptacji"), `prd.md:42` (US-004), `prd.md:55` (FR-005), `shape-notes.md:50`, `shape-notes.md:62` (autosave **odrzucony** jako podważający regułę) | brak egzekucji serwerowej; „egzekwuje" `GenerateView.tsx:85–91` |
| **I-02** | Oznaczenie pochodzenia jest **funkcją faktu**, nie deklaracją: `ai-edited` ⟺ treść różni się od propozycji, inaczej `ai-full` | `prd.md:54` (FR-004: „edycja zmienia oznaczenie na `ai-edited`"), `s02-generate/plan.md:44` | klient wysyła boolean `edited` (`GenerateView.tsx:89–90`), serwer go przepisuje bez weryfikacji (`api/flashcards.ts:66`, `:75`) |
| **I-03** | Propozycje nie są fiszkami użytkownika — po samej generacji w bazie przybywa **0 fiszek** | `prd.md:53` („propozycje istnieją tylko w widoku przeglądu"), `shape-notes.md:48`, `s02-generate/plan.md:43` | egzekwowane **przez nieobecność zapisu**: `api/generations.ts:24–30` zapisuje tylko metryki |
| **I-04** | Zapis zbiorczy jest **atomowy**: albo powstają wszystkie zaakceptowane fiszki wraz ze stanem powtórek i licznikami, albo żadna | `prd.md:55` („Zapis **zbiorczy**"), `s02-generate/plan.md:29–32` | brak jednej transakcji: pętla N osobnych transakcji (`api/flashcards.ts:71–78` × `db/flashcards.ts:54–74`) + osobny UPDATE (`:81–85`) |
| **I-05** | Liczniki generacji domykają się: `generated = accepted_unedited + accepted_edited + rejected`, wszystkie ≥ 0 | `prd.md:61` (FR-011), `prd.md:33` (metryka sukcesu liczona **z tej tabeli**) | brak jakiejkolwiek weryfikacji; `rejected` przychodzi od klienta (`api/flashcards.ts:69`) |
| **I-06** | Bramka akceptacji dla danej generacji domyka się **dokładnie raz** (wynik przeglądu jest ostateczny) | wynika z `prd.md:55` + `prd.md:33` (metryka byłaby niepoliczalna przy wielokrotnym domknięciu) — **nigdzie nie zapisane wprost** | brak: `updateGenerationCounts` nadpisuje (`db/generations.ts:26–30`), brak kolumny „zamknięte" w `schema.sql:17–28` |
| **I-07** | Każda operacja dotyczy wyłącznie zasobów właściciela; cudzy zasób nieodróżnialny od nieistniejącego (404) | `prd.md:63` (FR-013), `prd.md:47` (US-009), `AGENTS.md:27–30` | egzekwowane na odczycie/edycji/usunięciu (`db/flashcards.ts:39`, `:86`, `:94`; `db/reviews.ts:17`, `:30`); **dziura na zapisie**: `generation_id` cudzej generacji przechodzi (`api/flashcards.ts:76`) |
| **I-08** | Termin kolejnej powtórki wyznacza algorytm z oceny — nie użytkownik | `prd.md:67–69`, `prd.md:60` (FR-010), `shape-notes.md:63` (ręczny wybór **odrzucony**) | data liczona serwerowo z `new Date()` (`api/reviews.ts:26`) przez czystą funkcję (`lib/srs.ts:40–84`) — **egzekwowane** |
| **I-09** | Do sesji powtórek wchodzą wyłącznie fiszki `due_at ≤ teraz`, od najdawniej wymagalnych | `prd.md:60` (FR-010), `s04-review/plan.md:3–5` | egzekwowane na **odczycie** (`db/reviews.ts:16–18`); brak sprawdzenia „due" na **zapisie oceny** (`db/reviews.ts:26–35`) |
| **I-10** | Każda fiszka ma dokładnie jeden stan powtórek (1:1) | `prd.md:82`, `shape-notes.md:91` | egzekwowane: PK + kaskada (`schema.sql:51–52`) i jedyny konstruktor (`db/flashcards.ts:49–75`) |
| **I-11** | Limity domenowe: tekst 1000–10000, przód ≤ 200, tył ≤ 500 | `prd.md:53`, `prd.md:56`, `AGENTS.md:34–35` | egzekwowane serwerowo we wszystkich trzech ścieżkach zapisu (`api/generations.ts:16–17`, `api/flashcards.ts:35–36` i `:64–65`, `api/flashcards/[id].ts:21–22`) |
| **I-12** | Hasło nigdy nie jest persystowane w jawnej postaci | `prd.md:51` (FR-001) | egzekwowane: `lib/auth.ts:12–16`, `:31–33` |

---

## KROK 2 — Klasyfikacja i wybór #1

Trzy osie oceny:

- **(a) Rdzeniowość** — jak blisko sensu produktu (wizja `prd.md:7–19`, reguła biznesowa `prd.md:65–73`).
- **(b) Rozsmarowanie** — w ilu plikach i warstwach reguła dziś żyje.
- **(c) Egzekucja** — `EGZEKWOWANY` / `DEKLAROWANY` (opisany, ale nikt nie sprawdza) / `NARUSZALNY` (da się złamać zwykłym żądaniem HTTP).

| ID | (a) Rdzeniowość | (b) Rozsmarowanie | (c) Egzekucja |
| --- | --- | --- | --- |
| **I-01** | **maksymalna** — to dosłownie zdanie z `prd.md:67–69`; S-02 to north star slice (`roadmap.md:11–12`) | **6 plików / 4 warstwy**: `GenerateView.tsx`, `api/flashcards.ts`, `db/flashcards.ts`, `db/generations.ts`, `schema.sql`, `e2e/core-flow.spec.ts` | **NARUSZALNY** (dowód niżej) |
| I-02 | wysoka (metryka `prd.md:33` liczy „w tym po edycji") | 3 pliki | **NARUSZALNY** — flaga klienta |
| I-03 | wysoka | 2 pliki | EGZEKWOWANY (przez nieobecność kodu zapisu) |
| I-04 | średnia | 2 pliki | **DEKLAROWANY** — „zbiorczy" w planie, brak transakcji obejmującej całość |
| I-05 | wysoka (bez tego kryteria sukcesu są niemierzalne) | 2 pliki | **NARUSZALNY** |
| I-06 | średnia | 2 pliki | **nieistniejący jako reguła** — nigdzie nie zapisany |
| I-07 | wysoka (R-01, `test-plan.md:16`) | 5 plików | EGZEKWOWANY na odczycie/edycji, **NARUSZALNY** na zapisie `generation_id` |
| I-08 | **maksymalna** — druga połowa reguły z `prd.md:67–69` | 3 pliki | **EGZEKWOWANY** (serwerowy `new Date()` + czysta funkcja + testy) |
| I-09 | wysoka | 3 pliki | EGZEKWOWANY na odczycie, **NARUSZALNY** na zapisie oceny |
| I-10 | średnia | 2 pliki | EGZEKWOWANY (schemat) |
| I-11 | średnia | 4 pliki | EGZEKWOWANY |
| I-12 | wysoka | 1 plik | EGZEKWOWANY |

### Wybór #1: **I-01 — bramka akceptacji**

(z I-02, I-05, I-06 jako regułami podrzędnymi tego samego niezmiennika i I-04, I-07
jako jego szkodami ubocznymi)

**Uzasadnienie — jednocześnie najbardziej rdzeniowy i najsłabiej egzekwowany:**

1. **Rdzeniowość.** Reguła biznesowa produktu ma dwie połowy (`prd.md:67–69`):
   bramkę akceptacji i harmonogram powtórek. To one — wprost — odróżniają produkt
   od „pustego CRUD-a" (`prd.md:71–73`, `shape-notes.md:83–85`). Wartość produktu
   to zdanie z wizji: „Zestaw jest jego — **bo każdą fiszkę jawnie zaakceptował**"
   (`prd.md:12`). Bramka akceptacji **jest** tą wartością.
2. **Asymetria egzekucji między połowami.** Druga połowa (I-08, harmonogram) jest
   solidnie zabezpieczona: czysta funkcja (`lib/srs.ts`), data z zegara serwera
   (`api/reviews.ts:26`), wyrocznia reguł w planie (`s04-review/plan.md:9–16`) i
   testy jednostkowe. Pierwsza połowa nie ma **ani jednej** linii egzekucji po
   stronie serwera. Wybieramy tę, która ma to samo znaczenie i zero ochrony.
3. **Niemożność egzekucji z definicji.** Serwer **nie może** dziś zweryfikować
   akceptacji, bo nie pamięta, co zaproponował — I-03 („propozycje nie są
   zapisywane") sprawia, że jedynym posiadaczem prawdy jest przeglądarka. To nie
   jest zaniedbanie implementacyjne, tylko **luka projektowa**: brakuje bytu, który
   trzymałby stan przeglądu. To dokładnie sytuacja, w której odpowiedzią jest agregat.
4. **Plan testów już wie o ryzyku, ale go nie pokrywa.** R-03 (`test-plan.md:18`)
   opisuje dokładnie to ryzyko; jego jedyne pokrycie to szczęśliwa ścieżka E2E przez
   UI (`test-plan.md:53`, `e2e/core-flow.spec.ts:36–42`) — czyli test przechodzący
   przez tego samego strażnika, którego chcemy sprawdzić.

**Sformułowanie niezmiennika #1 (wersja do rejestru kontraktów):**

> Fiszka o pochodzeniu `ai-full` lub `ai-edited` może powstać wyłącznie jako wynik
> domknięcia bramki akceptacji dokładnie jednej generacji należącej do tego samego
> użytkownika; jej treść to dokładnie treść propozycji (`ai-full`) albo jej wersja
> zmieniona przez użytkownika (`ai-edited`); pochodzenie wynika z porównania treści,
> nie z deklaracji; bramka domyka się raz, atomowo, a liczniki generacji domykają
> się do liczby wygenerowanych propozycji.

---

## KROK 3 — Diagnoza niezmiennika #1

### 3.1 Gdzie dziś żyje reguła — warstwa po warstwie

**Warstwa UI (jedyny realny strażnik).**

`src/components/GenerateView.tsx:6` definiuje cały słownik stanu bramki po stronie
klienta: `type ProposalStatus = 'pending' | 'accepted' | 'edited' | 'rejected'`.
Propozycje żyją w `useState` (`:18`) i nigdzie indziej. Decyzje zapadają w
`:227` (Akceptuj), `:214–217` (Edytuj → status `edited`), `:241` (Odrzuć).
Wynik przeglądu jest **składany na kliencie** (`:85–92`):

```ts
// GenerateView.tsx:85-92
const accepted = proposals
  .filter((p) => p.status === 'accepted' || p.status === 'edited')
  .map((p) =>
    p.status === 'edited'
      ? { front: p.editedFront, back: p.editedBack, edited: true }
      : { front: p.front, back: p.back, edited: false },
  );
const rejectedCount = proposals.filter((p) => p.status === 'rejected').length;
```

Dwa problemy widoczne wprost w tym fragmencie:

- pole `edited` to **deklaracja klienta**, nie fakt (łamie I-02); status `edited`
  ustawia się po kliknięciu „Zapisz zmiany" (`:214–217`) **także wtedy, gdy treść
  się nie zmieniła**;
- `rejectedCount` liczy **tylko jawnie odrzucone**; propozycje pozostawione w
  statusie `pending` nie trafiają nigdzie — stąd systemowe rozjeżdżanie się I-05
  (`generated ≠ accepted + rejected`) już w szczęśliwej ścieżce UI.

Blokada „Zapisz zaakceptowane" przy zerze akceptacji (`:255`, `disabled={acceptedCount === 0 || saving}`)
to kolejna reguła domenowa mieszkająca wyłącznie w atrybucie przycisku.

**Warstwa API (przepisuje wejście klienta do bazy).**

`src/pages/api/flashcards.ts:25–26` rozpoznaje tryb batch po **kształcie ciała
żądania** (obecność `generationId: number` i `accepted: []`), po czym oddaje
sterowanie funkcji `saveAcceptedBatch` (`:48–88`). Ta funkcja jest dziś całą
„domeną" bramki akceptacji. Co sprawdza, a czego nie:

| Sprawdzane | Niesprawdzane |
| --- | --- |
| typ pól `front`/`back` (`:61–63`) | czy `generationId` **należy do użytkownika** |
| limity długości (`:64–65`) | czy `generationId` w ogóle istnieje |
| — | czy przysłana treść odpowiada **jakiejkolwiek** propozycji tej generacji |
| — | czy liczba zaakceptowanych ≤ `generated_count` |
| — | czy `rejectedCount` jest nieujemny i domyka sumę |
| — | czy bramka tej generacji nie została już domknięta |

Pochodzenie ustala jedna linia, wprost z flagi klienta:

```ts
// api/flashcards.ts:75
source: item.edited ? 'ai-edited' : 'ai-full',
```

**Warstwa persystencji.**

`src/db/flashcards.ts:49–75` — `createFlashcard` otwiera **własną** transakcję
(`:54 db.exec('BEGIN')`) na każdą pojedynczą fiszkę i tworzy przy okazji
`review_state` z `due_at = teraz` (`:62–65`). `src/db/generations.ts:19–32` —
`updateGenerationCounts` **nadpisuje** liczniki (`:27 SET accepted_unedited_count = ?, ...`)
i zwraca `boolean` sygnalizujący, czy trafiono we własny wiersz (`:31`).
`src/db/schema.sql:44` trzyma jedyną realnie egzekwowaną część reguły —
`CHECK (source IN ('ai-full', 'ai-edited', 'manual'))` — czyli pilnuje, że wartość
jest z właściwego zbioru, ale nie że jest **prawdziwa**.

### 3.2 Który błąd jest „połykany" zamiast zatrzymywać operację

To najostrzejszy punkt diagnozy. `updateGenerationCounts` zwraca `boolean`,
a wywołanie **ignoruje wynik**:

```ts
// api/flashcards.ts:80-87
const acceptedEdited = items.filter((item) => item.edited).length;
updateGenerationCounts(userId, generationId, {   // <-- zwraca boolean; wynik porzucony
  acceptedUnedited: items.length - acceptedEdited,
  acceptedEdited,
  rejected,
});

return jsonResponse({ saved: items.length }, 201);
```

Komentarz w repozytorium (`db/generations.ts:18`) mówi wprost: *„false gdy generacja
nie istnieje lub nie należy do użytkownika"*. Ten sygnał jest produkowany i
wyrzucany. Skutek: żądanie z **cudzym** `generationId` przechodzi jako `201 Created`,
fiszki powstają, a jedyna informacja o niespójności ginie. To wzorzec
„loguj-i-jedź dalej" w wersji jeszcze słabszej — bez logu.

### 3.3 Dowody z uruchomienia (zweryfikowane, nie hipotetyczne)

Serwer produkcyjny (`dist/server/entry.mjs`, `MOCK_AI=1`) na świeżej bazie poza repo,
żądania HTTP z ciasteczkiem sesji zwykłego użytkownika:

| # | Żądanie | Wynik | Złamany niezmiennik |
| --- | --- | --- | --- |
| P1 | użytkownik **B** wysyła `POST /api/flashcards` z `generationId` należącym do **A** | `201 {"saved":1}`; w bazie `flashcards(id=1, user_id=2, source='ai-full', generation_id=1)` — wiersz B wskazuje na generację A | **I-07**, I-01 |
| P2 | **A** wysyła treść, która nigdy nie była propozycją (`front: "NIGDY-NIE-PROPONOWANA"`), `edited:false` | `201`; w bazie `source='ai-full'` | **I-01, I-02** |
| P3 | `generationId: 999999` (nie istnieje) | **`500`, `content-type: null`, puste ciało** — wyjątek FK wycieka z handlera | konwencja API (`AGENTS.md:36–38`: każdy błąd to JSON `{error}`) |
| P4 | batch z jedną pozycją przekraczającą limit 200 znaków | `400`, zero zapisów — walidacja z góry (`api/flashcards.ts:54–67`) działa | I-11 ✅ |
| P5 | `rejectedCount: -999` | `201`; w bazie `rejected_count = -999` | **I-05** |
| P6 | dwa kolejne zapisy na ten sam `generationId` (3 akceptacje + 2 odrzucenia, potem 1 akceptacja) | `201` oba razy; w bazie **4 fiszki** z `generation_id=2`, ale liczniki po nadpisaniu: `generated=5, accepted_unedited=0, accepted_edited=1, rejected=0` | **I-06, I-05, I-04** |

**Konsekwencja dla kryteriów sukcesu.** Metryka „≥ 75% propozycji zaakceptowane"
jest zdefiniowana jako `(accepted_unedited + accepted_edited) / generated` z tabeli
`generations` (`prd.md:33`). Po P6 ta sama generacja raportuje 1/5 = 20% akceptacji,
podczas gdy realnie powstały z niej 4 fiszki. **Miernik sukcesu produktu jest dziś
liczbą wpisywaną przez klienta i podatną na nadpisanie.**

### 3.4 Podsumowanie diagnozy

| Warstwa | Status wobec I-01 |
| --- | --- |
| UI (`GenerateView.tsx`) | **jedyny strażnik**; trzyma stan przeglądu, ustala pochodzenie, liczy odrzucenia |
| API (`api/flashcards.ts`) | egzekwuje wyłącznie typy i limity; regułę domenową **przepisuje** z wejścia |
| Domena | **nie istnieje** dla tego obszaru |
| Persystencja (`db/*.ts`) | egzekwuje izolację na odczycie i zbiór wartości `source`; nie zna reguły |
| Schemat (`schema.sql`) | `CHECK` na zbiorze wartości; FK `generation_id` **bez powiązania z właścicielem** (`:45`) |

Jedno zdanie: **reguła, która definiuje produkt, jest dziś egzekwowana przez
komponent React, a serwer nie ma nawet danych, żeby ją sprawdzić.**

---

## KROK 4 — Projekt agregatu-strażnika

### 4.1 Granica agregatu

Granicą agregatu jest granica niezmiennika. I-01 wiąże w jedną całość: generację,
jej propozycje, decyzje użytkownika, powstałe fiszki i liczniki. To jest jedna
jednostka spójności → **jeden agregat**.

**Root: `GenerationReview`** — „przegląd generacji", tożsamość = `GenerationId`,
właściciel = `UserId`.

```
GenerationReview (AR)              ── tożsamość: GenerationId, właściciel: UserId
├── Proposal[] (encja)             ── tożsamość lokalna: ordinal (0..n-1)
│   ├── original: CardContent      ── to, co zaproponowało AI (niezmienne)
│   ├── status: pending|accepted|rejected
│   └── decided: CardContent | null
├── metadata: model, sourceTextLength, durationMs, generatedCount
└── closedAt: Date | null          ── domknięcie bramki (I-06)
```

**Poza agregatem** (osobne agregaty, powiązane przez id):
`StudyCard` (fiszka + jej stan powtórek, 1:1 — I-10, I-08, I-09) oraz `UserAccount`.
`GenerationReview.decide()` **produkuje opis** fiszek do utworzenia, ale nie jest
ich właścicielem cyklu życia — fiszkę można potem edytować i usunąć niezależnie
(FR-008, FR-009), więc trzymanie jej wewnątrz tego agregatu byłoby błędem granicy.

### 4.2 Decyzja projektowa, która odblokowuje egzekucję (i jej koszt)

Serwer nie może dziś sprawdzić akceptacji, bo nie pamięta propozycji. Trzeba to
zmienić — i trzeba to zrobić jawnie, bo dotyka zapisu w `prd.md:53`.

**Wariant A (rekomendowany) — propozycje persystowane jako kandydaci.**
Nowa tabela `generation_proposals` (dodatek zgodny z `AGENTS.md:23–25`: wyłącznie
`CREATE TABLE IF NOT EXISTS`, zero migracji destrukcyjnych). Propozycje **nie są
fiszkami**: nie mają `review_state`, nie pojawiają się w `listFlashcards` ani
`listDue`, znikają z UI po domknięciu bramki.

- **Zgodność z I-03:** `shape-notes.md:48` mówi „propozycje NIE są zapisywane
  **jako fiszki użytkownika**" — wariant A tego nie łamie. Łamie natomiast
  dosłowne brzmienie `prd.md:53` („propozycje istnieją tylko w widoku przeglądu").
  **To wymaga zmiany PRD** — patrz Faza 0. Zgodnie z `AGENTS.md:41–43` zmiana
  reguły idzie najpierw do dokumentu, potem do kodu.
- **Zysk:** agregat da się załadować i sprawdzić; liczniki są **wyprowadzane**,
  nie przyjmowane; ochrona przed powtórnym domknięciem jest darmowa; ryzyko R-03
  dostaje pokrycie inne niż E2E przez UI.

**Wariant B (rozważony i odrzucony) — propozycje podpisane HMAC.**
Serwer zwraca token HMAC nad `(generationId, userId, ordinal, front, back)`, klient
go odsyła, serwer weryfikuje podpis i wyprowadza pochodzenie z porównania.
Zachowuje literę `prd.md:53`. **Odrzucony**, bo: (1) wymaga nowego sekretu w env,
a `tech-stack.md:32` chwali się CI bez sekretów; (2) nie chroni przed powtórnym
domknięciem bez i tak jakiegoś stanu serwerowego; (3) koncepcyjnie to przechowywanie
stanu agregatu u klienta — czyli dokładnie problem, który usuwamy.

### 4.3 Typy i metody domenowe (`src/domain/`)

```ts
// src/domain/errors.ts
export abstract class DomainError extends Error {
  abstract readonly code: string;          // stabilny identyfikator do mapowania HTTP
}
export class InvalidCardContent      extends DomainError { readonly code = 'invalid_card_content'; }
export class UnknownProposal         extends DomainError { readonly code = 'unknown_proposal'; }
export class DuplicateDecision       extends DomainError { readonly code = 'duplicate_decision'; }
export class IncompleteReview        extends DomainError { readonly code = 'incomplete_review'; }
export class GenerationAlreadyClosed extends DomainError { readonly code = 'generation_closed'; }
```

```ts
// src/domain/card-content.ts  — Value Object
export class CardContent {
  private constructor(readonly front: string, readonly back: string) {}

  /** Jedyny konstruktor. Limity z src/lib/validation.ts — bez duplikowania literałów. */
  static of(front: unknown, back: unknown): CardContent {
    if (typeof front !== 'string' || typeof back !== 'string')
      throw new InvalidCardContent('Nieprawidłowe dane wejściowe.');
    const message = validateCardContent(front, back);   // istniejąca funkcja
    if (message) throw new InvalidCardContent(message);
    return new CardContent(front, back);
  }

  /** Wyrocznia porównania (do zapisania w planie zmiany): równość po trim(). */
  equals(other: CardContent): boolean {
    return this.front.trim() === other.front.trim() && this.back.trim() === other.back.trim();
  }
}
```

```ts
// src/domain/generation-review.ts  — AGGREGATE ROOT
export type Provenance = 'ai-full' | 'ai-edited';

export interface ProposalDecision {
  ordinal: number;
  accepted: boolean;
  content?: unknown;                       // { front, back } — obecne tylko gdy accepted
}

export interface AcceptedCard {
  ordinal: number;
  content: CardContent;
  provenance: Provenance;                  // WYPROWADZONE, nigdy z wejścia
}

export interface ReviewCounts {
  generated: number;
  acceptedUnedited: number;
  acceptedEdited: number;
  rejected: number;
}

export class GenerationReview {
  private constructor(
    readonly id: GenerationId | null,       // null dopóki nie zapisany
    readonly ownerId: UserId,
    readonly model: string,
    readonly sourceTextLength: number,
    readonly durationMs: number,
    private readonly proposals: Proposal[],
    private closedAt: Date | null,
  ) {}

  static open(...): GenerationReview;                                  // po udanej generacji
  static rehydrate(...): GenerationReview;                             // wyłącznie dla repozytorium

  decide(decisions: ProposalDecision[], now: Date): AcceptedCard[];     // JEDYNE wejście bramki
  get counts(): ReviewCounts;
  get isClosed(): boolean;
  get proposalsForClient(): { ordinal: number; front: string; back: string }[];
}
```

**Pseudokod `decide()` — preconditions najpierw, fail-fast, zero częściowej mutacji:**

```ts
decide(decisions: ProposalDecision[], now: Date): AcceptedCard[] {
  // P1 — bramka domyka się dokładnie raz (I-06)
  if (this.closedAt !== null)
    throw new GenerationAlreadyClosed(`Bramka akceptacji generacji ${this.id} jest już zamknięta.`);

  // P2 — komplet decyzji: nic nie może zostać "pending" (I-05: generated = accepted + rejected)
  if (decisions.length !== this.proposals.length)
    throw new IncompleteReview(
      `Oczekiwano decyzji dla ${this.proposals.length} propozycji, otrzymano ${decisions.length}.`);

  const seen = new Set<number>();
  const accepted: AcceptedCard[] = [];

  // Faza walidacji — buduje wynik do zmiennych lokalnych, NIE dotyka stanu agregatu.
  for (const d of decisions) {
    // P3 — ordinal musi należeć do TEJ generacji (I-01)
    const proposal = this.proposals[d.ordinal];
    if (!proposal) throw new UnknownProposal(`Propozycja ${d.ordinal} nie należy do tej generacji.`);

    // P4 — jedna decyzja na propozycję
    if (seen.has(d.ordinal)) throw new DuplicateDecision(`Zduplikowana decyzja dla propozycji ${d.ordinal}.`);
    seen.add(d.ordinal);

    if (!d.accepted) continue;

    // P5 — treść przechodzi przez VO (rzuca InvalidCardContent) — I-11
    const content = CardContent.of((d.content as any)?.front, (d.content as any)?.back);

    // I-02 — pochodzenie WYPROWADZONE z porównania, flaga klienta nie istnieje w kontrakcie
    accepted.push({
      ordinal: d.ordinal,
      content,
      provenance: content.equals(proposal.original) ? 'ai-full' : 'ai-edited',
    });
  }

  // Faza mutacji — dopiero po przejściu WSZYSTKICH preconditions.
  for (const d of decisions) this.proposals[d.ordinal].markDecided(d.accepted, ...);
  this.closedAt = now;
  return accepted;   // zero akceptacji jest legalne: wszystko odrzucone to też wynik przeglądu
}

get counts(): ReviewCounts {
  const c = {
    generated: this.proposals.length,
    acceptedUnedited: this.proposals.filter(p => p.provenance === 'ai-full').length,
    acceptedEdited:   this.proposals.filter(p => p.provenance === 'ai-edited').length,
    rejected:         this.proposals.filter(p => p.status === 'rejected').length,
  };
  // I-05 jako asercja wewnętrzna — liczniki są wyprowadzane, nigdy przyjmowane z zewnątrz.
  assert(c.acceptedUnedited + c.acceptedEdited + c.rejected === c.generated);
  return c;
}
```

**Co znika z kontraktu wejściowego:** pola `edited` i `rejectedCount`. Nie są
walidowane — są **usunięte**. Klient nie ma już czym skłamać.

**Zmiany zachowania warte świadomej decyzji (do zatwierdzenia w Fazie 0):**

1. Zapis z zerem akceptacji staje się **legalny** (dziś blokowany przyciskiem,
   `GenerateView.tsx:255`). „Odrzuciłem wszystko" to prawdziwy wynik przeglądu i
   powinien trafić do metryki (`prd.md:33`), zamiast zostawiać generację z zerami.
2. Klient musi przysłać decyzję dla **każdej** propozycji. Pozostawienie propozycji
   bez decyzji przestaje być cichym odrzuceniem.

### 4.4 Repozytorium agregatu

Zastępuje rozproszone zapytania jednym miejscem ładowania i zapisu.

```ts
// src/db/generation-review-repo.ts
export function insertOpenReview(review: GenerationReview): GenerationId;
export function loadGenerationReview(userId: number, generationId: number): GenerationReview | undefined;
export function saveDecidedReview(review: GenerationReview, accepted: AcceptedCard[]): number;
```

- `loadGenerationReview` ładuje **po parze `(userId, generationId)`** — cudzy agregat
  jest nieładowalny, więc I-07 przestaje zależeć od pamiętliwości autora endpointu.
  Brak wiersza → `undefined` → route mapuje na 404 (`AGENTS.md:27–30`).
- `saveDecidedReview` wykonuje **całość w JEDNEJ transakcji** (I-04):

```
BEGIN
  for each acceptedCard:
      INSERT INTO flashcards (user_id, front, back, source, generation_id) ...
      INSERT INTO review_state (flashcard_id, due_at = now, 0, 2.5, 0, 0)
  UPDATE generation_proposals SET status, decided_front, decided_back WHERE generation_id = ?
  UPDATE generations
     SET accepted_unedited_count = ?, accepted_edited_count = ?, rejected_count = ?,
         closed_at = ?
   WHERE id = ? AND user_id = ? AND closed_at IS NULL     -- I-06 także na poziomie SQL
  if changes === 0 -> ROLLBACK, throw GenerationAlreadyClosed
COMMIT                        -- każdy wyjątek po drodze -> ROLLBACK i przerzucenie w górę
```

**Zweryfikowane ograniczenie techniczne:** `node:sqlite` nie obsługuje zagnieżdżonych
transakcji — `BEGIN` wewnątrz `BEGIN` rzuca `cannot start a transaction within a
transaction` (sprawdzone). Dzisiejszy `createFlashcard` otwiera własną transakcję
(`db/flashcards.ts:54`), więc **nie da się go wywołać wewnątrz transakcji agregatu**.
Wymagany rozdział:

```ts
// src/db/flashcards.ts — po refaktorze
function insertFlashcardWithReviewState(db, userId, data): Flashcard;   // BEZ transakcji
export function createFlashcard(userId, data): Flashcard {              // ścieżka manualna
  return withTransaction((db) => insertFlashcardWithReviewState(db, userId, data));
}
// src/db/index.ts
export function withTransaction<T>(fn: (db: DatabaseSync) => T): T;     // BEGIN/COMMIT/ROLLBACK
```
(`SAVEPOINT` działa i jest alternatywą, gdyby zagnieżdżenie okazało się potrzebne —
zweryfikowane.)

### 4.5 Cienki route

Batch znika z `POST /api/flashcards` (`api/flashcards.ts:25–26`, `:48–88`) — ten
endpoint zostaje **wyłącznie** manualny (FR-006). Bramka dostaje własny zasób,
bo modyfikowanym bytem jest przegląd generacji, nie kolekcja fiszek:

```ts
// src/pages/api/generations/[id]/decisions.ts
export const POST: APIRoute = async ({ params, request, locals }) => {
  const userId = locals.user!.id;
  const id = Number(params.id);
  if (Number.isNaN(id)) return errorResponse(NOT_FOUND, 404);

  // 1) parse wejścia (bez reguł domenowych)
  const body = await readJsonBody(request);
  if (!body || !Array.isArray(body.decisions)) return errorResponse('Nieprawidłowe dane wejściowe.', 400);

  // 2) załaduj agregat — cudzy/nieistniejący jest nieodróżnialny (FR-013)
  const review = loadGenerationReview(userId, id);
  if (!review) return errorResponse(NOT_FOUND, 404);

  // 3) metoda agregatu + zapis w jednej transakcji
  try {
    const accepted = review.decide(body.decisions as ProposalDecision[], new Date());
    const saved = saveDecidedReview(review, accepted);
    return jsonResponse({ saved, counts: review.counts }, 201);
  } catch (err) {
    return domainErrorResponse(err);   // 4) mapowanie błędu domenowego
  }
};
```

```ts
// src/lib/http.ts — dodatek
const DOMAIN_ERROR_STATUS: Record<string, number> = {
  invalid_card_content: 400,
  unknown_proposal:     400,
  duplicate_decision:   400,
  incomplete_review:    400,
  generation_closed:    409,      // AGENTS.md:37 — 409 = konflikt
};

export function domainErrorResponse(err: unknown): Response {
  if (err instanceof DomainError)
    return errorResponse(err.message, DOMAIN_ERROR_STATUS[err.code] ?? 400);
  // Naprawia P3: żaden błąd nie wychodzi już jako gołe 500 bez JSON-a.
  return errorResponse('Wystąpił nieoczekiwany błąd.', 500);
}
```

**Przeniesienie egzekucji z klienta na serwer.** `GenerateView.tsx` przestaje być
strażnikiem i staje się formularzem: renderuje `{ordinal, front, back}` z serwera,
zbiera decyzje i wysyła **komplet** `decisions`. Nie liczy `rejectedCount`, nie
ustala `edited`, nie decyduje o pochodzeniu. Stany `accepted|edited` w typie
`ProposalStatus` (`GenerateView.tsx:6`) redukują się do `accepted` + zmieniona treść —
serwer sam zobaczy, czy się różni.

---

## KROK 5 — Before/after, plan, testy

### 5.1 Before / after dla każdego dzisiejszego miejsca reguły

| Miejsce dziś | Before | After |
| --- | --- | --- |
| `GenerateView.tsx:6` | `ProposalStatus` z `'edited'` jako osobnym stanem | `'accepted' \| 'rejected' \| 'pending'`; edycja to zmiana treści, nie status |
| `GenerateView.tsx:18` | propozycje wyłącznie w `useState` — jedyna kopia prawdy | `useState` to kopia robocza; prawda w `generation_proposals` |
| `GenerateView.tsx:85–91` | klient składa `accepted[]` i ustala `edited` | klient wysyła `decisions[]` dla **wszystkich** ordinali; brak pola `edited` |
| `GenerateView.tsx:92` | klient liczy `rejectedCount` | pole usunięte z kontraktu; licznik wyprowadza agregat |
| `GenerateView.tsx:255` | przycisk blokowany przy 0 akceptacji (reguła w atrybucie) | zapis 0 akceptacji legalny; blokada zostaje wyłącznie jako UX, nie jako reguła |
| `api/flashcards.ts:25–26` | tryb batch rozpoznawany po kształcie JSON-a | usunięte; endpoint wyłącznie manualny (FR-006) |
| `api/flashcards.ts:48–88` | `saveAcceptedBatch` — de facto warstwa domenowa w route'cie | usunięte; zastąpione `GenerationReview.decide()` |
| `api/flashcards.ts:66` | `edited: edited === true` — deklaracja klienta | brak takiego pola |
| `api/flashcards.ts:69` | `rejected` z wejścia, bez ograniczeń | wyprowadzone z decyzji, zawsze ≥ 0 |
| `api/flashcards.ts:71–78` | pętla N osobnych transakcji | jedna transakcja w `saveDecidedReview` |
| `api/flashcards.ts:75` | `source` z flagi klienta | `provenance` z `content.equals(original)` |
| `api/flashcards.ts:80–85` | wynik `updateGenerationCounts` **zignorowany** | liczniki w tej samej transakcji + `WHERE closed_at IS NULL`; `changes === 0` → `GenerationAlreadyClosed` → 409 |
| `db/flashcards.ts:49–75` | `createFlashcard` z własnym `BEGIN` | `insertFlashcardWithReviewState(db, ...)` bez transakcji + cienki wrapper dla ścieżki manualnej |
| `db/generations.ts:19–32` | `updateGenerationCounts` publiczne, nadpisujące | prywatne dla repozytorium agregatu, warunkowane `closed_at IS NULL` |
| `api/generations.ts:24–30` | zapis tylko metryk, propozycje odesłane i zapomniane | `insertOpenReview` zapisuje też propozycje jako kandydatów |
| `schema.sql:17–28` | brak znacznika domknięcia | `ALTER TABLE`-free dodatek: `closed_at` (nowa kolumna dodana idempotentnie) |
| `schema.sql` (nowa) | — | `generation_proposals (generation_id, ordinal, front, back, status, decided_front, decided_back, PRIMARY KEY (generation_id, ordinal))` |
| `lib/http.ts:11–13` | tylko `errorResponse` | + `domainErrorResponse` — koniec gołych 500 bez JSON-a (P3) |
| brak pliku | — | `src/domain/generation-review.ts`, `src/domain/card-content.ts`, `src/domain/errors.ts` |

### 5.2 Plan faz

Projekt ma dyscyplinę test-first **z wyrocznią z wymagań** (`AGENTS.md:41–43`,
`test-plan.md:84–87`) oraz działający runner (Vitest + Playwright, `package.json:18–20`).
Fazy 1–3 idą test-first; fazy oznaczone ⚙️ to refaktor bez nowej reguły.

| Faza | Zakres | Test-first? |
| --- | --- | --- |
| **0. Dokumenty** | Zmiana `prd.md:53` (propozycje jako kandydaci, nie fiszki) + doprecyzowanie FR-004 (pochodzenie wyprowadzane), FR-005 (bramka domyka się raz), FR-011 (liczniki domykają sumę). Nowy `context/changes/s05-acceptance-gate/plan.md` z **wyrocznią**: tabela statusów, reguła porównania treści (`trim()`), tożsamość liczników. Dopisanie R-03 w `test-plan.md` o poziom testów domenowych (dziś `test-plan.md:25–26` wyklucza warstwę pośrednią — to wykluczenie trzeba zmienić świadomie). | — (to jest źródło wyroczni) |
| **1. Domena** | `src/domain/{errors,card-content,generation-review}.ts`. Czyste, zero I/O — identycznie jak `lib/srs.ts`. | ✅ **tak** — `tests/unit/generation-review.test.ts` piszemy z planu z Fazy 0, przed implementacją |
| **2. Persystencja** | `schema.sql` (dodatki), `withTransaction` w `db/index.ts`, rozbicie `createFlashcard` ⚙️, `db/generation-review-repo.ts`. | ✅ **tak** — `tests/unit/generation-review-repo.test.ts` na bazie `:memory:` (wzorzec z `tests/unit/auth.test.ts`) |
| **3. API** | `api/generations/[id]/decisions.ts`, `domainErrorResponse` w `lib/http.ts`, usunięcie trybu batch z `api/flashcards.ts`, zapis propozycji w `api/generations.ts`. | ✅ **tak** — testy mapowania błąd domenowy → kod HTTP |
| **4. UI** ⚙️ | `GenerateView.tsx`: wysyłka kompletu decyzji, usunięcie `edited`/`rejectedCount`, uproszczenie `ProposalStatus`. | nie (zachowanie już przypięte testami warstw niższych + E2E) |
| **5. E2E** | Istniejący `e2e/core-flow.spec.ts` **musi przejść bez zmian asercji** (2 akceptacje + 1 odrzucenie → „Zapisano 2 fiszek.") — to test regresji na przeniesienie strażnika. Plus nowy spec: powtórny zapis tej samej generacji → 409, `/cards` bez duplikatów. | ✅ nowy spec przed zmianą |
| **6. Poza zakresem tej zmiany** | Agregat `StudyCard` dla I-09 (ocena tylko fiszki wymagalnej — dziś `db/reviews.ts:26–35` nie sprawdza `due_at`; zweryfikowane: ta sama fiszka przyjmuje drugą ocenę zaraz po pierwszej). Osobny plan zmiany. | — |

Kolejność bramek jakości bez zmian (`test-plan.md:58–66`): lint → check → unit →
build → e2e.

### 5.3 Przypadki testowe niezmiennika #1

**Operacje legalne** (agregat przechodzi, stan spójny):

| # | Scenariusz | Oczekiwanie (wyrocznia: plan z Fazy 0) |
| --- | --- | --- |
| L1 | `open()` z 5 propozycjami | `counts = {generated:5, 0, 0, 0}`, `isClosed === false` |
| L2 | 2 akceptacje bez zmiany treści + 3 odrzucenia | 2 × `provenance: 'ai-full'`; `counts = {5, 2, 0, 3}`; `isClosed === true` |
| L3 | 1 akceptacja ze zmienionym `front` + 4 odrzucenia | 1 × `'ai-edited'`; `counts = {5, 0, 1, 4}` |
| L4 | akceptacja treści identycznej z propozycją, ale klient „twierdzi", że edytował (pole nieobsługiwane) | `'ai-full'` — deklaracja klienta nie ma wpływu |
| L5 | akceptacja z różnicą wyłącznie w białych znakach (`"X "` vs `"X"`) | `'ai-full'` (porównanie po `trim()`) |
| L6 | wszystkie 5 odrzuconych | legalne; `counts = {5, 0, 0, 5}`; 0 fiszek; generacja domknięta |
| L7 | tożsamość liczników dla dowolnego wyniku `decide()` | `acceptedUnedited + acceptedEdited + rejected === generated` |
| L8 | fiszki utworzone przez bramkę | każda ma `review_state` z `due_at = teraz` (I-10) i `generation_id` = id generacji |

**Operacje nielegalne** (nazwany błąd domenowy, **zero zmian w stanie**):

| # | Scenariusz | Błąd | Kod HTTP |
| --- | --- | --- | --- |
| N1 | `decide()` na już domkniętej bramce | `GenerationAlreadyClosed` | 409 |
| N2 | powtórny `POST /decisions` po pełnym cyklu (regresja P6) | `GenerationAlreadyClosed`; liczniki i liczba fiszek **niezmienione** | 409 |
| N3 | decyzja dla `ordinal` spoza generacji | `UnknownProposal` | 400 |
| N4 | dwie decyzje dla tego samego `ordinal` | `DuplicateDecision` | 400 |
| N5 | 3 decyzje przy 5 propozycjach (propozycja bez decyzji) | `IncompleteReview` | 400 |
| N6 | akceptacja z `front` 201 znaków | `InvalidCardContent`; **0 fiszek zapisanych** (cała partia) | 400 |
| N7 | akceptacja z pustym `back` | `InvalidCardContent` | 400 |
| N8 | użytkownik B wysyła decyzje dla generacji A (regresja P1) | `loadGenerationReview` → `undefined`; zero zapisów; **żadna fiszka B nie dostaje `generation_id` A** | 404 |
| N9 | treść, która nigdy nie była propozycją, przy poprawnym `ordinal` (regresja P2) | akceptowana, ale **wyłącznie** jako `ai-edited` — nie da się podszyć pod `ai-full` | 201 |
| N10 | `generationId` nieistniejący (regresja P3) | 404 z ciałem `{ error }` — nigdy gołe 500 | 404 |
| N11 | pole `rejectedCount: -999` w ciele (regresja P5) | pole ignorowane; licznik z agregatu, zawsze ≥ 0 | 201 |
| N12 | wymuszony błąd przy k-tym `INSERT` w transakcji | `ROLLBACK`: 0 fiszek, 0 `review_state`, liczniki bez zmian, `closed_at IS NULL` | 500 z JSON-em |

Uwaga do N9: pełne odtworzenie „treść musi pochodzić z propozycji" jest niemożliwe —
edycja z definicji zmienia treść dowolnie (FR-004). Niezmiennik, który realnie
egzekwujemy, brzmi: **każda zapisana fiszka AI jest przypisana do konkretnej,
zaakceptowanej propozycji tego użytkownika, a `ai-full` oznacza dokładnie treść
zaproponowaną przez AI.** To jest maksimum, jakie da się egzekwować, i to wystarcza,
by metryka z `prd.md:33` była wiarygodna.

### 5.4 Nazwy „load-bearing" do rejestru kontraktów

Projekt nie ma osobnego pliku rejestru — rolę tę pełnią linie `Contract:` w
`context/changes/<change-id>/plan.md` oraz konwencje w `AGENTS.md`. Lekcja L-002
(`lessons.md:12–21`) wymaga ustalenia sygnatur **przed** rozpoczęciem pracy
równoległej. Do zarejestrowania w `context/changes/s05-acceptance-gate/plan.md`:

| Nazwa | Rodzaj | Miejsce |
| --- | --- | --- |
| `GenerationReview` | agregat (root) | `src/domain/generation-review.ts` |
| `Proposal` | encja w agregacie | jw. |
| `CardContent` | value object | `src/domain/card-content.ts` |
| `Provenance` (`'ai-full' \| 'ai-edited'`) | typ | jw. |
| `ProposalDecision`, `AcceptedCard`, `ReviewCounts` | typy kontraktu | jw. |
| `GenerationReview.open()` / `.decide()` / `.counts` / `.isClosed` | metody domenowe | jw. |
| `DomainError` (+ `code`) | klasa bazowa błędów | `src/domain/errors.ts` |
| `InvalidCardContent`, `UnknownProposal`, `DuplicateDecision`, `IncompleteReview`, `GenerationAlreadyClosed` | błędy domenowe | jw. |
| `loadGenerationReview`, `insertOpenReview`, `saveDecidedReview` | repozytorium agregatu | `src/db/generation-review-repo.ts` |
| `withTransaction` | pomocnik transakcji | `src/db/index.ts` |
| `insertFlashcardWithReviewState` | zapis bez transakcji | `src/db/flashcards.ts` |
| `domainErrorResponse` | mapowanie błąd → HTTP | `src/lib/http.ts` |
| `POST /api/generations/:id/decisions` | kontrakt HTTP | `src/pages/api/generations/[id]/decisions.ts` |
| `generation_proposals`, `generations.closed_at` | kontrakt schematu | `src/db/schema.sql` |

Do dopisania w `AGENTS.md` (sekcja Konwencje) — jedna reguła:

> **Domena:** niezmienniki bramki akceptacji egzekwuje wyłącznie agregat
> `GenerationReview` (`src/domain/`). Endpointy parsują wejście i mapują błędy
> domenowe na kody HTTP; nie zawierają reguł. Pochodzenie fiszki (`source`)
> wyprowadza agregat — nigdy nie przyjmujemy go z żądania.

---

## Załącznik — metoda weryfikacji dowodów z §3.3

Uruchomiony build produkcyjny z repo (`node dist/server/entry.mjs`) ze zmiennymi
`DATABASE_FILE` wskazującym plik **poza repozytorium**, `MOCK_AI=1`, `PORT=4711`.
Żądania HTTP z ciasteczkiem sesji zwykłego użytkownika (rejestracja przez
`/api/auth/register`), stan bazy odczytany przez `node:sqlite`. Kod produkcyjny,
baza `data/app.db` i baza `data/e2e.db` nietknięte; serwer zatrzymany po weryfikacji.
