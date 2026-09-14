/**
 * Zamienia wynik `promptfoo eval -o results/latest.json` w macierz Markdown
 * do README. Nic nie liczy „od nowa" — czyta to, co zapisał promptfoo:
 * wynik bramki z review.ts, metryki asercji, koszt z OpenRouter i czasy.
 *
 *   node evals/report.mjs evals/results/latest.json
 */

import { readFileSync } from 'node:fs';

const path = process.argv[2] ?? 'evals/results/latest.json';
const raw = JSON.parse(readFileSync(path, 'utf8'));
const rows = raw.results?.results ?? [];
if (rows.length === 0) {
  process.stderr.write(`report.mjs: brak wyników w ${path}\n`);
  process.exit(1);
}

/** Kolejność kolumn = kolejność providerów w konfiguracji. */
const providers = [];
for (const row of rows) {
  const id = row.provider.id;
  if (!providers.some((p) => p.id === id)) {
    providers.push({ id, label: row.provider.label ?? id, model: row.metadata?.model ?? id });
  }
}

/** Kolejność wierszy = kolejność przypadków w konfiguracji. */
const cases = [];
for (const row of rows) {
  const name = caseName(row);
  if (!cases.some((c) => c.name === name)) {
    cases.push({ name, expectedGate: row.vars?.expectedGate ?? '?', expectMax: row.vars?.expectMax });
  }
}

function caseName(row) {
  const description = row.testCase?.description ?? '';
  return description.split('—')[0].trim() || description;
}

/** Recenzja dowieziona = provider zwrócił obiekt review.ts. Nieudana asercja
 *  (np. przeoczone kryterium) NIE jest awarią dowozu — to inna kolumna macierzy. */
function delivered(row) {
  const output = row?.response?.output;
  return output && typeof output === 'object' && output.scores ? output : null;
}

/** Krótka etykieta awarii — pełna treść zostaje w results/latest.json. */
function errorKind(row) {
  const error = (row.error ?? '').toString();
  if (error.includes('timeout po')) return 'ERR timeout';
  if (error.includes('response did not match schema')) return 'ERR schemat (niezgodny)';
  if (error.includes('could not parse the response')) return 'ERR schemat (nieparsowalny)';
  if (error.includes('exit 2')) return 'ERR agent';
  return 'ERR';
}

function cell(row) {
  if (!row) return { text: 'brak', ok: false };
  const output = delivered(row);
  if (!output) {
    return { text: errorKind(row), ok: false };
  }
  const actual = output.gate?.passed ? 'pass' : 'blocked';
  const expected = row.vars?.expectedGate;
  const ok = actual === expected;
  return { text: `${ok ? 'OK' : 'MISS'} ${actual}`, ok, output };
}

function find(caseName_, providerId) {
  return rows.find((r) => caseName(r) === caseName_ && r.provider.id === providerId);
}

function metricPass(row, metric) {
  const component = (row?.gradingResult?.componentResults ?? []).find(
    (c) => c.assertion?.metric === metric,
  );
  return component?.pass ?? null;
}

const out = [];
const head = (cells) => `| ${cells.join(' | ')} |`;
const sep = (n) => `|${' --- |'.repeat(n)}`;

// --- Macierz bramki -------------------------------------------------------
out.push('### Bramka: oczekiwanie vs wynik');
out.push('');
out.push(head(['przypadek', 'oczekiwanie', ...providers.map((p) => p.label)]));
out.push(sep(providers.length + 2));
for (const c of cases) {
  const cells = providers.map((p) => cell(find(c.name, p.id)).text);
  out.push(head([`\`${c.name}\``, c.expectedGate, ...cells]));
}
out.push('');

// --- Macierz ocen ---------------------------------------------------------
out.push('### Oceny (data_isolation / plan_contract_drift / test_oracle_integrity / error_contract_integrity / ai_boundary_and_secrets)');
out.push('');
out.push(head(['przypadek', ...providers.map((p) => p.label)]));
out.push(sep(providers.length + 1));
for (const c of cases) {
  const cells = providers.map((p) => {
    const row = find(c.name, p.id);
    const output = delivered(row);
    if (!output) return 'ERR';
    return Object.values(output.scores).join('/');
  });
  out.push(head([`\`${c.name}\``, ...cells]));
}
out.push('');

// --- Kryteria, które miały polecieć nisko ---------------------------------
const withExpectations = cases.filter((c) => c.expectMax && Object.keys(c.expectMax).length > 0);
if (withExpectations.length > 0) {
  out.push('### Czy model trafił w kryterium, które miało polecieć nisko');
  out.push('');
  out.push(head(['przypadek', 'próg', ...providers.map((p) => p.label)]));
  out.push(sep(providers.length + 2));
  for (const c of withExpectations) {
    const threshold = Object.entries(c.expectMax)
      .map(([key, value]) => `${key} ≤ ${value}`)
      .join('<br>');
    const cells = providers.map((p) => {
      const row = find(c.name, p.id);
      const pass = metricPass(row, 'criteria');
      if (pass === null) return 'ERR';
      return pass ? 'OK' : 'MISS';
    });
    out.push(head([`\`${c.name}\``, threshold, ...cells]));
  }
  out.push('');
}

// --- Podsumowanie per model ----------------------------------------------
out.push('### Koszt, czas, niezawodność');
out.push('');
out.push(
  head([
    'model',
    'poprawny JSON',
    'bramka zgodna',
    'kryteria trafione',
    'skala 1-10',
    'koszt łącznie',
    'mediana czasu modelu',
    'najdłuższy',
  ]),
);
out.push(sep(8));
for (const p of providers) {
  const mine = rows.filter((r) => r.provider.id === p.id);
  const ok = mine.filter((r) => delivered(r) !== null);
  const durations = ok
    .map((r) => r.metadata?.durationMs ?? r.latencyMs)
    .filter((v) => typeof v === 'number')
    .sort((a, b) => a - b);
  const median = durations.length
    ? durations[Math.floor((durations.length - 1) / 2)]
    : null;
  const max = durations.length ? durations[durations.length - 1] : null;
  const cost = mine.reduce((acc, r) => acc + (r.cost ?? 0), 0);
  const count = (metric) => mine.filter((r) => metricPass(r, metric) === true).length;
  out.push(
    head([
      `\`${p.model}\``,
      `${ok.length}/${mine.length}`,
      `${count('gate')}/${mine.length}`,
      `${count('criteria')}/${mine.length}`,
      `${count('scale')}/${mine.length}`,
      `$${cost.toFixed(6)}`,
      median === null ? '—' : `${(median / 1000).toFixed(1)} s`,
      max === null ? '—' : `${(max / 1000).toFixed(1)} s`,
    ]),
  );
}
out.push('');
out.push(
  `_Wygenerowane z \`${path}\` (${rows.length} przebiegów: ${providers.length} modeli × ${cases.length} przypadków)._`,
);

process.stdout.write(`${out.join('\n')}\n`);
