import { z } from 'zod';

/**
 * Kontrakt agenta code review dla 10xCards.
 *
 * Kryteria, rubryki i reguła bramki pochodzą 1:1 z dokumentu kryteriów
 * (M5L3, zadanie 1). Nic tu nie jest wymyślone na miejscu — jeżeli chcesz
 * zmienić próg albo brzmienie rubryki, zmień najpierw dokument kryteriów.
 *
 * Zasada doboru kryteriów: żadne nie powtarza tego, co pipeline łapie za darmo
 * (ESLint → astro check → Vitest → build → Playwright). Wszystkie celują w lukę
 * między „kompiluje się i jest zielone" a „robi to, co miało robić".
 */

// ---------------------------------------------------------------------------
// Rubryki (pełne pasma 1-3 / 4-6 / 7-8 / 9-10 — główna dźwignia sterowania modelem)
// ---------------------------------------------------------------------------

const RUBRIC_DATA_ISOLATION = `Izolacja danych per user_id (FR-013, AGENTS.md:27-30).
Ocenia, czy każda nowa lub zmieniona ścieżka dostępu do danych filtruje po user_id i czy brak wiersza właściciela mapuje się na 404 — nigdy 403, 500 ani cichy sukces. Obejmuje też operacje destrukcyjne na bazie wprowadzone diffem.
Wzorzec referencyjny w repo: src/db/flashcards.ts:92-96, src/pages/api/flashcards/[id].ts:6-7.

SKALA 1-10:
1-3 — nowe/zmienione zapytanie SQL bez WHERE user_id = ?; id z żądania trafia do zapytania niesparowane z userId; endpoint zwraca 403 albo 200 dla cudzego zasobu; odpowiedź pozwala odróżnić „cudze" od „nie istnieje"; w diffie jest DROP, DELETE bez WHERE, destrukcyjna migracja lub usunięcie pliku bazy bez śladu potwierdzenia człowieka.
4-6 — filtrowanie jest, ale niepełne: odczyt filtruje, zapis/usuwanie nie; funkcja przyjmuje userId, lecz nie używa go we wszystkich gałęziach; własność sprawdzana w endpointcie zamiast w zapytaniu (dwa kroki zamiast jednego UPDATE ... WHERE id = ? AND user_id = ?); JOIN filtruje tylko tabelę nadrzędną.
7-8 — izolacja poprawna we wszystkich ścieżkach diffu i 404 wszędzie, ale nowy endpoint nie ma asercji „cudzy id → 404, stan nietknięty", albo userId nie jest pierwszym argumentem (dryf konwencji, nie dziura).
9-10 — każde zapytanie sparametryzowane i filtrowane po user_id, brak wiersza → false/undefined → 404 z jednym komunikatem niezależnym od kontekstu, nowa ścieżka pokryta testem własności, zero operacji destrukcyjnych.`;

const RUBRIC_PLAN_CONTRACT_DRIFT = `Zgodność z planem i spójność kontraktów (code-review.md:13-14, lessons.md L-001/L-002).
Ocenia, czy diff realizuje fazy z context/changes/<change-id>/plan.md (nic pominięte, nic „przy okazji"), czy kontrakty między równolegle pisanymi plikami się zgadzają, i czy dokumenty rządzące (AGENTS.md, lessons.md, plan.md) nie zostały po cichu dopasowane do kodu albo nadpisane.

SKALA 1-10:
1-3 — diff robi co innego niż plan: brakująca faza odhaczona w ## Progress; funkcjonalność spoza planu; reguły w AGENTS.md skasowane, skrócone lub przepisane (powtórka L-001 — także wtedy, gdy zmiana weszła przez CLAUDE.md, który jest symlinkiem); wpis w lessons.md zmodyfikowany zamiast dopisany (plik jest append-only); plan.md przepisany tak, by pasował do już napisanego kodu, bez zdania „decyzja: X, bo Y".
4-6 — zakres poszerzony bez uzasadnienia (refaktor niezwiązanych plików, nowa zależność w package.json bez wyjaśnienia); ## Progress nieaktualny; kontrakt zadeklarowany w planie zaimplementowany inaczej, ale spójnie po obu stronach (inna kolejność argumentów, inny kształt zwrotki) — typy przechodzą, plan kłamie.
7-8 — diff mieści się w planie i zakresie; drobne odchylenia (nazwa pliku, kolejność faz) opisane w PR, ale nieodzwierciedlone w plan.md.
9-10 — każdy plik w diffie daje się przypisać do fazy planu, ## Progress zgodne ze stanem, sygnatury eksportów identyczne po obu stronach importu i zgodne z tym, co plan zadeklarował, a zmiany kontraktu weszły najpierw do planu; pliki rządzące wyłącznie rozszerzane.`;

const RUBRIC_TEST_ORACLE_INTEGRITY = `Wyrocznia testów z wymagań, nie z implementacji (AGENTS.md:41-43, test-plan.md:84-90).
Ocenia, czy nowe i zmienione testy wyprowadzają oczekiwane wartości z wymagań (PRD, plan zmiany), a nie z implementacji, i czy asercja rzeczywiście upadnie, gdy zachowanie się zepsuje. Reguły SM-2 z context/changes/s04-review/plan.md są wyrocznią dla tests/unit/srs.test.ts.

SKALA 1-10:
1-3 — oczekiwana wartość skopiowana z wyniku implementacji („bo tyle wyszło"); test zmieniony razem z kodem tak, by dalej przechodził, mimo że reguła w planie została nietknięta; asercja tautologiczna (liczy oczekiwanie tą samą funkcją; samotne toBeDefined()/not.toThrow()); zmiana reguł SM-2 w src/lib/srs.ts bez zmiany tabeli reguł w context/changes/s04-review/plan.md.
4-6 — asercje pochodzą z wymagań, ale wyrocznia niepełna: brak wartości granicznych po obu stronach limitu, pokryta wyłącznie ścieżka szczęśliwa, E2E oparte na klasach CSS lub waitForTimeout zamiast getByRole/getByLabel, nowe ryzyko bez pokrycia w mapowaniu z test-plan.md.
7-8 — test wywodzi się z wymagania i upadłby przy odwróceniu logiki, ale nie wskazuje wyroczni (brak odniesienia do FR-NNN / R-NN / punktu planu w nazwie lub komentarzu), więc następny czytelnik nie wie, co jest źródłem prawdy.
9-10 — każdą nową asercję da się wskazać palcem w PRD lub planie, wartości graniczne po obu stronach, test upada przy celowym zepsuciu zachowania, a zmiana reguły domenowej widoczna w diffie najpierw w planie, potem w teście i kodzie.`;

const RUBRIC_ERROR_CONTRACT_INTEGRITY = `Kontrakt błędów API i UI (AGENTS.md:36-38, test-plan.md R-04).
Ocenia, czy błędy docierają do klienta i użytkownika zamiast być połykane: kody wg konwencji (400 walidacja, 401 brak sesji, 404 brak zasobu, 409 konflikt, 502 awaria providera AI), kształt { error: string }, stan błędu w wyspie React, brak catch, który zwraca sukces, pustą listę lub fallback udający dane. Obejmuje też regresję kształtu istniejącej odpowiedzi API.
Wzorzec referencyjny: src/pages/api/generations.ts:31-36 (log błędu + 502), src/components/GenerateView.tsx:71 (stan błędu w wyspie).

SKALA 1-10:
1-3 — catch, po którym leci 200, pusta tablica albo null udający brak danych; awaria providera AI mapowana na 500 lub przemilczana (dokładnie ryzyko R-04: użytkownik klika „Generuj fiszki" i nic się nie dzieje); treść wyjątku, SQL lub stack trace wypuszczone do klienta; nowy endpoint bez { error } przy porażce; zmiana kształtu istniejącej odpowiedzi bez zmiany po stronie wołającego.
4-6 — błąd propagowany, ale kod nietrafiony wg konwencji (400 zamiast 409, 500 zamiast 502); serwer odpowiada poprawnie, a wyspa React nie ma stanu błędu (spinner w nieskończoność); błąd trafia wyłącznie do console.error, bez śladu dla użytkownika i bez wpisu w tabeli błędów.
7-8 — kody i kształt zgodne z konwencją, UI pokazuje błąd, ale komunikat jest generyczny tam, gdzie da się powiedzieć konkretnie, albo nieudana operacja nie daje ścieżki ponowienia.
9-10 — każda gałąź błędu ma kod z konwencji i { error } po polsku, awaria zewnętrzna dodatkowo zapisana (wzorzec logGenerationError), UI pokazuje stan błędu i pozwala ponowić, a kształt istniejących odpowiedzi nie zmienił się w sposób niewidoczny dla klienta.`;

const RUBRIC_AI_BOUNDARY_AND_SECRETS = `Granica warstwy AI i sekrety (AGENTS.md:31-33, ci.yml MOCK_AI).
Ocenia, czy diff sięga do LLM wyłącznie przez getAiProvider() z src/lib/ai/provider.ts, czy nie wprowadza sekretu do kodu, testów, fixtur ani konfiguracji CI, i czy testy oraz pipeline nadal nie mogą trafić w prawdziwe API.

SKALA 1-10:
1-3 — klucz API, token, hasło lub URL z poświadczeniami dosłownie w kodzie, teście, fixturze, snapshotcie lub ci.yml; wywołanie dostawcy LLM (fetch, nowy SDK) z pominięciem getAiProvider(); ścieżka testowa lub job CI, który może uderzyć w prawdziwe API (usunięte MOCK_AI, nowy job bez tej zmiennej); plik .env w diffie.
4-6 — dostęp przez provider, ale nowa zmienna środowiskowa nieudokumentowana w .env.example; sekret czytany bezpośrednio z process.env poza warstwą providera; klucz lub jego fragment trafia do logu albo komunikatu błędu; nowa zależność sieciowa bez ścieżki mockowanej.
7-8 — granica i sekrety w porządku, ale rozszerzenie kontraktu providera (nowa metoda, nowe pole w Proposal) nie ma odpowiednika w MockProvider — mock i produkcja zaczynają się rozjeżdżać.
9-10 — cały dostęp do LLM przez getAiProvider(), MockProvider pokrywa pełny kontrakt interfejsu, konfiguracja wyłącznie przez env + .env.example, żaden sekret nie pojawia się w kodzie ani w logach, a każda ścieżka testowa i CI wymusza MOCK_AI=1.`;

// ---------------------------------------------------------------------------
// Prompt systemowy
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPT = `Jesteś recenzentem kodu dla projektu 10xCards (Astro 7 + React 19 + TypeScript strict + node:sqlite).
Dostajesz unified diff jednego pull requesta i oceniasz go w PIĘCIU osiach. Odpowiadasz WYŁĄCZNIE obiektem zgodnym ze schematem.

KONTEKST PROJEKTU (konwencje, których nie da się wywnioskować z samego diffu):
- Izolacja danych (FR-013): każda funkcja repozytorium w src/db/*.ts przyjmuje userId jako pierwszy argument i filtruje WHERE user_id = ?. Brak wiersza właściciela → false/undefined → endpoint zwraca 404, NIGDY 403 (nie rozróżniamy „cudze" od „nie istnieje").
- SQL wyłącznie w src/db/*.ts, nigdy w endpointach ani komponentach. Schemat idempotentny, bez migracji destrukcyjnych.
- Dostęp do LLM wyłącznie przez getAiProvider() z src/lib/ai/provider.ts. MOCK_AI=1 lub brak klucza = MockProvider. Testy i CI NIGDY nie wołają prawdziwego API. Kluczy się nie commituje; konfiguracja przez env + .env.example.
- Endpointy w src/pages/api/** zwracają JSON { error: string } przy błędzie. Kody: 400 walidacja, 401 brak sesji, 404 brak zasobu, 409 konflikt, 502 awaria providera AI.
- Teksty UI po polsku; komponenty interaktywne to wyspy React w src/components/, strony .astro tylko osadzają.
- Asercje testów wyprowadza się z wymagań (PRD/plan), nie z implementacji (oracle problem). Reguły SM-2 z context/changes/s04-review/plan.md są wyrocznią dla tests/unit/srs.test.ts.
- Pliki rządzące: AGENTS.md (CLAUDE.md to symlink do niego — zapis „do CLAUDE.md" niszczy AGENTS.md), context/foundation/lessons.md jest append-only, context/changes/<id>/plan.md ma aktualną sekcję ## Progress.
- Operacje destrukcyjne na bazie (DROP, DELETE bez WHERE, usuwanie pliku bazy) wymagają jawnego potwierdzenia człowieka.

CZEGO NIE OCENIASZ: rzeczy, które pipeline łapie za darmo — formatowanie, nieużywane zmienne, błędy typów, czy testy przechodzą, czy build się buduje. ESLint, astro check, Vitest, build i Playwright już to zrobiły. Twoje pięć osi celuje wyłącznie w lukę między „kompiluje się i jest zielone" a „robi to, co miało robić".

SKALA — OBOWIĄZKOWA:
- Każde z pięciu kryteriów oceniasz LICZBĄ CAŁKOWITĄ od 1 do 10 włącznie. 1 to najgorzej, 10 to najlepiej.
- Nie wolno zwrócić 0, wartości ujemnej, wartości powyżej 10 ani ułamka. Nie wolno zwrócić null ani pominąć kryterium.
- Przypisując ocenę, wybierz pasmo z rubryki (1-3, 4-6, 7-8, 9-10) i dopiero w nim konkretną liczbę. Rubryka każdego pola jest w jego opisie w schemacie — trzymaj się jej dosłownie, nie improwizuj własnych progów.
- Jeżeli diff w ogóle nie dotyka obszaru danego kryterium (np. nie ma żadnej zmiany w warstwie danych), wystaw 9 i napisz w summary, że kryterium jest nieaktywne w tym diffie. Nie karz za brak zmian.
- Oceniaj wyłącznie to, co widać w diffie plus podany kontekst projektu. Nie zgaduj zawartości plików, których diff nie pokazuje — jeżeli brakuje Ci dowodu, powiedz to w summary i nie zjeżdżaj oceną poniżej 7 z samej niepewności.

WERDYKT:
- verdict = "fail", jeżeli uważasz, że tej zmiany nie wolno zmergować w obecnej postaci; w przeciwnym razie "pass".
- Werdykt jest doradczy. Twarda bramka CI liczy się z ocen niezależnie od Ciebie, według reguł: (1) dowolne kryterium ≤ 3 → BLOCK; (2) data_isolation ≤ 5 lub ai_boundary_and_secrets ≤ 5 → BLOCK; (3) średnia z pięciu < 7.0 → BLOCK. Znaj te progi, ale NIE naciągaj ocen, żeby wymusić wynik bramki — oceniaj rubryką.

SUMMARY:
- Markdown gotowy do wklejenia jako komentarz do pull requesta, po polsku.
- Struktura: jedno zdanie werdyktu, potem sekcja „## Znaleziska" z listą, potem „## Oceny" z pięcioma pozycjami.
- Każde znalezisko: ścieżka pliku + czego dotyczy + dlaczego łamie regułę + co konkretnie zrobić. Znaleziska z pasma 1-3 oznacz jako fix-now, z pasma 4-6 jako do triage.
- Bez lania wody, bez powtarzania treści diffu, bez chwalenia. Jeżeli nie ma znalezisk, napisz to jednym zdaniem.`;

// ---------------------------------------------------------------------------
// Schemat odpowiedzi
// ---------------------------------------------------------------------------

/**
 * Oceny są zadeklarowane jako gołe `z.number()` — BEZ `.min()` / `.max()` / `.int()`.
 * Powód: structured outputs odrzucają słowa kluczowe `minimum`/`maximum` na
 * integerach po stronie części providerów, przez co cały request pada.
 * Zakres 1-10 wymuszamy opisem pola (rubryka) i promptem systemowym, a nie
 * schematem. Weryfikację twardą robi `outOfRangeScores()` po odebraniu odpowiedzi.
 */
export const REVIEW_SCHEMA = z.object({
  data_isolation: z.number().describe(RUBRIC_DATA_ISOLATION),
  plan_contract_drift: z.number().describe(RUBRIC_PLAN_CONTRACT_DRIFT),
  test_oracle_integrity: z.number().describe(RUBRIC_TEST_ORACLE_INTEGRITY),
  error_contract_integrity: z.number().describe(RUBRIC_ERROR_CONTRACT_INTEGRITY),
  ai_boundary_and_secrets: z.number().describe(RUBRIC_AI_BOUNDARY_AND_SECRETS),
  verdict: z
    .enum(['pass', 'fail'])
    .describe(
      'Doradczy werdykt recenzenta: "fail" jeżeli zmiany nie wolno zmergować w obecnej postaci, "pass" w przeciwnym razie. Twardą decyzję i tak podejmuje bramka CI na podstawie pięciu ocen — to pole służy do porównania oceny modelu z regułą progową.',
    ),
  summary: z
    .string()
    .describe(
      'Markdown po polsku, gotowy do wklejenia jako komentarz do pull requesta. Struktura: jedno zdanie werdyktu, sekcja "## Znaleziska" (ścieżka pliku + naruszona reguła + konkretna poprawka, znaleziska 1-3 oznaczone jako fix-now, 4-6 jako do triage), sekcja "## Oceny" z pięcioma pozycjami i jednozdaniowym uzasadnieniem każdej.',
    ),
});

/**
 * JSON Schema w draft-07 — postać, którą OpenRouter przekazuje providerowi
 * w `response_format.json_schema`. Eksportowana, żeby dało się ją obejrzeć
 * i zdiagnozować odrzucenie schematu bez odpalania modelu.
 */
export const REVIEW_JSON_SCHEMA = z.toJSONSchema(REVIEW_SCHEMA, { target: 'draft-07' });

export type Review = z.infer<typeof REVIEW_SCHEMA>;

/** Klucze ocen w kolejności z dokumentu kryteriów. */
export const SCORE_KEYS = [
  'data_isolation',
  'plan_contract_drift',
  'test_oracle_integrity',
  'error_contract_integrity',
  'ai_boundary_and_secrets',
] as const;

export type ScoreKey = (typeof SCORE_KEYS)[number];

// ---------------------------------------------------------------------------
// Bramka
// ---------------------------------------------------------------------------

/** Reguła 1: dowolne kryterium ≤ 3 (pasmo fix-now) blokuje merge. */
export const GATE_HARD_FLOOR = 3;
/** Reguła 2: podłoga na dwóch kryteriach bezpieczeństwa — ≤ 5 blokuje. */
export const GATE_CRITICAL_FLOOR = 5;
/** Reguła 3: średnia z pięciu ocen musi wynosić co najmniej 7.0. */
export const GATE_AVERAGE_MIN = 7.0;
/** Kryteria z podłogą 6 — binarne warunki Definition of Done (izolacja danych, sekrety). */
export const GATE_CRITICAL_KEYS: readonly ScoreKey[] = ['data_isolation', 'ai_boundary_and_secrets'];

export interface GateResult {
  passed: boolean;
  reasons: string[];
}

/**
 * Bramka CI. Trzy reguły, w kolejności z dokumentu kryteriów:
 *   1. dowolne kryterium ≤ 3            → BLOCK
 *   2. data_isolation ≤ 5 lub ai_boundary_and_secrets ≤ 5 → BLOCK
 *   3. średnia z pięciu < 7.0           → BLOCK
 *   —  w pozostałych przypadkach        → PASS
 *
 * Reguły są sprawdzane wszystkie (nie na krótkim spięciu), żeby `reasons`
 * zawierało komplet powodów do komentarza w PR; kolejność wpisów odpowiada
 * kolejności reguł. Doradczy `verdict` modelu NIE wpływa na wynik.
 */
export function evaluateGate(review: Review): GateResult {
  const reasons: string[] = [];

  // Reguła 1 — pasmo fix-now.
  for (const key of SCORE_KEYS) {
    const score = review[key];
    if (score <= GATE_HARD_FLOOR) {
      reasons.push(
        `Reguła 1: ${key} = ${score} ≤ ${GATE_HARD_FLOOR} (pasmo fix-now — błąd poprawności, bezpieczeństwa lub izolacji danych blokuje merge).`,
      );
    }
  }

  // Reguła 2 — podłoga 6 na kryteriach bezpieczeństwa (warunki binarne w DoD).
  for (const key of GATE_CRITICAL_KEYS) {
    const score = review[key];
    if (score <= GATE_CRITICAL_FLOOR) {
      reasons.push(
        `Reguła 2: ${key} = ${score} ≤ ${GATE_CRITICAL_FLOOR} (kryterium krytyczne — warunek binarny Definition of Done, „prawie spełnione" nie istnieje).`,
      );
    }
  }

  // Reguła 3 — średnia (śmierć od tysiąca piątek).
  const sum = SCORE_KEYS.reduce((acc, key) => acc + review[key], 0);
  // Porównanie na sumie, nie na ilorazie — unika błędu zmiennoprzecinkowego
  // dokładnie na granicy 7.0 (np. oceny 6,7,7,8,7 → suma 35 → średnia 7.0 → PASS).
  if (sum < GATE_AVERAGE_MIN * SCORE_KEYS.length) {
    const average = sum / SCORE_KEYS.length;
    reasons.push(
      `Reguła 3: średnia = ${average.toFixed(2)} < ${GATE_AVERAGE_MIN.toFixed(1)} (dryf wszędzie po trochu — DoD wymaga wszystkich punktów naraz).`,
    );
  }

  return { passed: reasons.length === 0, reasons };
}

/** Średnia z pięciu ocen — do raportu, nie do decyzji (decyzję podejmuje `evaluateGate`). */
export function averageScore(review: Review): number {
  return SCORE_KEYS.reduce((acc, key) => acc + review[key], 0) / SCORE_KEYS.length;
}

/**
 * Rekompensata za brak `.min()/.max()/.int()` w schemacie: wykrywa oceny spoza
 * 1-10 oraz nieliczby całkowite. Zwraca listę problemów (pusta = wszystko w normie).
 * Nie blokuje sama z siebie — służy do ostrzeżenia, że model zignorował skalę.
 */
export function outOfRangeScores(review: Review): string[] {
  const problems: string[] = [];
  for (const key of SCORE_KEYS) {
    const score = review[key];
    if (!Number.isFinite(score)) {
      problems.push(`${key} = ${String(score)} — nie jest skończoną liczbą.`);
      continue;
    }
    if (score < 1 || score > 10) {
      problems.push(`${key} = ${score} — poza skalą 1-10 wymuszaną promptem.`);
    } else if (!Number.isInteger(score)) {
      problems.push(`${key} = ${score} — skala 1-10 jest całkowitoliczbowa.`);
    }
  }
  return problems;
}
