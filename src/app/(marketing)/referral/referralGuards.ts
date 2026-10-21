/**
 * The referral form's guard logic that does not need React: which required
 * field is which, where a blocked Submit takes the user, and what triggered
 * the behavioral stop. Kept out of page.tsx so it can be unit tested. Every
 * eligibility rule still lives in src/lib/diagnosisCatalog.ts; nothing here
 * decides whether a referral is blocked, only how the form explains it.
 */
import { firstErrorKey } from '@/lib/formEscort';
import {
  classifyFreeText,
  combinedDiagnosisPicture,
  diagnosisPicture,
  DIAGNOSIS_GROUPS,
  inferService,
  screenBehavioralPaidCaregiver,
} from '@/lib/diagnosisCatalog';

// The required fields, in display order across both steps, so a blocked
// "Next" or "Submit" escorts to the topmost problem.
export type ReferralField =
  | 'programInterest' | 'clientCounty' | 'clientFirstName' | 'clientLastName' | 'clientDOB' | 'clientPhone' | 'clientSecondaryPhone' | 'clientEmail'
  | 'referralSource' | 'relationship' | 'referrerName' | 'diagnoses' | 'equipment' | 'behaviorRisk' | 'seekingPaidCaregiver' | 'careNeeds' | 'paidCareBasis' | 'hasGuardianship' | 'wantsAgencyStaff';
export type ReferralFieldErrors = Partial<Record<ReferralField, string>>;
export const FIELD_ORDER: readonly ReferralField[] = [
  'programInterest', 'clientCounty', 'clientFirstName', 'clientLastName', 'clientDOB', 'clientPhone', 'clientSecondaryPhone', 'clientEmail',
  'referralSource', 'relationship', 'referrerName', 'diagnoses', 'equipment', 'behaviorRisk', 'seekingPaidCaregiver', 'careNeeds', 'paidCareBasis', 'hasGuardianship', 'wantsAgencyStaff',
];

/** Optional fields a stop panel can point at (they hold the free text the
 *  behavioral screen reads). */
export type ReferralAnchor = ReferralField | 'serviceNeeds' | 'additionalNotes';

/** The escort target for a field: the wrapper holding its label, control and
 *  message (for a checklist, the heading block above the list). */
export const fieldId = (k: ReferralAnchor) => `ref-field-${k}`;

/** The answers that can lift the behavioral or young-child stop: checking a
 *  medical diagnosis or a skilled need clears either one. While one of them is
 *  still blank the stop may exist only because of the blank. */
export const STOP_LIFTING_FIELDS: readonly ReferralField[] = ['diagnoses', 'equipment'];

export type BlockedEscort =
  | { kind: 'field'; key: ReferralField }
  | { kind: 'panel'; id: string }
  | null;

/**
 * Where a Submit attempt goes while a hard stop is active. A blank diagnosis
 * or equipment answer goes first (to the topmost missing field), so a family
 * whose child does qualify is never led to a refusal that one more checkbox
 * would clear. Otherwise the user goes to the panel that explains the stop.
 */
export function blockedSubmitEscort(
  errors: ReferralFieldErrors,
  activeBlockId: string | null,
): BlockedEscort {
  const first = firstErrorKey(FIELD_ORDER, errors);
  if (first && STOP_LIFTING_FIELDS.some((k) => errors[k])) return { kind: 'field', key: first };
  if (activeBlockId) return { kind: 'panel', id: activeBlockId };
  return first ? { kind: 'field', key: first } : null;
}

// --- What triggered the behavioral stop ----------------------------------------

export type BehavioralTrigger =
  | 'behaviorRisk'
  | 'diagnoses'
  | 'diagnosisOther'
  | 'serviceNeeds'
  | 'additionalNotes'
  | 'careNeeds';

export interface BehavioralTriggerInput {
  diagnoses: string[];
  diagnosisOther: string;
  equipment: string[];
  behaviorRisk: string;
  currentServices: string[];
  careNeeds: string;
  serviceNeeds: string;
  additionalNotes: string;
  /** 'yes' only for a GAPP paid-caregiver request, as the page passes it. */
  seekingPaidCaregiver: string;
}

const BEHAVIORAL_CODES = new Set(
  DIAGNOSIS_GROUPS.filter((g) => g.behavioral).flatMap((g) => g.options.map((o) => o.code)),
);

/**
 * Every answer that contributes to the behavioral paid-caregiver stop, in
 * the order they appear on the page. Mirrors screenBehavioralPaidCaregiver: the
 * stop fires when the service inference says behavioral (behaviors that need
 * help to manage, a behavioral-only diagnosis with nothing else reported, or
 * the care-need answer), or when the whole diagnosis picture (checkboxes,
 * Other, and the free-text needs and notes) is behavioral with no skilled
 * equipment. Empty when the stop is not active.
 */
export function behavioralBlockTriggers(input: BehavioralTriggerInput): BehavioralTrigger[] {
  const freeText = `${input.serviceNeeds} ${input.additionalNotes}`;
  const screenInput = {
    diagnoses: input.diagnoses,
    diagnosisOther: input.diagnosisOther,
    equipment: input.equipment,
    behaviorRisk: input.behaviorRisk,
    currentServices: input.currentServices,
    careNeeds: input.careNeeds,
    freeText,
    seekingPaidCaregiver: input.seekingPaidCaregiver,
  };
  if (screenBehavioralPaidCaregiver(screenInput) === null) return [];

  const inferred = inferService(screenInput);
  const byInference = inferred.service === 'behavioral';
  const byPicture =
    inferred.source !== 'equipment' &&
    combinedDiagnosisPicture(input.diagnoses, input.diagnosisOther, freeText) === 'behavioral';
  const structuredBehavioral = diagnosisPicture(input.diagnoses, input.diagnosisOther) === 'behavioral';

  const out: BehavioralTrigger[] = [];
  if (byPicture) {
    if (classifyFreeText(input.serviceNeeds) === 'behavioral') out.push('serviceNeeds');
    if (classifyFreeText(input.additionalNotes) === 'behavioral') out.push('additionalNotes');
  }
  if (structuredBehavioral && ((byInference && inferred.source === 'diagnosis') || byPicture)) {
    if (input.diagnoses.some((c) => BEHAVIORAL_CODES.has(c))) out.push('diagnoses');
    if (classifyFreeText(input.diagnosisOther) === 'behavioral') out.push('diagnosisOther');
  }
  if (byInference && inferred.source === 'behavior') out.push('behaviorRisk');
  if (input.careNeeds === 'behavioral') out.push('careNeeds');
  return out;
}

/** One sentence per trigger, shown in the behavioral stop panel. */
export const BEHAVIORAL_TRIGGER_TEXT: Record<BehavioralTrigger, string> = {
  diagnoses: 'The diagnoses you checked are all developmental or behavioral, with no medical condition checked.',
  diagnosisOther: 'What you wrote under Other describes autism or developmental needs.',
  behaviorRisk: 'You told us about behaviors that happen often and need help to manage.',
  serviceNeeds: 'What you wrote under Description of Service Needs describes autism or developmental needs.',
  additionalNotes: 'What you wrote under Additional Notes describes autism or developmental needs.',
  careNeeds: 'You chose Behavioral Support or Autism-Related Needs as the main help needed.',
};

/** The in-form link to each trigger's control, one per control (the
 *  checkboxes and the Other box share the diagnosis question). */
export function behavioralTriggerLinks(
  triggers: readonly BehavioralTrigger[],
): { anchor: string; label: string }[] {
  const LINK: Record<BehavioralTrigger, { anchor: ReferralAnchor; label: string }> = {
    diagnoses: { anchor: 'diagnoses', label: 'Review the Diagnoses' },
    diagnosisOther: { anchor: 'diagnoses', label: 'Review the Diagnoses' },
    behaviorRisk: { anchor: 'behaviorRisk', label: 'Review the Behavior Answer' },
    serviceNeeds: { anchor: 'serviceNeeds', label: 'Review the Service Needs' },
    additionalNotes: { anchor: 'additionalNotes', label: 'Review the Additional Notes' },
    careNeeds: { anchor: 'careNeeds', label: 'Review the Main Care Need' },
  };
  const seen = new Set<string>();
  const links: { anchor: string; label: string }[] = [];
  for (const t of triggers) {
    const { anchor, label } = LINK[t];
    const id = fieldId(anchor);
    if (seen.has(id)) continue;
    seen.add(id);
    links.push({ anchor: id, label });
  }
  return links;
}
