# 10xCards — reguły dla agentów AI

Aplikacja webowa do generowania fiszek edukacyjnych przez AI z bramką akceptacji
i powtórkami SM-2. Kontrakty projektu żyją w `context/` — czytaj just-in-time:

- `context/foundation/prd.md` — wymagania (FR-NNN), user stories, non-goals
- `context/foundation/tech-stack.md` — stack i powody
- `context/foundation/roadmap.md` — slice'y S-01..S-04
- `context/foundation/test-plan.md` — mapa ryzyk i quality gates
- `context/changes/<change-id>/plan.md` — plan aktywnej zmiany (aktualizuj `## Progress`)
- `context/foundation/lessons.md` — lekcje z incydentów (append-only)

## Komendy

- `npm run dev` — dev server (uruchamiaj w tle: `astro dev --background`;
  zarządzanie: `astro dev stop` / `status` / `logs`)
- `npm run check` — typecheck (astro check); `npm run lint` — ESLint
- `npm test` — testy jednostkowe (Vitest); `npm run test:e2e` — Playwright
- `npm run build && npm start` — build produkcyjny + serwer node

## Konwencje (niewywnioskowalne z kodu)

- **Baza:** wyłącznie `node:sqlite` przez `src/db/index.ts`; schemat w
  `src/db/schema.sql` (idempotentny — tylko `CREATE ... IF NOT EXISTS`, bez
  migracji destrukcyjnych). SQL trzymaj w plikach `src/db/*.ts` (repozytoria),
  nigdy w endpointach ani komponentach.
- **Izolacja danych (FR-013):** każda funkcja repozytorium przyjmuje `userId`
  jako pierwszy argument i filtruje `WHERE user_id = ?`. Brak wiersza właściciela
  → zwróć `false`/`undefined`, endpoint mapuje na 404 (nigdy 403 — nie
  rozróżniamy „cudze" od „nie istnieje").
- **AI:** dostęp do LLM tylko przez `getAiProvider()` z `src/lib/ai/provider.ts`.
  `MOCK_AI=1` lub brak klucza = MockProvider. Testy i CI NIGDY nie wołają
  prawdziwego API. Kluczy nie commituj; konfiguracja przez env (`.env.example`).
- **Walidacja:** limity domenowe są w `src/lib/validation.ts` (tekst źródłowy
  1000–10000, front ≤ 200, back ≤ 500) — importuj, nie duplikuj literałów.
- **API:** endpointy w `src/pages/api/**` zwracają JSON `{ error: string }` przy
  błędzie; kody: 400 walidacja, 401 brak sesji, 404 brak zasobu, 409 konflikt,
  502 awaria providera AI.
- **UI:** teksty interfejsu po polsku; komponenty interaktywne to wyspy React w
  `src/components/`, strony `.astro` tylko osadzają i przekazują dane.
- **Testy:** asercje wyprowadzaj z wymagań (PRD/plan), nie z implementacji
  (oracle problem). Reguły SM-2 w `context/changes/s04-review/plan.md` są
  wyrocznią dla `tests/unit/srs.test.ts` — zmiana reguł wymaga zmiany planu.
- **Commity:** Conventional Commits; commituj wskazane pliki, nigdy `git add -A`.
- **Bezpieczeństwo:** operacje destrukcyjne na bazie (DROP/DELETE bez WHERE,
  usuwanie pliku bazy) wymagają jawnego potwierdzenia człowieka.
- **Uwaga na symlink:** `CLAUDE.md` jest symlinkiem do `AGENTS.md` — edytuj
  wyłącznie `AGENTS.md`; zapis „do CLAUDE.md" nadpisuje ten plik.

## Dokumentacja Astro

Pełna dokumentacja: https://docs.astro.build (routing, framework components,
styling/Tailwind — sięgaj przy pracy w tych obszarach).
