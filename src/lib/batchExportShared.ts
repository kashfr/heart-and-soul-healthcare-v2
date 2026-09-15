/**
 * Pure helpers for the batch PDF export. No Firebase imports, so they can be
 * unit-tested and reused without booting the client SDK.
 */

/** Normalize a stored date of service to YYYY-MM-DD. Accepts ISO or the legacy
 *  MM/DD/YYYY form; anything else is null. */
export function isoDate(s: string): string | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  return null;
}

export interface ChronoNote {
  form: { q6_dateofService: string; q7_shiftStart?: string; q3_clientName?: string };
}

/**
 * Oldest-to-newest by date of service; same-day notes then by shift start, then
 * by client name so the order is stable across runs. A note with no parseable
 * date sorts last rather than throwing the whole export out of order.
 */
export function compareChronological(a: ChronoNote, b: ChronoNote): number {
  const da = isoDate(a.form.q6_dateofService) ?? '9999-99-99';
  const db = isoDate(b.form.q6_dateofService) ?? '9999-99-99';
  if (da !== db) return da < db ? -1 : 1;
  const ta = a.form.q7_shiftStart || '';
  const tb = b.form.q7_shiftStart || '';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return (a.form.q3_clientName || '').localeCompare(b.form.q3_clientName || '');
}
