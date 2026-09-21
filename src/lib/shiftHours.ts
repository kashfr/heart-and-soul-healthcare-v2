// Shift hours math: splitting a documented shift into per-calendar-day hours,
// summing hours inside a date range, and comparing usage against a client's
// authorized hours (the GAPP "Letter of Notification").
//
// Why per-day: billing is by date of service, so a 19:00 to 07:00 shift is 5
// hours on the first day and 7 on the next. A month's usage must count the
// 7 hours that spilled into it from a shift whose date of service was the
// last day of the prior month. Every consumer (submissions list totals, the
// client Hours tab, the roster badges) goes through splitShiftByDay so the
// numbers agree everywhere.
//
// Firebase-free and clock-free on purpose (today is always passed in) so it
// runs on the roster, in a route, and under test with deterministic results.

export interface ShiftLike {
  /** Date of service, 'YYYY-MM-DD' ('' when unparseable). */
  dateISO: string;
  /** 'HH:MM' shift start ('' when absent). */
  shiftStart: string;
  /** 'YYYY-MM-DD' shift end date ('' on older notes). */
  shiftEndDate: string;
  /** 'HH:MM' shift end time ('' when absent). */
  shiftEnd: string;
  /** q9_totalHours as typed/computed on the note (free-text numeric). */
  totalHours: string;
}

export interface DaySegment {
  dateISO: string;
  hours: number;
}

/** Longest shift the splitter trusts (a 32h weekend stretch is real; a
 *  week-long one is a typo). Beyond this we fall back to the note's total. */
const MAX_SHIFT_DAYS = 7;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseHM(v: string): number | null {
  const m = (v || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Day-number arithmetic on ISO dates via UTC so DST never shifts a day. */
function isoToDayNum(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

function dayNumToISO(n: number): string {
  const d = new Date(n * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Shift an ISO date by n days (negative allowed). */
export function addDaysISO(iso: string, n: number): string {
  return dayNumToISO(isoToDayNum(iso) + n);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The note's total as a number, or 0 when blank/garbage/absurd. Mirrors the
 *  client dashboard's guard (h > 0) but allows multi-day stretches. */
export function parseTotalHours(v: string): number {
  const h = parseFloat(v);
  if (!Number.isFinite(h) || h <= 0 || h > MAX_SHIFT_DAYS * 24) return 0;
  return round2(h);
}

/**
 * Split one shift into the hours that fall on each calendar day, cutting at
 * midnight. Uses the start/end date-times when they are usable; otherwise
 * (older notes with no end date and an end time earlier than the start roll
 * to the next day, as the form did) and, when nothing parses, the whole
 * total lands on the date of service so no hours are lost.
 */
export function splitShiftByDay(s: ShiftLike): DaySegment[] {
  const dateISO = ISO_DATE.test(s.dateISO || '') ? s.dateISO : '';
  const total = parseTotalHours(s.totalHours);
  if (!dateISO) return [];

  const startMin = parseHM(s.shiftStart);
  const endMin = parseHM(s.shiftEnd);
  if (startMin == null || endMin == null) {
    return total > 0 ? [{ dateISO, hours: total }] : [];
  }

  const startDay = isoToDayNum(dateISO);
  let endDay: number;
  if (ISO_DATE.test(s.shiftEndDate || '')) {
    endDay = isoToDayNum(s.shiftEndDate);
  } else {
    // Legacy note: no end date. Same-day unless the end time is not after
    // the start, which the form treated as an overnight roll.
    endDay = endMin > startMin ? startDay : startDay + 1;
  }

  const startAbs = startDay * 1440 + startMin;
  const endAbs = endDay * 1440 + endMin;
  const spanDays = endDay - startDay;
  if (endAbs <= startAbs || spanDays > MAX_SHIFT_DAYS) {
    // End-before-start or an implausible span: trust the note's total instead.
    return total > 0 ? [{ dateISO, hours: total }] : [];
  }

  const out: DaySegment[] = [];
  for (let day = startDay; day <= endDay; day += 1) {
    const dayStart = day * 1440;
    const dayEnd = dayStart + 1440;
    const from = Math.max(startAbs, dayStart);
    const to = Math.min(endAbs, dayEnd);
    if (to <= from) continue;
    out.push({ dateISO: dayNumToISO(day), hours: round2((to - from) / 60) });
  }
  return out;
}

/** Sum of a shift's hours that fall inside [fromISO, toISO] (inclusive).
 *  Either bound may be '' for open-ended. */
export function hoursInRange(segments: DaySegment[], fromISO: string, toISO: string): number {
  let sum = 0;
  for (const seg of segments) {
    if (fromISO && seg.dateISO < fromISO) continue;
    if (toISO && seg.dateISO > toISO) continue;
    sum += seg.hours;
  }
  return round2(sum);
}

/** True when any of the shift's days falls inside the range. */
export function touchesRange(segments: DaySegment[], fromISO: string, toISO: string): boolean {
  return segments.some((seg) => (!fromISO || seg.dateISO >= fromISO) && (!toISO || seg.dateISO <= toISO));
}

/** Sum of all segments. */
export function totalOfSegments(segments: DaySegment[]): number {
  return round2(segments.reduce((a, s) => a + s.hours, 0));
}

/**
 * Absolute [start, end) minutes of a shift, or null when the window can't be
 * resolved (missing times, end before start, implausible span). Same rules as
 * splitShiftByDay so a shift that split cleanly always has an interval.
 */
export function shiftInterval(s: ShiftLike): { start: number; end: number } | null {
  if (!ISO_DATE.test(s.dateISO || '')) return null;
  const startMin = parseHM(s.shiftStart);
  const endMin = parseHM(s.shiftEnd);
  if (startMin == null || endMin == null) return null;
  const startDay = isoToDayNum(s.dateISO);
  const endDay = ISO_DATE.test(s.shiftEndDate || '')
    ? isoToDayNum(s.shiftEndDate)
    : endMin > startMin ? startDay : startDay + 1;
  const start = startDay * 1440 + startMin;
  const end = endDay * 1440 + endMin;
  if (end <= start || endDay - startDay > MAX_SHIFT_DAYS) return null;
  return { start, end };
}

export interface OverlapHit {
  /** The other shift's id. */
  otherId: string;
  /** Minutes the two windows share. */
  minutes: number;
}

/**
 * Pairs of shifts for ONE client whose clock windows intersect. Two nurses
 * charting the same hour on the same client is either a real double-staffed
 * hour or a data-entry error; either way it double-bills unless someone
 * looks, so the worksheet points at it. Keyed by shift id; each entry lists
 * every other shift it overlaps.
 */
export function findShiftOverlaps<T extends ShiftLike & { id: string }>(shifts: T[]): Map<string, OverlapHit[]> {
  const out = new Map<string, OverlapHit[]>();
  const withIv = shifts
    .map((s) => ({ id: s.id, iv: shiftInterval(s) }))
    .filter((x): x is { id: string; iv: { start: number; end: number } } => x.iv != null)
    .sort((a, b) => a.iv.start - b.iv.start);
  for (let i = 0; i < withIv.length; i += 1) {
    for (let j = i + 1; j < withIv.length; j += 1) {
      const a = withIv[i];
      const b = withIv[j];
      if (b.iv.start >= a.iv.end) break; // sorted by start: nothing later can overlap a
      const minutes = Math.min(a.iv.end, b.iv.end) - b.iv.start;
      if (minutes <= 0) continue;
      (out.get(a.id) ?? out.set(a.id, []).get(a.id)!).push({ otherId: b.id, minutes });
      (out.get(b.id) ?? out.set(b.id, []).get(b.id)!).push({ otherId: a.id, minutes });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Month helpers ('YYYY-MM').
// ---------------------------------------------------------------------------

export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthStartISO(ym: string): string {
  return `${ym}-01`;
}

export function monthEndISO(ym: string): string {
  return `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`;
}

/** 'September 2026' for a 'YYYY-MM' key. */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Every 'YYYY-MM' from the month of `fromISO` through the month of `toISO`. */
export function monthsBetween(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  let [y, m] = fromISO.slice(0, 7).split('-').map(Number);
  const end = toISO.slice(0, 7);
  for (let i = 0; i < 120; i += 1) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (key >= end) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Authorized hours (the GAPP Letter of Notification).
//
// The letter states a weekly rate ("21 hours/week of skilled nursing until
// 9/30/2026") AND a per-month block table (Jul 93, Aug 93, Sep 90). Parents
// spend the MONTHLY block however they like, so the month number is the one
// that matters. weekly x days-in-month / 7 reproduces the letter's full
// months exactly (21 x 31 / 7 = 93; 21 x 30 / 7 = 90); partial months and
// any other deviation are entered as overrides, month by month.
// ---------------------------------------------------------------------------

export interface HoursAuthorization {
  id?: string;
  patientId: string;
  /** Prior-authorization number as printed on the letter. */
  paNumber: string;
  /** 'skilled' | 'unskilled' nursing hours. */
  kind: 'skilled' | 'unskilled';
  /** Weekly rate from the letter; null when the letter only lists months. */
  hoursPerWeek: number | null;
  /** 'YYYY-MM-DD' effective window. */
  from: string;
  to: string;
  /** Month block hours as printed, keyed 'YYYY-MM'. Wins over the weekly default. */
  monthOverrides: Record<string, number>;
  note?: string;
}

/** Does the authorization cover any day of this month? */
export function authCoversMonth(a: HoursAuthorization, ym: string): boolean {
  return a.from <= monthEndISO(ym) && a.to >= monthStartISO(ym);
}

/**
 * Authorized hours for one month under one authorization: the override when
 * entered, otherwise the weekly rate prorated over the days of the month the
 * authorization actually covers. null when neither is available.
 */
export function monthCap(a: HoursAuthorization, ym: string): number | null {
  if (!authCoversMonth(a, ym)) return null;
  const override = a.monthOverrides?.[ym];
  if (typeof override === 'number' && Number.isFinite(override)) return override;
  if (a.hoursPerWeek == null || !Number.isFinite(a.hoursPerWeek)) return null;
  const start = a.from > monthStartISO(ym) ? a.from : monthStartISO(ym);
  const end = a.to < monthEndISO(ym) ? a.to : monthEndISO(ym);
  const days = isoToDayNum(end) - isoToDayNum(start) + 1;
  return Math.round((a.hoursPerWeek * days) / 7);
}

/** Whether a month's cap came from an override or the weekly default. */
export function monthCapSource(a: HoursAuthorization, ym: string): 'override' | 'weekly' | 'none' {
  if (!authCoversMonth(a, ym)) return 'none';
  if (typeof a.monthOverrides?.[ym] === 'number') return 'override';
  return a.hoursPerWeek != null ? 'weekly' : 'none';
}

/** The authorization in force for a month (newest `from` wins when several overlap). */
export function authForMonth(auths: HoursAuthorization[], ym: string): HoursAuthorization | null {
  const covering = auths.filter((a) => authCoversMonth(a, ym));
  if (covering.length === 0) return null;
  return [...covering].sort((a, b) => b.from.localeCompare(a.from))[0];
}

export interface MonthUsage {
  ym: string;
  authorized: number | null;
  used: number;
  remaining: number | null;
  /** used / authorized (0..∞), null when no cap. */
  pct: number | null;
  /** Straight-line projection of month-end usage from the pace so far.
   *  Only meaningful for the current month; equals `used` for past months. */
  projected: number | null;
  /** Date the month's hours run out at the current pace, when that is before
   *  month end. 'YYYY-MM-DD' or null. */
  runsOutOn: string | null;
  /** Average hours per day so far (current month) or over the month (past). */
  perDay: number;
}

/**
 * Usage for one month. `dayHours` is the per-day map already restricted to
 * shift notes (callers filter noteType; this function is agnostic).
 */
export function monthUsage(
  dayHours: Map<string, number>,
  authorized: number | null,
  ym: string,
  todayISO: string,
): MonthUsage {
  const start = monthStartISO(ym);
  const end = monthEndISO(ym);
  let used = 0;
  for (const [d, h] of dayHours) {
    if (d >= start && d <= end) used += h;
  }
  used = round2(used);
  const remaining = authorized == null ? null : round2(authorized - used);
  const pct = authorized ? used / authorized : null;

  const totalDays = daysInMonth(ym);
  let elapsed: number;
  if (todayISO < start) elapsed = 0;
  else if (todayISO > end) elapsed = totalDays;
  else elapsed = isoToDayNum(todayISO) - isoToDayNum(start) + 1;

  const perDay = elapsed > 0 ? used / elapsed : 0;
  let projected: number | null = null;
  let runsOutOn: string | null = null;
  if (elapsed >= totalDays) {
    projected = used;
  } else if (elapsed > 0) {
    projected = round2(perDay * totalDays);
    if (authorized != null && perDay > 0 && remaining != null && remaining > 0) {
      const daysLeft = remaining / perDay;
      const runOutDay = isoToDayNum(todayISO) + Math.floor(daysLeft);
      if (runOutDay <= isoToDayNum(end)) runsOutOn = dayNumToISO(runOutDay);
    } else if (remaining != null && remaining <= 0) {
      runsOutOn = todayISO;
    }
  }
  return { ym, authorized, used, remaining, pct, projected, runsOutOn, perDay: round2(perDay) };
}

/** Authorizations ending within this many days get a reminder. Matches the
 *  Therap-authorization threshold in reconcile.ts. */
export const HOURS_AUTH_EXPIRY_WARN_DAYS = 45;

export type HoursFinding = { severity: 'error' | 'warn' | 'info'; message: string };

/**
 * Roster-level findings for one client: an expiring/expired authorization and
 * a current month that is nearly used up or on pace to run over. Empty when
 * the client has no authorization on file (not every client has hours caps).
 */
export function hoursFindings(
  auths: HoursAuthorization[],
  dayHours: Map<string, number>,
  todayISO: string,
): HoursFinding[] {
  const out: HoursFinding[] = [];
  if (auths.length === 0) return out;
  const ym = monthKeyOf(todayISO);
  const current = authForMonth(auths, ym);
  const latest = [...auths].sort((a, b) => b.to.localeCompare(a.to))[0];

  if (latest) {
    const daysLeft = isoToDayNum(latest.to) - isoToDayNum(todayISO);
    if (daysLeft < 0) {
      out.push({ severity: 'error', message: `Hours authorization expired ${fmtUS(latest.to)}. No renewal on file.` });
    } else if (daysLeft <= HOURS_AUTH_EXPIRY_WARN_DAYS) {
      out.push({
        severity: daysLeft <= 14 ? 'error' : 'warn',
        message: `Hours authorization ends ${fmtUS(latest.to)} (${daysLeft === 0 ? 'today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'}`}). No renewal on file.`,
      });
    }
  }

  if (current) {
    const u = monthUsage(dayHours, monthCap(current, ym), ym, todayISO);
    if (u.authorized != null && u.remaining != null) {
      const label = monthLabel(ym).split(' ')[0];
      if (u.remaining < 0) {
        out.push({ severity: 'error', message: `${label}: ${fmtH(u.used)} of ${fmtH(u.authorized)} hours used. Over by ${fmtH(-u.remaining)}.` });
      } else if (u.pct != null && u.pct >= 0.9) {
        out.push({ severity: 'warn', message: `${label}: ${fmtH(u.used)} of ${fmtH(u.authorized)} hours used (${Math.round(u.pct * 100)}%). ${fmtH(u.remaining)} left.` });
      } else if (u.runsOutOn) {
        out.push({ severity: 'warn', message: `${label}: on pace to run out of hours ${fmtUS(u.runsOutOn)} (${fmtH(u.used)} of ${fmtH(u.authorized)} used).` });
      }
    }
  }
  return out;
}

/** '93', '5.5', '12.25' (no trailing zeros, at most two decimals). */
export function fmtH(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, '');
}

function fmtUS(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}
