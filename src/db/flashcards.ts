import { getDb } from './index';

// Repozytorium fiszek. Każda funkcja filtruje po user_id (FR-013);
// brak wiersza właściciela → false (endpoint mapuje na 404).

export interface Flashcard {
  id: number;
  front: string;
  back: string;
  source: 'ai-full' | 'ai-edited' | 'manual';
  createdAt: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

interface FlashcardRow {
  id: number;
  front: string;
  back: string;
  source: Flashcard['source'];
  created_at: string;
}

function toFlashcard(row: FlashcardRow): Flashcard {
  return { id: row.id, front: row.front, back: row.back, source: row.source, createdAt: row.created_at };
}

export function listFlashcards(
  userId: number,
  opts?: { limit?: number; offset?: number },
): { items: Flashcard[]; total: number } {
  const db = getDb();
  const limit = Math.min(Math.max(opts?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const rows = db
    .prepare(
      `SELECT id, front, back, source, created_at FROM flashcards
       WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`,
    )
    .all(userId, limit, offset) as unknown as FlashcardRow[];
  const totalRow = db
    .prepare('SELECT COUNT(*) AS total FROM flashcards WHERE user_id = ?')
    .get(userId) as { total: number };
  return { items: rows.map(toFlashcard), total: totalRow.total };
}

// Tworzy fiszkę wraz ze stanem powtórek (od razu do nauki: due_at = teraz).
export function createFlashcard(
  userId: number,
  data: { front: string; back: string; source: Flashcard['source']; generationId?: number | null },
): Flashcard {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const result = db
      .prepare(
        'INSERT INTO flashcards (user_id, front, back, source, generation_id) VALUES (?, ?, ?, ?, ?)',
      )
      .run(userId, data.front, data.back, data.source, data.generationId ?? null);
    const id = Number(result.lastInsertRowid);
    db.prepare(
      `INSERT INTO review_state (flashcard_id, due_at, interval_days, ease, reps, lapses)
       VALUES (?, ?, 0, 2.5, 0, 0)`,
    ).run(id, new Date().toISOString());
    const row = db
      .prepare('SELECT id, front, back, source, created_at FROM flashcards WHERE id = ?')
      .get(id) as unknown as FlashcardRow;
    db.exec('COMMIT');
    return toFlashcard(row);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function updateFlashcard(
  userId: number,
  id: number,
  data: { front: string; back: string },
): boolean {
  const result = getDb()
    .prepare(
      `UPDATE flashcards SET front = ?, back = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
    )
    .run(data.front, data.back, id, userId);
  return Number(result.changes) > 0;
}

// review_state znika kaskadowo (ON DELETE CASCADE).
export function deleteFlashcard(userId: number, id: number): boolean {
  const result = getDb()
    .prepare('DELETE FROM flashcards WHERE id = ? AND user_id = ?')
    .run(id, userId);
  return Number(result.changes) > 0;
}
