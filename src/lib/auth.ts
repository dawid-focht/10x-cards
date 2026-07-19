import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { getDb } from '../db';

export const SESSION_COOKIE = 'sid';
export const SESSION_DAYS = 30;

export interface SessionUser {
  id: number;
  email: string;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// Zwraca id nowego użytkownika albo null przy duplikacie e-maila.
export function createUser(email: string, password: string): number | null {
  const db = getDb();
  try {
    const result = db
      .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
      .run(email.toLowerCase(), hashPassword(password));
    return Number(result.lastInsertRowid);
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) return null;
    throw err;
  }
}

export function findUserByEmail(
  email: string,
): { id: number; email: string; password_hash: string } | undefined {
  return getDb()
    .prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
    .get(email.toLowerCase()) as { id: number; email: string; password_hash: string } | undefined;
}

export function createSession(userId: number): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  getDb()
    .prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, userId, expiresAt.toISOString());
  return { token, expiresAt };
}

export function getSessionUser(token: string): SessionUser | null {
  const row = getDb()
    .prepare(
      `SELECT u.id, u.email, s.expires_at FROM sessions s
       JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
    )
    .get(token) as { id: number; email: string; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    destroySession(token);
    return null;
  }
  return { id: row.id, email: row.email };
}

export function destroySession(token: string): void {
  getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}
