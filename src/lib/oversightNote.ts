// RN Oversight Visit Note — domain constants and required-field rules.
//
// The in-app version of the "one consistent oversight template" recommended
// by the QEPR 18119 exit report. Sections mirror the Word template v1
// (Documents/QEPR Documents/Resources) and map to the FY2027 Qlarant Nursing
// Services tool indicators and DBHDD policy 02-808 expectations.
//
// Oversight notes are stored in the same `progressNotes` collection as shift
// notes, discriminated by `noteType: 'rn-oversight-visit'`, and reuse the
// shift note's identity keys (q3_clientName, q4_dateofBirth,
// q6_dateofService, q11_nurseName, q12_credential, q61_signature, patientId,
// q1_formRev, q2_program, q2_serviceLevel) so the admin submissions list,
// audit trail, corrections, and batch export all work unchanged. Everything
// oversight-specific lives under the `ov_` prefix — deliberately NOT q-number
// keys, so it can never collide with present or future shift-note fields
// (q56_incidents taught us that lesson).

export const OVERSIGHT_NOTE_TYPE = 'rn-oversight-visit';

export const isOversightNote = (data: Record<string, unknown> | null | undefined): boolean =>
  !!data && data.noteType === OVERSIGHT_NOTE_TYPE;

/** Fixed appointment rows on the form (flat storage keeps drafts/audit simple). */
export const OVERSIGHT_APPT_ROWS = [1, 2, 3, 4] as const;

export interface OversightIssue {
  /** Field key; also the DOM id (or wrapper id for radio groups) to scroll to. */
  key: string;
  label: string;
}

import { isBpRoutinelyRequired } from './vitalRanges';

const has = (d: Record<string, string>, k: string): boolean => (d[k] ?? '').trim() !== '';
/** A vital is filled by its own value OR the section-level "unable to obtain vitals" reason. */
const vitalOr = (key: string) => (d: Record<string, string>) => has(d, key) || has(d, 'q16_vitalsNotObtainedReason');
/** Rev 3 (10/2026) added the vitals block; earlier notes are amended without it. */
const rev3 = (d: Record<string, string>) => Number(d.q1_formRev || '0') >= 3;

/** The form revision a new oversight note is saved as. */
export const OVERSIGHT_FORM_REV = '3';

/**
 * Where the visit took place (DBHDD 02-808 A.9.b.iii and COMP 2903.1.3 ask
 * for the "location where the service was delivered", not an address).
 * The dropdown answer lives in `ov_locationChoice`; the printed value is
 * always `ov_location` (the choice, or the typed place for "Other").
 */
export const OVERSIGHT_LOCATION_OTHER = 'Other';
export const OVERSIGHT_LOCATIONS = ["Client's Home", 'Day Program', OVERSIGHT_LOCATION_OTHER] as const;

/**
 * The dropdown answer for a stored location. Notes written before the
 * dropdown hold free text ("Client's Home", "individual's home"): a home
 * maps to "Client's Home", a day program to "Day Program", anything else to
 * "Other" with the text kept.
 */
export function locationChoiceFor(stored: string): { choice: string; other: string } {
  const t = (stored || '').trim();
  if (!t) return { choice: '', other: '' };
  const exact = OVERSIGHT_LOCATIONS.find((o) => o !== OVERSIGHT_LOCATION_OTHER && o.toLowerCase() === t.toLowerCase());
  if (exact) return { choice: exact, other: '' };
  if (/^(the )?((client|individual|member|patient)[\u2019']?s? )?home$/i.test(t)) return { choice: OVERSIGHT_LOCATIONS[0], other: '' };
  if (/^(the )?day program$/i.test(t)) return { choice: 'Day Program', other: '' };
  return { choice: OVERSIGHT_LOCATION_OTHER, other: t };
}

/** The printed location for a dropdown answer (the typed place for "Other"). */
export function locationFromChoice(choice: string, other: string): string {
  return choice === OVERSIGHT_LOCATION_OTHER ? (other || '').trim() : choice;
}

interface OvRule {
  key: string;
  label: string;
  applies?: (d: Record<string, string>) => boolean;
  /** Custom completeness check; defaults to "the key is non-empty". */
  filled?: (d: Record<string, string>) => boolean;
}

/**
 * Required fields for a complete oversight visit note, in document order.
 * Radio-store answers and RHF text fields are both validated off the merged
 * flat record, exactly like the shift note's noteValidation layer.
 */
const OVERSIGHT_RULES: OvRule[] = [
  { key: 'q3_clientName', label: 'Individual (select from the roster)' },
  { key: 'q6_dateofService', label: 'Date of visit' },
  { key: 'ov_timeIn', label: 'Time in' },
  { key: 'ov_timeOut', label: 'Time out' },
  { key: 'ov_locationChoice', label: 'Visit location' },
  {
    key: 'ov_locationOther',
    label: 'Where the visit took place (for "Other")',
    applies: (d) => d.ov_locationChoice === OVERSIGHT_LOCATION_OTHER,
  },
  { key: 'ov_visitType', label: 'Visit type' },
  { key: 'q11_nurseName', label: 'RN name' },

  // 1. Status & observations
  { key: 'ov_generalCondition', label: 'General condition and changes since last visit' },

  // Vitals (rev 3, 10/2026): the shift note's block and rules, the same as
  // the supervisory visit (supervisoryVisit.ts). 02-808 A.1.a.ii requires a
  // monthly face-to-face physical assessment with objective data. Every
  // vital is a reading or the "unable to obtain vitals" reason; BP is
  // routinely required from age 3 and also satisfied by its own reason; a
  // route or oxygen source is required once its reading is present.
  { key: 'q16_temperature', label: 'Temp (a reading or an "unable to obtain vitals" reason)', applies: rev3, filled: vitalOr('q16_temperature') },
  {
    key: 'q16_temperatureRoute',
    label: 'Temperature route',
    applies: (d) => rev3(d) && has(d, 'q16_temperature'),
  },
  {
    key: 'q17_bloodPressure',
    label: 'BP (a reading or an "unable to obtain" reason)',
    applies: (d) => rev3(d) && isBpRoutinelyRequired(d['q5_ageYears'] || '', d['q4_dateofBirth']),
    filled: (d) =>
      (has(d, 'q17_systolic') && has(d, 'q17_diastolic')) ||
      has(d, 'q17_bpNotObtainedReason') ||
      has(d, 'q16_vitalsNotObtainedReason'),
  },
  { key: 'q18_pulse', label: 'Pulse (a reading or an "unable to obtain vitals" reason)', applies: rev3, filled: vitalOr('q18_pulse') },
  { key: 'q19_respiration', label: 'Respiration (a reading or an "unable to obtain vitals" reason)', applies: rev3, filled: vitalOr('q19_respiration') },
  { key: 'q20_oxygenSaturation', label: 'O2 saturation (a reading or an "unable to obtain vitals" reason)', applies: rev3, filled: vitalOr('q20_oxygenSaturation') },
  {
    key: 'q21_oxygenSource',
    label: 'Oxygen source (delivery for the recorded SpO2)',
    applies: (d) => rev3(d) && has(d, 'q20_oxygenSaturation'),
  },
  { key: 'ov_interactions', label: "Conversations, interactions, and the individual's responses" },

  // 2. Healthcare plan
  { key: 'ov_hcpStatus', label: 'HCP review status' },
  { key: 'ov_hcpStaffTrained', label: 'Staff trained on the HCP' },

  // 3. Orders & medications
  { key: 'ov_ordersVerified', label: 'Physician orders verified for every medication' },
  { key: 'ov_marReviewed', label: 'MAR review' },
  { key: 'ov_equipOrders', label: 'Adaptive equipment orders review' },

  // 4. Appointments & follow-up
  { key: 'ov_preventiveReviewed', label: 'Preventive care review' },
  { key: 'ov_aims', label: 'AIMS assessment status' },
  { key: 'ov_hospitalization', label: 'Hospitalization / ER follow-up status' },

  // 5. Health data
  { key: 'ov_logsReviewed', label: 'Tracking logs review' },
  { key: 'ov_hrst', label: 'HRST status' },

  // 6. Education
  { key: 'ov_educationResponse', label: "Individual's response to education" },

  // 7. Choice & person-centered care
  { key: 'ov_choicesMade', label: 'Choices the individual made or declined' },

  // 8. Goals
  { key: 'ov_goalProgress', label: 'Progress on HCP / plan of care goals' },
  { key: 'ov_quarterly', label: 'Quarterly review status' },
  {
    key: 'ov_quarterlySummary',
    label: 'Quarterly data summary (required for a quarterly review)',
    // Either signal binds: marking the review completed in section 8, or
    // declaring the visit itself a quarterly review up top. Otherwise a
    // "Quarterly review" visit could submit with the review marked not due
    // and no data summary — the exact self-contradiction QEPR flags.
    applies: (d) =>
      d.ov_quarterly === 'Completed this visit' || d.ov_visitType === 'Quarterly review',
  },

  // 9. Recommendations
  { key: 'ov_actions', label: 'Actions taken / orders requested / referrals' },
  { key: 'ov_nextVisit', label: 'Plan for next visit' },

  { key: 'q61_signature', label: 'RN signature' },
];

/** Every required oversight field still empty, in document order. */
export function getOversightIncomplete(flat: Record<string, string>): OversightIssue[] {
  const issues: OversightIssue[] = [];
  for (const r of OVERSIGHT_RULES) {
    if (r.applies && !r.applies(flat)) continue;
    const ok = r.filled ? r.filled(flat) : has(flat, r.key);
    if (!ok) issues.push({ key: r.key, label: r.label });
  }
  return issues;
}

/** Radio-store keys the oversight form owns (cleared on mount, merged at submit). */
export const OVERSIGHT_RADIO_KEYS = [
  'ov_visitType',
  'ov_hcpStatus',
  'ov_hcpStaffTrained',
  'ov_proxyPlan',
  'ov_ordersVerified',
  'ov_ordersRenewals',
  'ov_marReviewed',
  'ov_refillsTimely',
  'ov_sideEffects',
  'ov_equipOrders',
  'ov_preventiveReviewed',
  'ov_aims',
  'ov_hospitalization',
  'ov_logsReviewed',
  'ov_hrst',
  'ov_quarterly',
] as const;
