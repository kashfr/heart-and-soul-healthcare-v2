/**
 * Medication error reports: pure helpers shared by the browser, the API
 * routes, and vitest. No Firebase imports here.
 *
 * Fields follow the DBHDD Community Services manual's medication error
 * expectations: what happened, when it occurred and when it was discovered,
 * the medication involved, the client's condition afterward, who was
 * notified and when, corrective action, and an RN review. A report is
 * immutable once filed; the reviewer adds findings on top.
 */

export type MedErrorType =
  | 'omitted'
  | 'wrong-dose'
  | 'wrong-time'
  | 'wrong-med'
  | 'wrong-client'
  | 'wrong-route'
  | 'unauthorized'
  | 'expired-discontinued'
  | 'documentation'
  | 'other';

export const MED_ERROR_TYPES: { value: MedErrorType; label: string; hint: string }[] = [
  { value: 'omitted', label: 'Omitted dose', hint: 'A scheduled dose was not given.' },
  { value: 'wrong-dose', label: 'Wrong dose', hint: 'More or less than ordered.' },
  { value: 'wrong-time', label: 'Wrong time', hint: 'Given outside the ordered window.' },
  { value: 'wrong-med', label: 'Wrong medication', hint: 'A different medication than ordered.' },
  { value: 'wrong-client', label: 'Wrong client', hint: 'Given to a different person than ordered.' },
  { value: 'wrong-route', label: 'Wrong route', hint: 'Oral vs tube, etc.' },
  { value: 'unauthorized', label: 'No current order', hint: 'Given without a valid physician order.' },
  { value: 'expired-discontinued', label: 'Expired or discontinued med', hint: 'Given after discontinuation or past expiry.' },
  { value: 'documentation', label: 'Documentation error', hint: 'Given correctly but charted wrong or not at all.' },
  { value: 'other', label: 'Other', hint: 'Describe below.' },
];

export type MedErrorDoseOutcome = 'given' | 'omitted' | 'partial' | 'unknown';
export const MED_ERROR_DOSE_OUTCOMES: { value: MedErrorDoseOutcome; label: string }[] = [
  { value: 'given', label: 'Dose was given (incorrectly)' },
  { value: 'omitted', label: 'Dose was not given' },
  { value: 'partial', label: 'Partial dose' },
  { value: 'unknown', label: 'Unknown' },
];

export type MedErrorHarm = 'none' | 'monitoring' | 'treatment' | 'er' | 'hospitalized' | 'death';
export const MED_ERROR_HARM_LEVELS: { value: MedErrorHarm; label: string }[] = [
  { value: 'none', label: 'No effect observed' },
  { value: 'monitoring', label: 'Required extra monitoring, no treatment' },
  { value: 'treatment', label: 'Required treatment or intervention' },
  { value: 'er', label: 'Urgent care or ER visit' },
  { value: 'hospitalized', label: 'Hospitalized' },
  { value: 'death', label: 'Death' },
];

export type MedErrorResponsibleType = 'nurse' | 'aide' | 'family' | 'client' | 'pharmacy' | 'unknown';
export const MED_ERROR_RESPONSIBLE_TYPES: { value: MedErrorResponsibleType; label: string }[] = [
  { value: 'nurse', label: 'Agency nurse' },
  { value: 'aide', label: 'Agency aide' },
  { value: 'family', label: 'Family or responsible party' },
  { value: 'client', label: 'Client (self-administered)' },
  { value: 'pharmacy', label: 'Pharmacy or supplier' },
  { value: 'unknown', label: 'Unknown' },
];

export const MED_ERROR_TEXT_MAX = 4000;

export interface MedErrorNotification {
  notified: boolean;
  name: string;
  at: string; // ISO local datetime "YYYY-MM-DDTHH:MM" or ''
}

export interface MedErrorReview {
  reviewerId: string;
  reviewerName: string;
  reviewerCredential: string;
  findings: string;
  rootCause: string;
  correctiveAction: string;
  incidentReportRequired: boolean;
  incidentReportFiledDate: string; // YYYY-MM-DD or ''
  reviewedAt: string | null; // ISO
}

export interface MedErrorReport {
  id: string;
  patientId: string;
  patientName: string;
  patientDob: string;
  reporterId: string;
  reporterName: string;
  reporterCredential: string;
  reporterRole: string;
  reporterSignature: string;
  discoveredAt: string; // YYYY-MM-DDTHH:MM (agency local)
  occurredAt: string; // YYYY-MM-DDTHH:MM or '' when unknown
  occurredApprox: boolean;
  medName: string;
  doseOrdered: string;
  doseGiven: string;
  route: string;
  marOrderId: string;
  marAdministrationId: string;
  errorType: MedErrorType;
  doseOutcome: MedErrorDoseOutcome;
  description: string;
  responsibleType: MedErrorResponsibleType;
  responsibleName: string;
  harm: MedErrorHarm;
  clientCondition: string;
  physician: MedErrorNotification;
  guardian: MedErrorNotification;
  supervisor: MedErrorNotification;
  actionsTaken: string;
  status: 'submitted' | 'reviewed';
  incidentReportRequired: boolean;
  review: MedErrorReview | null;
  createdAt: string | null;
}

export interface MedErrorInput {
  patientId: string;
  discoveredAt: string;
  occurredAt: string;
  occurredApprox: boolean;
  medName: string;
  doseOrdered: string;
  doseGiven: string;
  route: string;
  marOrderId: string;
  marAdministrationId: string;
  errorType: MedErrorType | '';
  doseOutcome: MedErrorDoseOutcome | '';
  description: string;
  responsibleType: MedErrorResponsibleType | '';
  responsibleName: string;
  harm: MedErrorHarm | '';
  clientCondition: string;
  physician: MedErrorNotification;
  guardian: MedErrorNotification;
  supervisor: MedErrorNotification;
  actionsTaken: string;
  reporterSignature: string;
}

export const EMPTY_NOTIFICATION: MedErrorNotification = { notified: false, name: '', at: '' };

export const EMPTY_MED_ERROR_INPUT: MedErrorInput = {
  patientId: '',
  discoveredAt: '',
  occurredAt: '',
  occurredApprox: false,
  medName: '',
  doseOrdered: '',
  doseGiven: '',
  route: '',
  marOrderId: '',
  marAdministrationId: '',
  errorType: '',
  doseOutcome: '',
  description: '',
  responsibleType: '',
  responsibleName: '',
  harm: '',
  clientCondition: '',
  physician: { ...EMPTY_NOTIFICATION },
  guardian: { ...EMPTY_NOTIFICATION },
  supervisor: { ...EMPTY_NOTIFICATION },
  actionsTaken: '',
  reporterSignature: '',
};

export type MedErrorFieldErrors = Partial<Record<keyof MedErrorInput | 'physicianAt' | 'guardianAt' | 'supervisorAt', string>>;

const LOCAL_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function isLocalDateTime(v: string): boolean {
  if (!LOCAL_DT.test(v)) return false;
  const [d, t] = v.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  if (m < 1 || m > 12 || hh > 23 || mm > 59) return false;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return day >= 1 && day <= dim;
}

/** The flag that governs the queue and the PDF: the reviewer's call once
 *  reviewed, else the automatic one set at filing. */
export function effectiveIncidentRequired(r: Pick<MedErrorReport, 'incidentReportRequired' | 'review'>): boolean {
  return r.review ? r.review.incidentReportRequired : r.incidentReportRequired;
}

export function validateMedErrorInput(input: MedErrorInput, nowLocal: string): MedErrorFieldErrors {
  const e: MedErrorFieldErrors = {};
  if (!input.patientId.trim()) e.patientId = 'Choose the client.';
  if (!isLocalDateTime(input.discoveredAt)) e.discoveredAt = 'Enter when the error was discovered.';
  else if (input.discoveredAt > nowLocal) e.discoveredAt = 'The discovery time cannot be in the future.';
  if (input.occurredAt) {
    if (!isLocalDateTime(input.occurredAt)) e.occurredAt = 'Enter a valid date and time, or leave it blank if unknown.';
    else if (isLocalDateTime(input.discoveredAt) && input.occurredAt > input.discoveredAt) e.occurredAt = 'The error cannot have occurred after it was discovered.';
  }
  if (!input.medName.trim()) e.medName = 'Enter the medication involved.';
  if (!input.errorType) e.errorType = 'Choose the type of error.';
  if (!input.doseOutcome) e.doseOutcome = 'Say whether the dose was given.';
  if (['wrong-dose', 'wrong-med', 'wrong-route', 'wrong-client', 'unauthorized', 'expired-discontinued'].includes(input.errorType) && ['given', 'partial'].includes(input.doseOutcome) && !input.doseGiven.trim()) {
    e.doseGiven = 'Enter the dose that was actually given.';
  }
  const desc = input.description.trim();
  if (!desc) e.description = 'Describe what happened in your own words.';
  else if (desc.length < 40) e.description = 'Say more: what was ordered, what happened, and how you found out (at least a sentence or two).';
  else if (desc.length > MED_ERROR_TEXT_MAX) e.description = `Keep the description under ${MED_ERROR_TEXT_MAX} characters.`;
  if (!input.responsibleType) e.responsibleType = 'Say who administered or was responsible for the dose.';
  if (!input.harm) e.harm = "Describe the client's condition after the error.";
  if (!input.clientCondition.trim()) e.clientCondition = "Note the client's condition and any symptoms, even if none.";
  if (!input.actionsTaken.trim()) e.actionsTaken = 'Note what was done in response.';
  for (const [k, n] of [['physician', input.physician], ['guardian', input.guardian], ['supervisor', input.supervisor]] as const) {
    if (!n.notified || !n.at) continue;
    if (!isLocalDateTime(n.at)) e[`${k}At`] = 'Enter a valid date and time.';
    else if (n.at > nowLocal) e[`${k}At`] = 'The notification time cannot be in the future.';
    else if (input.occurredAt && isLocalDateTime(input.occurredAt) && n.at < input.occurredAt) e[`${k}At`] = 'The notification cannot be before the error occurred.';
  }
  // The physician must be notified when the client was affected, and
  // whenever a wrong dose, medication, route, or client actually received
  // the dose, even with no effect observed yet. The form lets the reporter
  // record that it was done; it will not let it pass silently.
  const wrongGiven =
    ['wrong-dose', 'wrong-med', 'wrong-client', 'wrong-route', 'unauthorized', 'expired-discontinued'].includes(input.errorType) &&
    ['given', 'partial'].includes(input.doseOutcome);
  if (((input.harm && input.harm !== 'none') || wrongGiven) && !input.physician.notified) {
    e.physician = wrongGiven && (!input.harm || input.harm === 'none')
      ? 'The physician must be notified when a wrong dose or medication was actually given. Notify them, then record it here.'
      : 'The physician must be notified when the client was affected. Notify them, then record it here.';
  }
  if (!input.reporterSignature.startsWith('data:image/png;base64,')) e.reporterSignature = 'Sign the report.';
  return e;
}

/**
 * DBHDD: a medication error that results in harm needing medical treatment
 * (or worse), or a wrong-client error, is a reportable incident with its own
 * deadline. Flagged at filing so the RN and admin see it immediately; the
 * reviewer can override either way with a reason in the findings.
 */
export function incidentReportRequired(input: Pick<MedErrorInput, 'harm' | 'errorType'>): boolean {
  return ['treatment', 'er', 'hospitalized', 'death'].includes(input.harm) || input.errorType === 'wrong-client';
}

export function medErrorTypeLabel(v: string): string {
  return MED_ERROR_TYPES.find((t) => t.value === v)?.label || v || '';
}
export function medErrorHarmLabel(v: string): string {
  return MED_ERROR_HARM_LEVELS.find((t) => t.value === v)?.label || v || '';
}
export function medErrorOutcomeLabel(v: string): string {
  return MED_ERROR_DOSE_OUTCOMES.find((t) => t.value === v)?.label || v || '';
}
export function medErrorResponsibleLabel(v: string): string {
  return MED_ERROR_RESPONSIBLE_TYPES.find((t) => t.value === v)?.label || v || '';
}

/** Bell text (in-portal, may name the client). */
export function medErrorBellText(kind: 'filed' | 'incident' | 'reviewed', r: Pick<MedErrorReport, 'patientName' | 'reporterName' | 'medName' | 'errorType'>): string {
  const t = medErrorTypeLabel(r.errorType).toLowerCase();
  switch (kind) {
    case 'filed':
      return `Medication error reported for ${r.patientName} (${t}, ${r.medName}) by ${r.reporterName}`;
    case 'incident':
      return `Medication error for ${r.patientName} may require a DBHDD incident report (${t}, ${r.medName})`;
    case 'reviewed':
      return `Medication error report for ${r.patientName} (${r.medName}) has been reviewed`;
  }
}

/** Format "YYYY-MM-DDTHH:MM" for display, US style. */
export function formatLocalDateTimeUS(v: string): string {
  if (!isLocalDateTime(v)) return v || '';
  const [d, t] = v.split('T');
  const [y, m, day] = d.split('-');
  const [hh, mm] = t.split(':');
  const h = Number(hh);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${m}/${day}/${y} ${h12}:${mm} ${ampm}`;
}
