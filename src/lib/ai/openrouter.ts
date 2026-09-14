import type { AiProvider, Proposal } from './provider';
import { AiProviderError } from './provider';
import { BACK_MAX, FRONT_MAX } from '../validation';

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;

/**
 * Kody błędów, po których ponawiamy. Darmowe modele na OpenRouterze bywają
 * chwilowo przeciążone — kolejna próba (najlepiej na innym modelu) zwykle przechodzi.
 */
const RETRYABLE_CODES = new Set(['timeout', 'network', 'upstream', 'bad_response', 'empty']);

const SYSTEM_PROMPT =
  'Jesteś generatorem fiszek edukacyjnych. Na podstawie tekstu źródłowego od użytkownika ' +
  'utwórz od 3 do 8 fiszek po polsku. Zwróć WYŁĄCZNIE tablicę JSON w formacie ' +
  '[{"front":"pytanie","back":"odpowiedź"}] — bez żadnego dodatkowego tekstu, komentarzy ' +
  `ani bloków kodu. Pole "front" ma najwyżej ${FRONT_MAX} znaków, pole "back" najwyżej ${BACK_MAX} znaków.`;

interface ChatCompletionBody {
  error?: { message?: unknown; code?: unknown };
  choices?: Array<{ message?: { content?: unknown } }>;
}

/**
 * Provider LLM przez OpenRouter (API zgodne z OpenAI chat/completions).
 * Konfiguracja przez env: AI_MODEL (model), AI_MODEL_FALLBACKS (modele zapasowe,
 * rozdzielone przecinkami), AI_BASE_URL (baza API).
 */
export class OpenRouterProvider implements AiProvider {
  /** Model użyty w ostatniej udanej próbie — trafia do tabeli generations. */
  name = process.env.AI_MODEL ?? 'deepseek/deepseek-chat';

  /** Kolejka modeli: główny + zapasowe; kolejne próby idą po niej cyklicznie. */
  private readonly models: string[];

  constructor(private apiKey: string) {
    const fallbacks = (process.env.AI_MODEL_FALLBACKS ?? '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    this.models = [this.name, ...fallbacks];
  }

  async generateFlashcards(sourceText: string): Promise<Proposal[]> {
    let lastError: AiProviderError | undefined;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const model = this.models[attempt % this.models.length];
      try {
        const proposals = await this.requestOnce(model, sourceText);
        this.name = model;
        return proposals;
      } catch (err) {
        if (!(err instanceof AiProviderError) || !RETRYABLE_CODES.has(err.code)) throw err;
        lastError = err;
        // Log serwerowy jest tu celowy: bez niego odpowiedź 200 z ciałem błędu
        // ginęła w bazie jako „nieoczekiwany format" i nikt nie wiedział, co padło.
        console.warn(`[ai] próba ${attempt + 1}/${MAX_ATTEMPTS} (${model}) nieudana: ${err.code} — ${err.message}`);
      }
    }
    throw lastError ?? new AiProviderError('unknown', 'Usługa AI nie odpowiedziała.');
  }

  private async requestOnce(model: string, sourceText: string): Promise<Proposal[]> {
    const baseUrl = process.env.AI_BASE_URL ?? 'https://openrouter.ai/api/v1';

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: sourceText },
          ],
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new AiProviderError('timeout', 'Przekroczono limit czasu odpowiedzi usługi AI (60 s).');
      }
      throw new AiProviderError('network', 'Błąd połączenia z usługą AI. Spróbuj ponownie później.');
    }

    if (!response.ok) {
      throw new AiProviderError('bad_response', `Usługa AI zwróciła błąd (HTTP ${response.status}).`);
    }

    let data: ChatCompletionBody;
    try {
      data = (await response.json()) as ChatCompletionBody;
    } catch {
      throw new AiProviderError('bad_response', 'Nie udało się odczytać odpowiedzi usługi AI.');
    }

    // OpenRouter potrafi odpowiedzieć HTTP 200 z ciałem {"error": {...}} — np. gdy
    // dostawca modelu zwróci 502 „Service temporarily overloaded". Bez tej gałęzi
    // taki przypadek wyglądał jak brak treści i lądował w bazie jako bad_response.
    if (data.error) {
      const detail = typeof data.error.message === 'string' ? data.error.message : 'nieznany błąd dostawcy';
      throw new AiProviderError('upstream', `Usługa AI zgłosiła błąd: ${detail}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new AiProviderError('bad_response', 'Odpowiedź usługi AI ma nieoczekiwany format.');
    }

    const proposals = parseFlashcardsJson(content);
    if (proposals.length === 0) {
      throw new AiProviderError('empty', 'AI nie wygenerowało żadnych fiszek z podanego tekstu.');
    }
    return proposals;
  }
}

/**
 * Wyciąga fiszki z odpowiedzi modelu: usuwa fence'y ```json/```, bierze fragment
 * od pierwszego '[' do ostatniego ']', parsuje i filtruje niepoprawne elementy.
 * Zwraca [] gdy nie da się sparsować poprawnej tablicy.
 */
export function parseFlashcardsJson(content: string): Proposal[] {
  const stripped = content.replace(/```json/gi, '').replace(/```/g, '');
  const start = stripped.indexOf('[');
  const end = stripped.lastIndexOf(']');
  if (start === -1 || end <= start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const proposals: Proposal[] = [];
  for (const item of parsed) {
    if (
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).front === 'string' &&
      typeof (item as Record<string, unknown>).back === 'string'
    ) {
      const { front, back } = item as { front: string; back: string };
      proposals.push({
        front: front.slice(0, FRONT_MAX),
        back: back.slice(0, BACK_MAX),
      });
    }
  }
  return proposals;
}
