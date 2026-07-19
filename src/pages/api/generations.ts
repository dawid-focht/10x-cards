import type { APIRoute } from 'astro';
import { createGeneration, logGenerationError } from '../../db/generations';
import { AiProviderError, getAiProvider } from '../../lib/ai/provider';
import { errorResponse, jsonResponse, readJsonBody } from '../../lib/http';
import { validateSourceText } from '../../lib/validation';

export const POST: APIRoute = async ({ request, locals }) => {
  // Middleware gwarantuje sesję dla /api/** poza auth.
  const userId = locals.user!.id;

  const body = await readJsonBody(request);
  const sourceText = body?.sourceText;
  if (typeof sourceText !== 'string') {
    return errorResponse('Nieprawidłowe dane wejściowe.', 400);
  }
  const validationError = validateSourceText(sourceText);
  if (validationError) return errorResponse(validationError, 400);

  const text = sourceText.trim();
  const provider = getAiProvider();
  const startedAt = Date.now();
  try {
    const proposals = await provider.generateFlashcards(text);
    const generationId = createGeneration(userId, {
      model: provider.name,
      sourceTextLength: text.length,
      generatedCount: proposals.length,
      durationMs: Date.now() - startedAt,
    });
    return jsonResponse({ generationId, proposals });
  } catch (err) {
    const errorCode = err instanceof AiProviderError ? err.code : 'unknown';
    const message = err instanceof Error ? err.message : String(err);
    logGenerationError(userId, provider.name, errorCode, message);
    return errorResponse('Generowanie nie powiodło się. Spróbuj ponownie.', 502);
  }
};
