/**
 * Pure helpers behind the per-client dashboard (stats tiles, survey-readiness
 * baseline, activity assembly). Firebase-free — structural types only — so the
 * math that drives compliance signals is unit-testable. Fetching lives with the
 * callers (submissions.ts / mar.ts); this file only computes.
 */

// ---------------------------------------------------------------------------
// Dates. Notes store q6_dateofService as either YYYY-MM-DD (native date input)
// or MM/DD/YYYY (legacy typed entries); everything here normalizes to ISO and
// compares lexicographically, mirroring isoFromAnyDate in the PDF route.
// ---------------------------------------------------------------------------

export function normalizeDateISO(v: string | undefined): string {
  const s = (v || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split('/');
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  return '';
}

export function daysBetweenISO(a: string, b: string): number {
  const da = new Date(a + 'T12:00:00').getTime();
  const db = new Date(b + 'T12:00:00').getTime();
  return Math.round((db - da) / 86400000);
}

export function shiftISO(iso: string, deltaDays: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + deltaDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whole years between a YYYY-MM-DD birth date and today-ISO. Null when unknown. */
export function ageYears(dobISO: string, todayISO: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dobISO || '')) return null;
  const dob = new Date(dobISO + 'T12:00:00');
  const today = new Date(todayISO + 'T12:00:00');
  let age = today.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    today.getMonth() < dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

// ---------------------------------------------------------------------------
// Notes. The slim per-note shape the dashboard consumes (built by
// getNotesForPatient from the raw progressNotes doc).
// ---------------------------------------------------------------------------

export interface DashboardNote {
  id: string;
  dateISO: string; // normalized q6_dateofService; '' when unparseable
  submittedAt: Date | null;
  nurseId: string;
  nurseName: string;
  credential: string;
  totalHours: string; // q9, free text numeric
  temperature: string;
  bloodPressure: string; // "120/80"
  pulse: string;
  respiration: string;
  oxygenSaturation: string;
  painScore: string;
  medTolerance: string; // q43 radio value
  physNotified: string; // q43_reactionPhysNotified ('Yes' | 'No' | '')
  addrLine1: string;
  city: string;
  state: string;
  postal: string;
}

/** Notes sorted newest-first by date of service (ties by submittedAt). */
export function sortNotesDesc(notes: DashboardNote[]): DashboardNote[] {
  return [...notes].sort((a, b) => {
    const byDate = (b.dateISO || '').localeCompare(a.dateISO || '');
    if (byDate !== 0) return byDate;
    return (b.submittedAt?.getTime() || 0) - (a.submittedAt?.getTime() || 0);
  });
}

export function notesInWindow(notes: DashboardNote[], startISO: string, endISO: string): DashboardNote[] {
  return notes.filter((n) => n.dateISO && n.dateISO >= startISO && n.dateISO <= endISO);
}

// ---------------------------------------------------------------------------
// Survey-readiness metrics (the compliance nurse's baseline).
// ---------------------------------------------------------------------------

/** Documentation timeliness: a note documented on its date of service is
 *  "same-day"; submitted after it is a late entry (late documentation is a
 *  classic survey finding). Notes with no parseable pair are skipped. */
/** The agency operates in Georgia; timeliness must not flip when a viewer's
 *  machine is in another timezone, so the submission DAY is always derived in
 *  the agency's zone. */
const AGENCY_TZ = 'America/New_York';

/** YYYY-MM-DD of a Date in the agency timezone (en-CA locale renders ISO). */
export function agencyDayISO(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: AGENCY_TZ });
}

export function timelinessStats(notes: DashboardNote[]): {
  total: number;
  sameDay: number;
  late: number;
  pctSameDay: number | null;
} {
  let sameDay = 0;
  let late = 0;
  for (const n of notes) {
    if (!n.dateISO || !n.submittedAt) continue;
    const subISO = agencyDayISO(n.submittedAt);
    if (subISO <= n.dateISO) sameDay += 1;
    else late += 1;
  }
  const total = sameDay + late;
  return { total, sameDay, late, pctSameDay: total === 0 ? null : Math.round((sameDay / total) * 100) };
}

/** Continuity of care: the largest gap (in days) between consecutive service
 *  dates within the window, INCLUDING the tail gap from the last visit to
 *  today AND — when the client had visits before the window — the head gap
 *  from the window start to the first in-window visit, so a hiatus straddling
 *  the boundary can't hide. (A client with no prior history isn't penalized
 *  for days before care started.) Null when no visit falls in the window. */
export function largestGapDays(
  notes: DashboardNote[],
  windowStartISO: string,
  todayISO: string,
): number | null {
  const dates = Array.from(
    new Set(notes.map((n) => n.dateISO).filter((d) => d && d >= windowStartISO && d <= todayISO)),
  ).sort();
  if (dates.length === 0) return null;
  const hasPriorHistory = notes.some((n) => n.dateISO && n.dateISO < windowStartISO);
  let largest = hasPriorHistory ? daysBetweenISO(windowStartISO, dates[0]) : 0;
  for (let i = 1; i < dates.length; i += 1) {
    largest = Math.max(largest, daysBetweenISO(dates[i - 1], dates[i]));
  }
  largest = Math.max(largest, daysBetweenISO(dates[dates.length - 1], todayISO));
  return largest;
}

/**
 * Whether a q43 medication-tolerance value reports an adverse reaction. Prefix
 * match, NOT string equality: the stored radio label has shifted punctuation
 * over time ("… intolerance; document below" today, an em-dash variant before
 * 2026-06-10), and an exact match against one variant silently misses the
 * other — a false-green adverse-reaction signal on a survey card.
 */
export function isAdverseTolerance(value: string | undefined): boolean {
  return (value || '').startsWith('Adverse reaction / intolerance');
}

export interface AdverseEvent {
  dateISO: string;
  nurseName: string;
  physNotified: string; // 'Yes' | 'No' | ''
}

/** Adverse drug reactions reported on notes (q43 medication tolerance), newest
 *  first — surveyors check both the event and whether the physician was told. */
export function adverseEvents(notes: DashboardNote[]): AdverseEvent[] {
  return sortNotesDesc(notes)
    .filter((n) => isAdverseTolerance(n.medTolerance))
    .map((n) => ({ dateISO: n.dateISO, nurseName: n.nurseName, physNotified: n.physNotified }));
}

/** Care team derived from note authorship (uid -> most recent name/credential),
 *  so every care-team member can render names without extra permissions. */
export function careTeamFromNotes(
  notes: DashboardNote[],
): Array<{ uid: string; name: string; credential: string }> {
  const seen = new Map<string, { uid: string; name: string; credential: string }>();
  for (const n of sortNotesDesc(notes)) {
    if (!n.nurseId || seen.has(n.nurseId)) continue;
    seen.set(n.nurseId, { uid: n.nurseId, name: n.nurseName || 'Unknown', credential: n.credential || '' });
  }
  return Array.from(seen.values());
}

// ---------------------------------------------------------------------------
// MAR compliance. Structural types mirror MarOrder / MarAdministration without
// importing the Firebase-backed module.
// ---------------------------------------------------------------------------

export interface DashOrder {
  id?: string;
  status: string; // 'active' | 'discontinued'
  isPRN?: boolean;
  scheduledTimes?: string[];
  startDate?: string;
  endDate?: string | null;
  // Med-change linkage (a change = discontinue old + start new on the same
  // effective date); used to avoid double-counting the handoff day.
  supersedesOrderId?: string;
  supersededByOrderId?: string;
}

export interface DashAdmin {
  id?: string;
  amends?: string;
  orderId: string;
  date: string;
  scheduledTime: string;
  status: string; // given | held | refused
  outcome?: string;
}

function orderAppliesOnLite(o: DashOrder, date: string): boolean {
  if (o.startDate && date < o.startDate) return false;
  if (o.endDate && date > o.endDate) return false;
  return true;
}

/** Live (non-superseded) records — local mirror of resolveCurrentAdministrations.
 *  Exported so callers (e.g. the activity feed) never render a corrected record
 *  alongside its correction. */
export function currentAdmins<T extends { id?: string; amends?: string }>(list: T[]): T[] {
  const superseded = new Set<string>();
  for (const r of list) if (r.amends) superseded.add(r.amends);
  return list.filter((r) => !(r.id && superseded.has(r.id)));
}

/** A dose is PRN-ish when charted against the PRN slot OR as an unscheduled
 *  one-off (documented via the note's med-change flow with isPRN semantics). */
function isPrnSlot(scheduledTime: string): boolean {
  return scheduledTime === 'PRN' || scheduledTime === 'unscheduled';
}

export interface MarComplianceStats {
  expected: number; // scheduled slots due in the window (through today)
  given: number;
  held: number;
  refused: number;
  undocumented: number; // due but nothing recorded
  pctGiven: number | null; // given / expected; null when nothing was due
  prnGiven: number; // PRN doses given in the window
  prnPendingResult: number; // given PRN doses missing their outcome
}

/**
 * Scheduled-dose compliance across [startISO..min(endISO, todayISO)]: for every
 * day an order's window covers, each scheduled time is one EXPECTED dose;
 * administrations (current, post-amendment) fill them as given/held/refused.
 * Orders are counted regardless of current status so a discontinued order still
 * scores the days it ran. PRN doses are tallied separately (no expectation).
 */
export function marComplianceStats(
  orders: DashOrder[],
  admins: DashAdmin[],
  startISO: string,
  endISO: string,
  todayISO: string,
): MarComplianceStats {
  const end = endISO < todayISO ? endISO : todayISO;
  const current = currentAdmins(admins);
  const byKey = new Map<string, DashAdmin>();
  for (const a of current) {
    if (a.date >= startISO && a.date <= end) byKey.set(`${a.orderId}|${a.date}|${a.scheduledTime}`, a);
  }

  let expected = 0;
  let given = 0;
  let held = 0;
  let refused = 0;
  if (startISO <= end) {
    for (const o of orders) {
      if (o.isPRN || !o.scheduledTimes || o.scheduledTimes.length === 0) continue;
      for (let d = startISO; d <= end; d = shiftISO(d, 1)) {
        if (!orderAppliesOnLite(o, d)) continue;
        // Med-change handoff: the discontinued order ends the same day its
        // replacement starts, so both "apply" that day. The NEW regimen owns
        // the handoff day — skip the superseded order's slots there, or every
        // change would leave one permanently-undocumented phantom dose.
        if (o.supersededByOrderId && o.endDate === d) continue;
        for (const slot of o.scheduledTimes) {
          expected += 1;
          // A dose charted on the handoff day may be keyed to the OLD order
          // (given before the change was entered); accept it for the new
          // order's same slot so it isn't counted as missed.
          const hit =
            byKey.get(`${o.id}|${d}|${slot}`) ||
            (o.supersedesOrderId && o.startDate === d
              ? byKey.get(`${o.supersedesOrderId}|${d}|${slot}`)
              : undefined);
          if (!hit) continue;
          if (hit.status === 'given') given += 1;
          else if (hit.status === 'held') held += 1;
          else if (hit.status === 'refused') refused += 1;
        }
      }
    }
  }

  const prn = current.filter(
    (a) => isPrnSlot(a.scheduledTime) && a.status === 'given' && a.date >= startISO && a.date <= end,
  );
  const prnPendingResult = prn.filter((a) => !(a.outcome || '').trim()).length;

  const documented = given + held + refused;
  return {
    expected,
    given,
    held,
    refused,
    undocumented: Math.max(0, expected - documented),
    pctGiven: expected === 0 ? null : Math.round((given / expected) * 100),
    prnGiven: prn.length,
    prnPendingResult,
  };
}

// ---------------------------------------------------------------------------
// Document currency (phase 3). How fresh is the newest document of a category
// (plan of care, supervisory visit)? Structural type mirrors PatientDocument
// without importing the Firebase-backed module.
// ---------------------------------------------------------------------------

export interface DashDocument {
  id?: string;
  category: string;
  docDate: string; // YYYY-MM-DD (the date ON the document)
  archived?: boolean;
}

export interface DocumentCurrency {
  status: 'good' | 'warn' | 'bad' | 'none';
  daysSince: number | null;
  newestDateISO: string;
}

/**
 * Currency of the newest non-archived document in a category against a
 * required interval: 'good' within maxAgeDays, 'warn' up to 25% past it,
 * 'bad' beyond, 'none' when no dated document exists. A future-dated document
 * (e.g. a plan of care for a cert period starting next week) clamps to 0 days
 * rather than reporting a negative age.
 */
export function documentCurrency(
  docs: DashDocument[],
  category: string,
  maxAgeDays: number,
  todayISO: string,
): DocumentCurrency {
  const dates = docs
    .filter((d) => !d.archived && d.category === category && /^\d{4}-\d{2}-\d{2}$/.test(d.docDate || ''))
    .map((d) => d.docDate)
    .sort();
  if (dates.length === 0) return { status: 'none', daysSince: null, newestDateISO: '' };
  const newest = dates[dates.length - 1];
  const daysSince = Math.max(0, daysBetweenISO(newest, todayISO));
  const status: DocumentCurrency['status'] =
    daysSince <= maxAgeDays ? 'good' : daysSince <= Math.round(maxAgeDays * 1.25) ? 'warn' : 'bad';
  return { status, daysSince, newestDateISO: newest };
}

// ---------------------------------------------------------------------------
// Chart series (phase 2). Parsed, bounds-guarded points so a typo ("980/60",
// "9.86") can't blow out a chart's axis; unparseable values are dropped, not
// zeroed.
// ---------------------------------------------------------------------------

export interface VitalPoint {
  dateISO: string;
  temp?: number;
  sys?: number;
  dia?: number;
  pulse?: number;
  resp?: number;
  spo2?: number;
  pain?: number;
}

function inBounds(v: number, low: number, high: number): number | undefined {
  return !isNaN(v) && v >= low && v <= high ? v : undefined;
}

/** One point per note carrying at least one plausible vital, oldest first. */
export function vitalSeries(notes: DashboardNote[]): VitalPoint[] {
  const points: VitalPoint[] = [];
  for (const n of notes) {
    if (!n.dateISO) continue;
    const p: VitalPoint = { dateISO: n.dateISO };
    p.temp = inBounds(parseFloat(n.temperature), 90, 110);
    const bp = /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/.exec(n.bloodPressure || '');
    if (bp) {
      p.sys = inBounds(Number(bp[1]), 50, 260);
      p.dia = inBounds(Number(bp[2]), 20, 160);
    }
    p.pulse = inBounds(parseFloat(n.pulse), 20, 260);
    p.resp = inBounds(parseFloat(n.respiration), 4, 80);
    p.spo2 = inBounds(parseFloat(n.oxygenSaturation), 50, 100);
    p.pain = inBounds(parseFloat(n.painScore), 0, 10);
    if (
      p.temp !== undefined ||
      p.sys !== undefined ||
      p.dia !== undefined ||
      p.pulse !== undefined ||
      p.resp !== undefined ||
      p.spo2 !== undefined ||
      p.pain !== undefined
    ) {
      points.push(p);
    }
  }
  return points.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}

export interface MedWeekBucket {
  weekStartISO: string;
  given: number;
  held: number;
  refused: number;
}

/** Administrations per ISO week (current records only, scheduled + PRN),
 *  trailing `weeks` weeks including empty ones — the med-administration chart. */
export function weeklyMedBuckets(admins: DashAdmin[], weeks: number, todayISO: string): MedWeekBucket[] {
  const thisMonday = mondayOf(todayISO);
  const buckets: MedWeekBucket[] = [];
  const index = new Map<string, MedWeekBucket>();
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const weekStartISO = shiftISO(thisMonday, -7 * i);
    const b = { weekStartISO, given: 0, held: 0, refused: 0 };
    buckets.push(b);
    index.set(weekStartISO, b);
  }
  for (const a of currentAdmins(admins)) {
    if (!a.date) continue;
    const b = index.get(mondayOf(a.date));
    if (!b) continue;
    if (a.status === 'given') b.given += 1;
    else if (a.status === 'held') b.held += 1;
    else if (a.status === 'refused') b.refused += 1;
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// Weekly buckets (visits + hours) — powers the tiles now and charts later.
// ---------------------------------------------------------------------------

export interface WeekBucket {
  weekStartISO: string; // Monday
  visits: number;
  hours: number;
}

function mondayOf(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  const dow = d.getDay(); // 0 Sun .. 6 Sat
  const delta = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Visits and care hours per ISO week for the trailing `weeks` weeks (oldest
 *  first, empty weeks included so charts show the gaps). */
export function weeklyBuckets(notes: DashboardNote[], weeks: number, todayISO: string): WeekBucket[] {
  const thisMonday = mondayOf(todayISO);
  const buckets: WeekBucket[] = [];
  const index = new Map<string, WeekBucket>();
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const weekStartISO = shiftISO(thisMonday, -7 * i);
    const b = { weekStartISO, visits: 0, hours: 0 };
    buckets.push(b);
    index.set(weekStartISO, b);
  }
  for (const n of notes) {
    if (!n.dateISO) continue;
    const b = index.get(mondayOf(n.dateISO));
    if (!b) continue;
    b.visits += 1;
    const h = parseFloat(n.totalHours);
    if (!isNaN(h) && h > 0 && h < 25) b.hours += h;
  }
  return buckets;
}
