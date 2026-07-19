# Code review — standard solo (M2L3/M5L3)

Standard przeglądu własnego kodu (i kodu wygenerowanego przez agentów) przed
merge'em. Review robimy per zmiana (`context/changes/<change-id>/`), diff
porównujemy z planem zmiany, nie z pamięcią.

## Scorecard — 6 wymiarów

Każdy wymiar oceniamy PASS / WARN / FAIL z jednozdaniowym uzasadnieniem.

| Wymiar | Pytanie kontrolne |
|---|---|
| **Plan Adherence** | Czy diff realizuje fazy z `plan.md` — nic pominięte, nic „przy okazji"? |
| **Scope** | Czy zmiana nie wychodzi poza zakres slice'a (brak refaktorów niezwiązanych plików, brak nowych zależności bez uzasadnienia)? |
| **Safety** | Izolacja `user_id` w każdym zapytaniu SQL, brak sekretów w kodzie, brak destrukcyjnych operacji na bazie, poprawne kody błędów (404 zamiast 403)? |
| **Architecture** | SQL tylko w repozytoriach `src/db/*.ts`, AI tylko przez `getAiProvider()`, limity tylko z `src/lib/validation.ts`, wyspy React osadzane przez strony `.astro`? |
| **Patterns** | Zgodność z konwencjami AGENTS.md: JSON `{ error }` przy błędach, teksty UI po polsku, Conventional Commits? |
| **Success Criteria** | Czy kryteria sukcesu z planu zmiany są spełnione i pokryte testami wyprowadzonymi z wymagań (nie z implementacji)? |

## Triage znalezisk

Każde znalezisko dostaje dokładnie jedną etykietę:

- **fix-now** — błąd poprawności, bezpieczeństwa lub izolacji danych; blokuje
  merge, poprawiamy natychmiast.
- **fix-differently** — problem realny, ale poprawka wymaga zmiany planu lub
  innego podejścia; aktualizujemy `plan.md`, potem kod.
- **skip** — świadomie odpuszczamy (kosmetyka, mikro-optymalizacja); zapisujemy
  jednym zdaniem dlaczego.
- **lesson** — problem systemowy / powtarzalny; dopisujemy wpis do
  `context/foundation/lessons.md` (append-only).

## Definition of Done

Zmiana jest gotowa do merge'a, gdy wszystkie punkty są spełnione:

1. Przechodzi `npm run lint`, `npm run check` i wszystkie testy (unit + e2e).
2. Diff jest zgodny z planem zmiany (`context/changes/<change-id>/plan.md`),
   a sekcja `## Progress` odzwierciedla stan faktyczny.
3. Każde zapytanie do bazy filtruje po `user_id` (izolacja danych, FR-013).
4. Brak sekretów w kodzie — konfiguracja wyłącznie przez env / `.env.example`.
5. UI po polsku z obsługą stanów błędów (walidacja 400, brak sesji 401,
   brak zasobu 404, awaria AI 502).
