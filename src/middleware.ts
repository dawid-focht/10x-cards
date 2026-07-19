import { defineMiddleware } from 'astro:middleware';
import { getSessionUser, SESSION_COOKIE } from './lib/auth';
import { errorResponse } from './lib/http';

const PUBLIC_PAGES = new Set(['/login', '/register']);
const PUBLIC_API = new Set(['/api/auth/register', '/api/auth/login']);

export const onRequest = defineMiddleware((context, next) => {
  const token = context.cookies.get(SESSION_COOKIE)?.value;
  context.locals.user = token ? getSessionUser(token) : null;

  if (context.locals.user) return next();

  const path = context.url.pathname;
  if (path.startsWith('/api/')) {
    if (PUBLIC_API.has(path)) return next();
    return errorResponse('Wymagane logowanie.', 401);
  }
  if (PUBLIC_PAGES.has(path)) return next();
  return context.redirect('/login');
});
