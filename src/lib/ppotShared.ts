/**
 * PPOT (GAPP Appendix T, Physician Plan of Treatment) requests: pure helpers
 * shared by the Fax Center, the /api/fax/ppot routes, the recertification
 * sweep, and vitest. No Firebase imports.
 *
 * The GAPP manual (913.3) says providers cannot complete the PPOT and send it
 * for signature; the physician completes it. So a request is a cover sheet
 * that identifies the member (name, DOB, Medicaid ID) plus the BLANK form.
 * Nothing here ever writes onto the Appendix T itself.
 */
import { normalizeUSFaxNumber } from './verbalOrderShared';

/** A referral's label/value submission row (mirrors referrals.ts, which is server-only). */
export interface ReferralDetail {
  label: string;
  value: string;
}

export type PpotRequestType = 'new' | 'recert';
export type PpotSubjectKind = 'referral' | 'client';

export const PPOT_REQUEST_LABEL: Record<PpotRequestType, string> = {
  new: 'New case (initial request)',
  recert: 'Recertification',
};

/** Who a PPOT is being requested for, as the picker and the cover sheet see
 *  them. Deliberately minimal: identity plus the physician to fax. */
export interface PpotSubject {
  kind: PpotSubjectKind;
  id: string;
  name: string;
  /** As printed (MM/DD/YYYY). '' when unknown. */
  dob: string;
  /** '' when unknown; the physician's office fills it in on the form. */
  medicaidId: string;
  physicianName: string;
  physicianOffice: string;
  /** 10 digits, or '' when none on file. */
  physicianFax: string;
  /** Referral: the board stage. Client: the payer program. */
  context: string;
  /** Clients only: latest authorization end (YYYY-MM-DD), '' if none. */
  authEnd: string;
}

// Referral detail labels, per intake path. Our own form writes "Medicaid #";
// the GAPP website writes "Member's Medicaid ID" (or "Will provide later").
const MEDICAID_LABELS = ["Member's Medicaid ID", 'Medicaid #'];
const DOB_LABEL = 'Date of birth';
const PHYSICIAN_LABELS = { name: "Child's physician", office: 'Physician office', fax: 'Physician fax' };

/** Keep letters and digits only; '' for placeholders like "Will provide later". */
export function cleanMedicaidId(raw: string): string {
  const v = String(raw || '').trim();
  if (!v || /later/i.test(v) || /^(n\/?a|none|unknown|pending)$/i.test(v)) return '';
  const id = v.replace(/[^A-Za-z0-9]/g, '');
  return id.length >= 6 && id.length <= 20 ? id.toUpperCase() : '';
}

function detail(details: ReferralDetail[], labels: string[]): string {
  for (const label of labels) {
    const hit = details.find((d) => d.label === label);
    if (hit && String(hit.value || '').trim()) return String(hit.value).trim();
  }
  return '';
}

export function ppotSubjectFromReferral(r: { id: string; clientName: string; stage?: string; details: ReferralDetail[] }): PpotSubject {
  return {
    kind: 'referral',
    id: r.id,
    name: r.clientName,
    dob: detail(r.details, [DOB_LABEL]),
    medicaidId: cleanMedicaidId(detail(r.details, MEDICAID_LABELS)),
    physicianName: detail(r.details, [PHYSICIAN_LABELS.name]),
    physicianOffice: detail(r.details, [PHYSICIAN_LABELS.office]),
    physicianFax: normalizeUSFaxNumber(detail(r.details, [PHYSICIAN_LABELS.fax])),
    context: r.stage || '',
    authEnd: '',
  };
}

/** The latest end date across a client's authorization lines ('' if none). */
export function latestAuthEnd(lines: Array<{ to?: string | null }>): string {
  let best = '';
  for (const l of lines) {
    const to = String(l.to || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(to) && to > best) best = to;
  }
  return best;
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** How far past an authorization's end we keep nagging before giving up
 *  (the case has most likely closed, or the next authorization just hasn't
 *  been entered). */
export const RECERT_GRACE_DAYS = 30;

/**
 * Whether a client is inside the recertification window: the authorization
 * ends within leadDays (or ended no more than RECERT_GRACE_DAYS ago), and no
 * PPOT request has gone out for this cycle. A request counts for the cycle
 * when it was sent after the window opened, less a 30-day allowance for an
 * office that started early.
 */
export function recertStatus(p: {
  today: string;
  authEnd: string;
  leadDays: number;
  /** YYYY-MM-DD of the latest PPOT request sent for this client, '' if none. */
  lastRequestDate: string;
}): { due: boolean; daysLeft: number | null; requestedThisCycle: boolean } {
  if (!p.authEnd) return { due: false, daysLeft: null, requestedThisCycle: false };
  const daysLeft = daysBetween(p.today, p.authEnd);
  const inWindow = daysLeft <= p.leadDays && daysLeft >= -RECERT_GRACE_DAYS;
  const requestedThisCycle = !!p.lastRequestDate && daysBetween(p.lastRequestDate, p.authEnd) <= p.leadDays + 30;
  return { due: inWindow && !requestedThisCycle, daysLeft, requestedThisCycle };
}

export interface PpotSendInput {
  subjectKind: PpotSubjectKind;
  subjectId: string;
  requestType: PpotRequestType;
  recipientName: string;
  recipientOrg: string;
  toNumber: string;
  confirmNumber: string;
  medicaidId: string;
  note: string;
}

export type PpotSendField = 'subject' | 'requestType' | 'recipientName' | 'toNumber' | 'confirmNumber' | 'medicaidId' | 'note';
export type PpotSendErrors = Partial<Record<PpotSendField, string>>;

export function validatePpotSendInput(input: Partial<PpotSendInput>): PpotSendErrors {
  const e: PpotSendErrors = {};
  if ((input.subjectKind !== 'referral' && input.subjectKind !== 'client') || !String(input.subjectId || '').trim()) {
    e.subject = 'Choose who the plan of treatment is for.';
  }
  if (input.requestType !== 'new' && input.requestType !== 'recert') e.requestType = 'Choose new case or recertification.';
  const name = String(input.recipientName || '').trim();
  if (!name) e.recipientName = "Enter the physician's name.";
  else if (name.length > 80) e.recipientName = 'Keep the name under 80 characters.';
  const to = normalizeUSFaxNumber(String(input.toNumber || ''));
  if (!to) e.toNumber = "Enter the physician's 10-digit fax number.";
  const confirm = normalizeUSFaxNumber(String(input.confirmNumber || ''));
  if (to && !confirm) e.confirmNumber = 'Type the fax number again to confirm it.';
  else if (to && confirm !== to) e.confirmNumber = 'The two fax numbers do not match. Check the number and type it again.';
  const med = String(input.medicaidId || '').trim();
  if (med && !cleanMedicaidId(med)) e.medicaidId = 'Enter the Medicaid ID as printed (letters and numbers), or leave it blank for the office to fill in.';
  if (String(input.note || '').trim().length > 1200) e.note = 'Keep the note under 1200 characters.';
  return e;
}

/** The cover-sheet message when the sender doesn't write one. */
export function defaultPpotNote(requestType: PpotRequestType, hasMedicaidId: boolean): string {
  const lead =
    requestType === 'recert'
      ? 'This member is due for GAPP recertification. Please complete and sign the attached Appendix T (Physician Plan of Treatment) for the upcoming period'
      : 'Heart and Soul Healthcare has received a GAPP referral for this member. Please complete and sign the attached Appendix T (Physician Plan of Treatment)';
  const medicaid = hasMedicaidId ? '' : ' Please also fill in the member’s Medicaid number on the form.';
  return `${lead} and fax it back to us along with any office notes that support the hours recommended.${medicaid} Thank you.`;
}
