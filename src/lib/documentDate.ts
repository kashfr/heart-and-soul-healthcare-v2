/**
 * The date on a client document (docDate) is the date printed on the paper:
 * a visit, a letter, a signature. It can never be later than today, so a typo
 * like 11/20/2618 is caught when it is typed instead of sorting the document
 * to the top of the list for six centuries. "Today" is the agency's day
 * (Eastern time), the same day every other dated form here uses.
 */

/** Today's date in Eastern time as YYYY-MM-DD. */
export function todayEasternISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export const DOC_DATE_REQUIRED = 'Enter the date on the document.';
export const DOC_DATE_FUTURE = 'The date on the document cannot be in the future.';

/** A real YYYY-MM-DD calendar date. */
function isRealISODate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/** The problem with a document date, or null when it is a real date no later than today. */
export function documentDateError(iso: string, todayISO: string = todayEasternISO()): string | null {
  if (!isRealISODate(String(iso || ''))) return DOC_DATE_REQUIRED;
  if (iso > todayISO) return DOC_DATE_FUTURE;
  return null;
}
