import type { APIRoute } from 'astro';
import { applyGrade, listDue } from '../../db/reviews';
import { errorResponse, jsonResponse, readJsonBody } from '../../lib/http';

const GRADES = ['again', 'hard', 'good', 'easy'] as const;
type Grade = (typeof GRADES)[number];

function isGrade(value: unknown): value is Grade {
  return typeof value === 'string' && (GRADES as readonly string[]).includes(value);
}

export const GET: APIRoute = ({ locals }) => {
  // Middleware gwarantuje sesję dla /api/** poza auth.
  return jsonResponse({ items: listDue(locals.user!.id, new Date()) });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const userId = locals.user!.id;
  const body = await readJsonBody(request);
  const flashcardId = body?.flashcardId;
  const grade = body?.grade;
  if (typeof flashcardId !== 'number' || !isGrade(grade)) {
    return errorResponse('Nieprawidłowe dane wejściowe.', 400);
  }

  if (!applyGrade(userId, flashcardId, grade, new Date())) {
    return errorResponse('Nie znaleziono fiszki.', 404);
  }
  return jsonResponse({ ok: true });
};
