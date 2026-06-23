// US phone-number helpers shared across the portal and the marketing forms.
// We store and display numbers in the standard US format `(XXX) XXX-XXXX`.
// This module is the single canonical formatter for every place a user types
// or pastes a phone number.

/**
 * Reduce any input to its 10-digit US local number. Strips non-digits and a
 * leading US country code, so a pasted "+1 (470) 249-1083" (or "1-470-…")
 * normalizes to the 10 local digits instead of keeping the 1 and dropping the
 * last digit. US area codes never start with 1, so a leading 1 in an 11-digit
 * string is unambiguously the country code.
 */
export function phoneDigits(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits.slice(0, 10);
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
