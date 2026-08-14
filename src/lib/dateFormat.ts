/**
 * Convert an ISO date-only string (YYYY-MM-DD) to US format (MM/DD/YYYY).
 * Pure string slicing — no Date parsing, so no timezone drift. Anything not
 * shaped like an ISO date (empty, free text like "Will provide later") passes
 * through unchanged.
 */
export function formatDateUS(dateStr: string): string {
  if (!dateStr) return '';
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateStr;
  return `${m[2]}/${m[3]}/${m[1]}`;
}
