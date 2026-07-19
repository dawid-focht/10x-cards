import type { AiProvider, Proposal } from './provider';
import { BACK_MAX, FRONT_MAX } from '../validation';

const CARD_COUNT = 5;

/**
 * Deterministyczny provider dla dev/testów/CI: dzieli tekst na zdania i buduje
 * z nich fiszki. Zero sieci; identyczne wejście → identyczne wyjście.
 */
export class MockProvider implements AiProvider {
  name = 'mock';

  async generateFlashcards(sourceText: string): Promise<Proposal[]> {
    const sentences = sourceText
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 20);

    const proposals: Proposal[] = [];
    for (let i = 0; i < Math.min(CARD_COUNT, sentences.length); i++) {
      const sentence = sentences[i];
      const keyword = pickKeyword(sentence);
      proposals.push({
        front: truncate(`Co wiesz o: ${keyword}?`, FRONT_MAX),
        back: truncate(sentence, BACK_MAX),
      });
    }
    return proposals;
  }
}

function pickKeyword(sentence: string): string {
  const words = sentence.replace(/[.!?,;:]/g, '').split(' ');
  const candidate = words.filter((w) => w.length >= 5)[0] ?? words[0];
  return candidate.toLowerCase();
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
