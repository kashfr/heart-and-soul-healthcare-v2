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

const has = (d: Record<string, string>, k: string): boolean => (d[k] ?? '').trim() !== '';

interface OvRule {
  key: string;
  label: string;
  applies?: (d: Record<string, string>) => boolean;
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
  { key: 'ov_location', label: 'Visit location' },
  { key: 'ov_visitType', label: 'Visit type' },
  { key: 'q11_nurseName', label: 'RN name' },

  // 1. Status & observations
  { key: 'ov_generalCondition', label: 'General condition and changes since last visit' },
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
    if (!has(flat, r.key)) issues.push({ key: r.key, label: r.label });
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
