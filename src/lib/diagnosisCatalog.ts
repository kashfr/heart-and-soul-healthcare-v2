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
