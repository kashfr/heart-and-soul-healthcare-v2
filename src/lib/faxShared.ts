/**
 * Fax Center: types, access rule, and send-form validation shared by the
 * /admin/fax page and the /api/fax routes. No Firebase imports, so it stays
 * unit-testable (faxShared.test.ts).
 */
import type { Role } from './auth';
import type { FaxSettings } from './settings';
import { normalizeUSFaxNumber } from './verbalOrderShared';

/** Roles the settings picker can grant. Admins always have access once the
 *  feature is on; nurses never do (it is an office tool). */
export const FAX_GRANTABLE_ROLES: readonly Role[] = ['supervisor', 'va'];

/**
 * Who may use the Fax Center. The feature must be switched on in Settings;
 * then admins always may, and a supervisor or VA may when an admin checked
 * them. The server repeats this check on every route.
 */
export function canUseFax(fax: Pick<FaxSettings, 'enabled' | 'userUids'> | undefined, uid: string | null | undefined, role: Role | null | undefined): boolean {
  if (!fax || !fax.enabled || !uid || !role) return false;
  if (role === 'admin') return true;
  if (!FAX_GRANTABLE_ROLES.includes(role)) return false;
  return fax.userUids.includes(uid);
}

export const FAX_TEXT_MAX = { recipientName: 80, recipientOrg: 80, regarding: 120, note: 1200 } as const;
/** Largest document a person may upload (the cover sheet is added on top). */
export const FAX_MAX_PDF_BYTES = 10 * 1024 * 1024;
export const FAX_MAX_PAGES = 50;

export interface FaxSendInput {
  recipientName: string;
  recipientOrg: string;
  toNumber: string;
  /** The number typed a second time. A misdialed fax of client records is a
   *  reportable breach, so the two must match before anything is sent. */
  confirmNumber: string;
  regarding: string;
  note: string;
  includeCover: boolean;
}

export type FaxSendField = 'recipientName' | 'toNumber' | 'confirmNumber' | 'regarding' | 'note' | 'file';
export type FaxSendErrors = Partial<Record<FaxSendField, string>>;

export function validateFaxSendInput(input: Partial<FaxSendInput>, hasFile: boolean): FaxSendErrors {
  const e: FaxSendErrors = {};
  const name = String(input.recipientName || '').trim();
  if (!name) e.recipientName = 'Enter who the fax is for (a person or an office).';
  else if (name.length > FAX_TEXT_MAX.recipientName) e.recipientName = `Keep the name under ${FAX_TEXT_MAX.recipientName} characters.`;
  const to = normalizeUSFaxNumber(String(input.toNumber || ''));
  if (!to) e.toNumber = 'Enter a 10-digit US fax number.';
  const confirm = normalizeUSFaxNumber(String(input.confirmNumber || ''));
  if (to && !confirm) e.confirmNumber = 'Type the fax number again to confirm it.';
  else if (to && confirm !== to) e.confirmNumber = 'The two fax numbers do not match. Check the number and type it again.';
  if (String(input.regarding || '').trim().length > FAX_TEXT_MAX.regarding) e.regarding = `Keep this under ${FAX_TEXT_MAX.regarding} characters.`;
  if (String(input.note || '').trim().length > FAX_TEXT_MAX.note) e.note = `Keep the note under ${FAX_TEXT_MAX.note} characters.`;
  if (!hasFile) e.file = 'Choose the PDF to fax.';
  return e;
}

/** Delivery state shown in the outbox. SRFax reports 'In Progress', 'Sent',
 *  'Failed' (and 'Sending Email', which is still in flight for us). */
export type FaxDeliveryState = 'sending' | 'sent' | 'failed';

export function faxDeliveryState(sentStatus: string): FaxDeliveryState {
  if (sentStatus === 'Sent') return 'sent';
  if (sentStatus === 'Failed') return 'failed';
  return 'sending';
}

/** What a PPOT request fax is about (stored on the outbox row). */
export interface OutboundFaxPpot {
  requestType: 'new' | 'recert';
  subjectKind: 'referral' | 'client';
  subjectId: string;
  memberName: string;
  dob: string;
  medicaidId: string;
}

export interface OutboundFax {
  id: string;
  /** 'ppot' for an Appendix T request, 'general' for anything else. */
  kind: 'general' | 'ppot';
  ppot: OutboundFaxPpot | null;
  recipientName: string;
  recipientOrg: string;
  toNumber: string;
  regarding: string;
  note: string;
  includeCover: boolean;
  fileName: string;
  /** Pages sent, cover sheet included. */
  pages: number;
  faxDetailsId: string;
  sentStatus: string;
  error: string;
  attempts: number;
  queuedAt: string | null;
  sentAt: string | null;
  sentBy: string;
  sentByName: string;
  createdAt: string | null;
}

/** A safe download name for the uploaded PDF. */
export function cleanFaxFileName(raw: string): string {
  const base = String(raw || '').split(/[\\/]/).pop() || '';
  const stem = base.replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(0, 60);
  return `${stem || 'document'}.pdf`;
}
