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
