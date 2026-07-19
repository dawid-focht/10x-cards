---
starter_id: custom-astro-local
bootstrapper_confidence: manual
path_taken: custom
has_auth: true
has_ai: true
has_payments: false
has_realtime: false
has_background_jobs: false
---

# Tech Stack — 10xCards

> Wynik kroku /10x-tech-stack-selector na podstawie `prd.md`.
> Ścieżka `custom`: kursowy starter `10x-astro-starter` (Astro + Supabase + OpenRouter)
> nie jest osiągalny w tym środowisku — brak Dockera (lokalny Supabase odpada) i przyjęta
> zasada „nie zakładamy kont w usługach zewnętrznych".
> Zamienniki wybrane tak, by zachować charakter startera i zdawalność certyfikacji.

## Stack

| Warstwa | Wybór | Rola |
| --- | --- | --- |
| Framework | **Astro 5** (output: server, adapter node) | SSR, routing, API endpoints, middleware sesji |
| UI | **React 19** (wyspy) + **Tailwind CSS 4** | interaktywny przegląd propozycji i sesja powtórek |
| Język | **TypeScript 5** (strict) | typy end-to-end, przyjazność agentowi |
| Baza danych | **SQLite** przez `node:sqlite` (wbudowany w Node ≥ 22.5) + cienka typowana warstwa repozytoriów | zero natywnych zależności i kompilacji w CI, idempotentne migracje SQL |
| Auth | własne sesje: scrypt (node:crypto) + cookie HttpOnly | FR-001/002, brak zewnętrznego IdP |
| AI | **OpenRouter-compatible provider** (fetch, chat completions) + **MockProvider** | generacja fiszek; mock = deterministyczny fallback dla dev/testów/CI |
| Testy unit | **Vitest** | logika domenowa (SM-2, walidacje, parsowanie odpowiedzi AI) |
| Testy E2E | **Playwright** | kluczowy przepływ użytkownika (US-003/004/007) |
| CI/CD | **GitHub Actions** | lint + typecheck + unit + build + E2E (na MockProvider) |
| Lint/format | **ESLint + Prettier** | spójność kodu generowanego przez agenta |

## Why this stack (powiązanie z PRD)

- **FR-003/004 (generacja + przegląd propozycji)** — stan przeglądu żyje w przeglądarce do momentu zapisu zbiorczego (FR-005): wyspa React jest do tego naturalna, a Astro nie ciągnie pełnego SPA.
- **FR-010 (SM-2)** — czysta funkcja w TypeScript, testowalna Vitestem bez uruchamiania przeglądarki.
- **FR-013 (izolacja)** — każda funkcja repozytorium przyjmuje `userId` z sesji i filtruje w SQL; middleware Astro daje jedno miejsce egzekwowania logowania (US-008).
- **Open Question „podmiana modelu"** — interfejs `AiProvider` z implementacjami `OpenRouterProvider` (dowolny model przez jeden klucz; zgodny też z kluczem OpenAI przez zmianę base URL) i `MockProvider`. CI nie potrzebuje sekretów.
- **Kryteria sukcesu** — tabele `generations`/`generation_errors` w tym samym SQLite; brak drugiego systemu do utrzymania.

## Quality gates (kryteria agent-friendly z M1L2)

| Komponent | Typed | Convention-based | Popular in training | Well-documented |
| --- | --- | --- | --- | --- |
| Astro 5 | ✅ | ✅ (src/pages, src/components) | ✅ | ✅ |
| React 19 | ✅ | ✅ | ✅ | ✅ |
| node:sqlite + typowane repozytoria | ✅ | ✅ (schema.sql + repos) | ✅ | ✅ (docs Node.js) |
| Tailwind 4 | n/d | ✅ | ✅ | ✅ |
| Vitest / Playwright | ✅ | ✅ | ✅ | ✅ |

Werdykt: **ready** — bez planu kompensacji.

## Odstępstwa od kursowego startera i ich koszt

| Starter kursowy | Tutaj | Konsekwencja |
| --- | --- | --- |
| Supabase (auth + Postgres) | SQLite (node:sqlite) + własne sesje | więcej własnego kodu auth (~1 dzień), ale pełna lokalność i testowalność w CI bez sekretów; warstwa repozytoriów izoluje SQL na wypadek migracji do Postgresa |
| OpenRouter (klucz wymagany) | OpenRouter/OpenAI-compatible + mock | działa bez klucza (mock); z kluczem — realna generacja |
| Shadcn/ui | czysty Tailwind | mniej zależności; UI skromniejszy, wystarczający dla MVP |
| DigitalOcean deploy | build + adapter node, deploy opisany w `deployment-plan.md` | publiczny deployment jako warstwa ponad minimum certyfikacji (zgodnie z prework 4.2) |
