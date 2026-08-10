/**
 * Asercje zestawu — wyłącznie strukturalne.
 *
 * Nic tu nie dopasowuje tekstu recenzji. Oceniamy trzy rzeczy, w tej kolejności:
 *   1. `gate`  — wynik bramki (`evaluateGate` policzone w review.ts) vs wyrocznia przypadku,
 *   2. `scale` — czy model w ogóle utrzymał skalę 1-10 (`outOfRangeScores` → `warnings`),
 *   3. `criteria` — czy kryterium, które MIAŁO polecieć nisko, faktycznie poleciało.
 *
 * Werdykt modelu (`modelVerdict`) jest raportowany, ale nie decyduje — bramka
 * liczy się z ocen niezależnie od niego (patrz common/review-schema.ts).
 */

/** Provider zwraca obiekt; string obsłużony na wypadek serializacji po drodze. */
function asReview(output) {
  if (typeof output === 'string') return JSON.parse(output);
  return output;
}

function formatScores(scores) {
  return Object.entries(scores ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}

/** Bramka vs wyrocznia przypadku (`expectedGate`: "pass" albo "blocked"). */
export function gateMatchesExpectation(output, context) {
  const review = asReview(output);
  const expected = context.vars.expectedGate;
  if (expected !== 'pass' && expected !== 'blocked') {
    return { pass: false, score: 0, reason: `przypadek nie deklaruje expectedGate (jest: ${expected})` };
  }
  const actual = review.gate?.passed ? 'pass' : 'blocked';
  const pass = actual === expected;
  const reasons = (review.gate?.reasons ?? []).join(' | ');
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? `bramka = ${actual} (zgodnie z wyrocznią), oceny: ${formatScores(review.scores)}`
      : `bramka = ${actual}, oczekiwano ${expected}; oceny: ${formatScores(review.scores)}${reasons ? `; powody bramki: ${reasons}` : ''}`,
  };
}

/** Skala: pięć ocen, całkowite, w zakresie 1-10 (warnings z outOfRangeScores). */
export function scoresWithinScale(output) {
  const review = asReview(output);
  const scores = review.scores ?? {};
  const missing = Object.entries(scores).filter(([, value]) => typeof value !== 'number');
  const warnings = review.warnings ?? [];
  const pass = warnings.length === 0 && missing.length === 0 && Object.keys(scores).length === 5;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? `pięć ocen całkowitych w skali 1-10 (${formatScores(scores)})`
      : `model wyszedł poza kontrakt skali: ${[...warnings, ...missing.map(([key]) => `${key} nie jest liczbą`)].join('; ') || `${Object.keys(scores).length} ocen zamiast 5`}`,
  };
}

/**
 * Kryteria, które w danym przypadku mają polecieć nisko (`expectMax`: {klucz: próg}).
 * Przypadki bez naruszeń nie deklarują nic — wtedy asercja przechodzi z adnotacją.
 */
export function criterionExpectations(output, context) {
  const review = asReview(output);
  const expectMax = context.vars.expectMax;
  if (!expectMax || Object.keys(expectMax).length === 0) {
    return { pass: true, score: 1, reason: 'przypadek bez oczekiwań na poziomie kryteriów' };
  }
  const scores = review.scores ?? {};
  const misses = [];
  const hits = [];
  for (const [key, max] of Object.entries(expectMax)) {
    const score = scores[key];
    if (typeof score !== 'number') {
      misses.push(`${key}: brak oceny`);
    } else if (score <= max) {
      hits.push(`${key}=${score}≤${max}`);
    } else {
      misses.push(`${key}=${score} > ${max}`);
    }
  }
  const pass = misses.length === 0;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? `złapane naruszenia: ${hits.join(', ')}`
      : `przeoczone naruszenia: ${misses.join(', ')}${hits.length ? ` (złapane: ${hits.join(', ')})` : ''}`,
  };
}
