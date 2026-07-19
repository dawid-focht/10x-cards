import type { APIRoute } from 'astro';
import { destroySession, SESSION_COOKIE } from '../../../lib/auth';
import { clearSessionCookie } from '../../../lib/http';

export const POST: APIRoute = async ({ cookies, redirect }) => {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) destroySession(token);
  clearSessionCookie(cookies);
  // Wylogowanie działa też z klasycznego <form method="post"> — stąd redirect.
  return redirect('/login', 302);
};
