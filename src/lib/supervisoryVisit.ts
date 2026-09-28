// Home Supervisory Visit — domain constants and required-field rules.
//
// The in-app version of the agency's paper "Home Supervisory Visit" form
// (HEART AND SOUL HEALTHCARE, revised), completed by a nurse supervisor at
// the client's home. Questions and order follow the paper form; yes/no
// questions are structured as Yes/No answers, and their comment box becomes
// required only when the answer calls for an explanation.
//
// Stored in the same `progressNotes` collection as shift and oversight notes,
// discriminated by `noteType: 'home-supervisory-visit'`, reusing the shared
// identity keys (q3_clientName, q4_dateofBirth, q6_dateofService,
// q11_nurseName = supervisor, q12_credential, q61_signature, patientId,
// q1_formRev, q2_program, q2_serviceLevel) so the submissions list, audit
// trail, corrections, and PDF export work unchanged. Everything
// supervisory-specific lives under the `sv_` prefix.

export const SUPERVISORY_NOTE_TYPE = 'home-supervisory-visit';

export const isSupervisoryNote = (data: Record<string, unknown> | null | undefined): boolean =>
  !!data && data.noteType === SUPERVISORY_NOTE_TYPE;

/** Only staff (admin, supervisor) author supervisory visits. */
export const canAuthorSupervisoryVisit = (role: string | null | undefined): boolean =>
  role === 'admin' || role === 'supervisor';

export interface SupervisoryIssue {
  /** Field key; also the DOM id (or wrapper id for radio groups) to scroll to. */
  key: string;
  label: string;
}

const has = (d: Record<string, string>, k: string): boolean => (d[k] ?? '').trim() !== '';

interface SvRule {
  key: string;
  label: string;
  applies?: (d: Record<string, string>) => boolean;
}

/** Required fields for a complete supervisory visit, in document order. */
const SUPERVISORY_RULES: SvRule[] = [
  { key: 'q3_clientName', label: 'Client (select from the roster)' },
  { key: 'q6_dateofService', label: 'Date' },
  { key: 'sv_timeIn', label: 'Time in' },
  { key: 'sv_timeOut', label: 'Time out' },
  { key: 'sv_address', label: 'Address' },
  { key: 'sv_staffName', label: 'Staff performing duties' },
  { key: 'q11_nurseName', label: 'Supervisor' },

  { key: 'sv_temp', label: 'Temp' },
  { key: 'sv_bp', label: 'BP' },
  { key: 'sv_pulse', label: 'Pulse' },

  { key: 'sv_problems', label: 'Problems encountered by the client' },
  {
    key: 'sv_problemsDetail',
    label: 'Description of the problems encountered',
    applies: (d) => d.sv_problems === 'Yes',
  },
  { key: 'sv_rightsInformed', label: 'Client informed of rights' },
  { key: 'sv_clientSatisfied', label: 'Client satisfied with the services' },
  {
    key: 'sv_dissatisfaction',
    label: "Explanation of the client's dissatisfaction",
    applies: (d) => d.sv_clientSatisfied === 'No',
  },

  { key: 'sv_interviewMethod', label: 'Interview with the client (phone or in person)' },
  { key: 'sv_levelOfCare', label: 'Level of care appropriate' },
  {
    key: 'sv_levelOfCareRecs',
    label: 'Level of care recommendations',
    applies: (d) => d.sv_levelOfCare === 'No',
  },
  { key: 'sv_satisfiedWithStaff', label: 'Client satisfied with the staff' },
  {
    key: 'sv_staffFeedback',
    label: "Client's feedback on the staff's performance",
    applies: (d) => d.sv_satisfiedWithStaff === 'No',
  },

  { key: 'q61_signature', label: 'Supervisor signature' },
];

/** Every required supervisory-visit field still empty, in document order. */
export function getSupervisoryIncomplete(flat: Record<string, string>): SupervisoryIssue[] {
  const issues: SupervisoryIssue[] = [];
  for (const r of SUPERVISORY_RULES) {
    if (r.applies && !r.applies(flat)) continue;
    if (!has(flat, r.key)) issues.push({ key: r.key, label: r.label });
  }
  return issues;
}

/** Radio-store keys the supervisory form owns (cleared on mount, merged at submit). */
export const SUPERVISORY_RADIO_KEYS = [
  'sv_problems',
  'sv_rightsInformed',
  'sv_clientSatisfied',
  'sv_interviewMethod',
  'sv_levelOfCare',
  'sv_satisfiedWithStaff',
] as const;
