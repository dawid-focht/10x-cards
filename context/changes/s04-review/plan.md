# Plan — S-04 Sesja powtórek (SM-2 uproszczony)

**End state:** użytkownik przechodzi sesję fiszek z `due_at ≤ teraz` (kolejność od
najdawniej wymagalnych): widzi przód, odsłania tył, ocenia Again/Hard/Good/Easy;
każda ocena aktualizuje stan SR i termin kolejnej powtórki. (FR-010, US-007)

## Fazy

### Faza 1 — algorytm (czysta funkcja, wyrocznia z wymagań — nie z kodu)
- `src/lib/srs.ts` — Contract: `schedule(state: ReviewState, grade: Grade, now: Date): ReviewState`.
  Reguły (uproszczony SM-2, zapisane PRZED implementacją jako wyrocznia testów):
  - `again`: reps=0, lapses+1, interval=0, due = now + 10 min, ease −0.20 (min 1.3)
  - `hard`: interval = max(1, round(interval × 1.2)), ease −0.15 (min 1.3), due = now + interval dni
  - `good`: reps 0→interval 1; reps 1→interval 6; dalej interval × ease; due = now + interval dni
  - `easy`: jak good, następnie interval × 1.3 i ease +0.15 (max 2.8); min. skok do 2 dni przy pierwszej powtórce
  - ease start 2.5; interval zaokrąglany do pełnych dni (poza `again`).

### Faza 2 — API i widok
- `src/db/reviews.ts` — `listDue(userId, now, limit)`, `applyGrade(userId, flashcardId, grade, now)`
  (atomowo aktualizuje review_state; cudzy id → false/404).
- `src/pages/api/reviews.ts` — GET due, POST `{ flashcardId, grade }`.
- `src/components/ReviewSession.tsx` — pokaż przód → „Pokaż odpowiedź" → 4 przyciski
  ocen; licznik pozostałych; stan „nic do powtórki".
- `src/pages/review.astro` — osadza wyspę.

## Success criteria
- Nowa fiszka: `good` → due jutro; kolejne `good` → +6 dni (wyrocznia SM-2).
- `again` wraca do sesji (due za 10 min), lapses rośnie.
- Ocena cudzej fiszki → 404, stan nietknięty.

## Risks
- Off-by-one w datach → testy na granicach (dokładnie due=now; 23:59).
- Dryf wyroczni → tabela reguł w tym planie jest źródłem asercji (oracle problem, M3L1).

## Progress
- [x] Faza 1
- [x] Faza 2
