/**
 * Age-based vital sign reference ranges.
 *
 * Sources: AAP, AHA, Harriet Lane Handbook, WHO guidelines.
 * These are general screening thresholds for home health documentation.
 * Individual patient baselines and provider orders always take precedence.
 */

export interface VitalRange {
  low: number;
  high: number;
  unit: string;
  label: string;
}

export interface VitalRangeSet {
  temperature: VitalRange;
  systolic: VitalRange;
  diastolic: VitalRange;
  pulse: VitalRange;
  respiration: VitalRange;
  oxygenSaturation: VitalRange;
}

export type VitalKey = keyof VitalRangeSet;

export type AgeGroup =
  | 'newborn'     // 0-28 days
  | 'infant'      // 1-12 months
  | 'toddler'     // 1-3 years
  | 'preschool'   // 4-5 years
  | 'schoolAge'   // 6-12 years
  | 'adolescent'  // 13-17 years
  | 'adult'       // 18-64 years
  | 'elderly';    // 65+ years

/**
 * The hard-coded default range for an age group + vital. Exposed so the admin
 * vital-range settings can show the current default as the input placeholder —
 * the admin sees the threshold before deciding whether to override it.
 */
export function getDefaultVitalRange(group: AgeGroup, vital: VitalKey): VitalRange {
  return RANGES_BY_AGE_GROUP[group][vital];
}

const RANGES_BY_AGE_GROUP: Record<AgeGroup, VitalRangeSet> = {
  newborn: {
    temperature:     { low: 97.7, high: 99.5, unit: '°F',    label: 'Temperature' },
    systolic:        { low: 60,   high: 90,   unit: 'mmHg',  label: 'Systolic BP' },
    diastolic:       { low: 20,   high: 60,   unit: 'mmHg',  label: 'Diastolic BP' },
    pulse:           { low: 100,  high: 160,  unit: 'bpm',   label: 'Pulse' },
    respiration:     { low: 30,   high: 60,   unit: '/min',  label: 'Respirations' },
    oxygenSaturation:{ low: 95,   high: 100,  unit: '%',     label: 'O2 Saturation' },
  },
  infant: {
    temperature:     { low: 97.5, high: 99.5, unit: '°F',    label: 'Temperature' },
    systolic:        { low: 70,   high: 100,  unit: 'mmHg',  label: 'Systolic BP' },
    diastolic:       { low: 30,   high: 65,   unit: 'mmHg',  label: 'Diastolic BP' },
    pulse:           { low: 100,  high: 150,  unit: 'bpm',   label: 'Pulse' },
    respiration:     { low: 25,   high: 50,   unit: '/min',  label: 'Respirations' },
    oxygenSaturation:{ low: 95,   high: 100,  unit: '%',     label: 'O2 Saturation' },
  },
  // Pediatric pulse/respiration/SBP bounds below were widened from textbook
  // "resting 5th-95th percentile" values to also accommodate normal awake/
  // active and sleeping states (which our form doesn't capture as context).
  // Systolic floors for toddlers track PALS hypotension threshold
  // (70 + 2*age); upper bounds + pulse/RR ranges include AHA awake/play and
  // sleep ranges. Conservative thresholds had been firing false-positive
  // alerts on healthy pediatric patients; widening here keeps real
  // abnormalities visible while suppressing edge-of-normal noise.
  toddler: {
    temperature:     { low: 97.5, high: 99.5, unit: '°F',    label: 'Temperature' },
    systolic:        { low: 74,   high: 112,  unit: 'mmHg',  label: 'Systolic BP' },
    diastolic:       { low: 40,   high: 70,   unit: 'mmHg',  label: 'Diastolic BP' },
    pulse:           { low: 80,   high: 130,  unit: 'bpm',   label: 'Pulse' },
    respiration:     { low: 20,   high: 30,   unit: '/min',  label: 'Respirations' },
    oxygenSaturation:{ low: 95,   high: 100,  unit: '%',     label: 'O2 Saturation' },
  },
  preschool: {
    // Temp floor matches schoolAge at 97.0: real 4-5yo baselines run
    // consistently in the 97.0-97.5 band, which the previous 97.5 floor
    // was alerting on as false hypothermia.
    temperature:     { low: 97.0, high: 99.0, unit: '°F',    label: 'Temperature' },
    systolic:        { low: 80,   high: 110,  unit: 'mmHg',  label: 'Systolic BP' },
    diastolic:       { low: 45,   high: 70,   unit: 'mmHg',  label: 'Diastolic BP' },
    pulse:           { low: 70,   high: 130,  unit: 'bpm',   label: 'Pulse' },
    respiration:     { low: 18,   high: 30,   unit: '/min',  label: 'Respirations' },
    oxygenSaturation:{ low: 95,   high: 100,  unit: '%',     label: 'O2 Saturation' },
  },
  schoolAge: {
    temperature:     { low: 97.0, high: 99.0, unit: '°F',    label: 'Temperature' },
    systolic:        { low: 85,   high: 120,  unit: 'mmHg',  label: 'Systolic BP' },
    diastolic:       { low: 50,   high: 75,   unit: 'mmHg',  label: 'Diastolic BP' },
    pulse:           { low: 60,   high: 130,  unit: 'bpm',   label: 'Pulse' },
    respiration:     { low: 14,   high: 28,   unit: '/min',  label: 'Respirations' },
    oxygenSaturation:{ low: 95,   high: 100,  unit: '%',     label: 'O2 Saturation' },
  },
  adolescent: {
    temperature:     { low: 97.0, high: 99.0, unit: '°F',    label: 'Temperature' },
    systolic:        { low: 90,   high: 120,  unit: 'mmHg',  label: 'Systolic BP' },
    diastolic:       { low: 55,   high: 80,   unit: 'mmHg',  label: 'Diastolic BP' },
    pulse:           { low: 60,   high: 100,  unit: 'bpm',   label: 'Pulse' },
    respiration:     { low: 12,   high: 20,   unit: '/min',  label: 'Respirations' },
    oxygenSaturation:{ low: 95,   high: 100,  unit: '%',     label: 'O2 Saturation' },
  },
  adult: {
    temperature:     { low: 97.0, high: 99.0, unit: '°F',    label: 'Temperature' },
    systolic:        { low: 90,   high: 140,  unit: 'mmHg',  label: 'Systolic BP' },
    diastolic:       { low: 60,   high: 90,   unit: 'mmHg',  label: 'Diastolic BP' },
    pulse:           { low: 60,   high: 100,  unit: 'bpm',   label: 'Pulse' },
    respiration:     { low: 12,   high: 20,   unit: '/min',  label: 'Respirations' },
    oxygenSaturation:{ low: 95,   high: 100,  unit: '%',     label: 'O2 Saturation' },
  },
  elderly: {
    temperature:     { low: 96.0, high: 98.6, unit: '°F',    label: 'Temperature' },
    systolic:        { low: 90,   high: 150,  unit: 'mmHg',  label: 'Systolic BP' },
    diastolic:       { low: 60,   high: 90,   unit: 'mmHg',  label: 'Diastolic BP' },
    pulse:           { low: 60,   high: 100,  unit: 'bpm',   label: 'Pulse' },
    respiration:     { low: 12,   high: 20,   unit: '/min',  label: 'Respirations' },
    oxygenSaturation:{ low: 93,   high: 100,  unit: '%',     label: 'O2 Saturation' },
  },
};

/**
 * Treat patients younger than this many months as `infant` regardless of
 * what the form's `q5_ageYears` says, because pediatric vital ranges
 * shift sharply at the infant→toddler boundary (HR 100-150 vs. 80-130)
 * and a 12-17 month old is clinically still very much in the infant
 * bracket — flagging their normal infant tachycardia as abnormal
 * because they technically turned "1" is the wrong call.
 */
const INFANT_MAX_MONTHS = 18;

function computeAgeInMonths(dob: string, now: Date = new Date()): number | null {
  // Anchor at noon to avoid DST/midnight off-by-one issues across timezones.
  const birth = new Date(dob + 'T12:00:00');
  if (isNaN(birth.getTime())) return null;
  let months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months--;
  return Math.max(0, months);
}

function ageGroupForMonths(months: number): AgeGroup {
  if (months < 1) return 'newborn';
  if (months < INFANT_MAX_MONTHS) return 'infant';
  const years = Math.floor(months / 12);
  if (years <= 3) return 'toddler';
  if (years <= 5) return 'preschool';
  if (years <= 12) return 'schoolAge';
  if (years <= 17) return 'adolescent';
  if (years <= 64) return 'adult';
  return 'elderly';
}

/**
 * Determine age group from a date of birth, falling back to a free-form
 * age string ("5", "9 mo", "14 days") when DOB is missing or unparseable.
 *
 * DOB is preferred because it's authoritative: the form derives `ageStr`
 * from DOB at year resolution, which silently rounds 14-month-olds down
 * to "1" and gets them classified as toddlers instead of infants. Going
 * through DOB recovers the month precision.
 */
export function getAgeGroup(ageStr: string, dob?: string): AgeGroup {
  if (dob) {
    const months = computeAgeInMonths(dob);
    if (months !== null) return ageGroupForMonths(months);
  }

  if (ageStr) {
    const trimmed = ageStr.trim().toLowerCase();

    // "X days" or "X day"
    if (trimmed.includes('day')) {
      const days = parseInt(trimmed);
      if (!isNaN(days) && days <= 28) return 'newborn';
      return 'infant';
    }

    // "X mo"
    if (trimmed.includes('mo')) {
      const months = parseInt(trimmed);
      if (!isNaN(months) && months <= 0) return 'newborn';
      return 'infant';
    }

    // Plain number = years
    const years = parseInt(trimmed);
    if (!isNaN(years)) {
      if (years < 1) return 'infant';
      if (years <= 3) return 'toddler';
      if (years <= 5) return 'preschool';
      if (years <= 12) return 'schoolAge';
      if (years <= 17) return 'adolescent';
      if (years <= 64) return 'adult';
      return 'elderly';
    }
  }

  return 'adult';
}

/**
 * Whether blood pressure is *routinely* required to be documented for a patient
 * of this age. Per AAP / Bright Futures, routine BP screening begins at age 3;
 * under 3 years BP is indicated only with specific risk factors (prematurity,
 * cardiac/renal disease, BP-affecting meds, raised ICP) that the form can't
 * know about — so we treat under-3 BP as optional and let the nurse record it
 * when clinically indicated or ordered.
 *
 * Returns false ONLY when age can be positively determined as < 36 months.
 * When age is unknown or unparseable it returns true (conservative: preserves
 * the prior always-required behavior for adults and notes with no age yet).
 */
export function isBpRoutinelyRequired(ageStr: string, dob?: string): boolean {
  if (dob) {
    const months = computeAgeInMonths(dob);
    if (months !== null) return months >= 36;
  }
  if (ageStr) {
    const trimmed = ageStr.trim().toLowerCase();
    // "X days" / "X mo" are newborns/infants — well under 3 years.
    if (trimmed.includes('day') || trimmed.includes('mo')) return false;
    const years = parseInt(trimmed);
    if (!isNaN(years)) return years >= 3;
  }
  return true;
}

/**
 * Sparse override map admin can set from /admin/settings. Per leaf —
 * any { low, high } pair the override doesn't supply falls back to
 * the hard-coded RANGES_BY_AGE_GROUP value. Lets the RN tune e.g.
 * the preschool temperature floor without restating every other
 * pediatric vital.
 *
 * Shape mirrors VitalRangesOverride in lib/settings.ts but typed
 * locally so this module stays import-free of the settings module
 * (the settings module declares the shape, this module just consumes
 * it as data).
 */
export type VitalRangesOverride = {
  [G in AgeGroup]?: {
    [V in VitalKey]?: { low: number; high: number };
  };
};

/**
 * Merge the hard-coded ranges for an age group with any per-leaf
 * overrides passed in. Returns a fresh VitalRangeSet so callers can
 * inspect/format the unit + label fields exactly as before.
 */
function mergeRanges(group: AgeGroup, overrides?: VitalRangesOverride): VitalRangeSet {
  const base = RANGES_BY_AGE_GROUP[group];
  const groupOverride = overrides?.[group];
  if (!groupOverride) return base;
  const out = { ...base };
  for (const key of Object.keys(out) as VitalKey[]) {
    const o = groupOverride[key];
    if (o && Number.isFinite(o.low) && Number.isFinite(o.high) && o.low <= o.high) {
      out[key] = { ...base[key], low: o.low, high: o.high };
    }
  }
  return out;
}

/**
 * Get the appropriate vital sign ranges for a patient based on their age.
 * Optionally pass `overrides` (from /admin/settings) to bump any
 * specific low/high pair off the hard-coded defaults.
 */
export function getVitalRanges(
  ageStr: string,
  dob?: string,
  overrides?: VitalRangesOverride,
): VitalRangeSet {
  const group = getAgeGroup(ageStr, dob);
  return mergeRanges(group, overrides);
}

/**
 * Get a human-readable label for the age group (for display purposes).
 */
export function getAgeGroupLabel(ageStr: string, dob?: string): string {
  const labels: Record<AgeGroup, string> = {
    newborn: 'Newborn (0-28 days)',
    infant: 'Infant (1-12 months)',
    toddler: 'Toddler (1-3 years)',
    preschool: 'Preschool (4-5 years)',
    schoolAge: 'School Age (6-12 years)',
    adolescent: 'Adolescent (13-17 years)',
    adult: 'Adult (18-64 years)',
    elderly: 'Elderly (65+ years)',
  };
  return labels[getAgeGroup(ageStr, dob)];
}

/**
 * Check if a vital sign value is within normal range for the given age.
 */
export function checkVitalRange(
  key: VitalKey,
  value: number,
  ageStr: string,
  dob?: string,
  overrides?: VitalRangesOverride,
): 'normal' | 'low' | 'high' {
  const ranges = getVitalRanges(ageStr, dob, overrides);
  const range = ranges[key];
  if (value < range.low) return 'low';
  if (value > range.high) return 'high';
  return 'normal';
}

/**
 * Returns true if any recorded vital sign in the submission falls outside
 * the age-appropriate range. Used for the dashboard "abnormal vitals" filter.
 */
export function hasAnyAbnormalVital(
  data: Record<string, unknown>,
  overrides?: VitalRangesOverride,
): boolean {
  const s = (k: string) => (typeof data[k] === 'string' ? (data[k] as string) : '');
  const ageStr = s('q5_ageYears');
  const dob = s('q4_dateofBirth');
  const ranges = getVitalRanges(ageStr, dob, overrides);
  const parseNum = (v: string) => parseFloat((v || '').replace(/[^0-9.]/g, ''));

  const checks: Array<[string, VitalKey]> = [
    ['q16_temperature', 'temperature'],
    ['q18_pulse', 'pulse'],
    ['q19_respiration', 'respiration'],
    ['q20_oxygenSaturation', 'oxygenSaturation'],
  ];
  for (const [field, key] of checks) {
    const raw = s(field);
    if (!raw) continue;
    const v = parseNum(raw);
    if (isNaN(v)) continue;
    if (v < ranges[key].low || v > ranges[key].high) return true;
  }

  const bp = s('q17_bloodPressure');
  if (bp) {
    const [sysStr, diaStr] = bp.split('/');
    const sys = parseFloat(sysStr);
    const dia = parseFloat(diaStr);
    if (!isNaN(sys) && (sys < ranges.systolic.low || sys > ranges.systolic.high)) return true;
    if (!isNaN(dia) && (dia < ranges.diastolic.low || dia > ranges.diastolic.high)) return true;
  }

  return false;
}
