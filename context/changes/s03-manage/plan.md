# Plan — S-03 Zarządzanie fiszkami

**End state:** widok „Moje fiszki": lista z paginacją i źródłem pochodzenia,
tworzenie manualne, edycja, usuwanie z potwierdzeniem. Wszystkie operacje
ograniczone do właściciela; cudze id → 404. (FR-006..009, FR-013, US-005/006/009)

## Fazy

### Faza 1 — repozytorium i API
- `src/db/flashcards.ts` — Intent: jedno miejsce SQL dla fiszek. Contract:
  `listFlashcards(userId, {limit, offset})`, `createFlashcard(userId, {front, back, source, generationId?})`
  (tworzy też review_state), `updateFlashcard(userId, id, {front, back})`,
  `deleteFlashcard(userId, id)`; update/delete zwracają `false` gdy brak wiersza
  właściciela (API mapuje na 404).
- `src/pages/api/flashcards.ts` — GET lista (`?limit&offset`), POST manual
  (`{front, back}` → source `manual`); walidacja front ≤ 200, back ≤ 500.
- `src/pages/api/flashcards/[id].ts` — PUT edycja, DELETE usunięcie; 404 dla
  cudzych/nieistniejących (nierozróżnialne, FR-013).

### Faza 2 — widok
- `src/components/CardList.tsx` — lista + formularz manualny + edycja inline +
  usuwanie z `confirm()`; badge źródła (AI / AI-edytowana / manualna).
- `src/pages/cards.astro` — osadza wyspę.

## Success criteria
- Manualna fiszka pojawia się natychmiast ze źródłem `manual` (US-005).
- Edycja/usunięcie trwałe po odświeżeniu (US-006); usunięcie kasuje review_state.
- PUT/DELETE na cudzym id → 404 bez treści różnicującej (US-009).

## Risks
- IDOR → wszystkie zapytania z `WHERE user_id = ?`; test jednostkowy repozytorium.

## Progress
- [ ] Faza 1
- [ ] Faza 2
