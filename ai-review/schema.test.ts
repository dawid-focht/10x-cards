/**
 * Offline self-test kontraktu recenzenta — zero sieci, zero klucza API.
 *
 *   npx tsx schema.test.ts
 *
 * Sprawdza trzy rzeczy:
 *   1. REVIEW_SCHEMA przyjmuje poprawną odpowiedź i odrzuca niepoprawną,
 *   2. evaluateGate implementuje regułę progową z dokumentu kryteriów,
 *      łącznie z przypadkami brzegowymi (dokładnie 3, dokładnie 5 na kryterium
 *      krytycznym, średnia dokładnie 7.0),
 *   3. eksporty pomocnicze (REVIEW_JSON_SCHEMA, outOfRangeScores) trzymają kontrakt.
 *
 * Kod wyjścia: 0 = wszystko przeszło, 1 = jest awaria.
 */

import {
  GATE_AVERAGE_MIN,
  GATE_CRITICAL_FLOOR,
  GATE_HARD_FLOOR,
  REVIEW_JSON_SCHEMA,
  REVIEW_SCHEMA,
  SCORE_KEYS,
  SYSTEM_PROMPT,
  averageScore,
  evaluateGate,
  outOfRangeScores,
  type Review,
} from './common/review-schema.ts';

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    process.stdout.write(`  ok   ${name}\n`);
  } else {
    failures.push(name);
    process.stdout.write(`  FAIL ${name}${detail ? ` — ${detail}` : ''}\n`);
  }
}

function section(title: string): void {
  process.stdout.write(`\n${title}\n`);
}

/** Buduje pełną odpowiedź recenzenta: bazowo same siódemki, z punktowymi nadpisaniami. */
function review(overrides: Partial<Review> = {}): Review {
  return {
    data_isolation: 7,
    plan_contract_drift: 7,
    test_oracle_integrity: 7,
    error_contract_integrity: 7,
    ai_boundary_and_secrets: 7,
    verdict: 'pass',
    summary: '## Znaleziska\n\nBrak.',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
section('1. REVIEW_SCHEMA — parsowanie');
// ---------------------------------------------------------------------------

const validPayload = {
  data_isolation: 9,
  plan_contract_drift: 8,
  test_oracle_integrity: 7,
  error_contract_integrity: 8,
  ai_boundary_and_secrets: 10,
  verdict: 'pass',
  summary: '## Znaleziska\n\n- Brak blokerów.',
};

const okParse = REVIEW_SCHEMA.safeParse(validPayload);
check('poprawny obiekt przechodzi', okParse.success, okParse.success ? '' : okParse.error.message);
check(
  'sparsowane wartości są zachowane',
  okParse.success && okParse.data.data_isolation === 9 && okParse.data.verdict === 'pass',
);

const missingField = REVIEW_SCHEMA.safeParse({ ...validPayload, ai_boundary_and_secrets: undefined });
check('brak kryterium jest odrzucany', !missingField.success);

const stringScore = REVIEW_SCHEMA.safeParse({ ...validPayload, data_isolation: '9' });
check('ocena jako string jest odrzucana', !stringScore.success);

const badVerdict = REVIEW_SCHEMA.safeParse({ ...validPayload, verdict: 'maybe' });
check('verdict spoza enum jest odrzucany', !badVerdict.success);

const missingSummary = REVIEW_SCHEMA.safeParse({ ...validPayload, summary: undefined });
check('brak summary jest odrzucany', !missingSummary.success);

// Świadoma luka: gołe z.number() bez .min()/.max() — structured outputs odrzucają
// minimum/maximum na integerach, więc zakres pilnuje prompt + outOfRangeScores().
const outOfScale = REVIEW_SCHEMA.safeParse({ ...validPayload, data_isolation: 42 });
check('ocena 42 przechodzi schemat (świadomy brak .min()/.max())', outOfScale.success);
check(
  'outOfRangeScores() wyłapuje 42, czego schemat nie robi',
  outOfRangeScores(review({ data_isolation: 42 })).length === 1,
);
check(
  'outOfRangeScores() wyłapuje ułamek',
  outOfRangeScores(review({ plan_contract_drift: 7.5 })).length === 1,
);
check('outOfRangeScores() milczy dla poprawnych ocen', outOfRangeScores(review()).length === 0);

// ---------------------------------------------------------------------------
section('2. REVIEW_JSON_SCHEMA — kształt wysyłany do providera');
// ---------------------------------------------------------------------------

const js = REVIEW_JSON_SCHEMA as {
  type?: string;
  required?: string[];
  properties?: Record<string, { type?: string; description?: string; enum?: string[] }>;
};

check('to obiekt', js.type === 'object');
check(
  'ma dokładnie 7 pól (5 ocen + verdict + summary)',
  Object.keys(js.properties ?? {}).length === 7,
  `jest ${Object.keys(js.properties ?? {}).length}`,
);
check(
  'wszystkie 5 kryteriów jest wymaganych',
  SCORE_KEYS.every((key) => (js.required ?? []).includes(key)),
);
check(
  'oceny są typu number bez minimum/maximum',
  SCORE_KEYS.every((key) => {
    const prop = js.properties?.[key] as Record<string, unknown> | undefined;
    return prop?.['type'] === 'number' && !('minimum' in (prop ?? {})) && !('maximum' in (prop ?? {}));
  }),
);
check(
  'każde kryterium niesie pełną rubrykę w description',
  SCORE_KEYS.every((key) => {
    const description = js.properties?.[key]?.description ?? '';
    return (
      description.includes('1-3 —') &&
      description.includes('4-6 —') &&
      description.includes('7-8 —') &&
      description.includes('9-10 —')
    );
  }),
);
check('verdict jest enumem pass/fail', JSON.stringify(js.properties?.['verdict']?.enum) === '["pass","fail"]');
check(
  'SYSTEM_PROMPT nazywa skalę 1-10 wprost',
  SYSTEM_PROMPT.includes('LICZBĄ CAŁKOWITĄ od 1 do 10'),
);

// ---------------------------------------------------------------------------
section('3. evaluateGate — reguła 1: dowolne kryterium ≤ 3');
// ---------------------------------------------------------------------------

check(`stała GATE_HARD_FLOOR = 3`, GATE_HARD_FLOOR === 3);
check(
  'wszystkie 7 → przepuszcza',
  evaluateGate(review()).passed,
  JSON.stringify(evaluateGate(review()).reasons),
);
check('dokładnie 3 na plan_contract_drift → blokuje', !evaluateGate(review({ plan_contract_drift: 3 })).passed);
check(
  'dokładnie 3 daje powód z reguły 1',
  evaluateGate(review({ plan_contract_drift: 3 })).reasons.some((r) => r.startsWith('Reguła 1')),
);
check(
  '4 na niekrytycznym kryterium → nie odpala reguły 1',
  !evaluateGate(review({ plan_contract_drift: 4 })).reasons.some((r) => r.startsWith('Reguła 1')),
);
check(
  '1 na test_oracle_integrity → blokuje',
  !evaluateGate(review({ test_oracle_integrity: 1 })).passed,
);

// ---------------------------------------------------------------------------
section('4. evaluateGate — reguła 2: podłoga 6 na kryteriach krytycznych');
// ---------------------------------------------------------------------------

check('stała GATE_CRITICAL_FLOOR = 5', GATE_CRITICAL_FLOOR === 5);

// Kompensacja dziesiątkami, żeby średnia nie zdominowała testu reguły 2.
const isolation5 = review({ data_isolation: 5, plan_contract_drift: 10, test_oracle_integrity: 10 });
check('data_isolation dokładnie 5 → blokuje mimo średniej 7.8', !evaluateGate(isolation5).passed);
check('powód pochodzi z reguły 2', evaluateGate(isolation5).reasons.some((r) => r.startsWith('Reguła 2')));
check('a nie z reguły 3 (średnia jest w porządku)', averageScore(isolation5) >= GATE_AVERAGE_MIN);

const secrets5 = review({ ai_boundary_and_secrets: 5, plan_contract_drift: 10, test_oracle_integrity: 10 });
check('ai_boundary_and_secrets dokładnie 5 → blokuje', !evaluateGate(secrets5).passed);

const isolation6 = review({ data_isolation: 6, plan_contract_drift: 8 });
check('data_isolation = 6 → reguła 2 milczy', !evaluateGate(isolation6).reasons.some((r) => r.startsWith('Reguła 2')));
check('data_isolation = 6 przy średniej 7.0 → przepuszcza', evaluateGate(isolation6).passed);

const drift5 = review({ plan_contract_drift: 5, data_isolation: 10, error_contract_integrity: 9 });
check(
  'kryterium NIEkrytyczne = 5 nie odpala reguły 2',
  !evaluateGate(drift5).reasons.some((r) => r.startsWith('Reguła 2')),
);
check('…i przy dobrej średniej przechodzi (pasmo 4-6 jest informacyjne)', evaluateGate(drift5).passed);

// ---------------------------------------------------------------------------
section('5. evaluateGate — reguła 3: średnia < 7.0');
// ---------------------------------------------------------------------------

check('stała GATE_AVERAGE_MIN = 7.0', GATE_AVERAGE_MIN === 7.0);

const exactly70 = review({
  data_isolation: 6,
  plan_contract_drift: 7,
  test_oracle_integrity: 7,
  error_contract_integrity: 8,
  ai_boundary_and_secrets: 7,
});
check('średnia dokładnie 7.0 → przepuszcza (próg jest ostry: < 7.0)', evaluateGate(exactly70).passed);
check('…i średnia faktycznie wynosi 7.0', averageScore(exactly70) === 7.0);

const justBelow = review({
  data_isolation: 6,
  plan_contract_drift: 7,
  test_oracle_integrity: 7,
  error_contract_integrity: 7,
  ai_boundary_and_secrets: 7,
});
check('średnia 6.8 → blokuje', !evaluateGate(justBelow).passed);
check(
  'blokuje wyłącznie regułą 3 (żadna ocena nie jest ≤ 3 ani krytyczna ≤ 5)',
  evaluateGate(justBelow).reasons.length === 1 && evaluateGate(justBelow).reasons[0]!.startsWith('Reguła 3'),
);

const fractional = review({
  data_isolation: 7,
  plan_contract_drift: 7,
  test_oracle_integrity: 7,
  error_contract_integrity: 7,
  ai_boundary_and_secrets: 6,
});
check('średnia 6.8 z innego rozkładu też blokuje', !evaluateGate(fractional).passed);

// ---------------------------------------------------------------------------
section('6. evaluateGate — kumulacja powodów i niezależność od verdict modelu');
// ---------------------------------------------------------------------------

const disaster = review({
  data_isolation: 1,
  plan_contract_drift: 3,
  test_oracle_integrity: 2,
  error_contract_integrity: 2,
  ai_boundary_and_secrets: 1,
  verdict: 'pass',
});
const disasterGate = evaluateGate(disaster);
check('katastrofa blokuje', !disasterGate.passed);
check(
  'zbiera powody ze wszystkich trzech reguł (5×R1 + 2×R2 + 1×R3 = 8)',
  disasterGate.reasons.length === 8,
  `jest ${disasterGate.reasons.length}`,
);
check(
  'powody są w kolejności reguł',
  disasterGate.reasons.slice(0, 5).every((r) => r.startsWith('Reguła 1')) &&
    disasterGate.reasons.slice(5, 7).every((r) => r.startsWith('Reguła 2')) &&
    disasterGate.reasons[7]!.startsWith('Reguła 3'),
);
check('verdict "pass" od modelu nie ratuje diffu', !evaluateGate(review({ data_isolation: 1, verdict: 'pass' })).passed);
check('verdict "fail" od modelu nie blokuje dobrych ocen', evaluateGate(review({ verdict: 'fail' })).passed);
check('idealny zestaw dziesiątek przepuszcza', evaluateGate(review({
  data_isolation: 10,
  plan_contract_drift: 10,
  test_oracle_integrity: 10,
  error_contract_integrity: 10,
  ai_boundary_and_secrets: 10,
})).passed);

// ---------------------------------------------------------------------------
section('7. Scenariusz z fixtures/sample-diff.patch');
// ---------------------------------------------------------------------------

// Tak wyglądałaby ocena diffu, który: pyta o flashcards bez WHERE user_id,
// wkleja klucz API do src/lib/ai/suggest.ts z pominięciem getAiProvider(),
// zdejmuje MOCK_AI z joba E2E, odhacza nieistniejącą fazę w ## Progress
// i asertuje toBeDefined() na wartości skopiowanej z implementacji.
const sampleDiffReview = review({
  data_isolation: 1,
  plan_contract_drift: 2,
  test_oracle_integrity: 2,
  error_contract_integrity: 2,
  ai_boundary_and_secrets: 1,
  verdict: 'fail',
});
const sampleGate = evaluateGate(sampleDiffReview);
check('fixture jest blokowany', !sampleGate.passed);
check(
  'i to regułą 1 na data_isolation',
  sampleGate.reasons.some((r) => r.startsWith('Reguła 1') && r.includes('data_isolation')),
);
check(
  'oraz regułą 2 na ai_boundary_and_secrets',
  sampleGate.reasons.some((r) => r.startsWith('Reguła 2') && r.includes('ai_boundary_and_secrets')),
);

// ---------------------------------------------------------------------------

process.stdout.write(
  `\n${failures.length === 0 ? 'PASS' : 'FAIL'} — ${passed} asercji przeszło, ${failures.length} nie przeszło\n`,
);
if (failures.length > 0) {
  for (const name of failures) process.stdout.write(`  - ${name}\n`);
  process.exit(1);
}
