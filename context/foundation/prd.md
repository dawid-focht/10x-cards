# PRD — 10xCards

> Product Requirements Document wygenerowany z `shape-notes.md` (/10x-prd).
> Kontrakt produktowy: opisuje CO budujemy i dla kogo. Tech stack, plan testów
> i deployment są poza zakresem tego dokumentu (konsumują go kolejne artefakty).

## 1. Wizja

10xCards usuwa największą barierę w korzystaniu ze spaced repetition: koszt ręcznego
tworzenia dobrych fiszek. Użytkownik wkleja przeczytany tekst, AI proponuje fiszki
(pytanie–odpowiedź), a użytkownik w kilkanaście sekund decyduje, które trafiają do
jego zestawu. Zestaw jest jego — bo każdą fiszkę jawnie zaakceptował — a aplikacja
pilnuje harmonogramu powtórek.

**Problem:** manualne tworzenie wysokiej jakości fiszek jest czasochłonne, co
zniechęca do efektywnej metody nauki (spaced repetition).

**Wartość:** skrócenie drogi od „przeczytałem materiał" do „mam zaufany zestaw
fiszek i plan powtórek" z godzin do minut, bez oddawania kontroli nad jakością.

## 2. Persona

**Dorosły samouk** — np. developer uczący się nowej technologii albo student przed
egzaminem. Sam dobiera materiały źródłowe (dokumentacja, artykuły, własne notatki
— zawsze tekst). Po sesji czytania chce zamienić materiał na fiszki, którym ufa.
Pracuje w przeglądarce na desktopie. Zna pojęcie fiszek; nie musi znać pojęcia
spaced repetition — aplikacja decyduje za niego, co i kiedy powtórzyć.

## 3. Kryteria sukcesu

| Metryka | Cel | Źródło pomiaru |
| --- | --- | --- |
| Akceptowalność fiszek AI | ≥ 75% wygenerowanych propozycji zaakceptowane (w tym po edycji) | tabela `generations`: (accepted_unedited + accepted_edited) / generated |
| Udział AI w tworzeniu | ≥ 75% nowych fiszek powstaje z użyciem AI | `flashcards.source` ≠ manual / wszystkie |
| Przepływ end-to-end | Użytkownik przechodzi rejestrację → generację → akceptację → powtórkę bez wsparcia | test E2E + obserwacja |

## 4. User stories

- **US-001 Rejestracja** — Given nowy użytkownik na stronie rejestracji, When poda poprawny e-mail i hasło (min. 8 znaków), Then konto powstaje i użytkownik jest zalogowany.
- **US-002 Logowanie** — Given zarejestrowany użytkownik, When poda poprawne dane, Then otrzymuje sesję i trafia do aplikacji; przy błędnych danych widzi ogólny komunikat (bez wskazania pola).
- **US-003 Generacja** — Given zalogowany użytkownik na widoku „Generuj", When wklei tekst 1 000–10 000 znaków i uruchomi generację, Then widzi listę propozycji fiszek (przód/tył); żadna nie jest jeszcze zapisana.
- **US-004 Bramka akceptacji** — Given lista propozycji, When użytkownik akceptuje wybrane (bez zmian lub po edycji), odrzuca resztę i zapisuje, Then w bazie lądują wyłącznie zaakceptowane fiszki z oznaczeniem pochodzenia (`ai-full` / `ai-edited`).
- **US-005 Fiszka manualna** — Given zalogowany użytkownik, When utworzy fiszkę ręcznie, Then pojawia się ona na liście ze źródłem `manual`.
- **US-006 Zarządzanie** — Given lista „Moje fiszki", When użytkownik edytuje albo usuwa fiszkę (usuwanie z potwierdzeniem), Then zmiana jest trwała i widoczna natychmiast.
- **US-007 Powtórki** — Given fiszki z terminem ≤ dziś, When użytkownik przechodzi sesję (odsłania odpowiedź, ocenia Again/Hard/Good/Easy), Then każda ocena wyznacza nowy termin wg algorytmu rozłożonych powtórek.
- **US-008 Ochrona dostępu** — Given niezalogowany użytkownik, When wejdzie na dowolny widok aplikacji poza logowaniem/rejestracją, Then jest przekierowany do logowania.
- **US-009 Izolacja danych** — Given zalogowany użytkownik A, When spróbuje sięgnąć po zasób użytkownika B (URL/API), Then otrzymuje 404 bez ujawnienia istnienia zasobu.

## 5. Wymagania funkcjonalne

- **FR-001** Rejestracja konta: e-mail + hasło (min. 8 znaków), walidacja formatu, unikalność e-maila, hasło przechowywane wyłącznie jako hash.
- **FR-002** Logowanie/wylogowanie z sesją w cookie HttpOnly; sesja wygasa po 30 dniach.
- **FR-003** Generowanie propozycji fiszek z wklejonego tekstu o długości 1 000–10 000 znaków; walidacja długości przed wysyłką; propozycje istnieją tylko w widoku przeglądu.
- **FR-004** Przegląd propozycji: per pozycja akceptuj / edytuj-i-akceptuj / odrzuć; edycja zmienia oznaczenie na `ai-edited`.
- **FR-005** Zapis zbiorczy wyłącznie zaakceptowanych propozycji.
- **FR-006** Manualne tworzenie fiszki (przód ≤ 200 znaków, tył ≤ 500 znaków — te same limity dla generacji i edycji).
- **FR-007** Lista fiszek użytkownika z paginacją, podglądem i oznaczeniem źródła.
- **FR-008** Edycja fiszki (przód/tył) z zachowaniem stanu powtórek.
- **FR-009** Usuwanie fiszki z potwierdzeniem; usunięcie kasuje też stan powtórek.
- **FR-010** Sesja powtórek: wybór fiszek `due_at ≤ teraz`, kolejność od najdawniej wymagalnych, ocena w skali Again/Hard/Good/Easy, aktualizacja stanu wg uproszczonego SM-2.
- **FR-011** Rejestrowanie metryk każdej generacji: liczność wygenerowanych/zaakceptowanych bez edycji/po edycji/odrzuconych, model, długość tekstu, czas trwania.
- **FR-012** Obsługa błędów generacji: czytelny komunikat, możliwość ponowienia, zapis błędu w `generation_errors`.
- **FR-013** Autoryzacja zasobów: wszystkie operacje ograniczone do właściciela; cudze zasoby nieodróżnialne od nieistniejących (404).

## 6. Reguła biznesowa

**Żadna fiszka nie trafia do zestawu użytkownika bez jego jawnej akceptacji, a termin
każdej powtórki wyznacza algorytm rozłożonych powtórek na podstawie oceny odpowiedzi
— nie ręczny wybór.**

Dwie decyzje domenowe aplikacji: (1) transformacja tekstu na kandydatów na fiszki z
bramką akceptacji, (2) harmonogramowanie powtórek. To odróżnia 10xCards od pustego
CRUD-a na rekordach.

## 7. Model danych (poziom produktowy)

| Encja | Rola | Kluczowe pola |
| --- | --- | --- |
| users | konto użytkownika | email (unikalny), password_hash, created_at |
| sessions | sesje logowania | token, user_id, expires_at |
| flashcards | fiszki użytkownika | user_id, front, back, source (`ai-full`/`ai-edited`/`manual`), generation_id?, timestamps |
| review_state | stan powtórek (1:1 z fiszką) | due_at, interval_days, ease, reps, lapses |
| generations | metryki generacji AI | user_id, model, source_text_length, generated/accepted_unedited/accepted_edited/rejected_count, duration_ms |
| generation_errors | log błędów AI | user_id, model, error_code, message |

## 8. Kontrola dostępu

- Konta e-mail + hasło; jedna rola (`user`), brak adminów w MVP.
- Sesje w cookie HttpOnly (SameSite=Lax); middleware wymusza logowanie na wszystkich widokach poza `/login`, `/register`.
- Izolacja danych per użytkownik na poziomie każdego zapytania (FR-013).

## 9. Non-goals

- Własny zaawansowany algorytm powtórek (SuperMemo/FSRS) — świadomie uproszczony SM-2.
- Import plików (PDF, DOCX i inne) — wyłącznie copy-paste tekstu.
- Współdzielenie zestawów, role, organizacje, funkcje społecznościowe.
- Integracje z zewnętrznymi platformami edukacyjnymi.
- Aplikacje mobilne (tylko web, desktop-first).
- Płatności i limity abonamentowe.
- Odzyskiwanie hasła przez e-mail (brak infrastruktury mailowej w MVP).

## 10. Open Questions

- **Model LLM i koszty:** który model daje najlepszy stosunek jakości fiszek do ceny? Decyzja w `tech-stack.md`; architektura musi pozwalać na podmianę modelu.
- **Rate limiting generacji:** MVP nie limituje liczby generacji per użytkownik; do rozstrzygnięcia przed publicznym wdrożeniem.
- **Retencja logów błędów:** `generation_errors` bez polityki czyszczenia w MVP.
- **Języki treści:** prompt zakłada fiszki w języku tekstu źródłowego; nie weryfikujemy jakości dla języków innych niż PL/EN.
