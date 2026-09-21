// Date-of-service range for the shift notes list: relative presets (this
// month, last year...), a picked month, or an explicit from/to. Resolved to
// inclusive ISO bounds so the filter and the hours math compare plain
// strings. Pure and clock-free (today is passed in) so it is testable and the
// URL state stays the single source of truth.

import { addDaysISO, monthEndISO, monthStartISO } from './shiftHours';

export type RangePreset =
  | ''
  | 'today'
  | 'yesterday'
  | 'week'
  | 'lastweek'
  | 'month'
  | 'lastmonth'
  | '30d'
  | '90d'
  | 'year'
  | 'lastyear'
  /** A picked month; the 'YYYY-MM' travels in a second param. */
  | 'm'
  /** Explicit from/to. */
  | 'c';

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: '', label: 'Any date' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This week' },
  { value: 'lastweek', label: 'Last week' },
  { value: 'month', label: 'This month' },
  { value: 'lastmonth', label: 'Last month' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'year', label: 'This year' },
  { value: 'lastyear', label: 'Last year' },
  { value: 'm', label: 'Pick a month…' },
  { value: 'c', label: 'Custom range…' },
];

export function isRangePreset(v: string | null): v is RangePreset {
  return RANGE_PRESETS.some((p) => p.value === v);
}

export interface ResolvedRange {
  /** '' when open-ended. */
  fromISO: string;
  toISO: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

function dowOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Resolve the URL state to inclusive ISO bounds. Weeks run Sunday to
 * Saturday (matching the old "This week" behaviour). An unset or invalid
 * state resolves to no bounds at all rather than a partial range.
 */
export function resolveRange(
  preset: RangePreset,
  opts: { month?: string; from?: string; to?: string },
  todayISO: string,
): ResolvedRange {
  const none = { fromISO: '', toISO: '' };
  switch (preset) {
    case '':
      return none;
    case 'today':
      return { fromISO: todayISO, toISO: todayISO };
    case 'yesterday': {
      const y = addDaysISO(todayISO, -1);
      return { fromISO: y, toISO: y };
    }
    case 'week': {
      const start = addDaysISO(todayISO, -dowOf(todayISO));
      return { fromISO: start, toISO: addDaysISO(start, 6) };
    }
    case 'lastweek': {
      const thisStart = addDaysISO(todayISO, -dowOf(todayISO));
      const start = addDaysISO(thisStart, -7);
      return { fromISO: start, toISO: addDaysISO(start, 6) };
    }
    case 'month': {
      const ym = todayISO.slice(0, 7);
      return { fromISO: monthStartISO(ym), toISO: monthEndISO(ym) };
    }
    case 'lastmonth': {
      const ym = addDaysISO(monthStartISO(todayISO.slice(0, 7)), -1).slice(0, 7);
      return { fromISO: monthStartISO(ym), toISO: monthEndISO(ym) };
    }
    case '30d':
      return { fromISO: addDaysISO(todayISO, -30), toISO: todayISO };
    case '90d':
      return { fromISO: addDaysISO(todayISO, -90), toISO: todayISO };
    case 'year': {
      const y = todayISO.slice(0, 4);
      return { fromISO: `${y}-01-01`, toISO: `${y}-12-31` };
    }
    case 'lastyear': {
      const y = Number(todayISO.slice(0, 4)) - 1;
      return { fromISO: `${y}-01-01`, toISO: `${y}-12-31` };
    }
    case 'm': {
      const ym = opts.month || '';
      if (!ISO_MONTH.test(ym)) return none;
      return { fromISO: monthStartISO(ym), toISO: monthEndISO(ym) };
    }
    case 'c': {
      const from = ISO_DATE.test(opts.from || '') ? (opts.from as string) : '';
      const to = ISO_DATE.test(opts.to || '') ? (opts.to as string) : '';
      if (!from && !to) return none;
      if (from && to && from > to) return { fromISO: to, toISO: from };
      return { fromISO: from, toISO: to };
    }
    default:
      return none;
  }
}

/** '08/01/2026 to 08/15/2026', 'through 08/15/2026', 'from 08/01/2026'. */
export function describeRange(r: ResolvedRange): string {
  const us = (iso: string) => {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
  };
  if (r.fromISO && r.toISO) return r.fromISO === r.toISO ? us(r.fromISO) : `${us(r.fromISO)} to ${us(r.toISO)}`;
  if (r.fromISO) return `from ${us(r.fromISO)}`;
  if (r.toISO) return `through ${us(r.toISO)}`;
  return 'all dates';
}
