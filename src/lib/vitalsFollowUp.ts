/**
 * Abnormal-vitals follow-up: the submit gate that turns an out-of-range
 * first reading into a required recheck, and a recheck that is still out of
 * range into a required, documented action. Pure helpers shared by the
 * progress-note form, noteValidation, the admin detail view, and the PDF.
 * No Firebase imports.
 *
 * The rule, as agreed with nursing leadership (09/2026):
 *  1. Every vital on the first set that falls outside the age-based
 *     screening range must be retaken once, as a vitals recheck that
 *     includes that vital, at least MIN_RECHECK_GAP_MINUTES after the shift
 *     started (the first set is taken at the start of the shift).
 *  2. If the latest recheck of that vital is back in range, nothing more is
 *     asked; both readings stay on the note.
 *  3. If it is still out of range, the nurse documents what she did about it
 *     (q16f_*): notified the RN supervisor or physician, called 911, or the
 *     value is within this client's known baseline per the care plan. A
 *     notification needs its time; a baseline claim needs a note saying what
 *     the baseline is. Nurses are never asked to keep retaking a value.
 *
 * Critical values (src/lib/criticalVitals.ts) keep their own, stronger
 * escalation prompt at submit; this gate sits underneath it.
 *
 * Gated on the form revision stamp (FOLLOW_UP_FORM_REV) like every other
 * added rule, so amending an older note never demands a recheck that was
 * not required when the visit happened.
 */

import type { VitalRangeSet } from './vitalRanges';
import {
  readVitalsRechecks,
  recheckAbnormalVitals,
  vitalsRecheckFieldKey,
  type VitalsRecheck,
  type VitalsRecheckGap,
} from './vitalsRecheck';

export type VitalGroup = 'temperature' | 'bloodPressure' | 'pulse' | 'respiration' | 'oxygenSaturation';

export const VITAL_GROUPS: VitalGroup[] = ['temperature', 'bloodPressure', 'pulse', 'respiration', 'oxygenSaturation'];

export const VITAL_GROUP_LABELS: Record<VitalGroup, string> = {
  temperature: 'Temperature',
  bloodPressure: 'Blood pressure',
  pulse: 'Pulse',
  respiration: 'Respirations',
  oxygenSaturation: 'SpO2',
};

/** Minimum rest between the shift start (first set) and a recheck that counts. */
export const MIN_RECHECK_GAP_MINUTES = 15;

/** Form revision that introduced the follow-up gate. */
export const FOLLOW_UP_FORM_REV = 4;

export const FOLLOW_UP_ACTION_KEY = 'q16f_action';
export const FOLLOW_UP_TIME_KEY = 'q16f_actionTime';
export const FOLLOW_UP_NOTE_KEY = 'q16f_actionNote';
export const FOLLOW_UP_KEYS = [FOLLOW_UP_ACTION_KEY, FOLLOW_UP_TIME_KEY, FOLLOW_UP_NOTE_KEY] as const;

export const FOLLOW_UP_BASELINE = "Within this client's known baseline per care plan";
export const FOLLOW_UP_ACTIONS = [
  'Notified RN supervisor',
  'Notified physician',
  'Called 911 / EMS',
  FOLLOW_UP_BASELINE,
] as const;

export type Direction = 'low' | 'high';

const str = (v: unknown): string => (v == null ? '' : String(v)).trim();

function parseNum(v: string): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** True when the note was written on a revision that carries this gate. */
export function vitalsFollowUpApplies(values: Record<string, unknown>): boolean {
  return Number(str(values.q1_formRev) || '0') >= FOLLOW_UP_FORM_REV;
}

function direction(v: number | null, range: { low: number; high: number }): Direction | null {
  if (v === null) return null;
  if (v < range.low) return 'low';
  if (v > range.high) return 'high';
  return null;
}

/**
 * Which vitals on the FIRST set are outside the age-based screening range.
 * Blood pressure is one group: either number out of range counts, and the
 * direction reported is the systolic one when both are off.
 */
export function firstSetAbnormalGroups(
  values: Record<string, unknown>,
  ranges: VitalRangeSet,
): Partial<Record<VitalGroup, Direction>> {
  const out: Partial<Record<VitalGroup, Direction>> = {};
  const t = direction(parseNum(str(values.q16_temperature)), ranges.temperature);
  if (t) out.temperature = t;
  let sys = parseNum(str(values.q17_systolic));
  let dia = parseNum(str(values.q17_diastolic));
  if (sys === null && dia === null) {
    const [a, b] = str(values.q17_bloodPressure).split('/');
    sys = parseNum(a || '');
    dia = parseNum(b || '');
  }
  const bp = direction(sys, ranges.systolic) || direction(dia, ranges.diastolic);
  if (bp) out.bloodPressure = bp;
  const p = direction(parseNum(str(values.q18_pulse)), ranges.pulse);
  if (p) out.pulse = p;
  const r = direction(parseNum(str(values.q19_respiration)), ranges.respiration);
  if (r) out.respiration = r;
  const o = direction(parseNum(str(values.q20_oxygenSaturation)), ranges.oxygenSaturation);
  if (o) out.oxygenSaturation = o;
  return out;
}

/** The first-set value of a group, for messages ("102 bpm"). */
export function firstSetValueText(values: Record<string, unknown>, group: VitalGroup): string {
  switch (group) {
    case 'temperature': return str(values.q16_temperature) ? `${str(values.q16_temperature)} °F` : '';
    case 'bloodPressure': {
      const s = str(values.q17_systolic);
      const d = str(values.q17_diastolic);
      const bp = s && d ? `${s}/${d}` : str(values.q17_bloodPressure);
      return bp ? `${bp} mmHg` : '';
    }
    case 'pulse': return str(values.q18_pulse) ? `${str(values.q18_pulse)} bpm` : '';
    case 'respiration': return str(values.q19_respiration) ? `${str(values.q19_respiration)}/min` : '';
    case 'oxygenSaturation': return str(values.q20_oxygenSaturation) ? `${str(values.q20_oxygenSaturation)}%` : '';
  }
}

/** True when the recheck carries a value for the group (BP needs both numbers). */
export function recheckCovers(e: VitalsRecheck, group: VitalGroup): boolean {
  switch (group) {
    case 'temperature': return e.temperature !== '';
    case 'bloodPressure': return e.systolic !== '' && e.diastolic !== '';
    case 'pulse': return e.pulse !== '';
    case 'respiration': return e.respiration !== '';
    case 'oxygenSaturation': return e.oxygenSaturation !== '';
  }
}

/** Whether the group is still out of range on this recheck. */
export function recheckGroupDirection(e: VitalsRecheck, group: VitalGroup, ranges: VitalRangeSet): Direction | null {
  const ab = recheckAbnormalVitals(e, ranges);
  if (group === 'bloodPressure') return ab.systolic || ab.diastolic || null;
  return ab[group] || null;
}

function minutesOfDay(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/**
 * Minutes from `start` to `later` on a 24-hour clock. A later time that is
 * numerically earlier is taken as past midnight (an overnight shift), so
 * the gap is never negative. Null when either time is missing or malformed.
 */
export function minutesSince(start: string, later: string): number | null {
  const a = minutesOfDay(start);
  const b = minutesOfDay(later);
  if (a === null || b === null) return null;
  const d = b - a;
  return d < 0 ? d + 24 * 60 : d;
}

export interface VitalsFollowUp {
  /** First-set vitals outside the screening range. */
  abnormal: Partial<Record<VitalGroup, Direction>>;
  /** Abnormal vitals with no recheck that includes them. */
  needsRecheck: VitalGroup[];
  /** Abnormal vitals whose only rechecks came before the rest interval. */
  tooSoon: Array<{ group: VitalGroup; index: number }>;
  /** Abnormal vitals whose latest valid recheck is still out of range. */
  stillAbnormal: VitalGroup[];
}

/** Rechecks that include the group, latest first (by time since shift start, then by block number). */
function coveringRechecks(rechecks: VitalsRecheck[], group: VitalGroup, shiftStart: string): VitalsRecheck[] {
  return rechecks
    .filter((r) => recheckCovers(r, group))
    .map((r, i) => ({ r, i, t: minutesSince(shiftStart, r.time) }))
    .sort((x, y) => {
      if (x.t !== null && y.t !== null && x.t !== y.t) return y.t - x.t;
      return y.i - x.i;
    })
    .map((x) => x.r);
}

/** Assess the note's vitals against the follow-up rule. Pure. */
export function assessVitalsFollowUp(values: Record<string, unknown>, ranges: VitalRangeSet): VitalsFollowUp {
  const abnormal = firstSetAbnormalGroups(values, ranges);
  const rechecks = readVitalsRechecks(values);
  const shiftStart = str(values.q7_shiftStart);
  const needsRecheck: VitalGroup[] = [];
  const tooSoon: Array<{ group: VitalGroup; index: number }> = [];
  const stillAbnormal: VitalGroup[] = [];
  for (const group of VITAL_GROUPS) {
    if (!abnormal[group]) continue;
    const covering = coveringRechecks(rechecks, group, shiftStart);
    if (covering.length === 0) {
      needsRecheck.push(group);
      continue;
    }
    // Without a parseable shift start there is nothing to measure the rest
    // interval against, so every recheck counts.
    const valid = covering.filter((r) => {
      const gap = minutesSince(shiftStart, r.time);
      return gap === null || gap >= MIN_RECHECK_GAP_MINUTES;
    });
    if (valid.length === 0) {
      tooSoon.push({ group, index: covering[0].index });
      continue;
    }
    if (recheckGroupDirection(valid[0], group, ranges)) stillAbnormal.push(group);
  }
  return { abnormal, needsRecheck, tooSoon, stillAbnormal };
}

const listLabels = (groups: VitalGroup[]): string =>
  groups.map((g) => VITAL_GROUP_LABELS[g].toLowerCase()).join(', ');

/**
 * The follow-up submit gate. Returns what is missing; empty means the note
 * satisfies the rule. Same shape as vitalsRecheckGaps so the form and
 * noteValidation escort to it the same way. Callers gate on
 * vitalsFollowUpApplies (form revision) themselves.
 */
export function vitalsFollowUpGaps(values: Record<string, unknown>, ranges: VitalRangeSet): VitalsRecheckGap[] {
  const a = assessVitalsFollowUp(values, ranges);
  const gaps: VitalsRecheckGap[] = [];
  for (const group of a.needsRecheck) {
    const value = firstSetValueText(values, group);
    gaps.push({
      label:
        `Recheck the ${VITAL_GROUP_LABELS[group].toLowerCase()}: ${value ? `${value} is` : 'it was'} ${a.abnormal[group]} for the client's age. ` +
        `Add a later reading that includes it, at least ${MIN_RECHECK_GAP_MINUTES} minutes after the shift start`,
      targetId: 'q16r_readingList',
    });
  }
  for (const t of a.tooSoon) {
    gaps.push({
      label: `Vitals recheck ${t.index}: the ${VITAL_GROUP_LABELS[t.group].toLowerCase()} recheck must be at least ${MIN_RECHECK_GAP_MINUTES} minutes after the shift start (${str(values.q7_shiftStart)})`,
      targetId: vitalsRecheckFieldKey(t.index, 'time'),
    });
  }
  if (a.stillAbnormal.length > 0) {
    const action = str(values[FOLLOW_UP_ACTION_KEY]);
    const what = listLabels(a.stillAbnormal);
    if (!action) {
      gaps.push({ label: `Abnormal vitals follow-up: what was done about the ${what} that stayed out of range after the recheck`, targetId: FOLLOW_UP_ACTION_KEY });
    } else if (action === FOLLOW_UP_BASELINE) {
      if (!str(values[FOLLOW_UP_NOTE_KEY])) {
        gaps.push({ label: `Abnormal vitals follow-up: note the client's documented baseline for the ${what}`, targetId: FOLLOW_UP_NOTE_KEY });
      }
    } else if (!str(values[FOLLOW_UP_TIME_KEY])) {
      gaps.push({ label: `Abnormal vitals follow-up: the time you ${action.toLowerCase().replace(/^notified/, 'notified the')}`, targetId: FOLLOW_UP_TIME_KEY });
    }
  }
  return gaps;
}

/** "Notified RN supervisor at 13:05. Baseline pulse 100 per care plan." for the record. */
export function followUpSummary(values: Record<string, unknown>): string {
  const action = str(values[FOLLOW_UP_ACTION_KEY]);
  if (!action) return '';
  const time = str(values[FOLLOW_UP_TIME_KEY]);
  const note = str(values[FOLLOW_UP_NOTE_KEY]);
  return `${action}${time ? ` at ${time}` : ''}${note ? `. ${note}` : ''}`;
}
