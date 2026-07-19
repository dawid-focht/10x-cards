# Plan — S-01 Konto i sesja

**End state:** użytkownik może się zarejestrować (e-mail + hasło ≥ 8 znaków),
zalogować i wylogować. Sesja żyje w cookie HttpOnly (30 dni). Każda strona poza
`/login` i `/register` przekierowuje niezalogowanych do `/login`; API bez sesji
zwraca 401. (FR-001, FR-002, US-001, US-002, US-008)

## Fazy

### Faza 1 — fundament danych i kryptografia
- `src/db/schema.sql` — Intent: idempotentny schemat całej bazy (users, sessions,
  flashcards, review_state, generations, generation_errors). Contract: wykonywalny
  wielokrotnie (CREATE TABLE IF NOT EXISTS), FK z ON DELETE CASCADE.
- `src/db/index.ts` — Intent: singleton `node:sqlite` + migracja przy starcie.
  Contract: `getDb(): DatabaseSync`, ścieżka z `DATABASE_FILE` (default `data/app.db`),
  `:memory:` wspierane dla testów.
- `src/lib/auth.ts` — Intent: hasła i sesje bez zewnętrznego IdP. Contract:
  `hashPassword`, `verifyPassword` (scrypt + sól, timingSafeEqual),
  `createSession`, `getSessionUser`, `destroySession`, `SESSION_COOKIE`.

### Faza 2 — endpointy i middleware
- `src/pages/api/auth/register.ts`, `login.ts`, `logout.ts` — Contract: POST JSON;
  register waliduje format e-maila i długość hasła, 409 przy duplikacie; login
  zwraca 401 z komunikatem ogólnym (bez wskazania pola); oba ustawiają cookie.
- `src/middleware.ts` — Contract: wczytuje usera do `locals.user`; strony chronione →
  redirect `/login`; `/api/*` (poza auth) → 401 JSON.

### Faza 3 — widoki
- `src/layouts/Layout.astro` — nawigacja (Generuj / Moje fiszki / Powtórki / Wyloguj).
- `src/pages/login.astro`, `register.astro`, `index.astro` (redirect wg sesji).

## Success criteria (zachowanie)
- Rejestracja z poprawnymi danymi loguje automatycznie (US-001).
- Błędne logowanie: jeden ogólny komunikat (US-002).
- GET dowolnej strony bez sesji → 302 na `/login` (US-008); API → 401.
- Hasło w bazie nigdy plaintext (scrypt, format `salt:hash`).

## Risks
- Timing leak przy porównaniu haseł → `crypto.timingSafeEqual`.
- Enumeracja e-maili przy rejestracji: 409 świadomie akceptowane w MVP (odnotowane).

## Progress
- [ ] Faza 1
- [ ] Faza 2
- [ ] Faza 3
