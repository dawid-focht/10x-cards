import type { APIRoute } from 'astro';
import { deleteFlashcard, updateFlashcard } from '../../../db/flashcards';
import { errorResponse, jsonResponse, readJsonBody } from '../../../lib/http';
import { validateCardContent } from '../../../lib/validation';

// Cudze i nieistniejące id są nierozróżnialne (FR-013) — zawsze 404.
const NOT_FOUND = 'Nie znaleziono fiszki.';

export const PUT: APIRoute = async ({ params, request, locals }) => {
  // Middleware gwarantuje sesję dla /api/** poza auth.
  const userId = locals.user!.id;
  const id = Number(params.id);
  if (Number.isNaN(id)) return errorResponse(NOT_FOUND, 404);

  const body = await readJsonBody(request);
  const front = body?.front;
  const back = body?.back;
  if (typeof front !== 'string' || typeof back !== 'string') {
    return errorResponse('Nieprawidłowe dane wejściowe.', 400);
  }
  const validationError = validateCardContent(front, back);
  if (validationError) return errorResponse(validationError, 400);

  if (!updateFlashcard(userId, id, { front, back })) {
    return errorResponse(NOT_FOUND, 404);
  }
  return jsonResponse({ ok: true });
};

export const DELETE: APIRoute = ({ params, locals }) => {
  const userId = locals.user!.id;
  const id = Number(params.id);
  if (Number.isNaN(id)) return errorResponse(NOT_FOUND, 404);

  if (!deleteFlashcard(userId, id)) {
    return errorResponse(NOT_FOUND, 404);
  }
  return jsonResponse({ ok: true });
};
