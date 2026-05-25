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
  bloodGlucose: VitalRange;
}

export type VitalKey = keyof VitalRangeSet;

type AgeGroup =
  | 'newborn'     // 0-28 days
  | 'infant'      // 1-12 months
  | 'toddler'     // 1-3 years
  | 'preschool'   // 4-5 years
  | 'schoolAge'   // 6-12 years
  | 'adolescent'  // 13-17 years
  | 'adult'       // 18-64 years
  | 'elderly';    // 65+ years

const RANGES_BY_AGE_GROUP: Record<AgeGroup, VitalRangeSet> = {
  newborn: {
    temperature:     { low: 97.7, high: 99.5, unit: '°F',    label: 'Temperature' },
    systolic:        { low: 60,   high: 90,   unit: 'mmHg',  label: 'Systolic BP' },
    diastolic:       { low: 20,   high: 60,   unit: 'mmHg',  label: 'Diastolic BP' },
    pulse:           { low: 100,  high: 160,  unit: 'bpm',   label: 'Pulse' },
    respiration:     { low: 30,   high: 60,   unit: '/min',  label: 'Respirations' },
    oxygenSaturation:{ low: 95,   high: 100,  unit: '%',     label: 'O2 Saturation' },
    bloodGlucose:    { low: 40,   high: 180,  unit: 'mg/dL', label: 'Blood Glucose' },
  },
  infant: {
    temperature:     { low: 97.5, high: 99.5, unit: '°F',    label: 'Temperature' },
    systolic:        { low: 70,   high: 100,  unit: 'mmHg',  label: 'Systolic BP' },
    diastolic:       { low: 30,   high: 65,   unit: 'mmHg',  label: 'Diastolic BP' },
    pulse:           { low: 100,  high: 150,  unit: 'bpm',   label: 'Pulse' },
    respiration:     { low: 25,   high: 50,   unit: '/min',  label: 'Respirations' },
    oxygenSaturation:{ low: 95,   high: 100,  unit: '%',     label: 'O2 Saturation' },
    bloodGlucose:    { low: 60,   high: 180,  unit: 'mg/dL', label: 'Blood Glucose' },
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
    bloodGlucose:    { low: 70,   high: 180,  unit: 'mg/dL', label: 'Blood Glucose' },
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
    bloodGlucose:    { low: 70,   high: 180,  unit: 'mg/dL', label: 'Blood Glucose' },
  },
  schoolAge: {
    temperature:     { low: 97.0, high: 99.0, unit: '°F',    label: 'Temperature' },
    systolic:        { low: 85,   high: 120,  unit: 'mmHg',  label: 'Systolic BP' },
    diastolic:       { low: 50,   high: 75,   unit: 'mmHg',  label: 'Diastolic BP' },
    pulse:           { low: 60,   high: 130,  unit: 'bpm',   label: 'Pulse' },
    respiration:     { low: 14,   high: 28,   unit: '/min',  label: 'Respirations' },
    oxygenSaturation:{ low: 95,   high: 100,  unit: '%',     label: 'O2 Saturation' },
    bloodGlucose:    { low: 70,   high: 180,  unit: 'mg/dL', label: 'Blood Glucose' },
  },
  adolescent: {
    temperature:     { low: 97.0, high: 99.0, unit: '°F',    label: 'Temperature' },
    systolic:        { low: 90,   high: 120,  unit: 'mmHg',  label: 'Systolic BP' },
    diastolic:       { low: 55,   high: 80,   unit: 'mmHg',  label: 'Diastolic BP' },
    pulse:           { low: 60,   high: 100,  unit: 'bpm',   label: 'Pulse' },
    respiration:     { low: 12,   high: 20,   unit: '/min',  label: 'Respirations' },
    oxygenSaturation:{ low: 95,   high: 100,  unit: '%',     label: 'O2 Saturation' },
    bloodGlucose:    { low: 70,   high: 180,  unit: 'mg/dL', label: 'Blood Glucose' },
  },
  adult: {
    temperature:     { low: 97.0, high: 99.0, unit: '°F',    label: 'Temperature' },
    systolic:        { low: 90,   high: 140,  unit: 'mmHg',  label: 'Systolic BP' },
    diastolic:       { low: 60,   high: 90,   unit: 'mmHg',  label: 'Diastolic BP' },
    pulse:           { low: 60,   high: 100,  unit: 'bpm',   label: 'Pulse' },
    respiration:     { low: 12,   high: 20,   unit: '/min',  label: 'Respirations' },
    oxygenSaturation:{ low: 95,   high: 100,  unit: '%',     label: 'O2 Saturation' },
    bloodGlucose:    { low: 70,   high: 180,  unit: 'mg/dL', label: 'Blood Glucose' },
  },
  elderly: {
    temperature:     { low: 96.0, high: 98.6, unit: '°F',    label: 'Temperature' },
    systolic:        { low: 90,   high: 150,  unit: 'mmHg',  label: 'Systolic BP' },
    diastolic:       { low: 60,   high: 90,   unit: 'mmHg',  label: 'Diastolic BP' },
    pulse:           { low: 60,   high: 100,  unit: 'bpm',   label: 'Pulse' },
    respiration:     { low: 12,   high: 20,   unit: '/min',  label: 'Respirations' },
    oxygenSaturation:{ low: 93,   high: 100,  unit: '%',     label: 'O2 Saturation' },
    bloodGlucose:    { low: 70,   high: 180,  unit: 'mg/dL', label: 'Blood Glucose' },
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
 * Get the appropriate vital sign ranges for a patient based on their age.
 */
export function getVitalRanges(ageStr: string, dob?: string): VitalRangeSet {
  const group = getAgeGroup(ageStr, dob);
  return RANGES_BY_AGE_GROUP[group];
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
  dob?: string
): 'normal' | 'low' | 'high' {
  const ranges = getVitalRanges(ageStr, dob);
  const range = ranges[key];
  if (value < range.low) return 'low';
  if (value > range.high) return 'high';
  return 'normal';
}

/**
 * Returns true if any recorded vital sign in the submission falls outside
 * the age-appropriate range. Used for the dashboard "abnormal vitals" filter.
 */
export function hasAnyAbnormalVital(data: Record<string, unknown>): boolean {
  const s = (k: string) => (typeof data[k] === 'string' ? (data[k] as string) : '');
  const ageStr = s('q5_ageYears');
  const dob = s('q4_dateofBirth');
  const ranges = getVitalRanges(ageStr, dob);
  const parseNum = (v: string) => parseFloat((v || '').replace(/[^0-9.]/g, ''));

  const checks: Array<[string, VitalKey]> = [
    ['q16_temperature', 'temperature'],
    ['q18_pulse', 'pulse'],
    ['q19_respiration', 'respiration'],
    ['q20_oxygenSaturation', 'oxygenSaturation'],
    ['q21_bloodGlucose', 'bloodGlucose'],
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
