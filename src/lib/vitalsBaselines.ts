/**
 * Per-client vitals baselines: the client-record side. The range math and
 * the note snapshot keys live in vitalRanges.ts (so every consumer of the
 * ranges shares them); this module holds what the client editor and the
 * note forms need on top: validation, the snapshot written onto a note, and
 * plain-language descriptions. Pure; no Firebase imports.
 *
 * When a client has NO baseline for a vital, nothing changes: the age-based
 * screening range applies exactly as before. A baseline is an override for
 * one vital on one client, never a requirement.
 */

import {
  applyBaselines,
  baselineNoteKey,
  cleanBaselines,
  getVitalRanges,
  BASELINE_NOTE_KEYS,
  BASELINE_NOTE_NOTE_KEY,
  VITAL_KEYS,
  type VitalKey,
  type VitalsBaselines,
} from './vitalRanges';

export const BASELINE_LABELS: Record<VitalKey, string> = {
  temperature: 'Temperature',
  systolic: 'Systolic BP',
  diastolic: 'Diastolic BP',
  pulse: 'Pulse',
  respiration: 'Respirations',
  oxygenSaturation: 'SpO2',
};

/** Physiologic hard bounds a baseline must sit inside (same as the note's typo guard). */
export const BASELINE_LIMITS: Record<VitalKey, { min: number; max: number; unit: string }> = {
  temperature: { min: 80, max: 115, unit: '°F' },
  systolic: { min: 50, max: 280, unit: 'mmHg' },
  diastolic: { min: 30, max: 180, unit: 'mmHg' },
  pulse: { min: 20, max: 250, unit: 'bpm' },
  respiration: { min: 4, max: 80, unit: '/min' },
  oxygenSaturation: { min: 50, max: 100, unit: '%' },
};

/** Text pairs as typed in the editor, keyed by vital. '' means "no baseline". */
export type BaselineDraft = Partial<Record<VitalKey, { low: string; high: string }>>;

export function baselinesToDraft(b?: VitalsBaselines): BaselineDraft {
  const out: BaselineDraft = {};
  for (const key of VITAL_KEYS) {
    const pair = b?.[key];
    out[key] = { low: pair ? String(pair.low) : '', high: pair ? String(pair.high) : '' };
  }
  return out;
}

/**
 * Turn the editor's text into stored baselines, or name what is wrong. A
 * vital with both boxes blank has no baseline; one box filled is an error
 * (a half range is never stored).
 */
export function parseBaselineDraft(draft: BaselineDraft): { baselines: VitalsBaselines; errors: string[] } {
  const raw: Record<string, { low: number; high: number }> = {};
  const errors: string[] = [];
  for (const key of VITAL_KEYS) {
    const low = (draft[key]?.low ?? '').trim();
    const high = (draft[key]?.high ?? '').trim();
    if (!low && !high) continue;
    const label = BASELINE_LABELS[key];
    if (!low || !high) {
      errors.push(`${label}: enter both the low and the high value, or leave both blank.`);
      continue;
    }
    const lo = Number(low);
    const hi = Number(high);
    const lim = BASELINE_LIMITS[key];
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      errors.push(`${label}: both values must be numbers.`);
      continue;
    }
    if (lo > hi) {
      errors.push(`${label}: the low value (${lo}) is above the high value (${hi}).`);
      continue;
    }
    if (lo < lim.min || hi > lim.max) {
      errors.push(`${label}: must be between ${lim.min} and ${lim.max} ${lim.unit}.`);
      continue;
    }
    raw[key] = { low: lo, high: hi };
  }
  return { baselines: cleanBaselines(raw), errors };
}

/** True when the client has at least one baseline. */
export const hasAnyBaseline = (b?: VitalsBaselines): boolean => !!b && VITAL_KEYS.some((k) => !!b[k]);

/** "Pulse 100 to 110 bpm, SpO2 90 to 100%" for headers and helper text. */
export function describeBaselines(b?: VitalsBaselines): string {
  if (!b) return '';
  return VITAL_KEYS.filter((k) => b[k])
    .map((k) => {
      const unit = BASELINE_LIMITS[k].unit;
      const sep = unit === '%' || unit === '/min' ? '' : ' ';
      return `${BASELINE_LABELS[k]} ${b[k]!.low} to ${b[k]!.high}${sep}${unit}`;
    })
    .join(', ');
}

/**
 * The flat fields a note form writes when a client is selected: every
 * snapshot key, blank when the client has no baseline for that vital, so a
 * switch to a client without baselines clears the previous client's.
 */
export function baselinesToNoteFields(b?: VitalsBaselines, note?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of BASELINE_NOTE_KEYS) out[k] = '';
  if (b) {
    for (const key of VITAL_KEYS) {
      const pair = b[key];
      if (!pair) continue;
      out[baselineNoteKey(key, 'low')] = String(pair.low);
      out[baselineNoteKey(key, 'high')] = String(pair.high);
    }
  }
  if (hasAnyBaseline(b) && note) out[BASELINE_NOTE_NOTE_KEY] = note;
  return out;
}

/** The vital groups the note form uses, mapped to the range keys each covers. */
const GROUP_KEYS: Record<string, VitalKey[]> = {
  temperature: ['temperature'],
  bloodPressure: ['systolic', 'diastolic'],
  pulse: ['pulse'],
  respiration: ['respiration'],
  oxygenSaturation: ['oxygenSaturation'],
};

/** True when the baselines cover the form's vital group (BP: either bound). */
export function baselineCoversGroup(b: VitalsBaselines | undefined, group: string): boolean {
  return !!b && (GROUP_KEYS[group] || []).some((k) => !!b[k]);
}

/** Convenience for charts: the client's current ranges by age with baselines applied. */
export function clientVitalRanges(dob: string | undefined, baselines: VitalsBaselines | undefined, overrides?: Parameters<typeof getVitalRanges>[2]) {
  return applyBaselines(getVitalRanges('', dob, overrides), baselines);
}
