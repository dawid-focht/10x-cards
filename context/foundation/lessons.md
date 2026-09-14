# Lessons — rejestr lekcji z incydentów (append-only)

## L-001 CLAUDE.md jest symlinkiem — zapis niszczy AGENTS.md

- **Context:** bootstrap F-01; create-astro generuje `CLAUDE.md -> AGENTS.md` (symlink).
- **Problem:** zapis treści „do CLAUDE.md" podążył za symlinkiem i nadpisał pełne
  reguły w AGENTS.md jedną linijką importu.
- **Rule:** przed nadpisaniem pliku konfiguracyjnego sprawdź `ls -la`, czy nie jest
  symlinkiem; reguły edytuj wyłącznie w AGENTS.md.
- **Applies to:** AGENTS.md, CLAUDE.md, wszystkie pliki generowane starterem.

## L-002 Dryf kontraktów przy równoległej pracy agentów

- **Context:** równoległa implementacja wieloma agentami (fan-out na pliki
  pisane w tym samym czasie).
- **Problem:** dryf kontraktów między plikami pisanymi równolegle — agenci
  wymyślali własne sygnatury importów/eksportów, przez co pliki nie składały
  się w całość.
- **Rule:** sygnatury eksportów ustalaj przed fan-outem i wklejaj dosłownie do
  każdego promptu.
- **Applies to:** praca multi-agent.

## L-003 Dostawca AI zwraca błąd w odpowiedzi HTTP 200

- **Context:** produkcja 2026-09-14, pierwsze generacje na darmowych modelach
  OpenRouter (`nvidia/nemotron-3-super-120b-a12b:free`); 2 z 3 generacji padły
  z komunikatem „Odpowiedź usługi AI ma nieoczekiwany format", w bazie
  `generation_errors` kod `bad_response`.
- **Problem:** przy przeciążeniu upstreamu OpenRouter odpowiada statusem 200 z
  ciałem `{"error": {"code": 502, "message": "…overloaded"}}`. Klient sprawdzał
  tylko `response.ok` i brak `choices`, więc błąd dostawcy był raportowany jako
  zły format, nic nie trafiało do logu serwera i nie było ponowienia — ryzyko
  R-04 z planu testów zmaterializowało się dokładnie w opisanej postaci.
- **Rule:** kontrakt z zewnętrznym dostawcą testuj także na odpowiedzi
  „200 + błąd w ciele"; błąd dostawcy dostaje własny kod (`upstream`), własny
  wpis w logu i ponowienie na modelu zapasowym (`AI_MODEL_FALLBACKS`).
  Regresję pilnuje `tests/unit/openrouter.test.ts`.
- **Applies to:** `src/lib/ai/openrouter.ts`, każdy przyszły provider w `src/lib/ai/`.
