import { formatDateUS } from './dateFormat';
import { parseUSDate } from './usDateInput';

/**
 * The period a client document COVERS, as distinct from the date ON it
 * (`docDate`). An eligibility letter dated 10/21 covers October; an
 * authorization covers a service span; a plan of care covers a certification
 * period. Stored as two ISO dates (`periodStart`, `periodEnd`, inclusive) so
 * Firestore rules, filters and sorting treat them like every other date on
 * the record. Both are present or neither is.
 */
export interface DocumentPeriod {
  periodStart: string;
  periodEnd: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function isISODate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The whole calendar month, from `YYYY-MM`. */
export function monthPeriod(month: string): DocumentPeriod | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return null;
  const last = daysInMonth(Number(m[1]), Number(m[2]));
  return { periodStart: `${month}-01`, periodEnd: `${month}-${String(last).padStart(2, '0')}` };
}

/** `YYYY-MM` when the period is exactly one calendar month, else null. */
export function periodMonth(period: Partial<DocumentPeriod> | null | undefined): string | null {
  const start = period?.periodStart || '';
  const end = period?.periodEnd || '';
  if (!isISODate(start) || !isISODate(end)) return null;
  const month = start.slice(0, 7);
  const whole = monthPeriod(month);
  return whole && whole.periodStart === start && whole.periodEnd === end ? month : null;
}

function monthLabel(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/**
 * Short label for a period: "Oct 2026" for one month, "2026" for a whole
 * year, "Oct 2026 to Dec 2026" for whole months, otherwise the two US dates.
 * Empty when the period is missing or malformed.
 */
export function formatDocumentPeriod(period: Partial<DocumentPeriod> | null | undefined): string {
  const start = period?.periodStart || '';
  const end = period?.periodEnd || '';
  if (!isISODate(start) || !isISODate(end) || start > end) return '';
  const wholeMonths = start.endsWith('-01') && end === monthPeriod(end.slice(0, 7))!.periodEnd;
  if (wholeMonths) {
    if (start.slice(0, 7) === end.slice(0, 7)) return monthLabel(start);
    if (start.slice(0, 4) === end.slice(0, 4) && start.slice(5, 7) === '01' && end.slice(5, 7) === '12') return start.slice(0, 4);
    return `${monthLabel(start)} to ${monthLabel(end)}`;
  }
  return `${formatDateUS(start)} to ${formatDateUS(end)}`;
}

/** Inclusive overlap with a date range; an open bound matches everything on that side. */
export function periodOverlaps(period: Partial<DocumentPeriod> | null | undefined, from: string, to: string): boolean {
  const start = period?.periodStart || '';
  const end = period?.periodEnd || '';
  if (!isISODate(start) || !isISODate(end)) return false;
  return (!from || end >= from) && (!to || start <= to);
}

/**
 * Server-side parse of a submitted period. Both fields empty (or absent)
 * means "not tied to a period"; anything else must be a complete, ordered
 * pair of ISO dates.
 */
export function parseDocumentPeriod(input: { periodStart?: unknown; periodEnd?: unknown }): { ok: true; period: DocumentPeriod | null } | { ok: false; error: string } {
  const start = typeof input.periodStart === 'string' ? input.periodStart.trim() : '';
  const end = typeof input.periodEnd === 'string' ? input.periodEnd.trim() : '';
  if (!start && !end) return { ok: true, period: null };
  if (!start || !end) return { ok: false, error: 'Enter both the start and the end of the period the document covers.' };
  if (!isISODate(start) || !isISODate(end)) return { ok: false, error: 'The period covered must be two valid dates (YYYY-MM-DD).' };
  if (start > end) return { ok: false, error: 'The period start must be on or before its end.' };
  return { ok: true, period: { periodStart: start, periodEnd: end } };
}

/**
 * What the form holds while someone picks a period: one month (the common
 * case for eligibility and monthly authorizations) or a date range (a
 * certification period, a quarter, a plan year). Plain data, so a bulk
 * upload can copy one draft onto every pending file.
 */
export type DocumentPeriodMode = 'none' | 'month' | 'range';
export interface DocumentPeriodDraft {
  mode: DocumentPeriodMode;
  /** `YYYY-MM` for the month mode. */
  month: string;
  /** US-formatted text (MM/DD/YYYY) for the range mode. */
  from: string;
  to: string;
}

export const EMPTY_PERIOD_DRAFT: DocumentPeriodDraft = { mode: 'none', month: '', from: '', to: '' };

export function draftFromPeriod(period: Partial<DocumentPeriod> | null | undefined): DocumentPeriodDraft {
  const month = periodMonth(period);
  if (month) return { mode: 'month', month, from: '', to: '' };
  if (period?.periodStart && period?.periodEnd && isISODate(period.periodStart) && isISODate(period.periodEnd)) {
    return { mode: 'range', month: '', from: formatDateUS(period.periodStart), to: formatDateUS(period.periodEnd) };
  }
  return EMPTY_PERIOD_DRAFT;
}

export function resolvePeriodDraft(draft: DocumentPeriodDraft): { ok: true; period: DocumentPeriod | null } | { ok: false; error: string } {
  if (draft.mode === 'none') return { ok: true, period: null };
  if (draft.mode === 'month') {
    const period = monthPeriod(draft.month);
    return period ? { ok: true, period } : { ok: false, error: 'Choose the month the document covers.' };
  }
  const start = parseUSDate(draft.from);
  const end = parseUSDate(draft.to);
  if (!start || !end) return { ok: false, error: 'Enter the start and end of the period covered (MM/DD/YYYY).' };
  if (start > end) return { ok: false, error: 'The period start must be on or before its end.' };
  return { ok: true, period: { periodStart: start, periodEnd: end } };
}

/** The current month as `YYYY-MM` in local time, for a freshly chosen month mode. */
export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
