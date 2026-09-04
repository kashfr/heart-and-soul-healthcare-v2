/**
 * "Since your last shift" screening on the shift progress note (Page 2, every
 * program and credential, form revision 3+): three required Yes/No questions —
 * hospital admission, urgent care / ER visit, medication started / changed /
 * stopped — plus one Details box required when any answer is Yes.
 *
 * Pure helpers shared by the form, the validation rules, the Submissions list
 * badges, the note detail view, the PDF, and the server-side alert to the RN
 * supervisor. Firebase-free so every consumer and the unit tests read the
 * answers the same way.
 */

export const SHIFT_CHANGE_KEYS = {
  hospitalAdmission: 'q68_sinceHospitalAdmission',
  erUrgentCare: 'q68_sinceErUrgentCare',
  medChange: 'q68_sinceMedChange',
  details: 'q68_sinceDetails',
} as const;

export const SHIFT_CHANGE_YES_NO_KEYS = [
  SHIFT_CHANGE_KEYS.hospitalAdmission,
  SHIFT_CHANGE_KEYS.erUrgentCare,
  SHIFT_CHANGE_KEYS.medChange,
] as const;

/** Every key the section writes, for detail/PDF section gating. */
export const SHIFT_CHANGE_ALL_KEYS: readonly string[] = [...SHIFT_CHANGE_YES_NO_KEYS, SHIFT_CHANGE_KEYS.details];

export interface ShiftChangeReport {
  hospitalAdmission: boolean;
  erUrgentCare: boolean;
  medChange: boolean;
  /** Any of the three answered Yes. */
  any: boolean;
  /** All three questions carry an answer (Yes or No). False on notes written
      before the section existed. */
  answered: boolean;
  details: string;
}

const isYes = (v: unknown): boolean => String(v ?? '').trim().toLowerCase() === 'yes';
const isAnswered = (v: unknown): boolean => {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'yes' || s === 'no';
};

/** Read the section off a flat note record (submitted doc or flattened draft). */
export function readShiftChange(data: Record<string, unknown>): ShiftChangeReport {
  const hospitalAdmission = isYes(data[SHIFT_CHANGE_KEYS.hospitalAdmission]);
  const erUrgentCare = isYes(data[SHIFT_CHANGE_KEYS.erUrgentCare]);
  const medChange = isYes(data[SHIFT_CHANGE_KEYS.medChange]);
  return {
    hospitalAdmission,
    erUrgentCare,
    medChange,
    any: hospitalAdmission || erUrgentCare || medChange,
    answered: SHIFT_CHANGE_YES_NO_KEYS.every((k) => isAnswered(data[k])),
    details: String(data[SHIFT_CHANGE_KEYS.details] ?? '').trim(),
  };
}

/** True when any of the three answers is Yes (validation gate for Details). */
export function shiftChangeAnyYes(data: Record<string, unknown>): boolean {
  return readShiftChange(data).any;
}

/** Human labels for the Yes answers, in question order. */
export function shiftChangeLabels(r: ShiftChangeReport): string[] {
  const out: string[] = [];
  if (r.hospitalAdmission) out.push('Hospital admission');
  if (r.erUrgentCare) out.push('Urgent care / ER visit');
  if (r.medChange) out.push('Medication started, changed, or stopped');
  return out;
}

export interface ShiftChangeAlertContext {
  nurseName: string;
  credential: string;
  clientName: string;
  /** Already formatted for display (MM/DD/YYYY). */
  dateOfService: string;
  report: ShiftChangeReport;
}

const DETAILS_EXCERPT_MAX = 300;

export function excerptDetails(details: string, max = DETAILS_EXCERPT_MAX): string {
  const t = (details || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Portal bell text. Behind the login, so it names the client and carries the
 * reported items — the detail the PHI-free text message omits.
 */
export function shiftChangeBellText(ctx: ShiftChangeAlertContext): string {
  const who = ctx.nurseName ? `${ctx.nurseName}${ctx.credential ? ` (${ctx.credential})` : ''}` : 'A nurse';
  const items = shiftChangeLabels(ctx.report).join(' · ');
  return `${who} reports since the last shift for ${ctx.clientName} (${ctx.dateOfService}): ${items}.${ctx.report.medChange ? ' Verify the MAR.' : ''}`;
}

/**
 * Text message body. SMS is unencrypted and outside the BAA: no client name,
 * no clinical detail, no nurse name. Generic nudge plus the login link and the
 * STOP footer the A2P registration requires.
 */
export function shiftChangeSmsText(ctx: ShiftChangeAlertContext): string {
  const what = ctx.report.medChange
    ? 'a shift note reports a medication change since the last shift. Please verify the client\'s MAR in the portal'
    : 'a shift note reports a hospital or ER visit since the last shift. Please review it in the portal';
  return `Heart and Soul: ${what}: https://www.heartandsoulhc.org/login Reply STOP to opt out.`;
}

export interface ShiftChangeEmailCopy {
  subject: string;
  headline: string;
  intro: string;
  /** "Hospital admission: Yes" style lines, all three questions. */
  answers: string[];
  body: string;
}

/** Email carries client name and date (existing convention) plus the answers. */
export function shiftChangeEmailCopy(ctx: ShiftChangeAlertContext): ShiftChangeEmailCopy {
  const who = ctx.nurseName ? `${ctx.nurseName}${ctx.credential ? `, ${ctx.credential}` : ''}` : 'A nurse';
  const items = shiftChangeLabels(ctx.report);
  const yn = (b: boolean) => (b ? 'Yes' : 'No');
  return {
    subject: `${ctx.report.medChange ? 'Med change reported' : 'Hospital / ER visit reported'}: ${ctx.clientName} (${ctx.dateOfService})`,
    headline: 'Change reported since the last shift',
    intro: `${who} answered Yes to ${items.length === 1 ? 'a' : `${items.length}`} "since your last shift" question${items.length === 1 ? '' : 's'} on a progress note:`,
    answers: [
      `Hospital admission: ${yn(ctx.report.hospitalAdmission)}`,
      `Urgent care / ER visit: ${yn(ctx.report.erUrgentCare)}`,
      `Medication started, changed, or stopped: ${yn(ctx.report.medChange)}`,
    ],
    body: ctx.report.medChange
      ? 'Please verify the client\'s MAR matches the current orders. The nurse was asked to record the change on the note if the written order was in the home; if it was not, the MAR may still need updating.'
      : 'Please review the note and follow up on any discharge instructions or new orders.',
  };
}
