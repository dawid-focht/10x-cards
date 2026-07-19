import type { APIRoute } from 'astro';
import { createFlashcard, listFlashcards } from '../../db/flashcards';
import { updateGenerationCounts } from '../../db/generations';
import { errorResponse, jsonResponse, readJsonBody } from '../../lib/http';
import { validateCardContent } from '../../lib/validation';

const DEFAULT_LIMIT = 20;

export const GET: APIRoute = ({ url, locals }) => {
  // Middleware gwarantuje sesję dla /api/** poza auth.
  const userId = locals.user!.id;
  const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const offsetParam = Number.parseInt(url.searchParams.get('offset') ?? '', 10);
  const limit = Number.isNaN(limitParam) ? DEFAULT_LIMIT : limitParam;
  const offset = Number.isNaN(offsetParam) ? 0 : offsetParam;
  return jsonResponse(listFlashcards(userId, { limit, offset }));
};

export const POST: APIRoute = async ({ request, locals }) => {
  const userId = locals.user!.id;
  const body = await readJsonBody(request);
  if (!body) return errorResponse('Nieprawidłowe dane wejściowe.', 400);

  // Tryb batch: zapis zaakceptowanych propozycji z generacji.
  if (typeof body.generationId === 'number' && Array.isArray(body.accepted)) {
    return saveAcceptedBatch(userId, body.generationId, body.accepted, body.rejectedCount);
  }

  // Tryb manualny: pojedyncza fiszka.
  const front = body.front;
  const back = body.back;
  if (typeof front !== 'string' || typeof back !== 'string') {
    return errorResponse('Nieprawidłowe dane wejściowe.', 400);
  }
  const validationError = validateCardContent(front, back);
  if (validationError) return errorResponse(validationError, 400);

  const card = createFlashcard(userId, { front, back, source: 'manual' });
  return jsonResponse(card, 201);
};

interface AcceptedItem {
  front: string;
  back: string;
  edited: boolean;
}

function saveAcceptedBatch(
  userId: number,
  generationId: number,
  accepted: unknown[],
  rejectedCountRaw: unknown,
): Response {
  // Najpierw walidacja wszystkich pozycji — żadnych częściowych zapisów przy 400.
  const items: AcceptedItem[] = [];
  for (const raw of accepted) {
    if (typeof raw !== 'object' || raw === null) {
      return errorResponse('Nieprawidłowe dane wejściowe.', 400);
    }
    const { front, back, edited } = raw as Record<string, unknown>;
    if (typeof front !== 'string' || typeof back !== 'string') {
      return errorResponse('Nieprawidłowe dane wejściowe.', 400);
    }
    const validationError = validateCardContent(front, back);
    if (validationError) return errorResponse(validationError, 400);
    items.push({ front, back, edited: edited === true });
  }

  const rejected = typeof rejectedCountRaw === 'number' ? rejectedCountRaw : 0;

  for (const item of items) {
    createFlashcard(userId, {
      front: item.front,
      back: item.back,
      source: item.edited ? 'ai-edited' : 'ai-full',
      generationId,
    });
  }

  const acceptedEdited = items.filter((item) => item.edited).length;
  updateGenerationCounts(userId, generationId, {
    acceptedUnedited: items.length - acceptedEdited,
    acceptedEdited,
    rejected,
  });

  return jsonResponse({ saved: items.length }, 201);
}
