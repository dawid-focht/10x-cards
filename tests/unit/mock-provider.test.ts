import { describe, expect, it } from 'vitest';
import { MockProvider } from '../../src/lib/ai/mock';
import { BACK_MAX, FRONT_MAX } from '../../src/lib/validation';

const provider = new MockProvider();

// 8 zdań, każde >= 20 znaków, zakończone kropką.
const richText = Array.from(
  { length: 8 },
  (_, i) => `Zdanie numer ${i + 1} opisuje pewne istotne zagadnienie z materiału źródłowego.`,
).join(' ');

describe('MockProvider', () => {
  it('jest deterministyczny: to samo wejście → identyczny wynik', async () => {
    const first = await provider.generateFlashcards(richText);
    const second = await provider.generateFlashcards(richText);
    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(0);
  });

  it('zwraca maksymalnie 5 propozycji', async () => {
    const proposals = await provider.generateFlashcards(richText);
    expect(proposals).toHaveLength(5);
  });

  it('front <= 200 i back <= 500 znaków nawet dla bardzo długich zdań', async () => {
    const longSentence = `${'x'.repeat(600)}.`;
    const proposals = await provider.generateFlashcards(`${richText} ${longSentence}`);
    expect(proposals.length).toBeGreaterThan(0);
    for (const { front, back } of proposals) {
      expect(front.length).toBeGreaterThan(0);
      expect(back.length).toBeGreaterThan(0);
      expect(front.length).toBeLessThanOrEqual(FRONT_MAX);
      expect(back.length).toBeLessThanOrEqual(BACK_MAX);
    }
  });

  it('tekst bez zdań >= 20 znaków → pusta lista', async () => {
    const proposals = await provider.generateFlashcards('Krótko. Tak. Nie. Może. Chyba.');
    expect(proposals).toEqual([]);
  });
});
