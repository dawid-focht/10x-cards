import { getDb } from './index';

// Repozytorium metryk generowania AI. Każda funkcja filtruje po user_id (FR-013).

export function createGeneration(
  userId: number,
  data: { model: string; sourceTextLength: number; generatedCount: number; durationMs: number },
): number {
  const result = getDb()
    .prepare(
      `INSERT INTO generations (user_id, model, source_text_length, generated_count, duration_ms)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(userId, data.model, data.sourceTextLength, data.generatedCount, data.durationMs);
  return Number(result.lastInsertRowid);
}

// Zapisuje wynik bramki akceptacji; false gdy generacja nie istnieje lub nie należy do użytkownika.
export function updateGenerationCounts(
  userId: number,
  generationId: number,
  counts: { acceptedUnedited: number; acceptedEdited: number; rejected: number },
): boolean {
  const result = getDb()
    .prepare(
      `UPDATE generations
       SET accepted_unedited_count = ?, accepted_edited_count = ?, rejected_count = ?
       WHERE id = ? AND user_id = ?`,
    )
    .run(counts.acceptedUnedited, counts.acceptedEdited, counts.rejected, generationId, userId);
  return Number(result.changes) > 0;
}

export function logGenerationError(
  userId: number,
  model: string,
  errorCode: string,
  message: string,
): void {
  getDb()
    .prepare('INSERT INTO generation_errors (user_id, model, error_code, message) VALUES (?, ?, ?, ?)')
    .run(userId, model, errorCode, message);
}
