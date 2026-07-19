import { getDb } from './index';
import { schedule, type Grade } from '../lib/srs';

// Repozytorium powtórek (SM-2). Każda funkcja filtruje po user_id (FR-013).

export interface DueCard {
  id: number;
  front: string;
  back: string;
}

export function listDue(userId: number, now: Date, limit = 50): DueCard[] {
  return getDb()
    .prepare(
      `SELECT f.id, f.front, f.back FROM flashcards f
       JOIN review_state rs ON rs.flashcard_id = f.id
       WHERE f.user_id = ? AND rs.due_at <= ?
       ORDER BY rs.due_at ASC LIMIT ?`,
    )
    .all(userId, now.toISOString(), limit) as unknown as DueCard[];
}

// Ocena odpowiedzi: false gdy fiszka nie istnieje lub nie należy do użytkownika.
export function applyGrade(userId: number, flashcardId: number, grade: Grade, now: Date): boolean {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT rs.interval_days, rs.ease, rs.reps, rs.lapses FROM review_state rs
       JOIN flashcards f ON f.id = rs.flashcard_id
       WHERE rs.flashcard_id = ? AND f.user_id = ?`,
    )
    .get(flashcardId, userId) as
    | { interval_days: number; ease: number; reps: number; lapses: number }
    | undefined;
  if (!row) return false;
  const next = schedule(
    { intervalDays: row.interval_days, ease: row.ease, reps: row.reps, lapses: row.lapses },
    grade,
    now,
  );
  db.prepare(
    `UPDATE review_state SET due_at = ?, interval_days = ?, ease = ?, reps = ?, lapses = ?
     WHERE flashcard_id = ?`,
  ).run(next.dueAt.toISOString(), next.intervalDays, next.ease, next.reps, next.lapses, flashcardId);
  return true;
}
