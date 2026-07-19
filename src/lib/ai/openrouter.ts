import type { AiProvider, Proposal } from './provider';
import { AiProviderError } from './provider';
import { BACK_MAX, FRONT_MAX } from '../validation';

const REQUEST_TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT =
  'Jesteś generatorem fiszek edukacyjnych. Na podstawie tekstu źródłowego od użytkownika ' +
  'utwórz od 3 do 8 fiszek po polsku. Zwróć WYŁĄCZNIE tablicę JSON w formacie ' +
  '[{"front":"pytanie","back":"odpowiedź"}] — bez żadnego dodatkowego tekstu, komentarzy ' +
  `ani bloków kodu. Pole "front" ma najwyżej ${FRONT_MAX} znaków, pole "back" najwyżej ${BACK_MAX} znaków.`;

/**
 * Provider LLM przez OpenRouter (API zgodne z OpenAI chat/completions).
 * Konfiguracja przez env: AI_MODEL (model), AI_BASE_URL (baza API).
 */
export class OpenRouterProvider implements AiProvider {
  name = process.env.AI_MODEL ?? 'deepseek/deepseek-chat';

  constructor(private apiKey: string) {}

  async generateFlashcards(sourceText: string): Promise<Proposal[]> {
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
          model: this.name,
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

    let content: unknown;
    try {
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      content = data.choices?.[0]?.message?.content;
    } catch {
      throw new AiProviderError('bad_response', 'Nie udało się odczytać odpowiedzi usługi AI.');
    }

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
