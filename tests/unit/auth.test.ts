// Musi być ustawione zanim cokolwiek zawoła getDb() — testy chodzą na :memory:.
process.env.DATABASE_FILE = ':memory:';

import { afterAll, describe, expect, it } from 'vitest';
import {
  createSession,
  createUser,
  destroySession,
  getSessionUser,
  hashPassword,
  verifyPassword,
} from '../../src/lib/auth';
import { closeDbForTests, getDb } from '../../src/db';

afterAll(() => {
  closeDbForTests();
});

describe('hashPassword / verifyPassword', () => {
  it('hash ma format salt:hash (hex) i nie zawiera hasła', () => {
    const password = 'sekretne-haslo-123';
    const stored = hashPassword(password);
    const parts = stored.split(':');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/^[0-9a-f]+$/);
    expect(parts[1]).toMatch(/^[0-9a-f]+$/);
    expect(stored).not.toContain(password);
  });

  it('dwa hashe tego samego hasła różnią się (losowa sól)', () => {
    expect(hashPassword('to-samo-haslo')).not.toBe(hashPassword('to-samo-haslo'));
  });

  it('verifyPassword: poprawne hasło → true, błędne → false', () => {
    const stored = hashPassword('poprawne-haslo');
    expect(verifyPassword('poprawne-haslo', stored)).toBe(true);
    expect(verifyPassword('bledne-haslo', stored)).toBe(false);
  });
});

describe('createUser', () => {
  it('duplikat e-maila (case-insensitive) → null', () => {
    const first = createUser('Duplikat@Example.com', 'haslo-jeden-123');
    expect(typeof first).toBe('number');
    expect(createUser('duplikat@example.com', 'haslo-dwa-456')).toBeNull();
  });
});

describe('sesje', () => {
  it('create → get zwraca użytkownika, destroy → null', () => {
    const userId = createUser('sesja@example.com', 'haslo-sesji-123');
    expect(userId).not.toBeNull();
    const { token } = createSession(userId as number);

    const user = getSessionUser(token);
    expect(user).toEqual({ id: userId, email: 'sesja@example.com' });

    destroySession(token);
    expect(getSessionUser(token)).toBeNull();
  });

  it('wygasły token → null', () => {
    const userId = createUser('wygasla@example.com', 'haslo-wygasle-123');
    expect(userId).not.toBeNull();
    const { token } = createSession(userId as number);
    expect(getSessionUser(token)).not.toBeNull();

    const past = new Date(Date.now() - 60 * 1000).toISOString();
    getDb().prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(past, token);

    expect(getSessionUser(token)).toBeNull();
  });
});
