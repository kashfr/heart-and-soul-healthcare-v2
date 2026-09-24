import 'server-only';
import React from 'react';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { renderToBuffer } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { FieldValue } from 'firebase-admin/firestore';
import { adminBucket, adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';
import { getServerSettings } from './settingsServer';
import { srfaxConfig, srfaxQueueFax } from './fax/srfax';
import { SHARE_SITE_URL } from './shareLink';
import { formatDateUSFile } from './dateFormat';
import VerbalOrderPDF from './pdf/VerbalOrderPDF';
import {
  normalizeUSFaxNumber,
  parseVerbalOrderStatus,
  verbalOrderBellText,
  type VerbalOrderBellKind,
  type VerbalOrder,
  type VerbalOrderInput,
  type VerbalOrderSignMethod,
} from './verbalOrderShared';

/**
 * Firestore side of verbal orders. Every write goes through here (Admin SDK);
 * firestore.rules denies all client writes and scopes reads to staff, the
 * taking nurse, and the client's care team.
 *
 *   verbalOrders/{id}         the order, its fax state, and its signature
 *   verbalOrderSignTokens/{t} one-time public e-sign token -> order id
 */

const COL = 'verbalOrders';
const TOKENS = 'verbalOrderSignTokens';

function toIso(ts: unknown): string | null {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : null;
}

export function agencyTodayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function serializeVerbalOrder(id: string, d: FirebaseFirestore.DocumentData): VerbalOrder {
  const fax = d.fax
    ? {
        provider: d.fax.provider === 'manual' ? ('manual' as const) : ('srfax' as const),
        toNumber: String(d.fax.toNumber || ''),
        faxDetailsId: String(d.fax.faxDetailsId || ''),
        sentStatus: String(d.fax.sentStatus || ''),
        queuedAt: toIso(d.fax.queuedAt),
        sentAt: toIso(d.fax.sentAt),
        error: String(d.fax.error || ''),
        attempts: Number(d.fax.attempts || 0),
      }
    : null;
  const signed = d.signed
    ? {
        method: (['fax', 'esign', 'manual'].includes(d.signed.method) ? d.signed.method : 'manual') as VerbalOrderSignMethod,
        signedDate: String(d.signed.signedDate || ''),
        physicianPrintedName: String(d.signed.physicianPrintedName || ''),
        physicianSignature: String(d.signed.physicianSignature || ''),
        receivedAt: toIso(d.signed.receivedAt),
        receivedBy: String(d.signed.receivedBy || ''),
        receivedByName: String(d.signed.receivedByName || ''),
        documentId: String(d.signed.documentId || ''),
        inboundFaxFileName: String(d.signed.inboundFaxFileName || ''),
      }
    : null;
  const cancelled = d.cancelled
    ? {
        reason: String(d.cancelled.reason || ''),
        cancelledAt: toIso(d.cancelled.cancelledAt),
        cancelledBy: String(d.cancelled.cancelledBy || ''),
        cancelledByName: String(d.cancelled.cancelledByName || ''),
      }
    : null;
  return {
    id,
    patientId: String(d.patientId || ''),
    patientName: String(d.patientName || ''),
    patientDob: String(d.patientDob || ''),
    orderType: d.orderType === 'other' ? 'other' : 'medication',
    physicianName: String(d.physicianName || ''),
    physicianPhone: String(d.physicianPhone || ''),
    physicianFax: String(d.physicianFax || ''),
    physicianSpecialty: String(d.physicianSpecialty || ''),
    orderText: String(d.orderText || ''),
    readBackVerified: d.readBackVerified === true,
    nurseId: String(d.nurseId || ''),
    nurseName: String(d.nurseName || ''),
    nurseCredential: String(d.nurseCredential || ''),
    nurseSignature: String(d.nurseSignature || ''),
    takenAt: toIso(d.takenAt),
    takenDate: String(d.takenDate || ''),
    status: parseVerbalOrderStatus(d.status),
    marChangeRequestId: String(d.marChangeRequestId || ''),
    marOrderId: String(d.marOrderId || ''),
    marChangeType: (['add', 'change', 'discontinue'].includes(d.marChangeType) ? d.marChangeType : '') as VerbalOrder['marChangeType'],
    marMedName: String(d.marMedName || ''),
    fax,
    signed,
    cancelled,
    reminderSentAt: toIso(d.reminderSentAt),
    escalatedAt: toIso(d.escalatedAt),
    createdAt: toIso(d.createdAt),
  };
}

export async function getVerbalOrder(id: string): Promise<VerbalOrder | null> {
  const snap = await adminDb().collection(COL).doc(id).get();
  return snap.exists ? serializeVerbalOrder(snap.id, snap.data() || {}) : null;
}

/** The number printed on the form for the physician to fax back to. */
export async function returnFaxNumber(): Promise<string> {
  const settings = await getServerSettings().catch(() => null);
  const fromSettings = settings?.verbalOrders?.returnFax || '';
  if (fromSettings) return fromSettings;
  return srfaxConfig()?.faxNumber || normalizeUSFaxNumber(process.env.SRFAX_FAX_NUMBER || '') || '6788023121';
}

export async function verbalOrderThresholds(): Promise<{ overdueDays: number; escalateDays: number }> {
  const settings = await getServerSettings().catch(() => null);
  return {
    overdueDays: settings?.verbalOrders?.overdueDays ?? 14,
    escalateDays: settings?.verbalOrders?.escalateDays ?? 30,
  };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateVerbalOrderParams {
  input: VerbalOrderInput;
  caller: AuthedCaller;
  patient: { id: string; name: string; dob: string };
  /** Medication orders: the MAR change applied alongside (already done by the route). */
  mar?: { changeRequestId: string; orderId: string; type: 'add' | 'change' | 'discontinue'; medName: string };
}

export async function createVerbalOrder(p: CreateVerbalOrderParams): Promise<{ id: string; signToken: string }> {
  const db = adminDb();
  const ref = db.collection(COL).doc();
  const signToken = randomBytes(24).toString('base64url');
  // One transaction: the order, its e-sign token (server-only collection; the
  // token is never stored on the readable order doc), the MAR order tag, and
  // the MAR change link. The link is asserted inside the transaction so two
  // submits racing on the same change can't both attach.
  await db.runTransaction(async (tx) => {
    let marReqRef: FirebaseFirestore.DocumentReference | null = null;
    if (p.mar?.changeRequestId) {
      marReqRef = db.collection('marChangeRequests').doc(p.mar.changeRequestId);
      const reqSnap = await tx.get(marReqRef);
      if (!reqSnap.exists) throw new Error('MAR change not found.');
      if (String((reqSnap.data() || {}).verbalOrderId || '')) throw new Error('That MAR change is already attached to a verbal order.');
    }
    tx.set(ref, {
      patientId: p.patient.id,
      patientName: p.patient.name,
      patientDob: p.patient.dob,
      orderType: p.input.orderType,
      physicianName: p.input.physicianName.trim(),
      physicianPhone: p.input.physicianPhone.trim(),
      physicianFax: normalizeUSFaxNumber(p.input.physicianFax),
      physicianSpecialty: p.input.physicianSpecialty.trim(),
      orderText: p.input.orderText.trim(),
      readBackVerified: true,
      nurseId: p.caller.uid,
      nurseName: p.caller.profile.displayName || p.caller.email || '',
      nurseCredential: p.caller.profile.credential || '',
      nurseSignature: p.input.nurseSignature,
      takenAt: FieldValue.serverTimestamp(),
      takenDate: agencyTodayISO(),
      status: 'taken',
      marChangeRequestId: p.mar?.changeRequestId || '',
      marOrderId: p.mar?.orderId || '',
      marChangeType: p.mar?.type || '',
      marMedName: p.mar?.medName || '',
      fax: null,
      signed: null,
      cancelled: null,
      reminderSentAt: null,
      escalatedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.collection(TOKENS).doc(signToken), { orderId: ref.id, createdAt: FieldValue.serverTimestamp(), usedAt: null });
    if (marReqRef) tx.set(marReqRef, { verbalOrderId: ref.id }, { merge: true });
    if (p.mar?.orderId) {
      tx.set(db.collection('marOrders').doc(p.mar.orderId), { verbalOrderId: ref.id, verbalOrderPending: true }, { merge: true });
    }
  });
  return { id: ref.id, signToken };
}

// ---------------------------------------------------------------------------
// PDF + fax
// ---------------------------------------------------------------------------

export function esignUrlFor(token: string): string {
  return `${SHARE_SITE_URL}/physician/verbal-order?t=${encodeURIComponent(token)}`;
}

export async function renderVerbalOrderPdf(order: VerbalOrder, signToken?: string): Promise<Buffer> {
  const returnFax = await returnFaxNumber();
  let esignUrl: string | undefined;
  let esignQrDataUrl: string | undefined;
  if ((order.status === 'taken' || order.status === 'faxed') && signToken) {
    esignUrl = esignUrlFor(signToken);
    esignQrDataUrl = await QRCode.toDataURL(esignUrl, { margin: 1, width: 240, errorCorrectionLevel: 'M' });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(VerbalOrderPDF, { order, returnFax, esignUrl, esignQrDataUrl }) as any;
  return Buffer.from(await renderToBuffer(element));
}

export function verbalOrderPdfFileName(order: VerbalOrder): string {
  const name = (order.patientName || 'client').replace(/[^a-zA-Z0-9-]+/g, '_').replace(/^_+|_+$/g, '');
  return `Verbal_Order_${name}_${formatDateUSFile(order.takenDate)}.pdf`;
}

/** The order's live e-sign token (server-only collection). '' once used. */
export async function readSignToken(orderId: string): Promise<string> {
  const snap = await adminDb().collection(TOKENS).where('orderId', '==', orderId).limit(1).get();
  if (snap.empty) return '';
  const d = snap.docs[0].data() || {};
  return d.usedAt ? '' : snap.docs[0].id;
}

/** Per-order webhook key: SRFax gets HMAC(CRON_SECRET, orderId), never the
 *  secret itself, so a leaked notify URL can't drive any other endpoint. */
export function faxWebhookKey(orderId: string): string {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return '';
  return createHmac('sha256', secret).update(orderId).digest('base64url');
}

export function verifyFaxWebhookKey(orderId: string, key: string): boolean {
  const expected = faxWebhookKey(orderId);
  if (!expected || !key || expected.length !== key.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(key));
}

export interface FaxAttemptResult {
  configured: boolean;
  ok: boolean;
  error?: string;
}

/**
 * Fax the authentication form to the physician. Records the attempt on the
 * order either way. When SRFax isn't configured the order stays 'taken' with a
 * manual-fax marker so the queue tells the office to send it by hand.
 */
export async function faxVerbalOrder(orderId: string, actor: { uid: string; name: string }): Promise<FaxAttemptResult> {
  const db = adminDb();
  const ref = db.collection(COL).doc(orderId);
  const order = await getVerbalOrder(orderId);
  if (!order) return { configured: true, ok: false, error: 'Verbal order not found.' };
  if (order.status === 'signed') return { configured: true, ok: false, error: 'This order is already signed.' };
  if (order.status === 'cancelled') return { configured: true, ok: false, error: 'This order was cancelled.' };
  const to = normalizeUSFaxNumber(order.physicianFax);
  if (!to) return { configured: true, ok: false, error: 'The physician fax number is missing or invalid.' };

  const cfg = srfaxConfig();
  const attempts = (order.fax?.attempts || 0) + 1;
  if (!cfg) {
    await ref.set(
      {
        fax: { provider: 'manual', toNumber: to, faxDetailsId: '', sentStatus: '', queuedAt: null, sentAt: null, error: 'Fax service not configured; send by hand.', attempts: order.fax?.attempts || 0 },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { configured: false, ok: false, error: 'Fax service is not configured. Download the PDF and fax it by hand.' };
  }

  const token = await readSignToken(orderId);
  const pdf = await renderVerbalOrderPdf(order, token);
  const webhookKey = faxWebhookKey(orderId);
  const notifyUrl = webhookKey ? `${SHARE_SITE_URL}/api/verbal-orders/fax-status?key=${encodeURIComponent(webhookKey)}&id=${encodeURIComponent(orderId)}` : undefined;
  const result = await srfaxQueueFax({
    toTenDigits: to,
    fileName: verbalOrderPdfFileName(order),
    pdf,
    notifyUrl,
    accountCode: orderId.slice(0, 20),
    fromHeader: 'Heart and Soul Healthcare',
  });

  if (result.ok && result.faxDetailsId) {
    await ref.set(
      {
        status: 'faxed',
        fax: { provider: 'srfax', toNumber: to, faxDetailsId: result.faxDetailsId, sentStatus: 'In Progress', queuedAt: FieldValue.serverTimestamp(), sentAt: null, error: '', attempts },
        faxQueuedBy: actor.uid,
        faxQueuedByName: actor.name,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { configured: true, ok: true };
  }
  await ref.set(
    {
      fax: { provider: 'srfax', toNumber: to, faxDetailsId: order.fax?.faxDetailsId || '', sentStatus: 'Failed', queuedAt: order.fax?.queuedAt ? new Date(order.fax.queuedAt) : null, sentAt: null, error: result.error || 'Queue_Fax failed.', attempts },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { configured: true, ok: false, error: result.error || 'The fax could not be queued.' };
}

/** Apply a delivery status (from the SRFax notify webhook or a status poll). */
export async function recordFaxStatus(orderId: string, status: { sentStatus: string; errorCode?: string; dateSent?: string; faxDetailsId?: string }): Promise<void> {
  const ref = adminDb().collection(COL).doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const d = snap.data() || {};
  if (d.status === 'signed' || d.status === 'cancelled') return;
  // A late notification for a superseded attempt (the office hit Resend)
  // must not overwrite the current attempt's status.
  const current = String((d.fax || {}).faxDetailsId || '');
  if (status.faxDetailsId && current && status.faxDetailsId !== current) return;
  const sentStatus = String(status.sentStatus || '');
  const patch: Record<string, unknown> = {
    'fax.sentStatus': sentStatus,
    'fax.error': sentStatus === 'Failed' ? String(status.errorCode || 'Delivery failed') : '',
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (sentStatus === 'Sent') patch['fax.sentAt'] = FieldValue.serverTimestamp();
  await ref.update(patch);
  if (sentStatus === 'Failed') {
    await notifyStaff('fax-failed', serializeVerbalOrder(snap.id, d), `/admin/verbal-orders?vo=${snap.id}`);
  }
}

// ---------------------------------------------------------------------------
// Signature intake (fax return, e-sign, or office record) + filing
// ---------------------------------------------------------------------------

export interface RecordSignedParams {
  orderId: string;
  method: VerbalOrderSignMethod;
  signedDate: string; // YYYY-MM-DD
  physicianPrintedName: string;
  physicianSignature?: string; // e-sign PNG data URL
  receivedBy: { uid: string; name: string };
  /** The signed copy to file under the client's Documents (PDF bytes). */
  signedPdf?: Buffer;
  inboundFaxFileName?: string;
}

/**
 * Close the loop: mark the order signed, file the signed copy in the client's
 * Documents (Physician Orders), and stamp the MAR order's signed date so the
 * currency tile stops counting it. Idempotent: a second call on a signed
 * order is a no-op.
 */
export async function recordVerbalOrderSigned(p: RecordSignedParams): Promise<{ ok: boolean; alreadySigned?: boolean; cancelled?: boolean; documentId?: string; error?: string }> {
  const db = adminDb();
  const ref = db.collection(COL).doc(p.orderId);
  const order = await getVerbalOrder(p.orderId);
  if (!order) return { ok: false, error: 'Verbal order not found.' };
  if (order.status === 'signed') return { ok: true, alreadySigned: true, documentId: order.signed?.documentId };
  if (order.status === 'cancelled') return { ok: false, cancelled: true, error: 'This order was cancelled and can no longer be signed.' };
  // Claim the transition atomically so two concurrent intakes (a returned fax
  // and an office record, say) can't both file a copy.
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() || {};
    if (d.status === 'cancelled') return 'cancelled' as const;
    if (d.status === 'signed' || d.signingClaimedAt) return false;
    tx.update(ref, { signingClaimedAt: FieldValue.serverTimestamp() });
    return true;
  });
  if (claimed === 'cancelled') return { ok: false, cancelled: true, error: 'This order was cancelled and can no longer be signed.' };
  if (!claimed) {
    const again = await getVerbalOrder(p.orderId);
    return { ok: true, alreadySigned: true, documentId: again?.signed?.documentId };
  }

  // Provisional signed record so the PDF render below prints the completed
  // form (physician block filled) when we file it.
  const signedRecord = {
    method: p.method,
    signedDate: p.signedDate,
    physicianPrintedName: p.physicianPrintedName.trim() || order.physicianName,
    physicianSignature: p.physicianSignature || '',
    receivedAt: new Date().toISOString(),
    receivedBy: p.receivedBy.uid,
    receivedByName: p.receivedBy.name,
    documentId: '',
    inboundFaxFileName: p.inboundFaxFileName || '',
  };

  // What gets filed: the returned fax when we have it, else the completed
  // form rendered with the e-sign / recorded signature block.
  let fileBytes = p.signedPdf;
  if (!fileBytes) {
    fileBytes = await renderVerbalOrderPdf({ ...order, status: 'signed', signed: signedRecord });
  }

  let documentId = '';
  try {
    const docRef = db.collection('patientDocuments').doc();
    const fileName = `Verbal_Order_Signed_${formatDateUSFile(p.signedDate)}.pdf`;
    const storagePath = `patients/${order.patientId}/documents/${docRef.id}/${fileName}`;
    await adminBucket().file(storagePath).save(fileBytes, { contentType: 'application/pdf', resumable: false });
    await docRef.set({
      patientId: order.patientId,
      category: 'Physician Orders',
      title: `Signed verbal order: ${order.orderType === 'medication' && order.marMedName ? order.marMedName : order.physicianName} (${p.signedDate})`,
      fileName,
      storagePath,
      contentType: 'application/pdf',
      size: fileBytes.length,
      docDate: p.signedDate,
      uploadedBy: p.receivedBy.uid || 'system',
      uploadedByName: p.receivedBy.name || 'Portal (verbal order)',
      uploadedByRole: 'system',
      uploadedAt: FieldValue.serverTimestamp(),
      archived: false,
      verbalOrderId: order.id,
    });
    documentId = docRef.id;
  } catch (err) {
    // Filing is best-effort: the signature record below is the source of
    // truth, and the office can re-file from the queue.
    console.error('Verbal order: filing the signed copy failed:', err);
  }

  const batch = db.batch();
  batch.set(
    ref,
    {
      status: 'signed',
      signed: { ...signedRecord, receivedAt: FieldValue.serverTimestamp(), documentId },
      signingClaimedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  if (order.marOrderId) {
    batch.set(
      db.collection('marOrders').doc(order.marOrderId),
      { orderSignedDate: p.signedDate, verbalOrderPending: false, lastEditedAt: FieldValue.serverTimestamp(), lastEditedBy: p.receivedBy.uid || 'system', lastEditedByName: p.receivedBy.name || 'Portal (verbal order)' },
      { merge: true },
    );
  }
  await batch.commit();
  await notifyStaff('signed', order, `/admin/verbal-orders?vo=${order.id}`);
  return { ok: true, documentId };
}

// ---------------------------------------------------------------------------
// Cancel (void)
// ---------------------------------------------------------------------------

export interface CancelVerbalOrderParams {
  orderId: string;
  reason: string;
  actor: { uid: string; name: string };
}

/**
 * Void an unsigned order: entered in error, wrong client, or the physician
 * won't sign it. Nothing is deleted. The order keeps its text, nurse
 * signature, and fax history, gains a `cancelled` record (who, when, why),
 * and drops out of the queue, the sweep, the inbound-fax matcher, and e-sign.
 *
 * The MAR change a medication order authorized is NOT reversed here: whether
 * that med stays is a clinical call. The MAR order's "awaiting signature"
 * badge is cleared and it is tagged verbalOrderCancelled so the office can
 * review it in Manage meds.
 */
export interface CancelVerbalOrderResult {
  ok: boolean;
  status?: number;
  error?: string;
  order?: VerbalOrder;
}

export async function cancelVerbalOrder(p: CancelVerbalOrderParams): Promise<CancelVerbalOrderResult> {
  const db = adminDb();
  const ref = db.collection(COL).doc(p.orderId);
  const result = await db.runTransaction(async (tx): Promise<CancelVerbalOrderResult> => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, status: 404, error: 'Verbal order not found.' };
    const d = snap.data() || {};
    if (d.status === 'cancelled') return { ok: false, status: 409, error: 'This order is already cancelled.' };
    if (d.status === 'signed') return { ok: false, status: 409, error: 'This order is already signed and cannot be cancelled.' };
    // A signature intake is mid-flight (returned fax or e-sign being filed).
    if (d.signingClaimedAt) return { ok: false, status: 409, error: 'A signature for this order is being recorded right now. Refresh and try again.' };
    tx.update(ref, {
      status: 'cancelled',
      cancelled: { reason: p.reason, cancelledAt: FieldValue.serverTimestamp(), cancelledBy: p.actor.uid, cancelledByName: p.actor.name },
      updatedAt: FieldValue.serverTimestamp(),
    });
    const marOrderId = String(d.marOrderId || '');
    if (marOrderId) {
      tx.set(
        db.collection('marOrders').doc(marOrderId),
        { verbalOrderPending: false, verbalOrderCancelled: true, lastEditedAt: FieldValue.serverTimestamp(), lastEditedBy: p.actor.uid, lastEditedByName: p.actor.name },
        { merge: true },
      );
    }
    return { ok: true, order: serializeVerbalOrder(snap.id, d) };
  });
  if (!result.ok || !result.order) return result;
  // Retire the e-sign link so the physician can't sign a voided order.
  try {
    const tokens = await db.collection(TOKENS).where('orderId', '==', p.orderId).get();
    const batch = db.batch();
    tokens.docs.forEach((t) => batch.set(t.ref, { cancelledAt: FieldValue.serverTimestamp() }, { merge: true }));
    if (!tokens.empty) await batch.commit();
  } catch (err) {
    // lookupSignToken also checks the order's status, so this is belt and braces.
    console.error('Verbal order cancel: retiring the e-sign token failed:', err);
  }
  await notifyStaff('cancelled', result.order, `/admin/verbal-orders?vo=${p.orderId}`, p.actor);
  return result;
}

// ---------------------------------------------------------------------------
// Public e-sign token
// ---------------------------------------------------------------------------

export async function lookupSignToken(token: string): Promise<{ order: VerbalOrder; used: boolean; cancelled: boolean } | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const snap = await adminDb().collection(TOKENS).doc(token).get();
  if (!snap.exists) return null;
  const d = snap.data() || {};
  const order = await getVerbalOrder(String(d.orderId || ''));
  if (!order) return null;
  return { order, used: !!d.usedAt || order.status === 'signed', cancelled: order.status === 'cancelled' || !!d.cancelledAt };
}

export async function markSignTokenUsed(token: string): Promise<void> {
  await adminDb().collection(TOKENS).doc(token).set({ usedAt: FieldValue.serverTimestamp() }, { merge: true });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/** Bell every active admin + supervisor (never the taking nurse for 'taken'). */
export async function notifyStaffGeneric(text: string, href: string): Promise<number> {
  const db = adminDb();
  const staff = await db.collection('users').where('role', 'in', ['admin', 'supervisor']).get();
  let n = 0;
  for (const u of staff.docs) {
    if ((u.data() as { active?: boolean }).active === false) continue;
    try {
      await db.collection('notifications').add({ userId: u.id, kind: 'verbal-order-inbound', text, href, createdAt: FieldValue.serverTimestamp(), readAt: null });
      n++;
    } catch (err) {
      console.error('Verbal order bell failed:', err);
    }
  }
  return n;
}

export async function notifyStaff(kind: VerbalOrderBellKind, order: VerbalOrder, href: string, actor?: { uid: string; name: string }): Promise<number> {
  const db = adminDb();
  const staff = await db.collection('users').where('role', 'in', ['admin', 'supervisor']).get();
  const text = verbalOrderBellText(kind, order, actor?.name || '');
  let n = 0;
  for (const u of staff.docs) {
    const data = u.data() as { active?: boolean };
    if (data.active === false) continue;
    if (kind === 'taken' && u.id === order.nurseId) continue;
    if (actor?.uid && u.id === actor.uid) continue; // don't bell someone about their own action
    try {
      await db.collection('notifications').add({ userId: u.id, kind: `verbal-order-${kind}`, text, href, createdAt: FieldValue.serverTimestamp(), readAt: null });
      n++;
    } catch (err) {
      console.error('Verbal order bell failed:', err);
    }
  }
  return n;
}
