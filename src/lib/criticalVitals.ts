/**
 * Critical-vital (provider-notification) thresholds.
 *
 * These are the "escalation" tier — more extreme than the in-app "abnormal"
 * screening ranges in vitalRanges.ts. When a documented vital crosses one of
 * these, the progress-note form prompts the nurse to document escalation
 * (supervisor → provider → 911) or to acknowledge why none was needed.
 *
 * DRAFT VALUES, anchored to recognized pediatric standards (AHA PALS 2020 for
 * heart/resp rate + systolic hypotension floors; AAP 2021 for febrile infants;
 * general hypoxemia/hypothermia thresholds). Pending Clinical Director sign-off;
 * intended to be tuned later. Per-patient baselines and provider orders always
 * take precedence over these screening thresholds.
 */
import { getAgeGroup, type AgeGroup } from './vitalRanges';

export type CriticalVitalKey =
  | 'temperature'
  | 'systolic'
  | 'pulse'
  | 'respiration'
  | 'oxygenSaturation';

export interface CriticalThreshold {
  /** Notify if value is strictly below this. */
  low?: number;
  /** Notify if value is strictly above this. */
  high?: number;
}

export interface CriticalFinding {
  key: CriticalVitalKey;
  label: string;
  unit: string;
  value: number;
  direction: 'low' | 'high';
  threshold: number;
  /** Plain-language line for the nurse, e.g. "SpO₂ 86% is at or below the notify threshold (< 90%)." */
  message: string;
}

const META: Record<CriticalVitalKey, { label: string; unit: string }> = {
  temperature: { label: 'Temperature', unit: '°F' },
  systolic: { label: 'Systolic BP', unit: 'mmHg' },
  pulse: { label: 'Heart rate', unit: 'bpm' },
  respiration: { label: 'Respiratory rate', unit: '/min' },
  oxygenSaturation: { label: 'SpO₂', unit: '%' },
};

// Base thresholds by age group. Systolic low is refined by exact age (PALS
// hypotension formula) in getCriticalThresholds; infant temperature high is
// refined for the < 3-month febrile-infant rule.
const BASE: Record<AgeGroup, Record<CriticalVitalKey, CriticalThreshold>> = {
  newborn:    { temperature: { low: 95, high: 100.4 }, systolic: { low: 60 }, pulse: { low: 80, high: 180 }, respiration: { high: 70 }, oxygenSaturation: { low: 90 } },
  infant:     { temperature: { low: 95, high: 103 },   systolic: { low: 70 }, pulse: { low: 80, high: 180 }, respiration: { high: 60 }, oxygenSaturation: { low: 90 } },
  toddler:    { temperature: { low: 95, high: 103 },   systolic: {},          pulse: { low: 70, high: 160 }, respiration: { high: 40 }, oxygenSaturation: { low: 90 } },
  preschool:  { temperature: { low: 95, high: 103 },   systolic: {},          pulse: { low: 65, high: 150 }, respiration: { high: 35 }, oxygenSaturation: { low: 90 } },
  schoolAge:  { temperature: { low: 95, high: 103 },   systolic: {},          pulse: { low: 55, high: 140 }, respiration: { high: 30 }, oxygenSaturation: { low: 90 } },
  adolescent: { temperature: { low: 95, high: 103 },   systolic: { low: 90 }, pulse: { low: 50, high: 130 }, respiration: { high: 25 }, oxygenSaturation: { low: 90 } },
  adult:      { temperature: { low: 95, high: 103 },   systolic: { low: 90 }, pulse: { low: 40, high: 130 }, respiration: { low: 8, high: 30 }, oxygenSaturation: { low: 90 } },
  elderly:    { temperature: { low: 95, high: 103 },   systolic: { low: 90 }, pulse: { low: 40, high: 130 }, respiration: { low: 8, high: 30 }, oxygenSaturation: { low: 90 } },
};

function ageInYears(ageStr: string, dob?: string): number | null {
  if (dob) {
    const d = new Date(dob + 'T12:00:00');
    if (!isNaN(d.getTime())) {
      const now = new Date();
      let y = now.getFullYear() - d.getFullYear();
      const m = now.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < d.getDate())) y--;
      return Math.max(0, y);
    }
  }
  const trimmed = (ageStr || '').trim().toLowerCase();
  // "10 days" / "3 mo" are both under a year — don't let parseInt read the
  // leading number as years (which would misclassify a newborn as a 10-year-old).
  if (trimmed.includes('day') || trimmed.includes('mo')) return 0;
  const n = parseInt(trimmed, 10);
  return isNaN(n) ? null : n;
}

function ageInMonths(dob?: string): number | null {
  if (!dob) return null;
  const d = new Date(dob + 'T12:00:00');
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) months--;
  return Math.max(0, months);
}

/**
 * Effective critical thresholds for a patient: base table refined by exact age
 * for the systolic hypotension floor (PALS: <60 neonate, <70 infant,
 * <70+2*age for 1–10y, <90 for >10y) and the febrile-young-infant rule.
 */
export function getCriticalThresholds(
  ageStr: string,
  dob?: string,
): Record<CriticalVitalKey, CriticalThreshold> {
  const group = getAgeGroup(ageStr, dob);
  // Clone so we don't mutate BASE.
  const out: Record<CriticalVitalKey, CriticalThreshold> = {
    temperature: { ...BASE[group].temperature },
    systolic: { ...BASE[group].systolic },
    pulse: { ...BASE[group].pulse },
    respiration: { ...BASE[group].respiration },
    oxygenSaturation: { ...BASE[group].oxygenSaturation },
  };

  // Fill the systolic hypotension floor only where the base table leaves it
  // open (toddler → school-age), using the PALS formula 70 + 2*age (≤10 y) and
  // 90 for >10 y. Newborn (60), infant (70), and ≥adolescent (90) come straight
  // from the base table, so they're robust even without a precise age.
  const months = ageInMonths(dob);
  const years = ageInYears(ageStr, dob);
  if (out.systolic.low == null && years !== null) {
    out.systolic.low = years <= 10 ? 70 + 2 * years : 90;
  }

  // Any fever in an infant younger than 3 months is urgent (AAP).
  if (months !== null && months < 3) {
    out.temperature.high = 100.4;
  }

  return out;
}

const FIELD_BY_KEY: Record<Exclude<CriticalVitalKey, 'systolic'>, string> = {
  temperature: 'q16_temperature',
  pulse: 'q18_pulse',
  respiration: 'q19_respiration',
  oxygenSaturation: 'q20_oxygenSaturation',
};

function num(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

function evaluate(
  key: CriticalVitalKey,
  value: number,
  th: CriticalThreshold,
): CriticalFinding | null {
  const { label, unit } = META[key];
  if (th.low != null && value < th.low) {
    return { key, label, unit, value, direction: 'low', threshold: th.low,
      message: `${label} ${value}${unit} is below the provider-notification threshold (< ${th.low}${unit}).` };
  }
  if (th.high != null && value > th.high) {
    return { key, label, unit, value, direction: 'high', threshold: th.high,
      message: `${label} ${value}${unit} is above the provider-notification threshold (> ${th.high}${unit}).` };
  }
  return null;
}

/**
 * Inspect a submission's recorded vitals and return every value that crosses a
 * provider-notification threshold for the patient's age. Empty array = nothing
 * critical.
 */
export function getCriticalFindings(data: Record<string, unknown>): CriticalFinding[] {
  const s = (k: string) => (typeof data[k] === 'string' ? (data[k] as string) : data[k] != null ? String(data[k]) : '');
  const ageStr = s('q5_ageYears');
  const dob = s('q4_dateofBirth');
  const th = getCriticalThresholds(ageStr, dob);
  const findings: CriticalFinding[] = [];

  (Object.keys(FIELD_BY_KEY) as Array<keyof typeof FIELD_BY_KEY>).forEach((key) => {
    const v = num(s(FIELD_BY_KEY[key]));
    if (v == null) return;
    const f = evaluate(key, v, th[key]);
    if (f) findings.push(f);
  });

  // Systolic comes from either the joined "120/80" field or the split field.
  let sys = num(s('q17_systolic'));
  if (sys == null) {
    const bp = s('q17_bloodPressure');
    if (bp && bp.includes('/')) sys = num(bp.split('/')[0]);
  }
  if (sys != null) {
    const f = evaluate('systolic', sys, th.systolic);
    if (f) findings.push(f);
  }

  return findings;
}

/** True if any recorded vital crosses a provider-notification threshold. */
export function hasCriticalVital(data: Record<string, unknown>): boolean {
  return getCriticalFindings(data).length > 0;
}

/** Short one-line summary of the critical findings, for storage/display. */
export function summarizeFindings(findings: CriticalFinding[]): string {
  return findings
    .map((f) => `${f.label} ${f.value}${f.unit} (${f.direction === 'low' ? '<' : '>'} ${f.threshold}${f.unit})`)
    .join('; ');
}
