/**
 * Vitals rechecks: additional sets of vital signs taken later in the same
 * shift. Pure helpers shared by the progress-note form, the submit gate, the
 * admin detail view, and the printed note. No Firebase imports.
 *
 * Model: the first set of vitals stays in the original q16-q21 fields (every
 * dashboard chart, filter, and PDF consumer keeps reading those unchanged).
 * Each later reading is its own numbered block of flat form fields
 * (q16r_reading{n}_*) plus a count key, exactly like the seizure log
 * (src/lib/seizureShared.ts), so drafts, resume, edit mode, amendments, and
 * Firestore need no new plumbing.
 *
 * A recheck is PARTIAL by design. When a pulse reads high the nurse retakes
 * the pulse, not the whole set, so a reading needs a time plus at least one
 * vital. Route / oxygen source stay required once their value is present,
 * for the same interpretability reason as the first set.
 *
 * Origin: 09/22/2026, a nurse retook a heart rate of 102 after two hours of
 * rest (100) and had nowhere on the note to record the second reading.
 */

import type { VitalKey, VitalRangeSet } from './vitalRanges';

export const VITALS_RECHECK_PREFIX = 'q16r_reading';
export const VITALS_RECHECK_COUNT_KEY = 'q16r_readingCount';
export const MAX_VITALS_RECHECKS = 8;

/** What the client was doing when the reading was taken (the RN reviewer's first question on a high pulse). */
export const VITALS_RECHECK_CONTEXTS = [
  'Resting / calm',
  'Sleeping',
  'After activity or exertion',
  'Crying / agitated / upset',
  'After medication given',
  'After oxygen or respiratory treatment',
  'Other (see notes)',
] as const;

export interface VitalsRecheck {
  index: number; // 1-based, as in the field names
  time: string; // 'HH:MM'
  context: string; // one of VITALS_RECHECK_CONTEXTS or ''
  temperature: string;
  temperatureRoute: string;
  systolic: string;
  diastolic: string;
  bpMethod: string;
  bpSite: string;
  pulse: string;
  pulseSite: string;
  respiration: string;
  oxygenSaturation: string;
  oxygenSource: string;
  notes: string;
}

export type VitalsRecheckField = keyof Omit<VitalsRecheck, 'index'>;

export const VITALS_RECHECK_KEYS: VitalsRecheckField[] = [
  'time', 'context',
  'temperature', 'temperatureRoute',
  'systolic', 'diastolic', 'bpMethod', 'bpSite',
  'pulse', 'pulseSite',
  'respiration',
  'oxygenSaturation', 'oxygenSource',
  'notes',
];

export function vitalsRecheckFieldKey(index: number, field: VitalsRecheckField): string {
  return `${VITALS_RECHECK_PREFIX}${index}_${field}`;
}

/** Every flat key a note with `count` rechecks can carry (for section "has any value" checks). */
export function vitalsRecheckAllKeys(count: number): string[] {
  const out: string[] = [VITALS_RECHECK_COUNT_KEY];
  const n = Math.min(MAX_VITALS_RECHECKS, Math.max(0, count));
  for (let i = 1; i <= n; i += 1) for (const k of VITALS_RECHECK_KEYS) out.push(vitalsRecheckFieldKey(i, k));
  return out;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

/** Read the numbered reading blocks out of a flat form-values record. */
export function readVitalsRechecks(values: Record<string, unknown>): VitalsRecheck[] {
  const n = Math.min(MAX_VITALS_RECHECKS, Math.max(0, Number(values[VITALS_RECHECK_COUNT_KEY]) || 0));
  const out: VitalsRecheck[] = [];
  for (let i = 1; i <= n; i += 1) {
    const e = { index: i } as VitalsRecheck;
    for (const k of VITALS_RECHECK_KEYS) e[k] = str(values[vitalsRecheckFieldKey(i, k)]).trim();
    out.push(e);
  }
  return out;
}

/** True when the reading carries at least one vital value. */
export function recheckHasAnyVital(e: VitalsRecheck): boolean {
  return [e.temperature, e.systolic, e.diastolic, e.pulse, e.respiration, e.oxygenSaturation].some((v) => v.trim() !== '');
}

/** "118/76" or '' when either half is blank (a half reading is a data error, never printed). */
export function recheckBloodPressure(e: Pick<VitalsRecheck, 'systolic' | 'diastolic'>): string {
  return e.systolic.trim() && e.diastolic.trim() ? `${e.systolic.trim()}/${e.diastolic.trim()}` : '';
}

export interface VitalsRecheckGap {
  label: string;
  /** DOM id the form scrolls to and outlines. */
  targetId: string;
}

/**
 * The recheck submit gate. Returns what is missing; empty means the readings
 * are complete. Pure so it is unit-testable and can back the admin
 * In-Progress inspector as well as the nurse form.
 *  - Every reading needs a time and at least one vital.
 *  - Blood pressure needs BOTH numbers or neither.
 *  - Temperature needs its route; SpO2 needs its oxygen source.
 */
export function vitalsRecheckGaps(values: Record<string, unknown>): VitalsRecheckGap[] {
  const gaps: VitalsRecheckGap[] = [];
  for (const e of readVitalsRechecks(values)) {
    const p = `Vitals recheck ${e.index}: `;
    const k = (f: VitalsRecheckField) => vitalsRecheckFieldKey(e.index, f);
    if (!/^\d{1,2}:\d{2}$/.test(e.time)) gaps.push({ label: p + 'time taken', targetId: k('time') });
    if (!recheckHasAnyVital(e)) {
      gaps.push({ label: p + 'at least one vital (temperature, BP, pulse, respiration, or SpO2)', targetId: k('pulse') });
    }
    if ((e.systolic !== '') !== (e.diastolic !== '')) {
      gaps.push({ label: p + 'both blood pressure numbers (top and bottom)', targetId: e.systolic === '' ? k('systolic') : k('diastolic') });
    }
    if (e.temperature !== '' && e.temperatureRoute === '') gaps.push({ label: p + 'temperature route', targetId: k('temperatureRoute') });
    if (e.oxygenSaturation !== '' && e.oxygenSource === '') gaps.push({ label: p + 'oxygen source for the SpO2', targetId: k('oxygenSource') });
  }
  return gaps;
}

export type RecheckAbnormal = Partial<Record<VitalKey, 'low' | 'high'>>;

function parseNum(v: string): number | null {
  if (!v || !v.trim()) return null;
  const n = parseFloat(v.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Which values in a reading fall outside the age-appropriate screening range.
 * Takes an already-resolved range set so callers pass the same ranges (with
 * admin overrides) they use for the first set of vitals.
 */
export function recheckAbnormalVitals(e: VitalsRecheck, ranges: VitalRangeSet): RecheckAbnormal {
  const out: RecheckAbnormal = {};
  const checks: Array<[VitalKey, string]> = [
    ['temperature', e.temperature],
    ['systolic', e.systolic],
    ['diastolic', e.diastolic],
    ['pulse', e.pulse],
    ['respiration', e.respiration],
    ['oxygenSaturation', e.oxygenSaturation],
  ];
  for (const [key, raw] of checks) {
    const v = parseNum(raw);
    if (v === null) continue;
    if (v < ranges[key].low) out[key] = 'low';
    else if (v > ranges[key].high) out[key] = 'high';
  }
  return out;
}

/** True when any recheck carries any value outside the given ranges. */
export function anyRecheckAbnormal(values: Record<string, unknown>, ranges: VitalRangeSet): boolean {
  return readVitalsRechecks(values).some((e) => Object.keys(recheckAbnormalVitals(e, ranges)).length > 0);
}

/** "at 14:30 (Resting / calm)" or "at 14:30" or "" for headings and alert lines. */
export function recheckWhen(e: Pick<VitalsRecheck, 'time' | 'context'>): string {
  const t = e.time ? `at ${e.time}` : '';
  const c = e.context ? `(${e.context})` : '';
  return [t, c].filter(Boolean).join(' ');
}
