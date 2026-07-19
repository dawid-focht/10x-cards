// Uproszczony SM-2 — wyrocznia reguł: context/changes/s04-review/plan.md (Faza 1).
// Czysta funkcja: zero I/O, wejście nie jest mutowane.

export type Grade = 'again' | 'hard' | 'good' | 'easy';

export interface ReviewState {
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
}

export interface ScheduleResult extends ReviewState {
  dueAt: Date;
}

/** Startowa wartość ease dla nowej fiszki (wyrocznia: plan S-04). */
export const EASE_START = 2.5;

const EASE_MIN = 1.3;
const EASE_MAX = 2.8;
const AGAIN_DELAY_MS = 10 * 60 * 1000; // 10 minut
const DAY_MS = 24 * 60 * 60 * 1000;

function clampEase(ease: number): number {
  return Math.min(EASE_MAX, Math.max(EASE_MIN, ease));
}

function addDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

/** Interwał wg reguły `good`: reps 0→1 dzień, reps 1→6 dni, dalej interval × ease. */
function goodIntervalDays(state: ReviewState): number {
  if (state.reps === 0) return 1;
  if (state.reps === 1) return 6;
  return Math.round(state.intervalDays * state.ease);
}

export function schedule(state: ReviewState, grade: Grade, now: Date): ScheduleResult {
  switch (grade) {
    case 'again':
      return {
        intervalDays: 0,
        ease: clampEase(state.ease - 0.2),
        reps: 0,
        lapses: state.lapses + 1,
        dueAt: new Date(now.getTime() + AGAIN_DELAY_MS),
      };

    case 'hard': {
      const intervalDays = Math.max(1, Math.round(state.intervalDays * 1.2));
      return {
        intervalDays,
        ease: clampEase(state.ease - 0.15),
        reps: state.reps + 1,
        lapses: state.lapses,
        dueAt: addDays(now, intervalDays),
      };
    }

    case 'good': {
      const intervalDays = goodIntervalDays(state);
      return {
        intervalDays,
        ease: state.ease,
        reps: state.reps + 1,
        lapses: state.lapses,
        dueAt: addDays(now, intervalDays),
      };
    }

    case 'easy': {
      const intervalDays = Math.max(Math.round(goodIntervalDays(state) * 1.3), 2);
      return {
        intervalDays,
        ease: clampEase(state.ease + 0.15),
        reps: state.reps + 1,
        lapses: state.lapses,
        dueAt: addDays(now, intervalDays),
      };
    }
  }
}
