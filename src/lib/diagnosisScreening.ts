// Diagnosis screening for referral intake. Mirrors the GAPP website form's
// cross-check so a paid-caregiver request whose free-text diagnosis reads as
// behavioral/developmental gets flagged for staff even if it slips past the form
// gate (or arrives from another source). The form is the primary block; this is
// the backstop.

const BEHAVIORAL_DX_TERMS = [
  'autism', 'autistic', 'asd', 'asperger',
  'developmental delay', 'developmental disorder', 'global developmental delay',
  'gdd', 'speech delay', 'language delay', 'speech impairment',
  'adhd', 'attention deficit',
  'behavioral disorder', 'behavioural disorder', 'behavior disorder',
  'intellectual disability', 'cognitive delay',
  'learning disability', 'learning disorder', 'sensory processing',
];

const PHYSICAL_DX_TERMS = [
  'cerebral palsy', 'cp', 'feeding tube', 'g-tube', 'gtube', 'g tube',
  'gastrostomy', 'ng tube', 'nasogastric', 'tube fed', 'tube feeding', 'dysphagia',
  'tracheostomy', 'trach', 'ventilator', 'oxygen', 'bipap', 'cpap',
  'seizure', 'epilepsy', 'epileptic', 'muscular dystrophy', 'spina bifida',
  'hydrocephalus', 'microcephaly', 'spinal cord', 'quadripleg', 'hemipleg',
  'parapleg', 'paralysis', 'paralyzed', 'failure to thrive', 'congenital heart',
  'heart defect', 'cardiac', 'heart condition', 'septal defect', 'atrial septal',
  'ventricular septal', 'hypotonia', 'low muscle tone',
  'mitochondrial', 'colostomy', 'ostomy', 'non-ambulatory', 'nonambulatory',
  'wheelchair', 'immobile', 'medically fragile', 'medically complex',
];

function diagnosisHasAny(
  diagnosis: string,
  terms: string[],
  wholeWord: boolean
): boolean {
  const lower = diagnosis.toLowerCase();
  return terms.some((term) => {
    if (!wholeWord) return lower.includes(term);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`).test(lower);
  });
}

export type DiagnosisClass = 'behavioral' | 'mixed' | 'none';

// 'behavioral' -> behavioral/developmental only; 'mixed' -> behavioral plus a
// physical/medical condition; 'none' -> no behavioral terms. Behavioral terms
// use whole-word matching to avoid false positives; physical terms use substring
// matching so we err toward NOT flagging a real condition as ineligible.
export function classifyDiagnosis(diagnosis: string): DiagnosisClass {
  if (!diagnosis.trim()) return 'none';
  if (!diagnosisHasAny(diagnosis, BEHAVIORAL_DX_TERMS, true)) return 'none';
  return diagnosisHasAny(diagnosis, PHYSICAL_DX_TERMS, false) ? 'mixed' : 'behavioral';
}

// Staff-facing flag for a paid-caregiver request whose diagnosis reads as
// behavioral/developmental. Returns null when there is nothing to flag.
export function paidCaregiverDiagnosisFlag(
  diagnosis: string | undefined,
  seekingPaidCaregiver: string | undefined
): string | null {
  if (seekingPaidCaregiver !== 'yes') return null;
  const cls = classifyDiagnosis(diagnosis ?? '');
  if (cls === 'behavioral')
    return 'Likely ineligible: behavioral/developmental diagnosis with a paid-caregiver request (the Family Caregiver Option excludes behavioral aide; autism routes to the ASD Program).';
  if (cls === 'mixed')
    return 'Review: behavioral/developmental diagnosis alongside a physical/medical condition; confirm hands-on care needs.';
  return null;
}

/**
 * Age below which a paid-caregiver request gets the young-child advisory.
 *
 * Deliberately NOT a policy age limit: the GAPP manual (Q3 July 2026) has no
 * minimum age for the Family Caregiver Option. The denial mechanism for young
 * children is medical necessity — FCO pays only for personal support beyond
 * age-typical needs, and the state's own assessment discounts age-typical
 * limitations (toileting deficits score only above age 3; non-ambulation only
 * above 18 months). Under ~6, everyday feeding/bathing/dressing help reads as
 * ordinary parenting, so paid hours are rarely approved absent significant
 * medical needs. Advisory only — never a block, because medically fragile
 * toddlers (trach, G-tube, vent) CAN legitimately qualify.
 */
export const YOUNG_PAID_CAREGIVER_AGE_YEARS = 6;

/** Whole years of age from an ISO date (YYYY-MM-DD) as of `nowMs`; null for a
 *  missing, unparseable, or future date. */
export function ageYearsFromDob(
  dob: string | null | undefined,
  nowMs: number = Date.now()
): number | null {
  const s = String(dob ?? '').trim();
  if (!s) return null;
  const birth = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  if (Number.isNaN(birth.getTime()) || birth.getTime() > nowMs) return null;
  const now = new Date(nowMs);
  let years = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years -= 1;
  return years < 0 ? null : years;
}

/**
 * Staff-facing flag for a paid-caregiver request for a young child. Returns
 * null when not seeking pay, the child is old enough, or the DOB is unusable.
 */
export function paidCaregiverAgeFlag(
  dob: string | null | undefined,
  seekingPaidCaregiver: string | undefined,
  nowMs: number = Date.now()
): string | null {
  if (seekingPaidCaregiver !== 'yes') return null;
  const years = ageYearsFromDob(dob, nowMs);
  if (years === null || years >= YOUNG_PAID_CAREGIVER_AGE_YEARS) return null;
  const ageText = years < 1 ? 'an infant under 1' : `a ${years}-year-old`;
  return (
    `Paid-caregiver request for ${ageText}: the Family Caregiver Option pays only for personal support beyond age-typical needs, ` +
    'and everyday care for a young child (feeding, bathing, dressing, diapering) is rarely approved as medically necessary at this age ' +
    '(the assessment scores toileting deficits only above age 3 and non-ambulation only above 18 months). ' +
    'Expect paid family hours to be denied unless the child has significant medical needs; the child may still qualify for other GAPP services.'
  );
}
