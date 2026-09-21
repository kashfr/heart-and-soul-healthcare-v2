// Structured intake catalog for GAPP referrals: what conditions a family can
// pick, what equipment and daily care they report, and how those answers infer
// a GAPP service line.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS FILE IS DUPLICATED, BYTE-FOR-BYTE, IN TWO REPOSITORIES:
//   • georgiapediatricprogram        src/lib/diagnosisCatalog.ts  (the form)
//   • heart-and-soul-healthcare-v2   src/lib/diagnosisCatalog.ts  (the portal)
// They deploy independently (Vercel and Cloud Run), so there is no shared
// package to import. Keep them identical.
//
// Two guards make drift loud rather than silent:
//   1. diagnosisCatalog.test.ts asserts CATALOG_VERSION matches the catalog's
//      computed fingerprint, so you cannot edit an option without bumping the
//      version — and the bump is the reminder to copy the file across.
//   2. The form sends CATALOG_VERSION with every submission and the portal's
//      intake compares it against its own, flagging any referral that arrives
//      from a form running a different catalog.
// ─────────────────────────────────────────────────────────────────────────────
//
// Design constraint, from the GAPP In-Home Nursing Policy Manual (Q3 July 2026):
// the manual contains NO list of qualifying diagnoses. §702.1.1 sets eligibility
// on "medically necessary" need judged from "the overall medical condition of
// the member, the equipment and the level and frequency of care required", and
// Alliant Health Solutions decides. So nothing here gates eligibility. The
// inference below is a routing hint and a staff-facing flag, never a verdict.

/** GAPP's three service lines (§604): skilled nursing, personal support
 *  services, and behavioral support aide services (added 4/1/2023). */
export type ServiceKey = 'nursing' | 'pss' | 'behavioral';

export interface DiagnosisOption {
  code: string;
  label: string;
}

export interface DiagnosisGroup {
  key: string;
  title: string;
  /** True when every condition in the group is developmental/behavioral rather
   *  than medical. Used only to recognize a behavioral-only picture. */
  behavioral?: boolean;
  options: DiagnosisOption[];
}

/**
 * Conditions families actually report. Derived from the 59 referrals received
 * through the GAPP site between June and July 2026 — these groups cover ~90% of
 * what was typed into the old free-text box. Wording is deliberately plain
 * ("Feeding tube", not "gastrostomy") because parents, not clinicians, fill
 * this in. Anything unlisted goes in "Other", which is always preserved.
 */
export const DIAGNOSIS_GROUPS: DiagnosisGroup[] = [
  {
    key: 'dev',
    title: 'Developmental and behavioral',
    behavioral: true,
    options: [
      { code: 'autism', label: 'Autism or autism spectrum disorder' },
      { code: 'adhd', label: 'ADHD' },
      { code: 'dev_delay', label: 'Developmental delay' },
      { code: 'speech', label: 'Speech or language delay, or nonverbal' },
      { code: 'intellectual', label: 'Intellectual disability' },
    ],
  },
  {
    key: 'neuro',
    title: 'Seizures and neurological',
    options: [
      { code: 'seizures', label: 'Seizures or epilepsy' },
      { code: 'cerebral_palsy', label: 'Cerebral palsy' },
      { code: 'hydrocephalus', label: 'Hydrocephalus or shunt' },
      { code: 'spina_bifida', label: 'Spina bifida' },
      { code: 'brain_injury', label: 'Brain injury (HIE, stroke)' },
    ],
  },
  {
    key: 'genetic',
    title: 'Genetic and chromosomal',
    options: [
      { code: 'down', label: 'Down syndrome' },
      { code: 'genetic_other', label: 'Other genetic or chromosomal syndrome' },
    ],
  },
  {
    key: 'airway',
    title: 'Heart, lung and airway',
    options: [
      { code: 'heart', label: 'Heart condition or heart defect' },
      { code: 'lung', label: 'Chronic lung disease' },
      { code: 'airway', label: 'Airway problem (laryngomalacia, subglottic stenosis)' },
      { code: 'cystic_fibrosis', label: 'Cystic fibrosis' },
    ],
  },
  {
    key: 'medical',
    title: 'Other medical',
    options: [
      { code: 'diabetes', label: 'Diabetes' },
      { code: 'kidney', label: 'Kidney disease' },
      { code: 'metabolic', label: 'Metabolic or mitochondrial condition' },
      { code: 'immune', label: 'Immune deficiency' },
      { code: 'feeding_growth', label: 'Poor growth or feeding problem' },
    ],
  },
];

export interface EquipmentOption {
  code: string;
  label: string;
  /** 'skilled' items are nursing tasks; 'daily' items are personal support
   *  tasks (§604.2). 'none' is the explicit negative answer. */
  tier: 'skilled' | 'daily' | 'none';
}

/**
 * Equipment and hands-on care. This is the signal §702.1.1 actually names, and
 * the referral form has never asked for it. A trach or a feeding tube says more
 * about the service line than any diagnosis does.
 */
export const EQUIPMENT_OPTIONS: EquipmentOption[] = [
  { code: 'trach', label: 'Tracheostomy', tier: 'skilled' },
  { code: 'vent', label: 'Ventilator, BiPAP or CPAP', tier: 'skilled' },
  { code: 'oxygen', label: 'Oxygen', tier: 'skilled' },
  { code: 'suction', label: 'Suctioning', tier: 'skilled' },
  { code: 'feeding_tube', label: 'Feeding tube (G-tube, NG or J-tube)', tier: 'skilled' },
  { code: 'seizure_meds', label: 'Rescue medication for seizures', tier: 'skilled' },
  { code: 'catheter_ostomy', label: 'Catheter or ostomy care', tier: 'skilled' },
  { code: 'wheelchair', label: 'Uses a wheelchair, or cannot walk unassisted', tier: 'daily' },
  { code: 'help_feeding', label: 'Needs help with feeding', tier: 'daily' },
  { code: 'help_hygiene', label: 'Needs help with bathing, dressing or toileting', tier: 'daily' },
  { code: 'help_transfer', label: 'Needs help turning or transferring', tier: 'daily' },
  { code: 'equip_none', label: 'None of these', tier: 'none' },
];

export type BehaviorRisk = '' | 'none' | 'managed' | 'high';

export interface BehaviorRiskOption {
  code: Exclude<BehaviorRisk, ''>;
  label: string;
}

/**
 * The Behavioral Support Aide signal. Worded from Appendix W's own standard:
 * services are authorized for individuals "whose challenging behaviors are
 * dangerous or disruptive and present a risk to the health and safety of the
 * individual, their peers, and others".
 *
 * Note this is the BSS question — an autism diagnosis is not. Per §602.4,
 * "Members with Autism should access Medicaid's Autism Spectrum Disorder
 * Program", so autism on its own routes away from GAPP entirely.
 */
export const BEHAVIOR_RISK_OPTIONS: BehaviorRiskOption[] = [
  { code: 'none', label: 'No' },
  { code: 'managed', label: 'Sometimes, and we manage them at home' },
  { code: 'high', label: 'Yes, often, and we need help managing them' },
];

export interface ServiceOption {
  code: string;
  label: string;
}

/**
 * Services already in place. Mirrors the Appendix O checklist, which asks the
 * same question ("Other services this member receives: ABA / Speech Therapy /
 * OT / None"). An existing ABA relationship means a BCBA is already involved,
 * which the BSS packet requires (Appendix O needs a BCBA-signed behavior
 * intervention plan).
 */
export const CURRENT_SERVICE_OPTIONS: ServiceOption[] = [
  { code: 'aba', label: 'ABA therapy' },
  { code: 'speech_therapy', label: 'Speech therapy' },
  { code: 'ot_pt', label: 'Occupational or physical therapy' },
  { code: 'home_nursing', label: 'Private duty nursing at home' },
  { code: 'services_none', label: 'None' },
];

// --- Lookups -----------------------------------------------------------------

const DIAGNOSIS_BY_CODE = new Map(
  DIAGNOSIS_GROUPS.flatMap((g) => g.options.map((o) => [o.code, o] as const))
);
const BEHAVIORAL_DIAGNOSIS_CODES = new Set(
  DIAGNOSIS_GROUPS.filter((g) => g.behavioral).flatMap((g) => g.options.map((o) => o.code))
);
const BEHAVIOR_LABEL = new Map(BEHAVIOR_RISK_OPTIONS.map((o) => [o.code, o.label] as const));

/** Drop unknown codes and dedupe, preserving catalog order so two submissions
 *  with the same selections always render the same text. */
function known<T extends { code: string }>(codes: string[] | undefined, all: T[]): T[] {
  const picked = new Set(codes ?? []);
  return all.filter((o) => picked.has(o.code));
}

export function diagnosisLabels(codes: string[] | undefined): string[] {
  const picked = new Set(codes ?? []);
  return DIAGNOSIS_GROUPS.flatMap((g) => g.options)
    .filter((o) => picked.has(o.code))
    .map((o) => o.label);
}

export function equipmentLabels(codes: string[] | undefined): string[] {
  return known(codes, EQUIPMENT_OPTIONS).map((o) => o.label);
}

export function currentServiceLabels(codes: string[] | undefined): string[] {
  return known(codes, CURRENT_SERVICE_OPTIONS).map((o) => o.label);
}

export function behaviorRiskLabel(value: BehaviorRisk | string | undefined): string {
  return BEHAVIOR_LABEL.get(value as Exclude<BehaviorRisk, ''>) ?? '';
}

/**
 * Human-readable diagnosis text for the staff view, emails, and the PDF export.
 * The portal stores this as the `Diagnosis` detail row exactly as before, so
 * every existing referral, template, and print layout keeps working unchanged.
 */
export function composeDiagnosisText(
  codes: string[] | undefined,
  other: string | undefined
): string {
  const parts = diagnosisLabels(codes);
  const extra = String(other ?? '').trim();
  if (extra) parts.push(`Other: ${extra}`);
  return parts.join('; ');
}

// --- Free-text screening -----------------------------------------------------

// The checkbox list covers roughly 90% of what families reported through July
// 2026, but "Other" is free text and always will be, so these lists still earn
// their keep. They also classify referrals that predate the structured form.
//
// Behavioral terms match whole words to avoid false positives; physical terms
// match substrings so we err toward NOT calling a real medical condition
// behavioral. Consolidated here from the copies that used to live in the GAPP
// form and the portal's diagnosisScreening.ts.

export const BEHAVIORAL_DX_TERMS = [
  'autism', 'autistic', 'asd', 'asperger',
  'developmental delay', 'developmental disorder', 'global developmental delay',
  'gdd', 'speech delay', 'language delay', 'speech impairment',
  'adhd', 'attention deficit',
  'behavioral disorder', 'behavioural disorder', 'behavior disorder',
  'intellectual disability', 'cognitive delay',
  'learning disability', 'learning disorder', 'sensory processing',
];

export const PHYSICAL_DX_TERMS = [
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

function textHasAny(text: string, terms: string[], wholeWord: boolean): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => {
    if (!wholeWord) return lower.includes(term);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`).test(lower);
  });
}

/** 'behavioral' = behavioral/developmental terms only; 'mixed' = those plus a
 *  physical/medical term; 'none' = no behavioral terms found. */
export function classifyFreeText(text: string | undefined): 'behavioral' | 'mixed' | 'none' {
  const value = String(text ?? '');
  if (!value.trim()) return 'none';
  if (!textHasAny(value, BEHAVIORAL_DX_TERMS, true)) return 'none';
  return textHasAny(value, PHYSICAL_DX_TERMS, false) ? 'mixed' : 'behavioral';
}

/**
 * What the family's whole diagnosis answer looks like, checkboxes and free text
 * together.
 *
 *   'behavioral' — developmental/behavioral only, nothing medical named
 *   'mixed'      — behavioral alongside a medical condition, or alongside free
 *                  text we can't classify (unreadable text is never treated as
 *                  proof that nothing medical exists)
 *   'medical'    — no behavioral element
 *   'none'       — nothing answered
 */
export type DiagnosisPicture = 'behavioral' | 'mixed' | 'medical' | 'none';

export function diagnosisPicture(
  codes: string[] | undefined,
  other: string | undefined
): DiagnosisPicture {
  const picked = (codes ?? []).filter((c) => DIAGNOSIS_BY_CODE.has(c));
  const behavioralCodes = picked.filter((c) => BEHAVIORAL_DIAGNOSIS_CODES.has(c));
  const medicalCodes = picked.filter((c) => !BEHAVIORAL_DIAGNOSIS_CODES.has(c));

  const text = String(other ?? '').trim();
  const textClass = classifyFreeText(text);
  const textIsBehavioral = textClass === 'behavioral';
  // Free text that names nothing we recognize could be anything medical, so it
  // counts as a medical signal rather than as silence.
  const textIsUnclassified = text.length > 0 && textClass === 'none';

  const hasBehavioral = behavioralCodes.length > 0 || textIsBehavioral;
  const hasMedical =
    medicalCodes.length > 0 || textClass === 'mixed' || textIsUnclassified;

  if (!hasBehavioral && !hasMedical) return 'none';
  if (!hasBehavioral) return 'medical';
  return hasMedical ? 'mixed' : 'behavioral';
}

// --- Service inference -------------------------------------------------------

/** The self-reported care-need radio, kept for continuity. */
export type CareNeed = '' | 'personal' | 'nursing' | 'behavioral' | 'unsure';

export function serviceFromCareNeed(value: CareNeed | string | undefined): ServiceKey | null {
  if (value === 'personal') return 'pss';
  if (value === 'nursing') return 'nursing';
  if (value === 'behavioral') return 'behavioral';
  return null;
}

export interface ServiceInferenceInput {
  diagnoses?: string[];
  diagnosisOther?: string;
  equipment?: string[];
  behaviorRisk?: BehaviorRisk | string;
  currentServices?: string[];
  careNeeds?: CareNeed | string;
}

export interface ServiceInference {
  service: ServiceKey | null;
  /** What decided it, so staff can see the reasoning rather than a bare label. */
  source: 'equipment' | 'behavior' | 'daily-care' | 'diagnosis' | 'self-reported' | 'unknown';
  reason: string;
  /** Set when the inference disagrees with the self-reported radio. Advisory —
   *  it flags the card for a human, it never blocks or overwrites anything. */
  conflict: string | null;
}

const SERVICE_LABEL: Record<ServiceKey, string> = {
  nursing: 'Skilled Nursing',
  pss: 'Personal Support Services (PSS)',
  behavioral: 'Behavioral Support Aide Services (BSS)',
};

/**
 * Infer the likely GAPP service line from everything the family told us, in
 * priority order:
 *
 *   1. Skilled equipment (trach, vent, feeding tube…) — the strongest and least
 *      gameable signal, and the one §702.1.1 names outright.
 *   2. Behaviors that put someone at risk — Appendix W's actual BSS standard.
 *   3. Hands-on daily care — the §604.2 personal support definition.
 *   4. A behavioral-only picture with no medical condition and no care needs —
 *      likely not a GAPP case at all (§602.4 routes autism to the ASD Program).
 *   5. Whatever the family picked on the care-need radio.
 *
 * The radio is last on purpose. 68% of submitters through July 2026 were
 * seeking to be paid, and the paid path runs through personal care, so the
 * radio has been answering "how do I get paid?" rather than "what does my child
 * need?" — 8 of the 13 referrals with a behavioral diagnosis picked hands-on
 * personal care.
 */
export function inferService(input: ServiceInferenceInput): ServiceInference {
  const equipment = known(input.equipment, EQUIPMENT_OPTIONS);
  const skilled = equipment.filter((o) => o.tier === 'skilled');
  const daily = equipment.filter((o) => o.tier === 'daily');
  const selfReported = serviceFromCareNeed(input.careNeeds);

  const decide = (
    service: ServiceKey,
    source: ServiceInference['source'],
    reason: string
  ): ServiceInference => ({
    service,
    source,
    reason,
    conflict:
      selfReported && selfReported !== service
        ? `Family selected ${SERVICE_LABEL[selfReported]}; answers point to ${SERVICE_LABEL[service]} (${reason})`
        : null,
  });

  if (skilled.length > 0) {
    return decide('nursing', 'equipment', skilled.map((o) => o.label).join(', '));
  }

  if (input.behaviorRisk === 'high') {
    const aba = (input.currentServices ?? []).includes('aba');
    return decide(
      'behavioral',
      'behavior',
      aba
        ? 'behaviors that put someone at risk, with ABA already in place'
        : 'behaviors that put someone at risk'
    );
  }

  if (daily.length > 0) {
    return decide('pss', 'daily-care', daily.map((o) => o.label).join(', '));
  }

  if (diagnosisPicture(input.diagnoses, input.diagnosisOther) === 'behavioral') {
    return decide(
      'behavioral',
      'diagnosis',
      'developmental or behavioral diagnosis with no medical condition or hands-on care reported'
    );
  }

  if (selfReported) {
    return {
      service: selfReported,
      source: 'self-reported',
      reason: 'family-selected care need',
      conflict: null,
    };
  }

  return { service: null, source: 'unknown', reason: '', conflict: null };
}

// --- Mixed-diagnosis paid-caregiver screen ----------------------------------

/**
 * When a paid-caregiver request comes with BOTH a behavioral/developmental
 * diagnosis and a medical one (the Chance case: autism + ADHD + developmental
 * delay alongside seizures and a G-tube), the form cannot tell which one
 * drives the hands-on care, and that is the whole question: the Family
 * Caregiver Option pays for personal care related to the medical condition
 * and never for autism, ADHD, or developmental support. So the family is
 * made to answer it. This is the answer.
 */
export type PaidCareBasis = '' | 'medical' | 'behavioral' | 'unsure';

export const PAID_CARE_BASIS_OPTIONS: { code: Exclude<PaidCareBasis, ''>; label: string }[] = [
  { code: 'medical', label: 'The medical or physical condition' },
  { code: 'behavioral', label: 'The autism, ADHD, or developmental diagnosis' },
  { code: 'unsure', label: 'Not sure' },
];

const PAID_CARE_BASIS_LABEL = new Map(PAID_CARE_BASIS_OPTIONS.map((o) => [o.code, o.label]));

export function paidCareBasisLabel(value: PaidCareBasis | string | undefined): string {
  return PAID_CARE_BASIS_LABEL.get(value as Exclude<PaidCareBasis, ''>) ?? '';
}

export interface MixedPaidScreenInput {
  diagnoses?: string[];
  diagnosisOther?: string;
  /** Free-text needs/notes from a form that has them (the H&S site). */
  freeText?: string;
  seekingPaidCaregiver?: string;
  paidCareBasis?: PaidCareBasis | string;
}

export interface MixedPaidScreen {
  /** True when the follow-up question applies: seeking pay and the picture
   *  is mixed. The forms require an answer in exactly this case. */
  asks: boolean;
  /** Why the paid request is refused. Null when it may proceed. */
  block: string | null;
  /** Staff-facing note for the card when the request goes through. */
  flag: string | null;
}

const NO_MIXED_SCREEN: MixedPaidScreen = { asks: false, block: null, flag: null };

/**
 * Refuses a paid-caregiver request when the family says the hands-on care is
 * mainly due to the autism/developmental diagnosis: paid family hours will be
 * denied, full stop. The child may still qualify for GAPP nursing or personal
 * care, so the family is told to switch the paid answer to No, not to give
 * up on the referral. "Medical" and "not sure" go through with the
 * attestation recorded for the assessment.
 */
export function screenMixedPaidCaregiver(input: MixedPaidScreenInput): MixedPaidScreen {
  if (input.seekingPaidCaregiver !== 'yes') return NO_MIXED_SCREEN;
  const mixed =
    diagnosisPicture(input.diagnoses, input.diagnosisOther) === 'mixed' ||
    classifyFreeText(input.freeText) === 'mixed';
  if (!mixed) return NO_MIXED_SCREEN;

  switch (input.paidCareBasis) {
    case 'behavioral':
      return {
        asks: true,
        flag: null,
        block:
          'Paid-caregiver request where the family says the hands-on care is mainly due to the autism, ADHD, or developmental diagnosis. ' +
          'The Family Caregiver Option does not pay for behavioral or developmental support, so paid family hours will be denied. ' +
          'The child may still qualify for GAPP nursing or personal care on the medical condition; the referral can be sent with the paid-caregiver answer set to No.',
      };
    case 'medical':
      return {
        asks: true,
        block: null,
        flag:
          'Mixed diagnosis with a paid-caregiver request. The family attests the hands-on care is mainly due to the medical or physical condition, not the autism or developmental diagnosis. Hold them to this at the assessment: paid hours cover only care related to the medical condition.',
      };
    case 'unsure':
      return {
        asks: true,
        block: null,
        flag:
          'Mixed diagnosis with a paid-caregiver request. The family is not sure whether the hands-on care is due to the medical condition or the autism or developmental diagnosis. Paid hours cover only care related to the medical condition; settle this before scheduling.',
      };
    default:
      // Older form build that never asked. Same review note as before.
      return {
        asks: true,
        block: null,
        flag:
          'Review: behavioral/developmental diagnosis alongside a physical/medical condition with a paid-caregiver request; the form did not capture which drives the hands-on care. Confirm before scheduling.',
      };
  }
}

// --- Young-child paid-caregiver hard stop ------------------------------------

/**
 * Age below which a GAPP paid-caregiver request is screened as a young child.
 * Under this line, everyday personal care (feeding, bathing, dressing,
 * diapering) reads as ordinary parenting, so Medicaid does not approve paid
 * family hours for it and there is no other GAPP service the agency (or a
 * partner agency) can provide for those needs. Shared by both public forms and
 * both server intakes, so a request that is refused on the form is refused at
 * the API too.
 */
export const YOUNG_PAID_CAREGIVER_AGE_YEARS = 6;

/**
 * The state assessment scores "unable to ambulate" only above 18 months, so a
 * mobility need at or past this age is a real deficit rather than an
 * age-typical one, and the paid request is allowed through for the nurse to
 * assess. (Toileting scores only above age 3, but the hygiene option lumps
 * bathing and dressing in with it, which stay age-typical well past 3, so it
 * does not clear the stop on its own.)
 */
export const MOBILITY_SCORES_FROM_MONTHS = 18;

const MOBILITY_CODES = new Set(['wheelchair', 'help_transfer']);

/** Whole months of age from an ISO date (YYYY-MM-DD) as of `nowMs`; null for
 *  a missing, unparseable, or future date. */
export function ageMonthsFromDob(
  dob: string | null | undefined,
  nowMs: number = Date.now()
): number | null {
  const s = String(dob ?? '').trim();
  if (!s) return null;
  const birth = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  if (Number.isNaN(birth.getTime()) || birth.getTime() > nowMs) return null;
  const now = new Date(nowMs);
  let months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  return months < 0 ? null : months;
}

export interface YoungChildScreenInput extends ServiceInferenceInput {
  dob?: string | null;
  seekingPaidCaregiver?: string;
}

export interface YoungChildScreen {
  /** Why the referral is refused. Null when it may proceed. Plain prose that
   *  is shown to the family and stored for staff, so no dashes. */
  block: string | null;
  /** Set when a young child's paid request was allowed through: what cleared
   *  it, so staff know to confirm it at the assessment. */
  cleared: string | null;
  /** Whole years, when the DOB was usable. */
  ageYears: number | null;
}

const NOT_SCREENED: YoungChildScreen = { block: null, cleared: null, ageYears: null };

/**
 * Hard stop for a paid-caregiver request for a young child whose care picture
 * is everyday personal support. Refuses when ALL of:
 *
 *   - the family is seeking to be the paid caregiver,
 *   - the child is under YOUNG_PAID_CAREGIVER_AGE_YEARS (DOB usable),
 *   - no skilled-tier equipment is reported (trach, vent, oxygen, suction,
 *     feeding tube, seizure rescue meds, catheter/ostomy), and
 *   - no mobility need at MOBILITY_SCORES_FROM_MONTHS or older.
 *
 * Skilled equipment means the child needs nursing (which GAPP covers) and the
 * paid personal-care question becomes a real one for the assessment. A
 * mobility deficit past 18 months scores on the state's own grid. Everything
 * else at this age is ordinary parenting and cannot be reimbursed, so the
 * referral is refused outright rather than accepted and worked for nothing.
 */
export function screenYoungPaidCaregiver(
  input: YoungChildScreenInput,
  nowMs: number = Date.now()
): YoungChildScreen {
  if (input.seekingPaidCaregiver !== 'yes') return NOT_SCREENED;
  const months = ageMonthsFromDob(input.dob, nowMs);
  if (months === null) return NOT_SCREENED;
  const ageYears = Math.floor(months / 12);
  if (ageYears >= YOUNG_PAID_CAREGIVER_AGE_YEARS) {
    return { block: null, cleared: null, ageYears };
  }

  const equipment = known(input.equipment, EQUIPMENT_OPTIONS);
  const skilled = equipment.filter((o) => o.tier === 'skilled');
  const mobility = equipment.filter((o) => MOBILITY_CODES.has(o.code));
  const ageText =
    ageYears < 1
      ? `an infant (${months} month${months === 1 ? '' : 's'} old)`
      : `a ${ageYears}-year-old`;

  if (skilled.length > 0) {
    return {
      block: null,
      ageYears,
      cleared:
        `Paid-caregiver request for ${ageText}, allowed through because skilled needs were reported (${skilled
          .map((o) => o.label)
          .join(', ')}). A parent can be paid for personal care only, and at this age only for care beyond age-typical needs; confirm at the nursing assessment.`,
    };
  }
  if (mobility.length > 0 && months >= MOBILITY_SCORES_FROM_MONTHS) {
    return {
      block: null,
      ageYears,
      cleared:
        `Paid-caregiver request for ${ageText}, allowed through because a mobility need was reported (${mobility
          .map((o) => o.label)
          .join(', ')}) and the assessment scores non-ambulation above ${MOBILITY_SCORES_FROM_MONTHS} months. Confirm at the nursing assessment.`,
    };
  }

  return {
    ageYears,
    cleared: null,
    block:
      `Paid-caregiver request for ${ageText} with no skilled medical or mobility needs reported. ` +
      'GAPP pays a parent only for personal care that goes beyond what a child this age ordinarily needs, and everyday care for an infant or young child (feeding, bathing, dressing, diapering) is typical parenting. ' +
      'Medicaid will not approve paid family hours for it, and there is no other GAPP service that covers these needs, so the referral cannot be accepted.',
  };
}

// --- Drift guard -------------------------------------------------------------

/**
 * Deterministic fingerprint of every code and label in this file. FNV-1a, so it
 * runs in the browser with no crypto dependency and gives the same answer in
 * both repos.
 */
export function catalogFingerprint(): string {
  const parts: string[] = [];
  for (const g of DIAGNOSIS_GROUPS) {
    parts.push(`${g.key}|${g.title}|${g.behavioral ? 'b' : ''}`);
    for (const o of g.options) parts.push(`${o.code}=${o.label}`);
  }
  for (const o of EQUIPMENT_OPTIONS) parts.push(`${o.code}=${o.label}|${o.tier}`);
  for (const o of BEHAVIOR_RISK_OPTIONS) parts.push(`${o.code}=${o.label}`);
  for (const o of CURRENT_SERVICE_OPTIONS) parts.push(`${o.code}=${o.label}`);

  let hash = 0x811c9dc5;
  const source = parts.join('\n');
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `v1-${hash.toString(16).padStart(8, '0')}`;
}

/**
 * The catalog this build speaks. Sent with every submission so the portal can
 * spot a form running an older or newer catalog than its own.
 *
 * Editing any option above changes the fingerprint and fails
 * diagnosisCatalog.test.ts until you update this constant — which is your cue
 * to copy this file into the other repository too.
 */
export const CATALOG_VERSION = 'v1-ff0b39ed';
