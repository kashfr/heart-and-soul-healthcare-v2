/**
 * Service Plan: the agency's two-page "Service Plan" form (revised), written
 * and signed by a supervisor for each client and revised as the client's needs
 * change. Every submission is a new, signed, immutable plan; the newest one is
 * the current plan. Pure module: types, validation, prefill helpers. Shared by
 * the form, the API route, the PDF and the tests.
 */

export const SERVICE_TYPES = [
  { key: 'companion-sitter', label: 'Companion/Sitter' },
  { key: 'personal-care-assistant', label: 'Personal Care Assistant' },
  { key: 'nursing', label: 'Nursing' },
] as const;
export type ServiceTypeKey = (typeof SERVICE_TYPES)[number]['key'];

export const SPECIAL_DIETS = [
  { key: 'low-salt', label: 'Low salt' },
  { key: 'low-fat', label: 'Low fat' },
  { key: 'low-cholesterol', label: 'Low cholesterol' },
] as const;
export type SpecialDietKey = (typeof SPECIAL_DIETS)[number]['key'];

export type YesNo = 'yes' | 'no';

/** Who the plan was developed with (111-8-65-.11(1): the client, the
 *  responsible party, and for nursing services the personal physician). */
export const DEVELOPED_WITH = [
  { key: 'client', label: 'Client' },
  { key: 'responsible-party', label: 'Responsible party / caregiver' },
  { key: 'physician', label: 'Personal physician' },
] as const;
export type DevelopedWithKey = (typeof DEVELOPED_WITH)[number]['key'];

export interface ServicePlanGoal {
  goal: string;
  objective: string;
}

/** What the form submits. Name and date of birth are NOT here: the server
 *  snapshots them from the client record, so a plan can never be filed under
 *  a name that was typed over. */
export interface ServicePlanInput {
  patientId: string;
  address: string;
  diagnosis: string;
  functionalLimitations: string;
  serviceTypes: ServiceTypeKey[];
  nutritionalNeeds: string;
  allergies: string;
  expectedTimesFrequency: string;
  expectedDuration: string;
  descriptionOfServices: string;
  regularDiet: YesNo | '';
  specialDiets: SpecialDietKey[];
  specialDietOther: string;
  specialTreatments: string;
  specialEquipment: string;
  behaviors: string;
  tubBath: YesNo | '';
  bedBath: YesNo | '';
  lotionToBack: YesNo | '';
  goals: ServicePlanGoal[];
  medications: string;
  dischargePlans: string;
  supervisorName: string;
  supervisorCredentials: string;
  /** PNG data URL from the signature pad. */
  signature: string;
  /** Optional. GAPP section 916 asks for the caregiver's signature on the
   *  nursing care plan; other programs may leave it blank. */
  caregiverName: string;
  caregiverRelationship: string;
  caregiverSignature: string;
  /** Optional: who took part in writing the plan, and their names. */
  developedWith: DevelopedWithKey[];
  developedWithNotes: string;
  /** The plan this one revises, when it was started from an earlier plan. */
  revisesPlanId: string;
}

/** A filed plan, as the API returns it (timestamps as ISO strings). */
export interface ServicePlanRecord extends ServicePlanInput {
  id: string;
  clientName: string;
  /** YYYY-MM-DD */
  dob: string;
  /** YYYY-MM-DD, agency time, set by the server when the plan is signed. */
  signedDate: string;
  createdAt: string | null;
  createdBy: string;
  createdByName: string;
  /** The PDF filed under the client's Documents, when filing succeeded. */
  documentId: string;
  /** "Reviewed, no changes" attestations on this plan, oldest first. */
  reviews: ServicePlanReview[];
}

/**
 * A supervisor's attestation that the plan was reviewed and still reflects
 * the client's needs. Restarts the 62-day clock without writing a new plan.
 */
export interface ServicePlanReview {
  id: string;
  planId: string;
  patientId: string;
  /** YYYY-MM-DD, agency time, set by the server. */
  reviewedDate: string;
  reviewerUid: string;
  reviewerName: string;
  reviewerCredentials: string;
  signature: string;
  note: string;
  /** Differences from the current record the reviewer confirmed do not change
   *  the plan, as shown to them at review time. */
  differencesAcknowledged: string[];
  documentId: string;
  createdAt: string | null;
}

export interface ServicePlanReviewInput {
  reviewerName: string;
  reviewerCredentials: string;
  signature: string;
  note: string;
  differencesAcknowledged: string[];
  /** The reviewer ticked "still reflects the client's needs". */
  attested: boolean;
}

export const EMPTY_REVIEW_INPUT: ServicePlanReviewInput = {
  reviewerName: '',
  reviewerCredentials: '',
  signature: '',
  note: '',
  differencesAcknowledged: [],
  attested: false,
};

export type ReviewErrorKey = 'attested' | 'note' | 'reviewerName' | 'reviewerCredentials' | 'signature';
export const REVIEW_ERROR_ORDER: readonly ReviewErrorKey[] = ['attested', 'note', 'reviewerName', 'reviewerCredentials', 'signature'];
export const REVIEW_FIELD_LABEL: Record<ReviewErrorKey, string> = {
  attested: 'Review statement',
  note: 'Note',
  reviewerName: 'Reviewer printed name',
  reviewerCredentials: 'Reviewer credentials',
  signature: 'Reviewer signature',
};

/** When the record differs from the plan, the reviewer must say why the plan
 *  still stands, in at least a sentence. */
export function validateReview(r: ServicePlanReviewInput): Partial<Record<ReviewErrorKey, string>> {
  const e: Partial<Record<ReviewErrorKey, string>> = {};
  if (!r.attested) e.attested = 'Confirm the plan still reflects the client\'s needs, or revise the plan instead.';
  if (r.differencesAcknowledged.length > 0 && r.note.trim().length < 15) e.note = 'Explain why the differences listed above do not change the plan, or revise the plan instead.';
  if (!r.reviewerName.trim()) e.reviewerName = "Enter the reviewer's printed name.";
  if (!r.reviewerCredentials.trim()) e.reviewerCredentials = "Enter the reviewer's credentials (for example RN).";
  if (!r.signature) e.signature = 'Sign the review.';
  return e;
}

export function sanitizeReviewInput(raw: unknown): ServicePlanReviewInput {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    reviewerName: String(r.reviewerName ?? '').slice(0, 200),
    reviewerCredentials: String(r.reviewerCredentials ?? '').slice(0, 60),
    signature: String(r.signature ?? ''),
    note: String(r.note ?? '').slice(0, 2000),
    differencesAcknowledged: (Array.isArray(r.differencesAcknowledged) ? r.differencesAcknowledged : []).slice(0, 50).map((x) => String(x).slice(0, 400)),
    attested: r.attested === true,
  };
}

export const EMPTY_SERVICE_PLAN_INPUT: ServicePlanInput = {
  patientId: '',
  address: '',
  diagnosis: '',
  functionalLimitations: '',
  serviceTypes: [],
  nutritionalNeeds: '',
  allergies: '',
  expectedTimesFrequency: '',
  expectedDuration: '',
  descriptionOfServices: '',
  regularDiet: '',
  specialDiets: [],
  specialDietOther: '',
  specialTreatments: '',
  specialEquipment: '',
  behaviors: '',
  tubBath: '',
  bedBath: '',
  lotionToBack: '',
  goals: [{ goal: '', objective: '' }],
  medications: '',
  dischargePlans: '',
  supervisorName: '',
  supervisorCredentials: '',
  signature: '',
  caregiverName: '',
  caregiverRelationship: '',
  caregiverSignature: '',
  developedWith: [],
  developedWithNotes: '',
  revisesPlanId: '',
};

export const SERVICE_PLAN_TEXT_MAX = 4000;
export const SERVICE_PLAN_SHORT_MAX = 300;
export const SERVICE_PLAN_MAX_GOALS = 30;

export type ServicePlanErrorKey =
  | 'patientId'
  | 'address'
  | 'diagnosis'
  | 'functionalLimitations'
  | 'serviceTypes'
  | 'nutritionalNeeds'
  | 'allergies'
  | 'expectedTimesFrequency'
  | 'expectedDuration'
  | 'descriptionOfServices'
  | 'regularDiet'
  | 'tubBath'
  | 'bedBath'
  | 'lotionToBack'
  | 'goals'
  | 'medications'
  | 'dischargePlans'
  | 'supervisorName'
  | 'supervisorCredentials'
  | 'signature'
  | 'caregiverName'
  | 'caregiverSignature';

export type ServicePlanFieldErrors = Partial<Record<ServicePlanErrorKey, string>>;

/** Display order on the form: the escort goes to the first of these with an error. */
export const SERVICE_PLAN_ERROR_ORDER: readonly ServicePlanErrorKey[] = [
  'patientId',
  'address',
  'diagnosis',
  'functionalLimitations',
  'serviceTypes',
  'nutritionalNeeds',
  'allergies',
  'expectedTimesFrequency',
  'expectedDuration',
  'descriptionOfServices',
  'regularDiet',
  'tubBath',
  'bedBath',
  'lotionToBack',
  'goals',
  'medications',
  'dischargePlans',
  'supervisorName',
  'supervisorCredentials',
  'signature',
  'caregiverName',
  'caregiverSignature',
];

export const SERVICE_PLAN_FIELD_LABEL: Record<ServicePlanErrorKey, string> = {
  patientId: 'Client',
  address: 'Address',
  diagnosis: 'Diagnosis',
  functionalLimitations: 'Client functional limitations',
  serviceTypes: 'Types of services required',
  nutritionalNeeds: 'Nutritional needs',
  allergies: 'Allergies',
  expectedTimesFrequency: 'Expected times and frequency of service delivery',
  expectedDuration: 'Expected duration of services',
  descriptionOfServices: 'Description of services to be provided',
  regularDiet: 'Regular diet',
  tubBath: 'Tub bath',
  bedBath: 'Bed bath',
  lotionToBack: 'Applying lotion to back',
  goals: 'Goals and objectives',
  medications: 'Medications',
  dischargePlans: 'Discharge plans',
  supervisorName: 'Supervisor printed name',
  supervisorCredentials: 'Supervisor credentials',
  signature: 'Supervisor signature',
  caregiverName: 'Caregiver printed name',
  caregiverSignature: 'Caregiver signature',
};

const isYesNo = (v: unknown): v is YesNo => v === 'yes' || v === 'no';
const filled = (v: string) => v.trim().length > 0;

/** Rows the supervisor actually used: a row left completely blank is ignored. */
export function usedGoals(goals: ServicePlanGoal[]): ServicePlanGoal[] {
  return goals.filter((g) => filled(g.goal) || filled(g.objective));
}

/**
 * Field-level validation, one message per field, keyed for the escort.
 * Every narrative line on the paper form is required so a surveyor never
 * finds a blank; "None" is an acceptable answer where that is the truth.
 * Special treatments, special equipment, behaviors and the special-diet
 * boxes are the form's own optional lines and stay optional.
 */
export function validateServicePlan(p: ServicePlanInput): ServicePlanFieldErrors {
  const e: ServicePlanFieldErrors = {};
  if (!filled(p.patientId)) e.patientId = 'Choose the client.';
  if (!filled(p.address)) e.address = "Enter the client's address.";
  if (!filled(p.diagnosis)) e.diagnosis = 'Enter the diagnosis.';
  if (!filled(p.functionalLimitations)) e.functionalLimitations = "Describe the client's functional limitations.";
  if (p.serviceTypes.length === 0) e.serviceTypes = 'Check at least one type of service.';
  if (!filled(p.nutritionalNeeds)) e.nutritionalNeeds = 'Describe the nutritional needs, or write "None".';
  if (!filled(p.allergies)) e.allergies = 'List the allergies, or write "No known allergies".';
  if (!filled(p.expectedTimesFrequency)) e.expectedTimesFrequency = 'Enter the expected times and frequency of service delivery.';
  if (!filled(p.expectedDuration)) e.expectedDuration = 'Enter the expected duration of services.';
  if (!filled(p.descriptionOfServices)) e.descriptionOfServices = 'Describe the services to be provided.';
  if (!isYesNo(p.regularDiet)) e.regularDiet = 'Answer whether the client is on a regular diet.';
  if (!isYesNo(p.tubBath)) e.tubBath = 'Answer Yes or No for tub bath.';
  if (!isYesNo(p.bedBath)) e.bedBath = 'Answer Yes or No for bed bath.';
  if (!isYesNo(p.lotionToBack)) e.lotionToBack = 'Answer Yes or No for applying lotion to back.';
  const goals = usedGoals(p.goals);
  if (goals.length === 0) e.goals = 'Enter at least one goal with its objective.';
  else if (goals.some((g) => !filled(g.goal) || !filled(g.objective))) e.goals = 'Every goal needs an objective, and every objective needs a goal.';
  if (!filled(p.medications)) e.medications = 'List the medications, or write "None".';
  if (!filled(p.dischargePlans)) e.dischargePlans = 'Describe the discharge plans.';
  if (!filled(p.supervisorName)) e.supervisorName = "Enter the supervisor's printed name.";
  if (!filled(p.supervisorCredentials)) e.supervisorCredentials = "Enter the supervisor's credentials (for example RN).";
  if (!p.signature) e.signature = 'Sign the plan.';
  // The caregiver block is optional, but half of it is not a signature.
  if (p.caregiverSignature && !filled(p.caregiverName)) e.caregiverName = "Enter the caregiver's printed name, or clear their signature.";
  if (filled(p.caregiverName) && !p.caregiverSignature) e.caregiverSignature = 'Have the caregiver sign, or clear their name.';
  return e;
}

/**
 * Coerce whatever arrived (a JSON body, a stored document) into a well-typed
 * input: unknown keys dropped, strings capped, enums checked. Used by the API
 * route before validation and when a plan is read back into the form.
 */
export function sanitizeServicePlanInput(raw: unknown): ServicePlanInput {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const text = (k: string, max = SERVICE_PLAN_TEXT_MAX) => String(r[k] ?? '').slice(0, max);
  const yn = (k: string): YesNo | '' => (isYesNo(r[k]) ? r[k] : '');
  const serviceTypes = Array.isArray(r.serviceTypes)
    ? SERVICE_TYPES.map((t) => t.key).filter((k) => (r.serviceTypes as unknown[]).includes(k))
    : [];
  const specialDiets = Array.isArray(r.specialDiets)
    ? SPECIAL_DIETS.map((t) => t.key).filter((k) => (r.specialDiets as unknown[]).includes(k))
    : [];
  const developedWith = Array.isArray(r.developedWith)
    ? DEVELOPED_WITH.map((t) => t.key).filter((k) => (r.developedWith as unknown[]).includes(k))
    : [];
  const goals = (Array.isArray(r.goals) ? r.goals : [])
    .slice(0, SERVICE_PLAN_MAX_GOALS)
    .map((g) => {
      const x = (g && typeof g === 'object' ? g : {}) as Record<string, unknown>;
      return { goal: String(x.goal ?? '').slice(0, 1000), objective: String(x.objective ?? '').slice(0, 1000) };
    });
  return {
    patientId: text('patientId', 128).trim(),
    address: text('address', SERVICE_PLAN_SHORT_MAX),
    diagnosis: text('diagnosis', 1000),
    functionalLimitations: text('functionalLimitations'),
    serviceTypes,
    nutritionalNeeds: text('nutritionalNeeds', 1000),
    allergies: text('allergies', 1000),
    expectedTimesFrequency: text('expectedTimesFrequency', 1000),
    expectedDuration: text('expectedDuration', SERVICE_PLAN_SHORT_MAX),
    descriptionOfServices: text('descriptionOfServices'),
    regularDiet: yn('regularDiet'),
    specialDiets,
    specialDietOther: text('specialDietOther', SERVICE_PLAN_SHORT_MAX),
    specialTreatments: text('specialTreatments', 1000),
    specialEquipment: text('specialEquipment', 1000),
    behaviors: text('behaviors'),
    tubBath: yn('tubBath'),
    bedBath: yn('bedBath'),
    lotionToBack: yn('lotionToBack'),
    goals: goals.length ? goals : [{ goal: '', objective: '' }],
    medications: text('medications'),
    dischargePlans: text('dischargePlans'),
    supervisorName: text('supervisorName', 200),
    supervisorCredentials: text('supervisorCredentials', 60),
    signature: String(r.signature ?? ''),
    caregiverName: text('caregiverName', 200),
    caregiverRelationship: text('caregiverRelationship', 100),
    caregiverSignature: String(r.caregiverSignature ?? ''),
    developedWith,
    developedWithNotes: text('developedWithNotes', 1000),
    revisesPlanId: text('revisesPlanId', 128).trim(),
  };
}

const sameName = (a: string, b: string) => !!a.trim() && a.trim().toLowerCase() === b.trim().toLowerCase();

/** A filed plan, opened as the starting point of a revision. The signature and
 *  the signer are never carried over: the new plan is signed fresh. */
export function draftFromPlan(plan: ServicePlanRecord, signer: { name: string; credentials: string }): ServicePlanInput {
  const base = sanitizeServicePlanInput(plan);
  const goals = usedGoals(base.goals).map((g) => ({ ...g }));
  return {
    ...base,
    goals: goals.length ? goals : [{ goal: '', objective: '' }],
    supervisorName: signer.name,
    // A profile without a credential falls back to what the same person
    // typed on the earlier plan, so they don't retype it every revision.
    supervisorCredentials: signer.credentials || (sameName(plan.supervisorName, signer.name) ? base.supervisorCredentials : ''),
    signature: '',
    // A revision is signed, and developed, afresh.
    caregiverName: '',
    caregiverRelationship: '',
    caregiverSignature: '',
    developedWith: [],
    developedWithNotes: '',
    revisesPlanId: plan.id,
  };
}

export interface MedLine {
  medName: string;
  dose?: string;
  units?: string;
  route?: string;
  frequency: string;
}

/** One line per active order, the way the MAR prints it. */
export function medicationsText(orders: MedLine[]): string {
  return orders
    .map((o) => [o.medName, [o.dose, o.units].filter(Boolean).join(' '), o.route, o.frequency].map((x) => (x || '').trim()).filter(Boolean).join(', '))
    .filter(Boolean)
    .join('\n');
}

export interface TaskLine {
  name: string;
  frequency?: string;
  instructions?: string;
}

/** One line per approved care-plan task, as a starting description of services. */
export function servicesTextFromTasks(tasks: TaskLine[]): string {
  return tasks
    .map((t) => {
      const name = (t.name || '').trim();
      if (!name) return '';
      const freq = (t.frequency || '').trim();
      const notes = (t.instructions || '').trim();
      return `${name}${freq ? ` (${freq})` : ''}${notes ? `: ${notes}` : ''}`;
    })
    .filter(Boolean)
    .join('\n');
}

/** The paper form's line: "Companion/Sitter, Nursing". */
export function serviceTypesLabel(keys: readonly string[]): string {
  return SERVICE_TYPES.filter((t) => keys.includes(t.key)).map((t) => t.label).join(', ');
}

export function specialDietLabel(keys: readonly string[], other: string): string {
  const parts: string[] = SPECIAL_DIETS.filter((t) => keys.includes(t.key)).map((t) => t.label);
  if (other.trim()) parts.push(`Other: ${other.trim()}`);
  return parts.join(', ');
}

export const yesNoLabel = (v: YesNo | ''): string => (v === 'yes' ? 'Yes' : v === 'no' ? 'No' : '');

/** 111-8-65-.11(2): nursing service plans are reviewed and updated at least
 *  every 62 days. Every Heart and Soul client receives nursing, so this is the
 *  clock; a review or a revision restarts it. */
export const SERVICE_PLAN_MAX_DAYS = 62;

export function developedWithLabel(keys: readonly string[], notes: string): string {
  const parts: string[] = DEVELOPED_WITH.filter((t) => keys.includes(t.key)).map((t) => t.label);
  const who = parts.join(', ');
  const n = notes.trim();
  return who && n ? `${who} (${n})` : who || n;
}

/** Latest activity on a plan: its signing or its newest review. */
export function lastReviewedISO(plan: Pick<ServicePlanRecord, 'signedDate' | 'reviews'>): string {
  return [plan.signedDate, ...plan.reviews.map((r) => r.reviewedDate)].filter(Boolean).sort().pop() || '';
}

/** YYYY-MM-DD plus n days, calendar arithmetic in UTC (no DST drift). */
export function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export interface CurrentRecord {
  diagnosis: string;
  allergies: string;
  diet: string;
  /** Active MAR orders. */
  activeMeds: string[];
  /** Orders no longer active (discontinued, or past their end date). */
  inactiveMeds: string[];
  /** Approved, active care-plan task names. */
  tasks: string[];
}

/**
 * What in today's record the plan no longer matches, in words a nurse can act
 * on. Record fields left blank are not compared; wording that only differs in
 * case or punctuation is not a difference.
 */
export function planDifferences(plan: Pick<ServicePlanInput, 'diagnosis' | 'allergies' | 'nutritionalNeeds' | 'medications' | 'descriptionOfServices'>, cur: CurrentRecord): string[] {
  const out: string[] = [];
  const differs = (planText: string, recordText: string) => !!norm(recordText) && norm(planText) !== norm(recordText);
  if (differs(plan.diagnosis, cur.diagnosis)) out.push(`Diagnosis: the client record now says "${cur.diagnosis.trim()}".`);
  if (differs(plan.allergies, cur.allergies)) out.push(`Allergies: the client record now says "${cur.allergies.trim()}".`);
  if (differs(plan.nutritionalNeeds, cur.diet)) out.push(`Diet: the client record now says "${cur.diet.trim()}".`);
  const meds = norm(plan.medications);
  const active = new Set(cur.activeMeds.map(norm));
  for (const m of cur.activeMeds) if (norm(m) && !meds.includes(norm(m))) out.push(`Medication on the MAR but not in the plan: ${m}.`);
  for (const m of cur.inactiveMeds) if (norm(m) && !active.has(norm(m)) && meds.includes(norm(m))) out.push(`Medication in the plan but no longer active on the MAR: ${m}.`);
  const services = norm(plan.descriptionOfServices);
  for (const t of cur.tasks) if (norm(t) && !services.includes(norm(t))) out.push(`Care-plan task not in the description of services: ${t}.`);
  return out;
}

/** The Documents category the signed PDF is filed under. */
export const SERVICE_PLAN_DOC_CATEGORY = 'Service Plan';
