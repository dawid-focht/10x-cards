# 10xCards

**Wersja publiczna:** https://cards.focht.pl (rejestracja otwarta).

Aplikacja webowa do generowania fiszek edukacyjnych przez AI. Użytkownik wkleja
tekst źródłowy (1000–10000 znaków), AI proponuje fiszki, a **bramka akceptacji**
pozwala każdą propozycję zaakceptować, edytować lub odrzucić — zapisywane są
wyłącznie zaakceptowane. Powtórki działają wg algorytmu **SM-2** (oceny
Again/Hard/Good/Easy wyznaczają kolejne terminy).

Stack: Astro 7 (`output: 'server'`, adapter node) + React 19 + TypeScript strict
+ Tailwind 4 + SQLite przez `node:sqlite` (zero zewnętrznych usług bazodanowych).

## Wymagania

- Node.js **>= 22.12** (wbudowany `node:sqlite`)

## Szybki start

```sh
cp .env.example .env
npm install
npm run dev
```

Bez klucza API aplikacja używa deterministycznego MockProvidera — działa w pełni
lokalnie od razu po instalacji.

## Komendy

| Komenda | Opis |
|---|---|
| `npm run dev` | serwer deweloperski |
| `npm run check` | typecheck (`astro check`) |
| `npm run lint` | ESLint |
| `npm test` | testy jednostkowe (Vitest) |
| `npm run build && npm start` | build produkcyjny + serwer node |
| `npm run test:e2e` | testy Playwright (przed uruchomieniem wykonaj `npm run build`) |

## Konfiguracja AI

Domyślnie działa **MockProvider** (deterministyczne fiszki, bez sieci) — używany
też w testach i CI (`MOCK_AI=1`). Opcjonalnie ustaw w `.env`:

- `OPENROUTER_API_KEY` — klucz OpenRouter (lub innego API zgodnego z OpenAI)
- `AI_MODEL`, `AI_BASE_URL` — model i endpoint (patrz `.env.example`)

## Struktura katalogów

```
src/
  db/          # połączenie SQLite (index.ts), schema.sql, repozytoria (SQL tylko tutaj)
  lib/         # auth, http, walidacja, ai/ (interfejs providera + mock)
  components/  # wyspy React (interaktywne UI)
  pages/       # strony .astro + api/ (endpointy JSON)
  middleware.ts
context/       # artefakty kursu 10xDevs: foundation/ (PRD, roadmapa, test-plan,
               # code-review, lessons) i changes/ (plany zmian per slice)
tests/         # unit (Vitest) + e2e (Playwright)
```

## Certyfikacja 10xDevs

Mapowanie sześciu wymagań certyfikacyjnych na miejsca w repo:

1. **Auth** — rejestracja/logowanie/wylogowanie i ochrona widoków:
   `src/lib/auth.ts`, `src/pages/api/auth/`, `src/middleware.ts`;
   plan: `context/changes/s01-auth/`.
2. **CRUD** — zarządzanie fiszkami (lista, tworzenie manualne, edycja,
   usuwanie z potwierdzeniem, izolacja per użytkownik): repozytoria w `src/db/`,
   endpointy `src/pages/api/`; plan: `context/changes/s03-manage/`.
3. **Logika biznesowa** — generacja AI z bramką akceptacji
   (`src/lib/ai/`, plan `context/changes/s02-generate/`) oraz powtórki SM-2
   (tabela `review_state`, plan `context/changes/s04-review/`).
4. **Artefakty pracy z AI** — `context/foundation/` (prd, tech-stack, roadmap,
   test-plan, code-review, lessons) oraz `context/changes/*/plan.md`.
5. **Testy** — jednostkowe `tests/unit/` (Vitest, m.in. wyrocznia SM-2)
   i e2e `tests/e2e/` (Playwright na MockProviderze, `MOCK_AI=1`).
6. **CI/CD** — `.github/workflows/ci.yml`: lint → typecheck → testy jednostkowe →
   build → e2e na mocku; artefakt raportu Playwright przy porażce.
