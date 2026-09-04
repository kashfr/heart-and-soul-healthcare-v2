/**
 * Shared progress-note completeness check.
 *
 * A single source of truth for "which required fields are still empty" so the
 * same answer powers both the nurse's submit-time validation and the admin
 * In-Progress inspector ("check for errors"). It operates on a *flat* note
 * data map (the shape a submitted note uses), so it can run against either a
 * live draft (see {@link flattenDraft}) or an already-submitted note.
 *
 * It encodes the form's required fields and their credential/condition gates:
 *   - Tab 1 (Client & Shift): always required.
 *   - Tab 2 (Since your last shift, rev 3+): three Yes/No answers required for
 *     every credential and program; Details required when any answer is Yes.
 *   - Tab 2 (Vitals): required for every credential except HHA. Every vital is
 *     satisfied by a reading OR the section-level "unable to obtain vitals"
 *     reason (q16_vitalsNotObtainedReason); blood pressure additionally
 *     accepts its own BP-specific "unable to obtain" reason.
 *   - Tab 4: the nutrition note is required only when aspiration concerns = Yes.
 *   - Tab 5 (Skilled Nursing): the intervention narrative is required for LPN/RN.
 *   - Tab 6: physician-notification details are required only when the nurse
 *     marked the physician as notified.
 *   - Tab 7 (Sign-off): always required, including the certification checkbox
 *     and the signature.
 *
 * Deliberately NOT enforced (matches the form): q60_conditionAtEnd is starred
 * in the UI but has no hard requirement, so it never blocks submission.
 */

import { isBpRoutinelyRequired } from './vitalRanges';
import { SHIFT_CHANGE_KEYS, shiftChangeAnyYes } from './shiftChange';

export interface NoteIssue {
  /** Field key (also the DOM id the nurse form scrolls to). */
  key: string;
  /** Human-readable field name for the report. */
  label: string;
  /** 1-based tab number the field lives on. */
  tab: number;
  /** Tab name shown to the admin ("go to Tab 2 — Status & Vitals"). */
  tabName: string;
}

export const NOTE_TAB_NAMES: Record<number, string> = {
  1: 'Client & Shift',
  2: 'Status & Vitals',
  3: 'Observations & Systems',
  4: 'Personal Care & Nutrition',
  5: 'Meds & Interventions',
  6: 'Education & Notifications',
  7: 'Summary & Signature',
};

/** The minimum slice of a draft this module needs. */
export interface FlattenableDraft {
  formValues?: Record<string, unknown> | null;
  radioState?: Record<string, string> | null;
  checkboxState?: Record<string, string[]> | null;
}

/**
 * Flatten a draft's three stores (RHF values, DeselectableRadio store, and
 * checkbox groups) into the single key→string map a submitted note uses.
 * Checkbox groups join with ", " exactly like the submit handler does.
 */
export function flattenDraft(draft: FlattenableDraft): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(draft.formValues || {})) {
    out[k] = v == null ? '' : String(v);
  }
  for (const [k, v] of Object.entries(draft.radioState || {})) {
    if (v) out[k] = v;
  }
  for (const [k, arr] of Object.entries(draft.checkboxState || {})) {
    out[k] = Array.isArray(arr) ? arr.join(', ') : String(arr ?? '');
  }
  return out;
}

const has = (data: Record<string, string>, key: string): boolean =>
  (data[key] ?? '').trim() !== '';

const isLpnRn = (cred: string): boolean => cred === 'LPN' || cred === 'RN';

interface Rule {
  key: string;
  label: string;
  tab: number;
  /** Whether this field is required given the data + credential. */
  applies: (data: Record<string, string>, cred: string) => boolean;
  /** Whether the requirement is satisfied. */
  filled: (data: Record<string, string>) => boolean;
}

const ALWAYS = (): boolean => true;
const simple = (key: string) => (d: Record<string, string>) => has(d, key);
/** A vital is filled by its own value OR the section-level "unable to obtain vitals" reason. */
const vitalOr = (key: string) => (d: Record<string, string>) =>
  has(d, key) || has(d, 'q16_vitalsNotObtainedReason');
/**
 * True when the note was authored on form revision 2 or later (the QEPR
 * update, Aug 2026). Notes submitted before the stamp existed have no
 * q1_formRev, so rev-gated rules never flag them retroactively — an admin
 * can open and amend an old note without being forced to invent answers for
 * fields that didn't exist when the visit happened.
 */
const isRev2 = (d: Record<string, string>): boolean => Number(d['q1_formRev'] || '0') >= 2;
/**
 * Form revision 3 (Sept 2026) added the "since your last shift" screening.
 * Same retroactivity rule as isRev2: older notes are never flagged for it.
 */
const isRev3 = (d: Record<string, string>): boolean => Number(d['q1_formRev'] || '0') >= 3;
/** QEPR rules bind only to DBHDD-waiver (NOW/COMP) clients — see programDocRequirements.ts. */
const isNowComp = (d: Record<string, string>): boolean => d['q2_program'] === 'now-comp';

const RULES: Rule[] = [
  // --- Tab 1: Client & Shift (always) ---
  { key: 'q3_clientName', label: 'Client name', tab: 1, applies: ALWAYS, filled: simple('q3_clientName') },
  { key: 'q4_dateofBirth', label: 'Date of birth', tab: 1, applies: ALWAYS, filled: simple('q4_dateofBirth') },
  { key: 'q10_primaryDiagnosis', label: 'Primary diagnosis', tab: 1, applies: ALWAYS, filled: simple('q10_primaryDiagnosis') },
  { key: 'q200_addr_line1', label: 'Street address', tab: 1, applies: ALWAYS, filled: simple('q200_addr_line1') },
  { key: 'q200_city', label: 'City', tab: 1, applies: ALWAYS, filled: simple('q200_city') },
  { key: 'q200_state', label: 'State', tab: 1, applies: ALWAYS, filled: simple('q200_state') },
  { key: 'q200_postal', label: 'ZIP code', tab: 1, applies: ALWAYS, filled: simple('q200_postal') },
  { key: 'q6_dateofService', label: 'Date of service', tab: 1, applies: ALWAYS, filled: simple('q6_dateofService') },
  { key: 'q7_shiftStart', label: 'Shift start time', tab: 1, applies: ALWAYS, filled: simple('q7_shiftStart') },
  { key: 'q11_nurseName', label: 'Nurse / caregiver name', tab: 1, applies: ALWAYS, filled: simple('q11_nurseName') },
  { key: 'q12_credential', label: 'Credential', tab: 1, applies: ALWAYS, filled: simple('q12_credential') },

  // --- Tab 2: since your last shift (rev-3 notes; every credential and program) ---
  // Hospital admission, urgent care / ER visit, medication started / changed /
  // stopped: each needs an explicit Yes or No so it can't be glanced past, and
  // a Yes needs Details. Only rev-3 notes: amending an older note must not
  // demand answers for a shift long past.
  { key: SHIFT_CHANGE_KEYS.hospitalAdmission, label: 'Since your last shift: hospital admission (Yes/No)', tab: 2, applies: (d) => isRev3(d), filled: simple(SHIFT_CHANGE_KEYS.hospitalAdmission) },
  { key: SHIFT_CHANGE_KEYS.erUrgentCare, label: 'Since your last shift: urgent care or ER visit (Yes/No)', tab: 2, applies: (d) => isRev3(d), filled: simple(SHIFT_CHANGE_KEYS.erUrgentCare) },
  { key: SHIFT_CHANGE_KEYS.medChange, label: 'Since your last shift: medication started, changed, or stopped (Yes/No)', tab: 2, applies: (d) => isRev3(d), filled: simple(SHIFT_CHANGE_KEYS.medChange) },
  { key: SHIFT_CHANGE_KEYS.details, label: 'Since your last shift: details (required when any answer is Yes)', tab: 2, applies: (d) => isRev3(d) && shiftChangeAnyYes(d), filled: simple(SHIFT_CHANGE_KEYS.details) },

  // --- Tab 2: Vitals (all credentials except HHA) ---
  // Each vital is satisfied by a reading OR the section-level "unable to
  // obtain vitals" reason: the reason documents whichever vitals were left
  // blank (partial sets are fine — recorded vitals still count on their own).
  { key: 'q16_temperature', label: 'Temperature (a reading or an "unable to obtain vitals" reason)', tab: 2, applies: (_d, c) => c !== 'HHA', filled: vitalOr('q16_temperature') },
  // Temperature route is required once a temperature value is present — a
  // reading can't be interpreted without knowing how it was taken.
  {
    key: 'q16_temperatureRoute',
    label: 'Temperature route',
    tab: 2,
    applies: (d, c) => c !== 'HHA' && has(d, 'q16_temperature'),
    filled: simple('q16_temperatureRoute'),
  },
  {
    key: 'q17_bloodPressure',
    label: 'Blood pressure (a reading or an "unable to obtain" reason)',
    tab: 2,
    // Routinely required from age 3 (AAP); under 3 BP is optional.
    applies: (d, c) =>
      c !== 'HHA' && isBpRoutinelyRequired(d['q5_ageYears'] || '', d['q4_dateofBirth']),
    filled: (d) =>
      (has(d, 'q17_systolic') && has(d, 'q17_diastolic')) ||
      has(d, 'q17_bpNotObtainedReason') ||
      has(d, 'q16_vitalsNotObtainedReason'),
  },
  { key: 'q18_pulse', label: 'Pulse (a reading or an "unable to obtain vitals" reason)', tab: 2, applies: (_d, c) => c !== 'HHA', filled: vitalOr('q18_pulse') },
  { key: 'q19_respiration', label: 'Respiration (a reading or an "unable to obtain vitals" reason)', tab: 2, applies: (_d, c) => c !== 'HHA', filled: vitalOr('q19_respiration') },
  { key: 'q20_oxygenSaturation', label: 'O₂ saturation (a reading or an "unable to obtain vitals" reason)', tab: 2, applies: (_d, c) => c !== 'HHA', filled: vitalOr('q20_oxygenSaturation') },
  // Oxygen source is required once an SpO2 value is present — the saturation
  // can't be interpreted without knowing how the patient was oxygenated.
  {
    key: 'q21_oxygenSource',
    label: 'Oxygen source (delivery for the recorded SpO₂)',
    tab: 2,
    applies: (d, c) => c !== 'HHA' && has(d, 'q20_oxygenSaturation'),
    filled: simple('q21_oxygenSource'),
  },

  // --- Tab 4: nutrition note (only when aspiration concerns = Yes) ---
  {
    key: 'q38_nutritionNotes',
    label: 'Nutrition notes (aspiration concerns documented)',
    tab: 4,
    applies: (d) => d['q38_aspirationConcerns'] === 'Yes',
    filled: simple('q38_nutritionNotes'),
  },

  // --- Tab 5: skilled-nursing narrative (LPN/RN only) ---
  { key: 'q39_interventionDetails', label: 'Intervention details narrative', tab: 5, applies: (_d, c) => isLpnRn(c), filled: simple('q39_interventionDetails') },

  // --- Tab 5: individual's response to interventions (QEPR SG 4; rev-2 notes, all programs) ---
  // Split out of the interventions narrative so the response can never be
  // skipped — the surveyor cited notes that described interventions but not
  // how the individual responded.
  {
    key: 'q39_individualResponse',
    label: "Individual's response to interventions",
    tab: 5,
    applies: (d, c) => isLpnRn(c) && isRev2(d),
    filled: simple('q39_individualResponse'),
  },

  // --- Tab 6: individual choice documentation (QEPR Choice FOA; NOW/COMP only) ---
  {
    key: 'q42_choicesMade',
    label: 'Choices the individual made or declined',
    tab: 6,
    applies: (d) => isRev2(d) && isNowComp(d),
    filled: simple('q42_choicesMade'),
  },

  // --- Tab 6: physician-notification details (only when notified = Yes) ---
  { key: 'q53_physicianName', label: 'Physician name', tab: 6, applies: (d) => d['q52_physicianNotify'] === 'Yes', filled: simple('q53_physicianName') },
  { key: 'q54_notificationTime', label: 'Time physician notified', tab: 6, applies: (d) => d['q52_physicianNotify'] === 'Yes', filled: simple('q54_notificationTime') },
  { key: 'q52_notifyMethod', label: 'Notification method', tab: 6, applies: (d) => d['q52_physicianNotify'] === 'Yes', filled: simple('q52_notifyMethod') },
  { key: 'q52_infoReported', label: 'Information reported to physician', tab: 6, applies: (d) => d['q52_physicianNotify'] === 'Yes', filled: simple('q52_infoReported') },
  { key: 'q55_physicianOrders', label: 'Physician response / new orders', tab: 6, applies: (d) => d['q52_physicianNotify'] === 'Yes', filled: simple('q55_physicianOrders') },

  // --- Tab 7: sign-off (always) ---
  { key: 'q62_shiftEndDate', label: 'Shift end date', tab: 7, applies: ALWAYS, filled: simple('q62_shiftEndDate') },
  { key: 'q62_shiftEndTime', label: 'Shift end time', tab: 7, applies: ALWAYS, filled: simple('q62_shiftEndTime') },
  { key: 'q60_oncomingCaregiver', label: 'Oncoming caregiver name', tab: 7, applies: ALWAYS, filled: simple('q60_oncomingCaregiver') },
  { key: 'q60_handoffTime', label: 'Handoff time', tab: 7, applies: ALWAYS, filled: simple('q60_handoffTime') },
  { key: 'q60_verbalReport', label: 'Verbal report summary', tab: 7, applies: ALWAYS, filled: simple('q60_verbalReport') },
  { key: 'q60_conditionAtEnd', label: 'Client condition at shift end', tab: 7, applies: ALWAYS, filled: simple('q60_conditionAtEnd') },
  { key: 'q65_certification', label: 'Certification checkbox', tab: 7, applies: ALWAYS, filled: simple('q65_certification') },
  { key: 'q61_signature', label: 'Signature', tab: 7, applies: ALWAYS, filled: simple('q61_signature') },
];

/**
 * Return every required field that's applicable to this note but still empty,
 * in tab order. An empty array means "no required fields are missing."
 */
export function getIncompleteRequired(flat: Record<string, string>): NoteIssue[] {
  // These rules describe the SHIFT progress note. Other document types in the
  // same collection (RN oversight visit notes) have their own rules — see
  // src/lib/oversightNote.ts — and must never be scored against these.
  if ((flat['noteType'] || '') === 'rn-oversight-visit') return [];
  const cred = (flat['q12_credential'] || '').trim();
  const issues: NoteIssue[] = [];
  for (const r of RULES) {
    if (r.applies(flat, cred) && !r.filled(flat)) {
      issues.push({ key: r.key, label: r.label, tab: r.tab, tabName: NOTE_TAB_NAMES[r.tab] ?? `Tab ${r.tab}` });
    }
  }
  return issues;
}

/** Convenience: run the check straight off a draft's three stores. */
export function getDraftIncompleteRequired(draft: FlattenableDraft): NoteIssue[] {
  return getIncompleteRequired(flattenDraft(draft));
}
