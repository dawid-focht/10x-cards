import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterProvider } from '../../src/lib/ai/openrouter';
import { AiProviderError } from '../../src/lib/ai/provider';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

// Taki kształt naprawdę zwraca OpenRouter przy przeciążeniu dostawcy: HTTP 200, a w ciele błąd.
const overloaded = () =>
  json({ error: { message: 'Upstream error from Nvidia: Service temporarily overloaded', code: 502 } });
const withProposals = () => json({ choices: [{ message: { content: '[{"front":"P?","back":"O."}]' } }] });

describe('OpenRouterProvider — ponawianie i modele zapasowe', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('HTTP 200 z ciałem {error} to błąd dostawcy: ponawia na modelu zapasowym i zapisuje jego nazwę', async () => {
    vi.stubEnv('AI_MODEL', 'primary/model');
    vi.stubEnv('AI_MODEL_FALLBACKS', 'backup/model');
    const fetchMock = vi.fn().mockResolvedValueOnce(overloaded()).mockResolvedValueOnce(withProposals());
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const provider = new OpenRouterProvider('key');
    await expect(provider.generateFlashcards('tekst')).resolves.toEqual([{ front: 'P?', back: 'O.' }]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const modelOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body as string).model;
    expect(modelOf(0)).toBe('primary/model');
    expect(modelOf(1)).toBe('backup/model');
    expect(provider.name).toBe('backup/model');
  });

  it('po trzech nieudanych próbach rzuca AiProviderError z kodem upstream', async () => {
    vi.stubEnv('AI_MODEL', 'primary/model');
    const fetchMock = vi.fn().mockImplementation(async () => overloaded());
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const provider = new OpenRouterProvider('key');
    const err = await provider.generateFlashcards('tekst').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect((err as AiProviderError).code).toBe('upstream');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('bez modeli zapasowych ponawia na tym samym modelu', async () => {
    vi.stubEnv('AI_MODEL', 'only/model');
    const fetchMock = vi.fn().mockResolvedValueOnce(overloaded()).mockResolvedValueOnce(withProposals());
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const provider = new OpenRouterProvider('key');
    await expect(provider.generateFlashcards('tekst')).resolves.toHaveLength(1);
    const modelOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body as string).model;
    expect(modelOf(1)).toBe('only/model');
  });
});
