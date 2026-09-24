/**
 * Verbal (telephone) physician orders: pure helpers shared by the browser, the
 * API routes, and vitest. No Firebase imports here.
 *
 * Lifecycle (status only moves forward):
 *   taken     -> the nurse recorded the order, read it back, and signed
 *   faxed     -> the physician authentication form went out (SRFax, or by hand)
 *   signed    -> the physician's signature is on file (returned fax, e-sign, or
 *                the office recording a signed copy by hand)
 *   cancelled -> voided before it was signed (entered in error, wrong client,
 *                physician declined). The record is kept for the audit trail;
 *                it just leaves the queue and can no longer be signed.
 * "Overdue" and "escalated" are derived from takenDate + settings, not stored
 * statuses, so changing the thresholds re-evaluates every open order.
 */

export type VerbalOrderStatus = 'taken' | 'faxed' | 'signed' | 'cancelled';
export type VerbalOrderType = 'medication' | 'other';
export type VerbalOrderSignMethod = 'fax' | 'esign' | 'manual';

export const VERBAL_ORDER_TEXT_MAX = 4000;
export const VERBAL_ORDER_CANCEL_REASON_MAX = 1000;
export const DEFAULT_VERBAL_ORDER_OVERDUE_DAYS = 14;
export const DEFAULT_VERBAL_ORDER_ESCALATE_DAYS = 30;

export const VERBAL_ORDER_SPECIALTIES = [
  'Primary care / Pediatrics',
  'Neurology',
  'Gastroenterology',
  'Pulmonology',
  'Cardiology',
  'Psychiatry',
  'Physiatry / Rehab',
  'Orthopedics',
  'Endocrinology',
  'Other',
] as const;

export interface VerbalOrderFaxState {
  provider: 'srfax' | 'manual';
  toNumber: string;
  faxDetailsId: string;
  sentStatus: string; // '' | 'In Progress' | 'Sent' | 'Failed'
  queuedAt: string | null; // ISO
  sentAt: string | null; // ISO
  error: string;
  attempts: number;
}

export interface VerbalOrderSigned {
  method: VerbalOrderSignMethod;
  signedDate: string; // YYYY-MM-DD, the date the physician signed
  physicianPrintedName: string;
  /** e-sign only: PNG data URL of the physician's canvas signature. */
  physicianSignature: string;
  receivedAt: string | null; // ISO
  receivedBy: string;
  receivedByName: string;
  /** patientDocuments id of the filed signed copy, when one exists. */
  documentId: string;
  /** SRFax inbound file name, when the copy came back by fax. */
  inboundFaxFileName: string;
}

export interface VerbalOrderCancelled {
  reason: string;
  cancelledAt: string | null; // ISO
  cancelledBy: string;
  cancelledByName: string;
}

export interface VerbalOrder {
  id: string;
  patientId: string;
  patientName: string;
  patientDob: string;
  orderType: VerbalOrderType;
  physicianName: string;
  physicianPhone: string;
  physicianFax: string;
  physicianSpecialty: string;
  orderText: string;
  readBackVerified: boolean;
  nurseId: string;
  nurseName: string;
  nurseCredential: string;
  /** PNG data URL, captured on the same canvas the note form uses. */
  nurseSignature: string;
  takenAt: string | null; // ISO
  takenDate: string; // YYYY-MM-DD, agency time
  status: VerbalOrderStatus;
  /** Medication orders: the MAR change this verbal order authorized. */
  marChangeRequestId: string;
  marOrderId: string;
  marChangeType: '' | 'add' | 'change' | 'discontinue';
  marMedName: string;
  fax: VerbalOrderFaxState | null;
  signed: VerbalOrderSigned | null;
  cancelled: VerbalOrderCancelled | null;
  reminderSentAt: string | null;
  escalatedAt: string | null;
  createdAt: string | null;
}

export interface VerbalOrderInput {
  patientId: string;
  orderType: VerbalOrderType;
  physicianName: string;
  physicianPhone: string;
  physicianFax: string;
  physicianSpecialty: string;
  orderText: string;
  readBackVerified: boolean;
  nurseSignature: string;
}

export type VerbalOrderFieldErrors = Partial<Record<keyof VerbalOrderInput, string>>;

function digits(v: string): string {
  return (v || '').replace(/\D/g, '');
}

/** Ten US digits, or eleven starting with 1, else ''. */
export function normalizeUSFaxNumber(raw: string): string {
  const d = digits(raw);
  if (d.length === 10) return d;
  if (d.length === 11 && d.startsWith('1')) return d.slice(1);
  return '';
}

export function formatUSFaxNumber(tenDigits: string): string {
  const d = normalizeUSFaxNumber(tenDigits);
  if (!d) return tenDigits || '';
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function validateVerbalOrderInput(input: Partial<VerbalOrderInput>): VerbalOrderFieldErrors {
  const e: VerbalOrderFieldErrors = {};
  if (!String(input.patientId || '').trim()) e.patientId = 'Choose the client.';
  if (input.orderType !== 'medication' && input.orderType !== 'other') e.orderType = 'Choose the type of order.';
  if (!String(input.physicianName || '').trim()) e.physicianName = "Enter the physician's name.";
  if (digits(String(input.physicianPhone || '')).length < 10) e.physicianPhone = "Enter the physician's telephone number.";
  if (!normalizeUSFaxNumber(String(input.physicianFax || ''))) e.physicianFax = "Enter the physician's fax number (10 digits).";
  const text = String(input.orderText || '').trim();
  if (!text) e.orderText = 'Describe the order exactly as given.';
  else if (text.length > VERBAL_ORDER_TEXT_MAX) e.orderText = `Keep the order under ${VERBAL_ORDER_TEXT_MAX} characters.`;
  if (input.readBackVerified !== true) e.readBackVerified = 'You must read the order back to the physician and verify it.';
  if (!String(input.nurseSignature || '').startsWith('data:image/png;base64,')) e.nurseSignature = 'Sign the order.';
  return e;
}

/** Days between two YYYY-MM-DD dates (b - a), or null when either is malformed. */
export function daysBetweenISO(a: string, b: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
  return Math.floor((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
}

export type VerbalOrderUrgency = 'signed' | 'cancelled' | 'open' | 'overdue' | 'escalated';

/** Still waiting on the physician: not signed and not cancelled. */
export function isVerbalOrderOpen(o: Pick<VerbalOrder, 'status'>): boolean {
  return o.status === 'taken' || o.status === 'faxed';
}

/** Parse a stored status, defaulting unknown values to 'taken'. */
export function parseVerbalOrderStatus(v: unknown): VerbalOrderStatus {
  return v === 'signed' || v === 'faxed' || v === 'cancelled' ? v : 'taken';
}

/** Where an order stands against the signature deadline. */
export function verbalOrderUrgency(
  order: Pick<VerbalOrder, 'status' | 'takenDate'>,
  todayISO: string,
  thresholds: { overdueDays: number; escalateDays: number },
): VerbalOrderUrgency {
  if (order.status === 'signed') return 'signed';
  if (order.status === 'cancelled') return 'cancelled';
  const age = daysBetweenISO(order.takenDate, todayISO);
  if (age === null) return 'open';
  if (age >= thresholds.escalateDays) return 'escalated';
  if (age >= thresholds.overdueDays) return 'overdue';
  return 'open';
}

export function verbalOrderAgeDays(order: Pick<VerbalOrder, 'takenDate'>, todayISO: string): number | null {
  return daysBetweenISO(order.takenDate, todayISO);
}

export const VERBAL_ORDER_STATUS_LABEL: Record<VerbalOrderStatus, string> = {
  taken: 'Taken, not yet faxed',
  faxed: 'Faxed, awaiting signature',
  signed: 'Signed',
  cancelled: 'Cancelled',
};

export function verbalOrderStatusLabel(o: Pick<VerbalOrder, 'status' | 'fax'>): string {
  if (isVerbalOrderOpen(o) && o.fax?.sentStatus === 'Failed') return 'Fax failed';
  if (o.status === 'faxed' && o.fax?.sentStatus === 'In Progress') return 'Fax sending';
  return VERBAL_ORDER_STATUS_LABEL[o.status];
}

export type VerbalOrderBellKind = 'taken' | 'fax-failed' | 'fax-returned' | 'signed' | 'overdue' | 'escalated' | 'cancelled';

/** In-portal bell text (behind the login, may name the client). */
export function verbalOrderBellText(kind: VerbalOrderBellKind, o: Pick<VerbalOrder, 'patientName' | 'nurseName' | 'physicianName'>, actorName = ''): string {
  switch (kind) {
    case 'taken':
      return `Verbal order taken for ${o.patientName} by ${o.nurseName} from ${o.physicianName}`;
    case 'fax-failed':
      return `Verbal order fax to ${o.physicianName} for ${o.patientName} failed and needs a resend`;
    case 'fax-returned':
      return `A fax from ${o.physicianName}'s office arrived; match it to the verbal order for ${o.patientName}`;
    case 'signed':
      return `Signed verbal order received for ${o.patientName} from ${o.physicianName}`;
    case 'overdue':
      return `Verbal order for ${o.patientName} is still unsigned by ${o.physicianName}`;
    case 'escalated':
      return `Verbal order for ${o.patientName} has gone unsigned past the escalation limit`;
    case 'cancelled':
      return `Verbal order for ${o.patientName} from ${o.physicianName} was cancelled${actorName ? ` by ${actorName}` : ''}`;
  }
}

/**
 * Inbound-fax matcher: which open orders could this fax be the signed copy of?
 * Fax services report two sender numbers: the line's caller ID and the
 * machine's own "remote ID" header. Cloud fax providers (MetroFax, for one)
 * send a carrier number as caller ID and put the real fax number in the
 * remote ID, so both are checked.
 */
export function candidateOrdersForInboundFax(
  senderNumbers: string | string[],
  openOrders: Pick<VerbalOrder, 'id' | 'physicianFax' | 'status'>[],
): string[] {
  const raws = Array.isArray(senderNumbers) ? senderNumbers : [senderNumbers];
  const froms = new Set(raws.map(normalizeUSFaxNumber).filter(Boolean));
  if (froms.size === 0) return [];
  return openOrders
    .filter((o) => isVerbalOrderOpen(o) && froms.has(normalizeUSFaxNumber(o.physicianFax)))
    .map((o) => o.id);
}
