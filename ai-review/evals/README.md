# evals — porównanie modeli na jednym zestawie diffów

Zadanie 3 z M5L3: rozstrzygnąć „tańszy czy droższy model" **twardą macierzą
wyników**, a nie przeczuciem z jednego PR-a. Zestaw zostaje jako **bramka
regresji** — odpalasz go po każdej zmianie `SYSTEM_PROMPT` albo rubryk w
`common/review-schema.ts` i widzisz, czy recenzent dalej łapie to, co ma łapać.

```
evals/
  promptfooconfig.yaml   # 4 modele × 5 przypadków, asercje strukturalne
  provider.mjs           # provider promptfoo: uruchamia ../review.ts (nie kopiuje prompta)
  asserts.mjs            # asercje: bramka / skala 1-10 / kryteria, które miały polecieć nisko
  report.mjs             # results/latest.json → macierz Markdown do tego README
  cases/*.patch          # diffy o znanym z góry wyniku (generowane przez git diff)
  results/latest.json    # surowy wynik ostatniego przebiegu
```

## Dlaczego provider uruchamia `review.ts`, a nie woła OpenRoutera sam

Porównanie modeli ma sens tylko wtedy, gdy każdy dostaje **dokładnie to samo**:
ten sam `SYSTEM_PROMPT`, ten sam `REVIEW_SCHEMA` (z rubrykami w opisach pól), to
samo `require_parameters: true`, tę samą `temperature: 0` i tę samą bramkę
`evaluateGate`. Gdyby konfiguracja promptfoo miała własną kopię prompta,
rozjechałaby się przy pierwszej zmianie i zestaw przestałby być bramką regresji.

Dlatego `provider.mjs` odpala `../review.ts` jako podproces (stdin = diff,
stdout = JSON, kod wyjścia = decyzja bramki) i podmienia wyłącznie
`AI_REVIEW_MODEL`. Jedyna kopia kontraktu żyje w `common/review-schema.ts`.

Kody wyjścia `0` (przepuszcza) i `1` (blokuje) to poprawne wyniki. Dopiero `2`
albo brak JSON-a na stdout liczy się jako „model nie dowiózł recenzji" — i taki
przypadek trafia do macierzy jako **wynik**, nie jako awaria przebiegu.

## Zestaw testowy — wyrocznia ustalona przed uruchomieniem

Eval jest wart tyle, ile jego wyrocznia. Każdy przypadek ma **z góry** zapisane
oczekiwanie na poziomie bramki (`pass`/`blocked`), a przy naruszeniach — próg dla
kryterium, które ma polecieć nisko. Oceniamy macierz, nie to, czy proza modelu
brzmi mądrze.

Diffy w `cases/` są prawdziwe: powstały przez `git diff` na kopii repozytorium
w katalogu tymczasowym, więc mają poprawne nagłówki hunków i przechodzą
`git apply --check`.

| przypadek | co robi diff | oczekiwanie |
|---|---|---|
| `clean` | dokłada `tests/unit/flashcards-isolation.test.ts` — test własności repozytorium, którego wprost żąda sekcja Risks planu S-03 — i odhacza fazę w `## Progress` | bramka **przepuszcza** |
| `blatant` | `../fixtures/sample-diff.patch`: klucz API w kodzie, `fetch` z pominięciem `getAiProvider()`, zdjęte `MOCK_AI` z CI, SQL sklejany z parametru bez `user_id`, `catch` → 200 z pustą listą, skasowana reguła z `AGENTS.md`, `toBeDefined()` | bramka **blokuje**, `data_isolation` ≤ 3, `ai_boundary_and_secrets` ≤ 3 |
| `subtle-isolation` | `searchFlashcards(userId, …)` filtruje listę po `user_id`, ale zapytanie `COUNT` już nie (wyciek liczby cudzych fiszek); `GET /api/flashcards/[id]` mapuje brak wiersza na **403** zamiast 404. Plan zaktualizowany, zapytania sparametryzowane — reszta diffu jest czysta | bramka **blokuje**, `data_isolation` ≤ 5 |
| `oracle-drift` | interwał `good` w `src/lib/srs.ts` zmieniony z 6 na 5 dni **i ta sama zmiana w asercji** `tests/unit/srs.test.ts`; `context/changes/s04-review/plan.md` nietknięty. Testy zielone, wyrocznia zepsuta | bramka **blokuje**, `test_oracle_integrity` ≤ 3 |
| `noise` | wyłącznie komentarze i formatowanie (`validation.ts`, `reviews.ts`, `http.ts`) | bramka **przepuszcza** |

`clean` i `noise` mierzą fałszywe alarmy: model, który blokuje kosmetyczny diff,
zablokuje dowolny PR i nie nadaje się na bramkę.

## Asercje — wyłącznie strukturalne

| metryka | co sprawdza |
|---|---|
| `gate` | `evaluateGate(review).passed` vs wyrocznia przypadku |
| `scale` | pięć ocen, całkowitych, w zakresie 1-10 (`outOfRangeScores` → `warnings`) |
| `criteria` | czy kryterium, które miało polecieć nisko, faktycznie poleciało |

Zero dopasowania tekstu. Doradczy `verdict` modelu jest raportowany, ale nie
decyduje — bramka liczy się z ocen niezależnie od niego.

## Uruchomienie

```sh
cd ai-review
set -a && . ../.env && set +a          # OPENROUTER_API_KEY — nie wypisuj wartości
npx promptfoo@0.122.0 eval -c evals/promptfooconfig.yaml -j 4 --no-cache \
  -o evals/results/latest.json
node evals/report.mjs evals/results/latest.json   # macierz Markdown
```

Suchy przebieg całej mechaniki **bez wydawania zapytań** — podstaw własny runner
o tym samym kontrakcie stdin/stdout:

```sh
AI_REVIEW_EVAL_RUNNER=/ścieżka/do/atrapy.mts npx promptfoo@0.122.0 eval -c evals/promptfooconfig.yaml
```

### Budżet

Klucz ma **limit wydatków $0**, więc porównywane są wyłącznie warianty `:free`
(model płatny zwróciłby 402). Wśród darmowych modeli OpenRoutera dokładnie cztery
deklarują `structured_outputs` — zweryfikowane 2026-08-10 na
`/api/v1/models` i `/api/v1/models/<id>/endpoints`. `gemma-4-26b-a4b-it:free` ma
dwa endpointy i tylko jeden (Darkbloom) obsługuje schemat, drugi (Google AI
Studio) nie — dlatego `require_parameters: true` w `review.ts` jest warunkiem
sensowności tego porównania, a nie ozdobnikiem.

Darmowe konto ma limit **50 zapytań/dobę** i 20/minutę. Macierz to
4 modele × 5 przypadków = **20 zapytań**; `-j 4` trzyma nas przy ~4 równoległych,
czyli daleko pod limitem minutowym.

## Wyniki (przebieg 2026-08-10, `eval-gAg-2026-08-10T13:55:06`)

### Bramka: oczekiwanie vs wynik

| przypadek | oczekiwanie | gemma-4-26b-a4b-it | gpt-oss-20b | nemotron-nano-9b-v2 | nemotron-3-super-120b (produkcja) |
| --- | --- | --- | --- | --- | --- |
| `clean` | pass | ERR schemat (nieparsowalny) | ERR schemat (nieparsowalny) | ERR timeout | OK pass |
| `blatant` | blocked | ERR schemat (nieparsowalny) | ERR schemat (nieparsowalny) | ERR timeout | OK blocked |
| `subtle-isolation` | blocked | ERR schemat (nieparsowalny) | ERR schemat (nieparsowalny) | ERR timeout | OK blocked |
| `oracle-drift` | blocked | MISS pass | ERR timeout | MISS pass | MISS pass |
| `noise` | pass | OK pass | ERR schemat (niezgodny) | ERR timeout | OK pass |

### Oceny (data_isolation / plan_contract_drift / test_oracle_integrity / error_contract_integrity / ai_boundary_and_secrets)

| przypadek | gemma-4-26b-a4b-it | gpt-oss-20b | nemotron-nano-9b-v2 | nemotron-3-super-120b (produkcja) |
| --- | --- | --- | --- | --- |
| `clean` | ERR | ERR | ERR | 10/10/10/9/9 |
| `blatant` | ERR | ERR | ERR | 2/2/2/2/1 |
| `subtle-isolation` | ERR | ERR | ERR | 9/4/9/2/9 |
| `oracle-drift` | 9/4/7/9/9 | ERR | 9/9/9/9/9 | 9/10/10/9/9 |
| `noise` | 9/9/9/9/9 | ERR | ERR | 9/9/9/9/9 |

### Czy model trafił w kryterium, które miało polecieć nisko

| przypadek | próg | gemma-4-26b-a4b-it | gpt-oss-20b | nemotron-nano-9b-v2 | nemotron-3-super-120b (produkcja) |
| --- | --- | --- | --- | --- | --- |
| `blatant` | `data_isolation` ≤ 3, `ai_boundary_and_secrets` ≤ 3, pozostałe ≤ 5 | ERR | ERR | ERR | OK |
| `subtle-isolation` | `data_isolation` ≤ 5 | ERR | ERR | ERR | MISS |
| `oracle-drift` | `test_oracle_integrity` ≤ 3 | MISS | ERR | MISS | MISS |

### Koszt, czas, niezawodność

| model | poprawny JSON | bramka zgodna | kryteria trafione | skala 1-10 | koszt łącznie | mediana czasu | najdłuższy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `nvidia/nemotron-3-super-120b-a12b:free` | **5/5** | 4/5 | 3/5 | 5/5 | $0.000000 | 64,4 s | 112,5 s |
| `google/gemma-4-26b-a4b-it:free` | 2/5 | 1/5 | 1/5 | 2/5 | $0.000000 | 15,2 s | 18,9 s |
| `nvidia/nemotron-nano-9b-v2:free` | 1/5 | 0/5 | 0/5 | 1/5 | $0.000000 | 42,7 s | 42,7 s |
| `openai/gpt-oss-20b:free` | 0/5 | 0/5 | 0/5 | 0/5 | $0.000000 | — | — |

Mianownikiem jest zawsze 5 przypadków, nie „5 udanych odpowiedzi" — model, który
nie dowiózł JSON-a, nie zaliczył przypadku. Czasy dotyczą samego wywołania modelu
(`usage.durationMs` z `review.ts`), nie startu procesu. Koszt jest realny z
OpenRoutera (`providerMetadata.openrouter.usage.cost`), nie szacowany.

## Co z tego wynika

**Kolumna kosztu nie rozstrzyga niczego — wszystkie cztery modele kosztują $0.**
Różnicuje je wyłącznie niezawodność kontraktu i czas. Przy limicie wydatków $0
pytanie „tańszy czy droższy" sprowadza się do „który z darmowych w ogóle działa".

1. **Dwa z czterech modeli nie dowożą schematu.** `gpt-oss-20b` nie oddał
   poprawnego obiektu ani razu (4 × „could not parse the response", raz „response
   did not match schema"), `gemma-4-26b-a4b-it` tylko na dwóch najkrótszych
   diffach (1,5 kB i 2,2 kB) — trzy dłuższe (3,3–5,1 kB) padły. To nie jest
   kwestia constrained decoding: powtórka z `AI_REVIEW_STRICT_SCHEMA=0` na
   przypadku `clean` dała **dokładnie te same błędy** dla obu modeli.
2. **`nemotron-nano-9b-v2` nie mieści się w czasie.** Cztery z pięciu wywołań
   przekroczyły 180 s i zostały ubite; jedyne, które wróciło, zajęło 42,7 s.
   Model dla bramki CI bezużyteczny.
3. **`nemotron-3-super-120b` (obecna produkcja) jako jedyny dowozi kontrakt** —
   5/5 poprawnych odpowiedzi, 5/5 w skali 1-10, mediana 64 s.
4. **Ale jakość ocen jest przeciętna, i to widać dopiero na trudnych
   przypadkach.** `blatant` rozwalił bez pudła (średnia 1,8, wszystkie pięć
   kryteriów w paśmie fix-now), `clean` i `noise` przepuścił bez fałszywego
   alarmu. Natomiast:
   - **`oracle-drift` przeoczyły wszystkie trzy modele, które w ogóle
     odpowiedziały** — łącznie z produkcyjnym, który wystawił
     `test_oracle_integrity = 10` i napisał, że zmiana „jest spójna z regułami
     SM-2 z dokumentacji". Nie jest: plan mówi 6 dni, diff zmienia na 5 i
     dopasowuje asercję. To dokładnie ten typ regresji, dla którego to kryterium
     powstało, i bramka go **nie** łapie.
   - **`subtle-isolation` zablokował, ale nie za to.** Dał `data_isolation = 9`
     (nie zauważył zapytania `COUNT` bez `WHERE user_id`), a zablokował przez
     `error_contract_integrity = 2` za 403 zamiast 404. Wynik bramki poprawny,
     atrybucja kryterium — nie.

## Rekomendacja

**Zostajemy przy `nvidia/nemotron-3-super-120b-a12b:free`** — nie dlatego, że
jest dobry, tylko dlatego, że jest jedynym z czterech darmowych modeli ze
`structured_outputs`, który w ogóle dowozi kontrakt (5/5 vs 2/5, 1/5 i 0/5), a
przy limicie wydatków $0 nie ma alternatywy do porównania.

Zmiany, których ten eval **nie** uzasadnia, ale na które wskazuje: traktować
`test_oracle_integrity` jako kryterium, którego bramka realnie nie egzekwuje
(0/3 trafień), i przy pierwszym budżecie na model płatny powtórzyć ten sam
zestaw — `oracle-drift` jest gotową miarą tego, czy droższy model faktycznie coś
zmienia.

## Czego nie zmierzono

- **Żadnego modelu płatnego.** Klucz ma limit $0, więc porównanie „tańszy czy
  droższy" rozstrzygnięto wyłącznie wewnątrz darmowego progu. Interesujące
  pytanie — czy płatny model łapie `oracle-drift` — pozostaje otwarte.
- **Wariancji.** Jeden przebieg na komórkę, `temperature: 0`, bez powtórzeń.
  Nie wiadomo, ile z awarii `gpt-oss-20b`/`gemma` i timeoutów `nano` to trwała
  cecha modelu, a ile chwilowe obciążenie darmowego endpointu. Przy 50 zapytaniach
  na dobę na powtórzenia nie było budżetu.
- **Który endpoint obsłużył nieudane wywołania.** `review.ts` raportuje
  `provider` tylko przy sukcesie — udane odpowiedzi szły przez Nvidia
  (nemotrony) i Darkbloom (gemma), przy błędach tej informacji nie ma.
  `require_parameters: true` powinno wykluczyć routing na endpoint bez schematu,
  ale nie zostało to potwierdzone od strony odpowiedzi.
- **Jakości `summary`.** Asercje patrzą wyłącznie na strukturę. To, czy komentarz
  do PR-a jest użyteczny dla człowieka, nie jest tu w ogóle mierzone.
- **Zużycie limitu:** 33 zapytania z 50 dobowych (20 macierz + 8 z przerwanego
  pierwszego przebiegu + 1 smoke test + 2 diagnostyka `STRICT_SCHEMA=0`).
  Wewnętrznych ponowień AI SDK nie da się z tego poziomu policzyć.
