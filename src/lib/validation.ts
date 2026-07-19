// Limity domenowe (PRD FR-003, FR-006) — jedyne źródło tych wartości w projekcie.
export const SOURCE_TEXT_MIN = 1000;
export const SOURCE_TEXT_MAX = 10000;
export const FRONT_MAX = 200;
export const BACK_MAX = 500;
export const PASSWORD_MIN = 8;

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Zwracają komunikat błędu (PL) albo null gdy dane poprawne.
export function validateSourceText(text: string): string | null {
  const len = text.trim().length;
  if (len < SOURCE_TEXT_MIN) {
    return `Tekst źródłowy musi mieć co najmniej ${SOURCE_TEXT_MIN} znaków (ma ${len}).`;
  }
  if (len > SOURCE_TEXT_MAX) {
    return `Tekst źródłowy może mieć najwyżej ${SOURCE_TEXT_MAX} znaków (ma ${len}).`;
  }
  return null;
}

export function validateCardContent(front: string, back: string): string | null {
  if (!front.trim()) return 'Przód fiszki nie może być pusty.';
  if (!back.trim()) return 'Tył fiszki nie może być pusty.';
  if (front.length > FRONT_MAX) return `Przód fiszki może mieć najwyżej ${FRONT_MAX} znaków.`;
  if (back.length > BACK_MAX) return `Tył fiszki może mieć najwyżej ${BACK_MAX} znaków.`;
  return null;
}
