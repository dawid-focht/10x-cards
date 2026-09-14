/**
 * Provider promptfoo dla agenta code review.
 *
 * Nie odtwarza wywołania modelu — URUCHAMIA `../review.ts`, czyli dokładnie ten
 * sam kod, który chodzi w CI. Dzięki temu każdy porównywany model dostaje ten
 * sam SYSTEM_PROMPT, ten sam REVIEW_SCHEMA i tę samą bramkę z
 * `common/review-schema.ts` — bez kopiowania prompta ani rubryk do konfiguracji
 * promptfoo. Zmiana prompta automatycznie przechodzi przez ten zestaw, więc
 * eval działa jako bramka regresji, a nie jako osobna, rozjeżdżająca się kopia.
 *
 * Wejście: prompt = surowy unified diff (var `diff`, ładowany z pliku).
 * Wyjście: obiekt JSON wypisany przez review.ts (oceny + gate + usage).
 *
 * Kody wyjścia review.ts: 0 = bramka przepuszcza, 1 = bramka blokuje,
 * 2 = agent nie wystartował. 0 i 1 to POPRAWNE wyniki (bramka ma prawo
 * blokować) — błędem jest dopiero 2 albo niepoprawny JSON na stdout.
 *
 * `AI_REVIEW_EVAL_RUNNER` podmienia uruchamiany skrypt — służy do suchego
 * przebiegu całej mechaniki (config, asercje, raport) bez wydawania zapytań.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = path.resolve(HERE, '..');
const TSX = path.join(AGENT_DIR, 'node_modules', '.bin', 'tsx');
const RUNNER = process.env.AI_REVIEW_EVAL_RUNNER ?? 'review.ts';

const EXIT_PASS = 0;
const EXIT_BLOCKED = 1;
/** Model, który nie odpowiedział w tym czasie, jest dla bramki CI bezużyteczny — to wynik, nie awaria. */
const DEFAULT_TIMEOUT_MS = 180_000;
/** Zapas na domknięcie strumieni po `exit`, gdy `close` nie przyjdzie. */
const CLOSE_GRACE_MS = 3_000;
const STDERR_TAIL_CHARS = 1_200;

function tail(text, max = STDERR_TAIL_CHARS) {
  const trimmed = text.trim();
  return trimmed.length > max ? `…${trimmed.slice(-max)}` : trimmed;
}

function runAgent(diff, model, timeoutMs) {
  return new Promise((resolve) => {
    const env = { ...process.env, AI_REVIEW_MODEL: model };
    // Metadane PR-a nie mogą wpływać na porównanie — każdy model dostaje goły diff.
    delete env.AI_REVIEW_PR_TITLE;
    delete env.AI_REVIEW_PR_BODY;

    // `detached` robi z dziecka lidera grupy procesów. Bez tego zabicie shima
    // `node_modules/.bin/tsx` zostawia osieroconego wnuka (właściwy proces node
    // z review.ts), który trzyma odziedziczone potoki otwarte — `close` nigdy
    // nie przychodzi i cały przebieg promptfoo stoi w miejscu. Zabijamy grupę.
    const child = spawn(TSX, [RUNNER], { cwd: AGENT_DIR, env, detached: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let timer;

    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    };

    const killTree = () => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    };

    timer = setTimeout(() => {
      timedOut = true;
      killTree();
      // Potoki po zabitej grupie i tak powinny się domknąć, ale nie zakładamy tego.
      setTimeout(() => finish(null), CLOSE_GRACE_MS);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      stderr = `${stderr}\n${error.message}`;
      finish(null);
    });
    // `close` = strumienie domknięte (ścieżka normalna); `exit` + zapas =
    // ubezpieczenie na wypadek procesu, który mimo wszystko przetrzyma potoki.
    child.on('exit', (code) => {
      setTimeout(() => finish(code), CLOSE_GRACE_MS);
    });
    child.on('close', (code) => finish(code));

    child.stdin.end(diff);
  });
}

export default class AiReviewProvider {
  constructor(options = {}) {
    this.config = options.config ?? {};
    this.model = this.config.model;
    if (!this.model) {
      throw new Error('provider.mjs: brak config.model — podaj id modelu OpenRouter.');
    }
  }

  id() {
    // Model w identyfikatorze — inaczej cztery wpisy z tym samym plikiem
    // providera zlałyby się w jedną kolumnę macierzy.
    return `ai-review:${this.model}`;
  }

  async callApi(prompt) {
    const timeoutMs = Number(this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const startedAt = Date.now();
    const { code, stdout, stderr, timedOut } = await runAgent(prompt, this.model, timeoutMs);
    const wallClockMs = Date.now() - startedAt;

    if (timedOut) {
      return { error: `timeout po ${timeoutMs} ms — model nie odpowiedział`, metadata: { model: this.model, wallClockMs } };
    }

    if (code !== EXIT_PASS && code !== EXIT_BLOCKED) {
      // Exit 2 (albo cokolwiek innego) = agent nie dowiózł recenzji.
      // To jest WYNIK porównania — model odpadł na schemacie, limicie albo błędzie API.
      return {
        error: `review.ts exit ${code}: ${tail(stderr)}`,
        metadata: { model: this.model, exitCode: code, wallClockMs, stderr: tail(stderr) },
      };
    }

    let payload;
    try {
      payload = JSON.parse(stdout);
    } catch {
      return {
        error: `stdout nie jest JSON-em (${stdout.length} znaków): ${tail(stdout, 400)}`,
        metadata: { model: this.model, exitCode: code, wallClockMs },
      };
    }

    const usage = payload.usage ?? {};
    return {
      output: payload,
      // Koszt realny z OpenRouter (providerMetadata.openrouter.usage.cost).
      // null = odpowiedź go nie zawierała; nie zgadujemy, zostawiamy 0 i flagę w metadanych.
      cost: typeof usage.costUsd === 'number' ? usage.costUsd : 0,
      tokenUsage: {
        prompt: usage.inputTokens ?? undefined,
        completion: usage.outputTokens ?? undefined,
        total: usage.totalTokens ?? undefined,
      },
      metadata: {
        model: this.model,
        provider: payload.provider ?? null,
        exitCode: code,
        // durationMs mierzy samo wywołanie modelu (bez startu procesu tsx),
        // wallClockMs — całe uruchomienie agenta.
        durationMs: usage.durationMs ?? null,
        wallClockMs,
        costKnown: typeof usage.costUsd === 'number',
        costSource: usage.costSource ?? null,
      },
    };
  }
}
