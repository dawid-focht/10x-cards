import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import schemaSql from './schema.sql?raw';

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  const file = process.env.DATABASE_FILE ?? 'data/app.db';
  if (file !== ':memory:') {
    mkdirSync(dirname(file), { recursive: true });
  }
  db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  db.exec(schemaSql);
  return db;
}

// Zamyka i zeruje singleton — używane wyłącznie w testach (świeża baza :memory:).
export function closeDbForTests(): void {
  db?.close();
  db = null;
}
