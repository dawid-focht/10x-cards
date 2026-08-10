# ai-review — oskryptowany agent code review dla 10xCards

Czyta unified diff ze stdin, ocenia go w pięciu osiach (skala 1-10), zwraca JSON
z ocenami i werdyktem bramki. Kod wyjścia niesie decyzję — w M5L3 ten sam skrypt
staje się krokiem w CI.

Paczka jest **niezależna od aplikacji**: własny `package.json`, własne
`node_modules`, własny `tsconfig.json`. Zależności agenta (Vercel AI SDK) nie
mieszają się z zależnościami 10xCards.

```
ai-review/
  package.json               # 10x-cards-ai-review, private, type: module
  tsconfig.json              # osobny typecheck (npx tsc --noEmit)
  common/review-schema.ts    # SYSTEM_PROMPT + REVIEW_SCHEMA + evaluateGate
  review.ts                  # runner: stdin → model → JSON + exit code
  schema.test.ts             # offline self-test (bez sieci, bez klucza)
  fixtures/sample-diff.patch # symulowany diff łamiący wszystkie 5 kryteriów
```

## Instalacja

```sh
cd ai-review && npm install
```

## Uruchomienie

```sh
# recenzja bieżącej gałęzi względem main
git diff origin/main...HEAD | OPENROUTER_API_KEY=sk-or-... npx tsx review.ts
```

Kody wyjścia:

| kod | znaczenie |
|---|---|
| `0` | bramka przepuszcza (albo diff był pusty — nie ma czego recenzować) |
| `1` | bramka blokuje — co najmniej jedna reguła progowa zadziałała |
| `2` | agent nie wystartował (brak `OPENROUTER_API_KEY`, błąd wywołania modelu) |

Rozdzielenie `1` od `2` jest celowe: w CI „recenzja zablokowała merge" to inne
zdarzenie niż „agent się wysypał" i wymaga innej reakcji.

JSON leci na **stdout**, wszystkie logi i ostrzeżenia na **stderr** — dzięki temu
`... | jq .summary` w CI działa bez czyszczenia wyjścia.

Zmienne środowiskowe:

| zmienna | domyślnie | do czego |
|---|---|---|
| `OPENROUTER_API_KEY` | — | wymagana; brak → czytelny błąd i exit 2 |
| `AI_REVIEW_MODEL` | `nvidia/nemotron-3-super-120b-a12b:free` | podmiana modelu bez zmiany kodu |
| `AI_REVIEW_MAX_DIFF_CHARS` | `400000` | próg przycięcia diffu |
| `AI_REVIEW_STRICT_SCHEMA` | `1` | `0` wyłącza `json_schema.strict`, gdyby provider go odrzucał |
| `AI_REVIEW_PR_TITLE` | — | tytuł PR-a jako kontekst; nieufne wejście (patrz niżej) |
| `AI_REVIEW_PR_BODY` | — | opis PR-a jako kontekst; nieufne wejście (patrz niżej) |

### Metadane PR-a to dane, nie instrukcje

`AI_REVIEW_PR_TITLE` i `AI_REVIEW_PR_BODY` pisze autor recenzowanej zmiany, czyli
osoba zainteresowana wynikiem recenzji. Wchodzą do prompta w bloku ograniczonym
separatorem z **jednorazowym nonce** (UUID losowany przy każdym uruchomieniu),
opatrzonym instrukcją, że to deklaracja intencji, a nie polecenie, i że próbę
sterowania oceną należy odnotować w `summary` jako znalezisko. Nonce jest tu
istotą: stały separator autor PR-a mógłby po prostu przepisać w opisie i wyjść
z obszaru danych do obszaru instrukcji.

Kryteria, rubryki i progi bramki zostają przy tym nietknięte — `SYSTEM_PROMPT`
i `REVIEW_SCHEMA` nie wiedzą o istnieniu metadanych.

## Wybór modelu — sprawdzony, nie zgadnięty

**Wybrany: `nvidia/nemotron-3-super-120b-a12b:free` — darmowy, 262 144 tokeny kontekstu.**

Endpoint `https://openrouter.ai/api/v1/models` jest publiczny (bez auth). Na dzień
2026-08-10 katalog ma 400 modeli, z czego 14 w wariancie `:free`, a **tylko 4 z nich**
mają `structured_outputs` w `supported_parameters`:

| model | kontekst | uwaga |
|---|---|---|
| `nvidia/nemotron-3-super-120b-a12b:free` | 262 144 | **wybrany** — jedyny endpoint wariantu wspiera schemat |
| `google/gemma-4-26b-a4b-it:free` | 262 144 | ma 2 endpointy, jeden (Google AI Studio) **nie** wspiera `structured_outputs` |
| `openai/gpt-oss-20b:free` | 131 072 | 20B — najsłabszy z czwórki do zadania oceniania |
| `nvidia/nemotron-nano-9b-v2:free` | 128 000 | 9B — jw. |

Dowód z API, `GET /api/v1/models` (fragment wpisu modelu):

```json
{
  "id": "nvidia/nemotron-3-super-120b-a12b:free",
  "context_length": 262144,
  "pricing": { "prompt": "0", "completion": "0" },
  "supported_parameters": [
    "include_reasoning", "max_tokens", "reasoning", "reasoning_effort",
    "response_format", "seed", "structured_outputs", "temperature",
    "tool_choice", "tools", "top_p"
  ]
}
```

Poziom modelu to jednak za mało — OpenRouter routuje request na konkretny
**endpoint**, a wsparcie dla schematu jest cechą endpointu, nie modelu.
Dlatego druga weryfikacja, `GET /api/v1/models/nvidia/nemotron-3-super-120b-a12b:free/endpoints`:

```json
{
  "provider_name": "Nvidia",
  "context_length": 262144,
  "max_completion_tokens": 262144,
  "pricing": { "prompt": "0", "completion": "0" },
  "supported_parameters": [
    "reasoning", "include_reasoning", "temperature", "max_tokens", "seed",
    "top_p", "tools", "tool_choice", "structured_outputs", "response_format",
    "reasoning_effort"
  ]
}
```

Wariant `:free` ma **dokładnie jeden** endpoint i ten endpoint wspiera
`structured_outputs`. To najmocniejsza gwarancja z całej czwórki — nie ma
alternatywnej trasy, na którą router mógłby zjechać.

Kontrprzykład pokazujący, dlaczego to sprawdzamy: `google/gemma-4-26b-a4b-it:free`
ma dwa endpointy — Darkbloom (131k, `structured_outputs: true`) i Google AI Studio
(262k, `structured_outputs: false`). Wpis modelu deklaruje `structured_outputs`,
ale losowo trafiony endpoint Google AI Studio wysypałby request.

### Dlatego `require_parameters: true`

```ts
provider: { require_parameters: true }
```

Ta preferencja każe OpenRouterowi routować wyłącznie na endpointy obsługujące
**wszystkie** parametry requestu — czyli tutaj tylko na te ze structured outputs.
Bez niej router może wybrać providera bez wsparcia schematu i wywołanie padnie
błędem, mimo że model „wspiera" schemat na poziomie katalogu.

## Kontrakt: pięć kryteriów i bramka

Kryteria, pełne rubryki i progi pochodzą 1:1 z dokumentu kryteriów (M5L3, zad. 1).
Zasada doboru: **żadne kryterium nie powtarza tego, co pipeline łapie za darmo**.
`ci.yml` uruchamia ESLint → `astro check` → Vitest → build → Playwright; wszystkie
pięć osi celuje w lukę między „kompiluje się i jest zielone" a „robi to, co miało robić".

| klucz | ocenia | czego CI nie łapie |
|---|---|---|
| `data_isolation` | filtrowanie po `user_id`, 404 zamiast 403, operacje destrukcyjne | ESLint nie czyta semantyki SQL w stringach |
| `plan_contract_drift` | zgodność z `plan.md`, spójność kontraktów, nietykalność plików rządzących | CI nie zna intencji ani stanu `## Progress` |
| `test_oracle_integrity` | asercje z wymagań, nie z implementacji | `npm test` jest tak samo zielony dla testu, który przyklepuje bug |
| `error_contract_integrity` | kody błędów, kształt `{ error }`, stan błędu w wyspie React | `catch { return [] }` to poprawny TypeScript |
| `ai_boundary_and_secrets` | dostęp do LLM tylko przez `getAiProvider()`, brak sekretów, `MOCK_AI` w CI | w pipelinie nie ma skanera sekretów ani reguły ograniczającej importy |

Bramka (`evaluateGate` w `common/review-schema.ts`) — trzy reguły, w tej kolejności:

| # | warunek | wynik |
|---|---|---|
| 1 | dowolne kryterium ≤ **3** | BLOCK |
| 2 | `data_isolation` ≤ **5** lub `ai_boundary_and_secrets` ≤ **5** | BLOCK |
| 3 | średnia z pięciu < **7.0** | BLOCK |
| — | w pozostałych przypadkach | PASS |

Doradczy `verdict` modelu **nie wpływa** na decyzję — bramka liczy się wyłącznie
z ocen. Rozjazd (model mówi „fail", reguła przepuszcza) trafia jako ostrzeżenie
na stderr. Znaleziska z pasma 4-6 są informacyjne: idą do PR-a jako triage,
a decyduje człowiek. Powód: sędzia LLM jest niestabilny na granicy 6/7, więc
bramka blokująca na szum nauczyłaby ludzi omijać ją odruchowo.

Wszystkie reguły są sprawdzane (bez krótkiego spięcia), żeby `reasons` niosło
komplet powodów do komentarza w PR.

### Dlaczego oceny to gołe `z.number()`

W `REVIEW_SCHEMA` pięć ocen jest zadeklarowanych jako `z.number()` — **bez**
`.min(1).max(10)` i bez `.int()`. Structured outputs odrzucają słowa kluczowe
`minimum`/`maximum` na integerach po stronie części providerów i wywalają cały
request. Zakres wymuszamy więc dwiema innymi dźwigniami:

1. **`.describe()` z pełną rubryką** — każde pole niesie całe pasma 1-3 / 4-6 /
   7-8 / 9-10 z dokumentu kryteriów. To główna dźwignia sterowania modelem:
   opis pola trafia do JSON Schema, czyli do samego requestu, a nie tonie
   w promptcie systemowym.
2. **`SYSTEM_PROMPT`** — jawnie żąda liczby całkowitej 1-10 i zakazuje 0,
   wartości ujemnych, >10 i ułamków.

Kontrolę po fakcie robi `outOfRangeScores()` — wypisuje ostrzeżenie na stderr,
jeżeli model mimo wszystko zwrócił coś spoza skali. Nie blokuje sama z siebie.

## Raportowanie kosztu

Provider dostaje `usage: { include: true }`, dzięki czemu OpenRouter dokłada blok
usage accounting z realną ceną. Agent wypisuje:

- **koszt** z `providerMetadata.openrouter.usage.cost` (dolary, 6 miejsc po przecinku),
- **tokeny** z `result.totalUsage` (`inputTokens` / `outputTokens` / `totalTokens`).

Jeżeli pola `cost` w odpowiedzi nie ma, agent mówi to wprost —
`"costSource": "niedostępne w odpowiedzi"` w JSON-ie i komunikat na stderr —
**zamiast szacować**. Na wybranym modelu koszt powinien wyjść `0`, bo wariant
`:free` ma cenę `0` za prompt i completion; wartość `0` to jednak zmierzone zero,
nie założone.

## Weryfikacja

### Offline self-test — przechodzi

```sh
cd ai-review && npx tsx schema.test.ts
```

47 asercji, bez sieci i bez klucza API. Pokrywa:

- parsowanie poprawnego obiektu i odrzucanie niepoprawnego (brak kryterium, ocena
  jako string, `verdict` spoza enum, brak `summary`),
- świadomą lukę schematu (ocena 42 przechodzi walidację, a `outOfRangeScores()` ją łapie),
- kształt `REVIEW_JSON_SCHEMA` — 7 pól, wszystkie wymagane, brak `minimum`/`maximum`,
  pełna rubryka w `description` każdego kryterium,
- **przypadki brzegowe bramki**: dokładnie 3 na kryterium, dokładnie 5 i dokładnie 6
  na kryterium krytycznym, średnia dokładnie 7.0 (przepuszcza — próg jest ostry `< 7.0`)
  i 6.8 (blokuje), kumulacja powodów ze wszystkich trzech reguł, niezależność od
  `verdict` modelu.

### Typecheck — przechodzi

```sh
cd ai-review && npx tsc --noEmit
```

### Weryfikacja requestu bez sieci

Kształt wywołania został sprawdzony przez podstawienie własnego `fetch` do
`createOpenRouter` i przechwycenie body. Potwierdzone, że na wyjściu jest:
`model: nvidia/nemotron-3-super-120b-a12b:free`, `temperature: 0`,
`usage: {"include":true}`, `provider: {"require_parameters":true}`,
`response_format.type: json_schema`, `json_schema.strict: true`, komplet siedmiu
pól schematu bez `minimum`/`maximum` oraz pełne rubryki w `description`.

### Live smoke test — wykonany (2026-08-10)

```sh
cd ai-review && OPENROUTER_API_KEY=sk-or-... npx tsx review.ts < fixtures/sample-diff.patch; echo "exit=$?"
```

**Wynik:** `exit=1`, oceny `2/2/2/2/1`, średnia 1,8 — bramka blokuje, zgodnie z
oczekiwaniem (fixture łamie wszystkie pięć kryteriów). Model odpowiedział przez
endpoint Nvidia, koszt `$0.000000`, czas 64 s.

Gdyby request padł na odrzuconym schemacie, pierwsza rzecz do sprawdzenia to
`AI_REVIEW_STRICT_SCHEMA=0` (wyłącza `json_schema.strict`, zostawiając schemat
w `response_format`).

### Porównanie modeli — `evals/`

Pełna macierz 4 modele × 5 diffów o znanym z góry wyniku (bramka, oceny, koszt,
czas, czy model w ogóle dowiózł JSON) żyje w [`evals/README.md`](evals/README.md).
Ten sam zestaw jest bramką regresji dla `SYSTEM_PROMPT` i rubryk: provider
promptfoo uruchamia `review.ts`, więc zmiana kontraktu automatycznie przechodzi
przez wszystkie przypadki.

## `fixtures/sample-diff.patch`

Symulowany diff, wygenerowany jako prawdziwy `git diff` na kopii repozytorium
(HEAD + świadomie zepsute zmiany), więc jest poprawnym unified diffem, nie atrapą.
Udaje PR „wyszukiwarka fiszek + podpowiedzi AI" i celowo narusza każde kryterium:

| plik | naruszenie | kryterium |
|---|---|---|
| `src/pages/api/flashcards/search.ts` | `SELECT ... FROM flashcards` **bez `WHERE user_id = ?`**, `q` wklejone do SQL przez interpolację, SQL w endpointcie zamiast w repozytorium | `data_isolation` |
| tamże | `catch { return jsonResponse({ items: [] }) }` — awaria bazy udaje pusty wynik, status 200 | `error_contract_integrity` |
| `src/lib/ai/suggest.ts` | klucz API w literale + `fetch` prosto do OpenRoutera z pominięciem `getAiProvider()` | `ai_boundary_and_secrets` |
| `.github/workflows/ci.yml` | zdjęte `MOCK_AI: '1'` z joba E2E — testy mogą uderzyć w prawdziwe API | `ai_boundary_and_secrets` |
| `tests/unit/search.test.ts` | samotne `toBeDefined()` i wartość skopiowana z wyniku implementacji („tyle wychodzi z modelu") | `test_oracle_integrity` |
| `src/lib/srs.ts` | reguła SM-2 `reps 1 → 6 dni` zmieniona na `4` bez zmiany tabeli reguł w planie | `test_oracle_integrity` |
| `AGENTS.md` | reguła izolacji danych skrócona do jednej linijki (powtórka L-001) | `plan_contract_drift` |
| `context/changes/s04-review/plan.md` | `## Progress` odhacza „Fazę 3", której w planie nie ma | `plan_contract_drift` |

Klucz w fixturze (`sk-or-v1-EXAMPLE000…`) jest **syntetyczny** i celowo nie pasuje
do formatu prawdziwych kluczy OpenRoutera (`EXAMPLE` łamie wzorzec hex), żeby nie
wywołać push protection na GitHubie. Dla recenzenta wygląda jak sekret w kodzie —
i o to chodzi.

## Stack

- `ai@^6` — `ToolLoopAgent`, `Output.object({ schema })`, `stopWhen: stepCountIs(2)`.
  Agent nie ma narzędzi (`tools: {}`): jedyne, co robi, to czyta diff i wypełnia schemat.
- `@openrouter/ai-sdk-provider@^2.10` — wersja `3.x` wymaga `ai@^7`, więc dla AI SDK 6
  właściwa jest linia `2.x` (peer: `ai: ^6.0.0`).
- `zod@^4` — potrzebny dla `z.toJSONSchema(..., { target: 'draft-07' })`.
- `tsx` do uruchamiania TypeScriptu bez kroku budowania.

Importy używają jawnego rozszerzenia `.ts` (`allowImportingTsExtensions` w
`tsconfig.json`), więc paczka działa zarówno pod `tsx`, jak i pod natywnym
strippingiem typów w Node 24.

## W CI (M5L3)

Agent jest wpięty w pipeline jako osobny workflow — istniejący job `build-test`
z `ci.yml` zostaje nietknięty.

```
.github/actions/ai-reviewer/   akcja kompozytowa (skan sekretów → agent → werdykt)
  action.yml                   inputs: api-key, pr-title, pr-body, diff; output: verdict
  scan-secrets.sh              bramka bezpieczeństwa PRZED wywołaniem modelu
  run-review.sh                uruchomienie agenta + budowa komentarza na PR
.github/workflows/review.yml   konsument: uses: ./.github/actions/ai-reviewer
```

Podział ról: workflow liczy diff i komentuje PR-a, akcja recenzuje i zwraca
`verdict` (`pass` / `blocked` / `error`). Akcja **nie** wywraca joba przy
blokadzie — decyzję podejmuje krok „Bramka" w workflow, dopiero po opublikowaniu
komentarza. Odwrotna kolejność zostawiałaby czerwony przebieg bez uzasadnienia.

Cztery rzeczy w tej konfiguracji są nieoczywiste i łatwo je zepsuć przy edycji:

1. **`fetch-depth: 0`** w `actions/checkout`. Domyślny płytki checkout nie ma
   commita bazowego, więc `git diff` względem bazy zwraca pustkę — agent dostaje
   pusty diff i przepuszcza każdą zmianę. Bramka wygląda wtedy na działającą.
2. **Skan sekretów przed modelem.** Diff może zawierać klucz. Gdyby skan stał po
   recenzji, sekret najpierw poleciałby do zewnętrznego API, a dopiero potem
   model doniósłby, że wyciekł. Wzorce są wąskimi wyrażeniami regularnymi —
   szczegóły i uzasadnienie w nagłówku `scan-secrets.sh`.
3. **Nieufne wejścia idą kanałem `env`.** Tytuł i opis PR-a nigdy nie są
   interpolowane przez `${{ }}` do bloku `run:` — tam byłyby wykonaniem kodu na
   runnerze, który trzyma w pamięci `OPENROUTER_API_KEY`.
4. **Akcje przypięte do SHA**, nie do ruchomego `@v7`, z komentarzem wersji obok.
   To cudzy kod z dostępem do sekretów; tag można przesunąć, SHA nie.

Diff jest przycinany do 90 000 bajtów po stronie workflow. Powód jest techniczny:
jedzie do akcji jako zmienna środowiskowa, a `execve` na Linuksie ogranicza
pojedynczy łańcuch środowiska do 128 KiB (`MAX_ARG_STRLEN`).
