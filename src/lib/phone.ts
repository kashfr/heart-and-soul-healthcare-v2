// US phone-number helpers shared by the staff/nurse profile forms and their
// API routes. We store and display numbers in the standard US format
// `(XXX) XXX-XXXX`. The referral form has its own inline copy of the
// as-you-type formatter; this module is the canonical version for the portal.

/** Strip everything but digits, capped at 10 (US local number, no country code). */
export function phoneDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 10);
}

/**
 * Format a (partial) phone number as the user types: `(XXX) XXX-XXXX`.
 * Accepts any input and returns the best-effort formatted prefix so the
 * field reads naturally while being filled in.
 */
export function formatUSPhone(value: string): string {
  const digits = phoneDigits(value);
  if (digits.length === 0) return '';
  // Hold the closing paren and the dash until the next digit arrives, so a
  // backspace can delete the area code and the 6th digit instead of getting
  // stuck on "(678) " or "(678) 644-".
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** True when the value contains exactly 10 digits (a complete US number). */
export function isValidUSPhone(value: string): boolean {
  return phoneDigits(value).length === 10;
}
