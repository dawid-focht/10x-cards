# Plan — S-02 Generacja fiszek z bramką akceptacji (north star)

**End state:** zalogowany użytkownik wkleja tekst 1 000–10 000 znaków, dostaje
propozycje fiszek od AI (nic nie zapisuje się automatycznie), przegląda je
per pozycja (akceptuj / edytuj-i-akceptuj / odrzuć) i zapisuje zbiorczo wyłącznie
zaakceptowane. Metryki generacji trafiają do `generations`, błędy do
`generation_errors`. (FR-003..005, FR-011, FR-012, US-003, US-004)

## Fazy

### Faza 1 — warstwa AI
- `src/lib/ai/provider.ts` — Intent: kontrakt niezależny od dostawcy. Contract:
  `interface AiProvider { name: string; generateFlashcards(text): Promise<Proposal[]> }`,
  `Proposal = { front: string; back: string }`, factory `getAiProvider()`:
  `MOCK_AI=1` lub brak klucza → mock; inaczej OpenRouter.
- `src/lib/ai/mock.ts` — Intent: deterministyczne propozycje dla dev/testów/CI.
  Contract: 5 fiszek wyprowadzonych z pierwszych zdań tekstu; zero sieci; stabilne
  dla identycznego wejścia.
- `src/lib/ai/openrouter.ts` — Intent: realna generacja. Contract: chat completions
  (`OPENROUTER_API_KEY`, `AI_MODEL`, opcjonalnie `AI_BASE_URL` — zgodne też z OpenAI);
  prompt wymusza JSON; `parseFlashcardsJson()` odporny na markdown fences; walidacja
  limitów długości (front ≤ 200, back ≤ 500); timeout 60 s.

### Faza 2 — endpoint generacji i zapisu
- `src/pages/api/generations.ts` — Contract: POST `{ sourceText }`; walidacja
  1000–10000 znaków (400); wynik `{ generationId, proposals[] }`; wiersz w
  `generations` z `generated_count` i `duration_ms`; błąd providera → 502 +
  wpis w `generation_errors` (FR-012).
- `src/pages/api/flashcards.ts` (POST, tryb batch) — Contract:
  `{ generationId, accepted: [{front, back, edited}] }` → insert fiszek
  `source = ai-full|ai-edited` + `review_state` (due = teraz); aktualizacja
  liczników accepted_unedited/accepted_edited/rejected w `generations`.

### Faza 3 — widok przeglądu (wyspa React)
- `src/components/GenerateView.tsx` — Intent: cały stan przeglądu w przeglądarce
  do momentu zapisu. Contract: textarea z licznikiem znaków; lista propozycji;
  akcje akceptuj/edytuj/odrzuć per pozycja; „Zapisz zaakceptowane (N)" wywołuje
  batch POST; komunikat błędu z opcją „Spróbuj ponownie".
- `src/pages/generate.astro` — osadza wyspę (`client:load`).

## Success criteria
- Tekst 999 i 10 001 znaków → walidacja blokuje wysyłkę (FR-003).
- Po generacji w bazie 0 nowych fiszek; po zapisie — dokładnie zaakceptowane (FR-005).
- Edytowana propozycja ma `source='ai-edited'`, nieedytowana `ai-full` (FR-004).
- Awaria providera: użytkownik widzi komunikat + retry, wiersz w `generation_errors`.

## Risks
- LLM zwraca niepoprawny JSON → parser wyciąga blok JSON, waliduje strukturę,
  odrzuca pozycje przekraczające limity; całość pusta → błąd 502.
- Koszty API → domyślnie MockProvider bez klucza; realny provider tylko z env.

## Progress
- [ ] Faza 1
- [ ] Faza 2
- [ ] Faza 3
