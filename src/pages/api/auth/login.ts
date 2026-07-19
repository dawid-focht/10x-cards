import type { APIRoute } from 'astro';
import { createSession, findUserByEmail, verifyPassword } from '../../../lib/auth';
import { errorResponse, jsonResponse, readJsonBody, setSessionCookie } from '../../../lib/http';

// US-002: przy błędnych danych jeden ogólny komunikat, bez wskazywania pola.
const INVALID_CREDENTIALS = 'Nieprawidłowy e-mail lub hasło.';

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await readJsonBody(request);
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  const user = email ? findUserByEmail(email) : undefined;
  if (!user || !verifyPassword(password, user.password_hash)) {
    return errorResponse(INVALID_CREDENTIALS, 401);
  }

  const { token, expiresAt } = createSession(user.id);
  setSessionCookie(cookies, token, expiresAt);
  return jsonResponse({ ok: true });
};
