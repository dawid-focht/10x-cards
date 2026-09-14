# Infrastructure — 10xCards

> Wynik /10x-infra-research (M1L5), wzorzec ADR. Konsumuje `tech-stack.md`.

## Decyzja

**Hosting: VPS Hetzner (Ubuntu 24.04, Node 22) — proces `node dist/server/entry.mjs`
pod systemd, nginx jako reverse proxy z TLS od Let's Encrypt, baza SQLite w trwałym
katalogu poza aplikacją.** Aplikacja działa publicznie pod https://cards.focht.pl
(wdrożenie 2026-09-14 według planu poniżej). Rozważane były managed Node hosty
(DigitalOcean App Platform); VPS wygrał, bo już go mam i nie wymaga kolejnego konta.

## Scored comparison (kryteria agent-friendly z M1L5)

| Kryterium | Cloudflare Pages/Workers | DigitalOcean App Platform | VPS (Node + systemd) |
| --- | --- | --- | --- |
| CLI | ✅ wrangler | ✅ doctl | ⚠️ ssh/scp |
| Managed | ✅ | ✅ | ❌ (własny patching) |
| Docs dla agenta | ✅ | ✅ | ✅ (standardowy Linux) |
| Deployment API | ✅ | ✅ | ⚠️ własne skrypty |
| Zgodność ze stackiem | ⚠️ **SQLite przez node:sqlite nie działa na Workers** (wymaga D1 = zmiana warstwy DB) | ✅ adapter node bez zmian | ✅ adapter node bez zmian |

Kursowa rekomendacja (Cloudflare) odpada bez zmiany warstwy bazy — nasz stack używa
`node:sqlite` i pliku na dysku. Wybór: platforma uruchamiająca proces Node z trwałym
wolumenem.

## Anti-bias (3 testy)

- **Devil's advocate:** „dlaczego VPS to zły wybór?" — brak managed patchingu i
  backupów; akceptuję ryzyko dla projektu kursowego, do produkcji → App Platform.
- **Pre-mortem:** najbardziej prawdopodobna awaria = utrata pliku SQLite przy
  redeployu → wymóg: trwały wolumen/katalog danych poza katalogiem aplikacji
  (`DATABASE_FILE=/var/lib/10x-cards/app.db`).
- **Unknown unknowns:** limity API LLM na produkcji (rate limits, koszty) —
  dopisane do Open Questions w PRD; mock nie maskuje ich w testach obciążeniowych.

## Plan wdrożenia (do wykonania ręcznie — wymaga kont/sekretów)

1. `npm run build` → `dist/` (adapter node, tryb standalone).
2. Serwer: Node 22+, `node dist/server/entry.mjs`, proces pod systemd.
3. Env: `DATABASE_FILE` (trwały katalog), `OPENROUTER_API_KEY` (sekret, nigdy w repo),
   `SESSION_SECURE=1`, `HOST=127.0.0.1`, `PORT=4321` + reverse proxy (Caddy/nginx, TLS).
4. Rollback: poprzedni build w katalogu wersjonowanym + symlink; baza migrowana
   idempotentnie (CREATE TABLE IF NOT EXISTS), bez migracji destrukcyjnych.
5. Akcje destrukcyjne (usunięcie bazy, rotacja sekretów) — wyłącznie człowiek.

## Sekrety i uprawnienia

- Klucz LLM tylko w env procesu; brak kluczy w repo i w CI (CI używa MockProvider).
- Brak zewnętrznego IdP; sesje własne — nie ma tokenów OAuth do zarządzania.
