// Canonical age-string computation for progress notes. The stored
// `q5_ageYears` field is a display string ("4", "5 mo", "12 days") derived
// from the client's DOB as-of the date of service. Keeping this in one place
// means the progress-note form, the admin note editor, and the maintenance
// recompute tool can't drift from each other.

/**
 * Parse a stored date string anchored at local noon — matching the form's
 * original `new Date(dob + 'T12:00:00')` convention so day-boundary math is
 * identical. Accepts `YYYY-MM-DD` (the storage format, and what
 * <input type="date"> emits) and tolerates `MM/DD/YYYY` defensively.
 * Returns null for empty or unparseable input.
 */
export function parseNoteDate(value: string | undefined | null): Date | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  let y: string, m: string, d: string;
  let match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    [, y, m, d] = match;
  } else {
    match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      [, m, d, y] = match;
    } else {
      return null;
    }
  }
  const date = new Date(
    `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00`
  );
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Compute the age display string for a DOB as-of a reference date.
 *
 * - 1 year or older → whole years, e.g. "4"
 * - under 1 year    → whole months, e.g. "5 mo"
 * - under 1 month   → days, e.g. "12 days" / "1 day"
 *
 * `asOfDate` defaults to today when omitted (used by the live form before a
 * date of service is entered). Returns '' when the DOB can't be parsed.
 */
export function computeAgeString(dob: string, asOfDate?: string): string {
  const birthDate = parseNoteDate(dob);
  if (!birthDate) return '';
  const asOf = asOfDate ? parseNoteDate(asOfDate) : new Date();
  if (!asOf) return '';

  let years = asOf.getFullYear() - birthDate.getFullYear();
  const monthDiff = asOf.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < birthDate.getDate())) {
    years--;
  }
  if (years >= 1) return String(years);

  let months =
    (asOf.getFullYear() - birthDate.getFullYear()) * 12 +
    (asOf.getMonth() - birthDate.getMonth());
  if (asOf.getDate() < birthDate.getDate()) months--;
  if (months >= 1) return `${months} mo`;

  const diffMs = asOf.getTime() - birthDate.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return `${days} day${days !== 1 ? 's' : ''}`;
}
