// Wyrocznia: tabela reguł uproszczonego SM-2 w context/changes/s04-review/plan.md.
// Zmiana reguł wymaga najpierw zmiany planu — nie dopasowuj asercji do kodu.
import { describe, expect, it } from 'vitest';
import { schedule } from '../../src/lib/srs';

const NOW = new Date('2026-07-19T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

function makeState(overrides: Partial<ReturnType<typeof baseState>> = {}) {
  return { ...baseState(), ...overrides };
}

function baseState() {
  return {
    dueAt: new Date(NOW),
    intervalDays: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
  };
}

describe('schedule (uproszczony SM-2)', () => {
  it('good na nowej karcie → interval 1 dzień, due jutro', () => {
    const result = schedule(makeState(), 'good', NOW);
    expect(result.intervalDays).toBe(1);
    expect(result.dueAt.getTime()).toBe(NOW.getTime() + 1 * DAY_MS);
    expect(result.reps).toBe(1);
  });

  it('drugi good (reps 1, interval 1) → 6 dni', () => {
    const result = schedule(makeState({ reps: 1, intervalDays: 1 }), 'good', NOW);
    expect(result.intervalDays).toBe(6);
    expect(result.dueAt.getTime()).toBe(NOW.getTime() + 6 * DAY_MS);
    expect(result.reps).toBe(2);
  });

  it('trzeci good (reps 2, interval 6, ease 2.5) → interval × ease = 15 dni', () => {
    const result = schedule(makeState({ reps: 2, intervalDays: 6, ease: 2.5 }), 'good', NOW);
    expect(result.intervalDays).toBe(15);
    expect(result.dueAt.getTime()).toBe(NOW.getTime() + 15 * DAY_MS);
  });

  it('again → interval 0, due za 10 minut, lapses+1, ease −0.20, reps 0', () => {
    const result = schedule(makeState({ reps: 2, intervalDays: 6, ease: 2.5 }), 'again', NOW);
    expect(result.intervalDays).toBe(0);
    expect(result.dueAt.getTime()).toBe(NOW.getTime() + 10 * MIN_MS);
    expect(result.lapses).toBe(1);
    expect(result.ease).toBeCloseTo(2.3, 10);
    expect(result.reps).toBe(0);
  });

  it('hard z interval 6 → round(6×1.2)=7 dni, ease 2.35', () => {
    const result = schedule(makeState({ reps: 3, intervalDays: 6, ease: 2.5 }), 'hard', NOW);
    expect(result.intervalDays).toBe(7);
    expect(result.dueAt.getTime()).toBe(NOW.getTime() + 7 * DAY_MS);
    expect(result.ease).toBeCloseTo(2.35, 10);
  });

  it('easy na nowej karcie → min. skok do 2 dni, ease +0.15 = 2.65', () => {
    const result = schedule(makeState(), 'easy', NOW);
    expect(result.intervalDays).toBe(2);
    expect(result.dueAt.getTime()).toBe(NOW.getTime() + 2 * DAY_MS);
    expect(result.ease).toBeCloseTo(2.65, 10);
  });

  it('ease nigdy nie spada poniżej 1.3 (wielokrotne again)', () => {
    let state = makeState();
    for (let i = 0; i < 10; i++) {
      state = schedule(state, 'again', NOW);
      expect(state.ease).toBeGreaterThanOrEqual(1.3 - 1e-9);
    }
    expect(state.ease).toBeCloseTo(1.3, 10);
  });

  it('ease nigdy nie przekracza 2.8 (wielokrotne easy)', () => {
    let state = makeState();
    for (let i = 0; i < 10; i++) {
      state = schedule(state, 'easy', NOW);
      expect(state.ease).toBeLessThanOrEqual(2.8 + 1e-9);
    }
    expect(state.ease).toBeCloseTo(2.8, 10);
  });

  it('nie mutuje przekazanego stanu', () => {
    const state = makeState({ reps: 1, intervalDays: 1 });
    const snapshot = structuredClone(state);
    schedule(state, 'good', NOW);
    schedule(state, 'again', NOW);
    expect(state).toEqual(snapshot);
  });
});
