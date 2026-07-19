# Shape Notes — 10xCards

> Zapis decyzji z sesji planistycznej (/10x-shape, tryb greenfield).
> Decyzje podejmowane wg kryteriów z preworku 4.2.

## Faza 1: Vision & problem

**Pytanie:** Co dokładnie chcesz rozwiązać i czemu?
**Decyzja:** Manualne tworzenie dobrych fiszek edukacyjnych (pytanie–odpowiedź) jest na
tyle czasochłonne, że ludzie rezygnują ze spaced repetition, mimo że to jedna z
najskuteczniejszych metod nauki. 10xCards skraca drogę od „przeczytałem materiał" do
„mam zestaw fiszek, którym ufam": użytkownik wkleja tekst, AI proponuje fiszki,
użytkownik je zatwierdza i powtarza wg harmonogramu.

**Wyzwanie sokratejskie:** Co musiałoby być prawdą, żeby to nie miało sensu?
— Gdyby użytkownicy woleli uczyć się bez fiszek albo ufali fiszkom AI bez przeglądu.
Przyjmujemy odwrotnie: wartością jest *bramka akceptacji* — użytkownik zachowuje
kontrolę nad jakością, AI usuwa koszt startowy.

## Faza 2: Persona & access control

**Persona:** Dorosły samouk (np. developer uczący się nowej technologii, student przed
egzaminem), który sam dobiera materiały źródłowe w formie tekstu (dokumentacja,
artykuły, notatki) i chce po sesji czytania zamienić tekst na fiszki, którym ufa.
Pracuje na desktopie, w przeglądarce.

**Access control:** Konta e-mail + hasło, sesja w cookie HttpOnly. Każdy użytkownik
widzi wyłącznie własne fiszki i statystyki. Jedna rola (user) — brak adminów,
organizacji i współdzielenia w MVP.

## Faza 3: MVP discipline

**Pierwszy wartościowy przepływ:** rejestracja → wklejenie tekstu → generacja
propozycji przez AI → przegląd (akceptuj / edytuj / odrzuć) → zapis → lista „Moje
fiszki" → sesja powtórek.

**Weryfikacja timeline:** przepływ realizowalny w < 3 tygodnie pracy po godzinach
(stack oparty o konwencje, brak integracji zewnętrznych poza jednym API LLM).
Czujnik dymu z preworku 4.2: pierwszy działający przepływ ~tydzień. ✅

## Faza 4: Functional Requirements + user stories

### FR (format FR-NNN)

- **FR-001** Rejestracja konta (e-mail + hasło, walidacja, hasło hashowane).
- **FR-002** Logowanie i wylogowanie; sesja utrzymywana w cookie HttpOnly.
- **FR-003** Generowanie propozycji fiszek przez AI z wklejonego tekstu (1 000–10 000 znaków); propozycje NIE są zapisywane jako fiszki użytkownika.
- **FR-004** Przegląd propozycji: dla każdej — akceptuj / edytuj-i-akceptuj / odrzuć (bramka akceptacji).
- **FR-005** Zapis wyłącznie zaakceptowanych propozycji jako fiszek użytkownika (zapis zbiorczy po przeglądzie).
- **FR-006** Manualne tworzenie fiszki (przód/tył) z pominięciem AI.
- **FR-007** Lista „Moje fiszki" z podglądem przodu/tyłu i źródłem pochodzenia (AI / AI-edytowana / manualna).
- **FR-008** Edycja istniejącej fiszki.
- **FR-009** Usuwanie fiszki z potwierdzeniem.
- **FR-010** Sesja powtórek: system wybiera fiszki „due", pokazuje przód → użytkownik odsłania tył → ocenia (Again/Hard/Good/Easy) → algorytm SR wyznacza kolejny termin.
- **FR-011** Zbieranie metryk generacji: liczba wygenerowanych / zaakceptowanych bez edycji / zaakceptowanych po edycji / odrzuconych (pod kryteria sukcesu).
- **FR-012** Obsługa błędów AI: timeout / błąd API → czytelny komunikat + możliwość ponowienia; błędy logowane.
- **FR-013** Autoryzacja zasobów: operacje na fiszkach wyłącznie właściciela; próba dostępu do cudzych → 404/403.

**Wyzwania sokratejskie (wybrane):**
- FR-003 błędny, gdyby AI generowało śmieciowe fiszki z krótkich tekstów → stąd dolny limit 1 000 znaków.
- FR-005 błędny, gdyby autosave propozycji był wygodniejszy → odrzucone: podważa regułę biznesową (zaufanie do zestawu).
- FR-010 błędny, gdyby użytkownik chciał sam wybierać fiszki do powtórki → odrzucone w MVP: wartość SR wynika z harmonogramu, nie z ręcznego wyboru.

### User stories (Given/When/Then)

- **US-001** Given nowy użytkownik na stronie rejestracji, When poda poprawny e-mail i hasło (min. 8 znaków), Then konto powstaje i użytkownik jest zalogowany.
- **US-002** Given zarejestrowany użytkownik, When poda poprawne dane logowania, Then otrzymuje sesję i widzi swój dashboard; When poda błędne, Then widzi komunikat bez ujawniania, które pole jest błędne.
- **US-003** Given zalogowany użytkownik na stronie „Generuj", When wklei tekst 1 000–10 000 znaków i kliknie „Generuj fiszki", Then otrzymuje listę propozycji (przód/tył) bez zapisu do bazy.
- **US-004** Given lista propozycji, When użytkownik zaakceptuje część (w tym po edycji) i odrzuci resztę, a następnie kliknie „Zapisz zaakceptowane", Then w bazie lądują wyłącznie zaakceptowane fiszki z oznaczeniem pochodzenia.
- **US-005** Given zalogowany użytkownik, When utworzy fiszkę ręcznie, Then fiszka pojawia się na liście ze źródłem „manual".
- **US-006** Given lista fiszek, When użytkownik edytuje lub usunie fiszkę (z potwierdzeniem), Then zmiana jest widoczna natychmiast i trwała.
- **US-007** Given użytkownik ma fiszki z terminem powtórki ≤ dziś, When rozpocznie sesję powtórek i oceni odpowiedzi, Then każda ocena aktualizuje termin kolejnej powtórki wg algorytmu SR.
- **US-008** Given niezalogowany użytkownik, When wejdzie na dowolny widok poza logowaniem/rejestracją, Then zostaje przekierowany do logowania.
- **US-009** Given zalogowany użytkownik A, When spróbuje odczytać/zmienić fiszkę użytkownika B (bezpośredni URL/API), Then dostaje 404 i nic nie wycieka.

## Faza 5: Business logic + data

**Reguła biznesowa (jedno zdanie):** Żadna fiszka nie trafia do zestawu użytkownika bez
jego jawnej akceptacji, a termin każdej powtórki wyznacza algorytm rozłożonych powtórek
na podstawie oceny odpowiedzi — nie ręczny wybór.

**Test pustego CRUD-a:** aplikacja podejmuje dwie decyzje domenowe: (1) transformacja
tekst → kandydaci na fiszki (AI) z bramką akceptacji, (2) harmonogram powtórek (SR).
Nie jest to lista rekordów. ✅

**Dane:**
- `users` — id, email (unikalny), password_hash, created_at.
- `sessions` — id (token), user_id, expires_at.
- `flashcards` — id, user_id, front, back, source (`ai-full` / `ai-edited` / `manual`), generation_id?, created_at, updated_at.
- `review_state` (1:1 z flashcard) — due_at, interval_days, ease, reps, lapses.
- `generations` — id, user_id, model, source_text_length, generated_count, accepted_unedited_count, accepted_edited_count, rejected_count, duration_ms, created_at.
- `generation_errors` — id, user_id, model, error_code, message, created_at.

## Faza 6: Product framing

Typ: aplikacja webowa (SSR + wyspy interaktywne), desktop-first, PL UI.
Skala: single-user accounts, dziesiątki–setki fiszek na użytkownika. Bez ambicji
produkcyjnej skali w MVP.

### Kryteria sukcesu (mierzalne w aplikacji)

- ≥ 75% fiszek wygenerowanych przez AI jest akceptowane (accepted / generated, z tabeli `generations`).
- ≥ 75% wszystkich nowych fiszek powstaje z użyciem AI (source ≠ manual).

### Non-goals (jawne)

- Własny zaawansowany algorytm powtórek (SuperMemo, FSRS) — używamy uproszczonego SM-2.
- Import plików (PDF, DOCX) — tylko copy-paste.
- Współdzielenie zestawów między użytkownikami, role, organizacje.
- Integracje z platformami edukacyjnymi.
- Aplikacje mobilne — tylko web.
- Płatności, limity abonamentowe.
- Odzyskiwanie hasła e-mailem (MVP: brak wysyłki maili) — świadome ograniczenie.

## Closing soft-gate ✅

1. **Access control** — tak: konta e-mail+hasło, izolacja per user, jedna rola.
2. **Data model** — tak: 6 tabel wyżej.
3. **Business logic** — tak: jednozdaniowa reguła (bramka akceptacji + SR).
4. **Project artifacts** — tak: prd.md, tech-stack.md, plan.md, test-plan.md, CLAUDE.md (kolejne lekcje).
5. **MVP-in-three-weeks** — tak: jeden przepływ, jedno API zewnętrzne, stack konwencjonalny.
6. **Non-goals** — tak: lista wyżej.

## Checkpoint

Decyzje powyżej są kompletne dla /10x-prd. Otwarte kwestie przeniesione do sekcji
Open Questions w PRD: dobór modelu LLM i limity kosztów, rate limiting generacji,
polityka retencji `generation_errors`.
