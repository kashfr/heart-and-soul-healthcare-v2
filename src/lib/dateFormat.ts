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

/**
 * ISO date (YYYY-MM-DD) to MM-DD-YYYY for filenames, where slashes are
 * illegal. Same passthrough behavior as formatDateUS.
 */
export function formatDateUSFile(dateStr: string): string {
  if (!dateStr) return '';
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateStr;
  return `${m[2]}-${m[3]}-${m[1]}`;
}

/**
 * ISO month key (YYYY-MM) to MM-YYYY for filenames. The month key itself
 * (API params, Firestore range queries) must stay ISO — format only the
 * filename interpolation.
 */
export function formatMonthUSFile(month: string): string {
  if (!month) return '';
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!m) return month;
  return `${m[2]}-${m[1]}`;
}

/** Format external date/time labels without shifting unzoned calendar dates.
 * Zoned ISO timestamps represent instants and are displayed in agency time.
 * Existing US dates and vendor/free-text labels pass through unchanged. */
export function formatDateTimeUS(value: string): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString('en-US', {
        timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
    }
  }
  const local = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?$/.exec(value);
  return local ? `${formatDateUS(local[1])}${local[2] ? ` ${local[2]}` : ''}` : value;
}
