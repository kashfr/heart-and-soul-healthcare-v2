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
  | 'signature';

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
    revisesPlanId: text('revisesPlanId', 128).trim(),
  };
}

/** A filed plan, opened as the starting point of a revision. The signature and
 *  the signer are never carried over: the new plan is signed fresh. */
export function draftFromPlan(plan: ServicePlanRecord, signer: { name: string; credentials: string }): ServicePlanInput {
  const base = sanitizeServicePlanInput(plan);
  const goals = usedGoals(base.goals).map((g) => ({ ...g }));
  return {
    ...base,
    goals: goals.length ? goals : [{ goal: '', objective: '' }],
    supervisorName: signer.name,
    supervisorCredentials: signer.credentials,
    signature: '',
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

/** Plans are revised on the client's own schedule; a plan older than this is
 *  flagged on Survey readiness as a baseline the compliance nurse can tune. */
export const SERVICE_PLAN_MAX_DAYS = 365;

/** The Documents category the signed PDF is filed under. */
export const SERVICE_PLAN_DOC_CATEGORY = 'Service Plan';
