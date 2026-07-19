import { describe, expect, it } from 'vitest';
import {
  BACK_MAX,
  FRONT_MAX,
  validateCardContent,
  validateSourceText,
} from '../../src/lib/validation';

describe('validateSourceText — granice 1000–10000 (FR-003)', () => {
  it('999 znaków → błąd', () => {
    expect(validateSourceText('a'.repeat(999))).not.toBeNull();
  });

  it('1000 znaków → OK', () => {
    expect(validateSourceText('a'.repeat(1000))).toBeNull();
  });

  it('10000 znaków → OK', () => {
    expect(validateSourceText('a'.repeat(10000))).toBeNull();
  });

  it('10001 znaków → błąd', () => {
    expect(validateSourceText('a'.repeat(10001))).not.toBeNull();
  });
});

describe('validateCardContent — puste pola i limity 200/500 (FR-006)', () => {
  it('poprawna fiszka → null', () => {
    expect(validateCardContent('Pytanie?', 'Odpowiedź.')).toBeNull();
  });

  it('pusty przód → błąd (także same białe znaki)', () => {
    expect(validateCardContent('', 'Odpowiedź.')).not.toBeNull();
    expect(validateCardContent('   ', 'Odpowiedź.')).not.toBeNull();
  });

  it('pusty tył → błąd (także same białe znaki)', () => {
    expect(validateCardContent('Pytanie?', '')).not.toBeNull();
    expect(validateCardContent('Pytanie?', '   ')).not.toBeNull();
  });

  it('przód dokładnie 200 → OK, 201 → błąd', () => {
    expect(validateCardContent('a'.repeat(FRONT_MAX), 'Odpowiedź.')).toBeNull();
    expect(validateCardContent('a'.repeat(FRONT_MAX + 1), 'Odpowiedź.')).not.toBeNull();
  });

  it('tył dokładnie 500 → OK, 501 → błąd', () => {
    expect(validateCardContent('Pytanie?', 'a'.repeat(BACK_MAX))).toBeNull();
    expect(validateCardContent('Pytanie?', 'a'.repeat(BACK_MAX + 1))).not.toBeNull();
  });
});
