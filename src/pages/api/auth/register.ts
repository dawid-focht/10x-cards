import type { APIRoute } from 'astro';
import { createSession, createUser } from '../../../lib/auth';
import { isValidEmail, PASSWORD_MIN } from '../../../lib/validation';
import { errorResponse, jsonResponse, readJsonBody, setSessionCookie } from '../../../lib/http';

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await readJsonBody(request);
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!isValidEmail(email)) return errorResponse('Podaj poprawny adres e-mail.', 400);
  if (password.length < PASSWORD_MIN) {
    return errorResponse(`Hasło musi mieć co najmniej ${PASSWORD_MIN} znaków.`, 400);
  }

  const userId = createUser(email, password);
  if (userId === null) return errorResponse('Konto z tym adresem e-mail już istnieje.', 409);

  const { token, expiresAt } = createSession(userId);
  setSessionCookie(cookies, token, expiresAt);
  return jsonResponse({ ok: true });
};
