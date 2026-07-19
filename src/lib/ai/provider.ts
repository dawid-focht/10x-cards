import { MockProvider } from './mock';
import { OpenRouterProvider } from './openrouter';

export interface Proposal {
  front: string;
  back: string;
}

export interface AiProvider {
  /** Nazwa modelu/providera zapisywana w tabeli generations. */
  name: string;
  generateFlashcards(sourceText: string): Promise<Proposal[]>;
}

/** Błąd domenowy warstwy AI — endpoint mapuje na 502 + wpis w generation_errors. */
export class AiProviderError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export function getAiProvider(): AiProvider {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (process.env.MOCK_AI === '1' || !apiKey) {
    return new MockProvider();
  }
  return new OpenRouterProvider(apiKey);
}
