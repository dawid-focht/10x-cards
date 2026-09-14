# Plan testów — 10xCards

Strategia wg M3L1: testujemy ryzyka, nie pokrycie. Zaczynamy od mapy scenariuszy
awarii z perspektywy użytkownika, każdemu ryzyku przypisujemy wpływ i
prawdopodobieństwo w skali 3-stopniowej (niskie / średnie / wysokie), a testy
projektujemy tak, by pokrywały ryzyka od najgroźniejszych. Asercje wyprowadzamy
z wymagań (PRD, plany zmian) — nigdy z implementacji (oracle problem).

## Mapa ryzyk

Skala: wpływ × prawdopodobieństwo, obie osie 3-stopniowe
(niskie / średnie / wysokie).

| ID   | Scenariusz awarii użytkownika                                                                                                            | Wpływ   | Prawd.  | Wymaganie      |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------- | -------------- |
| R-01 | Utrata lub pomieszanie fiszek między kontami: użytkownik widzi/edytuje/usuwa cudze fiszki (IDOR — podmiana id w żądaniu)                   | wysokie | średnie | FR-013         |
| R-02 | Błędny harmonogram SM-2: fiszki wracają za wcześnie/za późno albo nigdy — nauka przestaje działać, choć UI wygląda poprawnie              | wysokie | średnie | FR-010         |
| R-03 | Zapis nieakceptowanych propozycji: do kolekcji trafiają fiszki odrzucone lub nieocenione, łamiąc regułę bramki akceptacji                  | średnie | średnie | FR-004, FR-005 |
| R-04 | Awaria providera AI blokuje przepływ bez komunikatu: użytkownik klika „Generuj fiszki" i nic się nie dzieje (brak błędu, brak ponowienia) | średnie | wysokie | FR-012         |
| R-05 | Hasła w plaintext lub enumeracja kont: wyciek bazy ujawnia hasła; odpowiedzi API zdradzają, które e-maile istnieją                         | wysokie | niskie  | FR-001         |
| R-06 | Walidacja limitów nie działa: tekst poza 1000–10000 znaków lub fiszka poza limitami 200/500 przechodzi (albo poprawne dane są odrzucane)   | niskie  | wysokie | FR-003, FR-006 |

## Profil testów

Dwa poziomy — szybkie testy jednostkowe czystej logiki + jeden krytyczny
przepływ E2E. Bez warstwy pośredniej (integracyjnej) na tym etapie projektu.

### Testy jednostkowe (Vitest, `tests/unit/`)

- `srs.test.ts` — algorytm SM-2 (`src/lib/srs.ts`); wyrocznią jest tabela reguł
  w `context/changes/s04-review/plan.md`, nie kod.
- `auth.test.ts` — hashowanie/weryfikacja haseł, unikalność e-maila
  (case-insensitive), cykl życia sesji z wygasaniem; baza `:memory:`.
- `mock-provider.test.ts` — kontrakt MockProvidera: determinizm, maks. 5
  propozycji, limity długości, puste wejście.
- `validation.test.ts` — granice limitów domenowych (999/1000/10000/10001,
  front ≤ 200, back ≤ 500, puste pola).
- `openrouter.test.ts` — klient OpenRouter (`src/lib/ai/openrouter.ts`) na
  stubie `fetch`: błąd dostawcy w odpowiedzi HTTP 200 → `AiProviderError('upstream')`,
  do 3 prób naprzemiennie na modelu głównym i zapasowym, bez zapasowego ponawia
  ten sam model; po trzech porażkach wyjątek z ostatnim błędem.

### E2E (Playwright, `e2e/`)

Jeden spec krytycznego przepływu na produkcyjnym buildzie (`node dist/server/entry.mjs`,
świeża baza `data/e2e.db`, `MOCK_AI=1`):
rejestracja → generacja → akceptacja/odrzucenie propozycji → zapis → lista
fiszek → sesja powtórek; plus test ochrony dostępu (strona chroniona bez sesji
→ redirect na `/login`).

## Mapowanie ryzyko → test

| Ryzyko | Pokrycie                                                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-01   | E2E „ochrona dostępu" (bez sesji → `/login`); testy repozytoriów per `userId` przy rozbudowie; konwencja 404-nie-403 z AGENTS.md                        |
| R-02   | `srs.test.ts` — pełna tabela reguł (good/again/hard/easy, granice ease 1.3–2.8, brak mutacji wejścia)                                                   |
| R-03   | E2E przepływ krytyczny: 2× akceptuj + 1× odrzuć → zapis dokładnie 2 fiszek („Zapisano 2 fiszek.", 2 pozycje na `/cards`)                                |
| R-04   | `openrouter.test.ts` — dostawca odpowiada HTTP 200 z ciałem błędu (przeciążony upstream): błąd rozpoznany jako `upstream`, ponowienie na modelu zapasowym, po 3 nieudanych próbach `AiProviderError` z komunikatem dla użytkownika zamiast ciszy; `mock-provider.test.ts` (kontrakt granicy AI); kody błędów 502 z konwencji API. Ryzyko zmaterializowało się na produkcji 2026-09-14 (2 z 3 generacji „bez formatu" — patrz `lessons.md`) |
| R-05   | `auth.test.ts` — hash w formacie `salt:hash` bez hasła w treści, weryfikacja true/false, duplikat e-maila → null (jedna odpowiedź niezależnie od kontekstu) |
| R-06   | `validation.test.ts` — wartości graniczne po obu stronach każdego limitu                                                                                |

## Quality gates

Kolejność w CI (fail-fast, od najtańszych):

1. `npm run lint` — ESLint
2. `npm run check` — astro check (typecheck)
3. `npm test` — Vitest (testy jednostkowe)
4. `npm run build` — build produkcyjny (wymagany przed E2E)
5. `npm run test:e2e` — Playwright na buildzie z kroku 4

Lokalnie: hook per-edit uruchamia ESLint na zapisywanym pliku — lint nie czeka
do CI. E2E wymaga wcześniejszego `npm run build` (webServer startuje
`dist/server/entry.mjs`, nie robi builda sam).

## Sekcja wykluczeń

Świadomie NIE testujemy:

- **Realnego API LLM** — koszt, niedeterminizm, sekrety w CI; granicę AI
  pokrywa MockProvider (`MOCK_AI=1`), kontrakt providera testujemy na mocku.
- **Wyglądu** — brak testów wizualnych/screenshotowych; selektory E2E opierają
  się na rolach i etykietach, nie na klasach CSS.
- **Wydajności** — brak testów obciążeniowych; skala MVP tego nie uzasadnia.

## Cookbook Patterns

- **Wyrocznia z wymagań, nie z kodu**: oczekiwane wartości w asercjach pochodzą
  z PRD i planów zmian (np. tabela SM-2 w `context/changes/s04-review/plan.md`).
  Nie wolno „odczytać" oczekiwanej wartości z implementacji i wkleić do testu —
  taki test przyklepuje każdy bug. Zmiana reguł = najpierw zmiana planu.
- **E2E: `getByRole`/`getByLabel`**: selektory po dostępnej roli i etykiecie
  („Zarejestruj się", „Tekst źródłowy"), nigdy po klasach CSS ani strukturze
  DOM. Żadnych `waitForTimeout` — wyłącznie auto-czekające asercje.
- **Unikalne e-maile przez `Date.now()`**: każdy przebieg E2E rejestruje
  `e2e+<timestamp>@example.com`, więc testy nie zderzają się o unikalność
  e-maila nawet na tej samej bazie.
- **Mock tylko na granicy AI**: podmieniamy wyłącznie providera LLM
  (`MOCK_AI=1` → MockProvider). Baza, HTTP, sesje i routing w E2E są prawdziwe
  — mockowanie głębiej ukrywałoby błędy integracji.
