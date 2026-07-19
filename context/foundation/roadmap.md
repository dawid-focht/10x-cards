# Roadmap — 10xCards MVP

> Wynik /10x-roadmap na podstawie `prd.md`. Vertical-first: każdy slice to pełny
> przepływ użytkownika przez wszystkie warstwy, weryfikowalny end-to-end.
> Bez estymat czasowych — kolejność wynika z Prerequisites.

**Main goal:** działający przepływ „tekst → propozycje AI → akceptacja → powtórki"
spełniający wymagania certyfikacji Builder.

**North star slice:** S-02 (generacja + bramka akceptacji) — najmniejszy przepływ
udowadniający tezę produktu: AI usuwa koszt tworzenia fiszek, użytkownik zachowuje
kontrolę nad jakością.

**Top blocker:** brak — stack w pełni lokalny, jedyna zależność zewnętrzna (API LLM)
ma deterministyczny MockProvider.

## Foundations

### F-01 Bootstrap projektu
- **Unlocks:** S-01, S-02, S-03, S-04
- **Zakres:** szkielet Astro 5 + React + TS + Tailwind (starter CLI), schemat SQLite
  (node:sqlite) z idempotentną migracją, middleware sesji (szkielet), lint/format,
  reguły agenta (CLAUDE.md/AGENTS.md), skrypty npm.
- **Status:** done

## Slices

### S-01 Konto i sesja
- **Outcome:** User can utworzyć konto, zalogować się i wylogować; widoki aplikacji są niedostępne bez sesji.
- **Change ID:** `s01-auth` · **PRD refs:** FR-001, FR-002, US-001, US-002, US-008
- **Prerequisites:** F-01 · **Risk:** niski (wzorce dobrze znane) · **Status:** done

### S-02 Generacja fiszek z bramką akceptacji ⭐ north star
- **Outcome:** User can wkleić tekst (1–10 tys. znaków), otrzymać propozycje fiszek od AI, zaakceptować/edytować/odrzucić każdą i zapisać wyłącznie zaakceptowane.
- **Change ID:** `s02-generate` · **PRD refs:** FR-003, FR-004, FR-005, FR-011, FR-012, US-003, US-004
- **Prerequisites:** F-01, S-01 · **Risk:** średni (parsowanie odpowiedzi LLM, obsługa błędów) — mitygacja: interfejs AiProvider + MockProvider, walidacja odpowiedzi
- **Status:** done

### S-03 Zarządzanie fiszkami
- **Outcome:** User can przeglądać swoje fiszki, tworzyć manualne, edytować i usuwać (z potwierdzeniem); widzi źródło każdej fiszki.
- **Change ID:** `s03-manage` · **PRD refs:** FR-006, FR-007, FR-008, FR-009, FR-013, US-005, US-006, US-009
- **Prerequisites:** S-01 (równolegle z S-02 poza zapisem zaakceptowanych) · **Risk:** niski · **Status:** done

### S-04 Sesja powtórek (SR)
- **Outcome:** User can przejść sesję powtórek fiszek wymagalnych na dziś, ocenić odpowiedzi (Again/Hard/Good/Easy), a system wyznacza kolejne terminy wg SM-2.
- **Change ID:** `s04-review` · **PRD refs:** FR-010, US-007
- **Prerequisites:** S-02 lub S-03 (muszą istnieć fiszki) · **Risk:** średni (poprawność algorytmu) — mitygacja: czysta funkcja + testy jednostkowe z wyrocznią z wymagań
- **Status:** done

## Pokrycie must-have z PRD (self-review)

FR-001..FR-013 pokryte przez F-01 + S-01..S-04. Metryki sukcesu (tabela `generations`)
realizowane w S-02. Brak osieroconych fundamentów (F-01 odblokowuje wszystkie slice'y).

## Unknowns / Parked

- Wybór docelowego modelu LLM i limity kosztów — Parked (interfejs pozwala podmienić; MVP domyślnie MockProvider bez klucza, OpenRouter z kluczem).
- Rate limiting generacji — Parked do fazy publicznego wdrożenia (Open Question w PRD).
