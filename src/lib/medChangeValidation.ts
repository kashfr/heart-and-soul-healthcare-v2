/**
 * Pure validation for the two "add / change / discontinue a medication" forms
 * (ManageMedsModal on the standalone MAR and MedChangeRequestModal on the
 * progress note). Both forms share the same clinical gates; this keeps them in
 * one testable place and returns the problems PER FIELD so each one can be
 * outlined and explained where it sits (the owner's rule: no lone banner).
 *
 * Every message here is a clinical safety gate carried over verbatim from the
 * modals; change the wording only with the owner.
 */
import { looksLikeUnknownPhysician, parseValueOptions } from './marShared';

export type MedChangeMode = 'add' | 'change' | 'discontinue';

export type MedChangeField =
  | 'targetOrderId'
  | 'medName'
  | 'dose'
  | 'units'
  | 'route'
  | 'times'
  | 'indication'
  | 'valueOptions'
  | 'orderingPhysician'
  | 'orderSignedDate'
  | 'doseTime'
  | 'doseByName'
  | 'reason';

export type MedChangeFieldErrors = Partial<Record<MedChangeField, string>>;

/** Top-to-bottom order of the fields on both forms, for the escort. */
export const MED_CHANGE_FIELD_ORDER: readonly MedChangeField[] = [
  'targetOrderId',
  'medName',
  'dose',
  'units',
  'route',
  'times',
  'indication',
  'valueOptions',
  'orderingPhysician',
  'orderSignedDate',
  'doseTime',
  'doseByName',
  'reason',
];

export interface MedChangeFormValues {
  mode: MedChangeMode;
  reason: string;
  /** Change / discontinue: the order being acted on. */
  targetOrderId: string;
  medName: string;
  dose: string;
  units: string;
  route: string;
  /** Derived from the frequency dropdown ("As needed (PRN)"). */
  isPRN: boolean;
  /** Scheduled times; blanks are ignored. */
  times: string[];
  indication: string;
  orderingPhysician: string;
  /** 'YYYY-MM-DD' or ''. */
  orderSignedDate: string;
  /** "I don't know the physician right now" escape hatch. */
  physicianUnknown: boolean;
  /** Check-style order (standalone MAR only). A non-blank label makes the
   *  order a check, which drops the dose/units requirement and requires a
   *  picklist of readings instead. */
  valueLabel?: string;
  /** Comma-separated allowed readings for a check-style order. */
  valueOptions?: string;
  /** Add-only "I administered a dose this shift" block (note modal only). */
  doseGiven?: boolean;
  doseByType?: string;
  doseByName?: string;
  doseTime?: string;
  /** Agency-local today, 'YYYY-MM-DD'; the signed-date gate compares to it. */
  today: string;
}

const REQUIRED_MED_FIELDS = 'Medication, dose, units, and route are required.';
const REQUIRED_CHECK_FIELDS = 'Name and route are required.';

export function validateMedChangeForm(v: MedChangeFormValues): MedChangeFieldErrors {
  const errors: MedChangeFieldErrors = {};

  if (!v.reason.trim()) errors.reason = 'A reason is required.';

  if (v.mode === 'discontinue') {
    if (!v.targetOrderId) errors.targetOrderId = 'Choose the medication to discontinue.';
    return errors;
  }

  if (v.mode === 'change' && !v.targetOrderId) errors.targetOrderId = 'Choose the medication to change.';

  // A check records a reading rather than an amount, so it needs no dose or
  // units; requiring them would force junk values onto the order.
  const isCheck = !!(v.valueLabel || '').trim();
  const requiredMsg = isCheck ? REQUIRED_CHECK_FIELDS : REQUIRED_MED_FIELDS;
  if (!v.medName.trim()) errors.medName = requiredMsg;
  if (!v.route.trim()) errors.route = requiredMsg;
  if (!isCheck) {
    if (!v.dose.trim()) errors.dose = REQUIRED_MED_FIELDS;
    if (!v.units.trim()) errors.units = REQUIRED_MED_FIELDS;
  }
  if (isCheck && parseValueOptions(v.valueOptions || '').length < 2) {
    errors.valueOptions = 'Add at least two allowed readings so the nurse picks from a list instead of typing.';
  }

  if (v.orderSignedDate && v.orderSignedDate > v.today) {
    errors.orderSignedDate = '"Physician order signed on" cannot be a future date.';
  }

  if (!v.physicianUnknown && looksLikeUnknownPhysician(v.orderingPhysician)) {
    errors.orderingPhysician = v.orderingPhysician.trim()
      ? 'Enter the ordering physician\'s actual name (placeholders like "N/A" don\'t document the order). If you don\'t know it right now, check the box below to flag it for follow-up.'
      : 'Ordering physician is required; this change reflects a physician order. If you don\'t know it right now, check the box below to flag it for follow-up.';
  }

  if (!v.isPRN && v.times.filter(Boolean).length === 0) {
    errors.times = 'Add at least one scheduled time, or choose the "As needed (PRN)" frequency.';
  }
  if (v.isPRN && !v.indication.trim()) {
    errors.indication = 'Add an indication: PRN doses are documented against what the med is for.';
  }

  if (v.mode === 'add' && v.doseGiven) {
    if (v.doseByType !== 'nurse' && !(v.doseByName || '').trim()) {
      errors.doseByName = 'Enter who administered the dose.';
    }
    // A one-off dose has no scheduled slot to fall back on: without a time
    // the record is untimed and the shift-window gate can't see it.
    if (!v.doseTime) errors.doseTime = 'Enter the time the dose was given.';
  }

  return errors;
}

/**
 * Which field a server-side rejection from /api/mar/change (or the staging
 * path) is about, judged from its message, so it can land on that field
 * instead of only in the banner. Null when the message names no field (auth,
 * network, "client not found"), which belongs next to the buttons.
 */
export function medChangeServerErrorField(message: string): MedChangeField | null {
  const m = message.toLowerCase();
  if (!m) return null;
  if (m.startsWith('a reason is required')) return 'reason';
  if (m.startsWith('choose the medication')) return 'targetOrderId';
  if (m.startsWith('medication, dose, units, and route')) return 'medName';
  if (m.includes('allowed readings')) return 'valueOptions';
  if (m.includes('signed on')) return 'orderSignedDate';
  if (m.includes('physician')) return 'orderingPhysician';
  if (m.includes('scheduled time')) return 'times';
  if (m.includes('indication')) return 'indication';
  return null;
}
