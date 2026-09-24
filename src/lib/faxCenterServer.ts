import 'server-only';
import React from 'react';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { renderToBuffer } from '@react-pdf/renderer';
import { PDFDocument } from 'pdf-lib';
import { FieldValue } from 'firebase-admin/firestore';
import { adminBucket, adminDb } from './firebaseAdmin';
import { requireRole, AdminAuthError, type AuthedCaller } from './adminAuthGuard';
import { getServerSettings } from './settingsServer';
import { createPortalNotification } from './notificationsServer';
import { srfaxConfig, srfaxGetFaxStatus, srfaxQueueFax } from './fax/srfax';
import { SHARE_SITE_URL } from './shareLink';
import { returnFaxNumber } from './verbalOrderServer';
import { normalizeUSFaxNumber } from './verbalOrderShared';
import { canUseFax, FAX_MAX_PAGES, type FaxSendInput, type OutboundFax, type OutboundFaxPpot } from './faxShared';
import { PPOT_REQUEST_LABEL } from './ppotShared';
import FaxCoverPDF from './pdf/FaxCoverPDF';

/**
 * Fax Center, server side. Every write goes through here (Admin SDK);
 * firestore.rules and storage.rules default-deny both locations.
 *
 *   outboundFaxes/{id}                    one fax: recipient, delivery state, who sent it
 *   faxes/outbound/{id}/{fileName} (GCS)  the exact PDF that was sent (cover included)
 *
 * The stored PDF is the audit copy: what went to which number, when, and by
 * whom. A retry resends those same bytes.
 */

const COL = 'outboundFaxes';

function toIso(ts: unknown): string | null {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : null;
}

export function serializeOutboundFax(id: string, d: FirebaseFirestore.DocumentData): OutboundFax {
  const pp = d.ppot as Record<string, unknown> | undefined;
  return {
    id,
    kind: d.kind === 'ppot' ? 'ppot' : 'general',
    ppot: pp
      ? {
          requestType: pp.requestType === 'recert' ? 'recert' : 'new',
          subjectKind: pp.subjectKind === 'client' ? 'client' : 'referral',
          subjectId: String(pp.subjectId || ''),
          memberName: String(pp.memberName || ''),
          dob: String(pp.dob || ''),
          medicaidId: String(pp.medicaidId || ''),
        }
      : null,
    recipientName: String(d.recipientName || ''),
    recipientOrg: String(d.recipientOrg || ''),
    toNumber: String(d.toNumber || ''),
    regarding: String(d.regarding || ''),
    note: String(d.note || ''),
    includeCover: d.includeCover !== false,
    fileName: String(d.fileName || ''),
    pages: Number(d.pages || 0),
    faxDetailsId: String(d.faxDetailsId || ''),
    sentStatus: String(d.sentStatus || ''),
    error: String(d.error || ''),
    attempts: Number(d.attempts || 0),
    queuedAt: toIso(d.queuedAt),
    sentAt: toIso(d.sentAt),
    sentBy: String(d.sentBy || ''),
    sentByName: String(d.sentByName || ''),
    createdAt: toIso(d.createdAt),
  };
}

/**
 * Role check plus the Settings grant. Throws AdminAuthError (403) for a
 * signed-in staff member the admin hasn't given fax access, so routes can
 * handle it exactly like requireRole.
 */
export async function requireFaxAccess(request: Request): Promise<AuthedCaller> {
  const caller = await requireRole(request, ['admin', 'supervisor', 'va']);
  const settings = await getServerSettings();
  if (!settings.fax.enabled) throw new AdminAuthError(403, 'The Fax Center is turned off. An admin can turn it on in Settings.');
  if (!canUseFax(settings.fax, caller.uid, caller.role)) {
    throw new AdminAuthError(403, 'You do not have Fax Center access. Ask an admin to add you in Settings.');
  }
  return caller;
}

/** Per-fax webhook key, HMAC(CRON_SECRET) over a prefixed id so a verbal
 *  order's notify key can never be replayed here (or the reverse). */
export function outboundFaxWebhookKey(faxId: string): string {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return '';
  return createHmac('sha256', secret).update(`outbound-fax:${faxId}`).digest('base64url');
}

export function verifyOutboundFaxWebhookKey(faxId: string, key: string): boolean {
  const expected = outboundFaxWebhookKey(faxId);
  if (!expected || !key || expected.length !== key.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(key));
}

function printDate(): string {
  return new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
}

export class FaxDocumentError extends Error {}

/** Load the uploaded PDF, refusing anything we can't count or merge. */
async function loadUpload(pdf: Buffer): Promise<PDFDocument> {
  if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new FaxDocumentError('The file must be a PDF.');
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(pdf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/encrypt/i.test(msg)) throw new FaxDocumentError('That PDF is password protected. Save an unprotected copy and try again.');
    throw new FaxDocumentError('That PDF could not be read. Try saving or printing it to a new PDF.');
  }
  const pages = doc.getPageCount();
  if (pages < 1) throw new FaxDocumentError('That PDF has no pages.');
  if (pages > FAX_MAX_PAGES) throw new FaxDocumentError(`Fax at most ${FAX_MAX_PAGES} pages at a time.`);
  return doc;
}

/** Build what actually goes over the wire: cover sheet (optional) + upload. */
async function buildFaxPdf(p: {
  upload: PDFDocument;
  input: FaxSendInput;
  toNumber: string;
  senderName: string;
  reference: string;
  ppot?: OutboundFaxPpot;
}): Promise<{ bytes: Buffer; pages: number }> {
  const uploadPages = p.upload.getPageCount();
  if (!p.input.includeCover) {
    return { bytes: Buffer.from(await p.upload.save()), pages: uploadPages };
  }
  const totalPages = uploadPages + 1;
  const element = React.createElement(FaxCoverPDF, {
    recipientName: p.input.recipientName.trim(),
    recipientOrg: p.input.recipientOrg.trim(),
    toNumber: p.toNumber,
    senderName: p.senderName,
    returnFax: await returnFaxNumber(),
    totalPages,
    sentDate: printDate(),
    regarding: p.input.regarding.trim(),
    note: p.input.note.trim(),
    reference: p.reference,
    ppot: p.ppot
      ? { requestLabel: PPOT_REQUEST_LABEL[p.ppot.requestType], memberName: p.ppot.memberName, dob: p.ppot.dob, medicaidId: p.ppot.medicaidId }
      : undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pdf's renderToBuffer wants its own element type
  }) as any;
  const cover = await PDFDocument.load(await renderToBuffer(element));
  const out = await PDFDocument.create();
  for (const page of await out.copyPages(cover, cover.getPageIndices())) out.addPage(page);
  for (const page of await out.copyPages(p.upload, p.upload.getPageIndices())) out.addPage(page);
  return { bytes: Buffer.from(await out.save()), pages: totalPages };
}

async function queue(faxId: string, toNumber: string, fileName: string, pdf: Buffer) {
  const key = outboundFaxWebhookKey(faxId);
  const notifyUrl = key ? `${SHARE_SITE_URL}/api/fax/status?key=${encodeURIComponent(key)}&id=${encodeURIComponent(faxId)}` : undefined;
  return srfaxQueueFax({
    toTenDigits: toNumber,
    fileName,
    pdf,
    notifyUrl,
    accountCode: faxId.slice(0, 20),
    fromHeader: 'Heart and Soul Healthcare',
  });
}

export interface SendFaxResult {
  ok: boolean;
  fax?: OutboundFax;
  error?: string;
  status?: number;
}

/**
 * Build, store, and queue one fax. The record is written before SRFax is
 * called so even a failed attempt leaves an audit trail (and a Retry button).
 */
export async function sendOutboundFax(p: {
  input: FaxSendInput;
  pdf: Buffer;
  fileName: string;
  caller: AuthedCaller;
  /** Set for a PPOT request: forces the cover sheet and adds its member block. */
  ppot?: OutboundFaxPpot;
}): Promise<SendFaxResult> {
  if (!srfaxConfig()) return { ok: false, status: 503, error: 'Fax service is not configured on the portal yet.' };
  const toNumber = normalizeUSFaxNumber(p.input.toNumber);
  if (!toNumber) return { ok: false, status: 400, error: 'Enter a 10-digit US fax number.' };

  let upload: PDFDocument;
  try {
    upload = await loadUpload(p.pdf);
  } catch (err) {
    if (err instanceof FaxDocumentError) return { ok: false, status: 400, error: err.message };
    throw err;
  }

  const db = adminDb();
  const ref = db.collection(COL).doc();
  const senderName = p.caller.profile.displayName || p.caller.email || '';
  const input = p.ppot ? { ...p.input, includeCover: true } : p.input;
  const built = await buildFaxPdf({ upload, input, toNumber, senderName, reference: ref.id.slice(0, 8).toUpperCase(), ppot: p.ppot });
  const storagePath = `faxes/outbound/${ref.id}/${p.fileName}`;
  await adminBucket().file(storagePath).save(built.bytes, { contentType: 'application/pdf', resumable: false });

  await ref.set({
    kind: p.ppot ? 'ppot' : 'general',
    ppot: p.ppot ?? null,
    recipientName: p.input.recipientName.trim(),
    recipientOrg: p.input.recipientOrg.trim(),
    toNumber,
    regarding: p.input.regarding.trim(),
    note: p.input.note.trim(),
    includeCover: input.includeCover,
    fileName: p.fileName,
    storagePath,
    pages: built.pages,
    provider: 'srfax',
    faxDetailsId: '',
    sentStatus: '',
    error: '',
    attempts: 0,
    queuedAt: null,
    sentAt: null,
    sentBy: p.caller.uid,
    sentByName: senderName,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await attempt(ref.id, toNumber, p.fileName, built.bytes, { uid: p.caller.uid, name: senderName });
  const snap = await ref.get();
  const fax = serializeOutboundFax(snap.id, snap.data() || {});
  if (fax.sentStatus === 'Failed') return { ok: false, status: 502, fax, error: fax.error || 'The fax could not be queued.' };
  return { ok: true, fax };
}

async function attempt(faxId: string, toNumber: string, fileName: string, pdf: Buffer, actor: { uid: string; name: string }): Promise<void> {
  const ref = adminDb().collection(COL).doc(faxId);
  const result = await queue(faxId, toNumber, fileName, pdf);
  if (result.ok && result.faxDetailsId) {
    await ref.update({
      faxDetailsId: result.faxDetailsId,
      sentStatus: 'In Progress',
      error: '',
      attempts: FieldValue.increment(1),
      queuedAt: FieldValue.serverTimestamp(),
      sentAt: null,
      lastAttemptBy: actor.uid,
      lastAttemptByName: actor.name,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }
  await ref.update({
    sentStatus: 'Failed',
    error: result.error || 'The fax could not be queued.',
    attempts: FieldValue.increment(1),
    lastAttemptBy: actor.uid,
    lastAttemptByName: actor.name,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** Resend the stored PDF of a fax that failed. */
export async function retryOutboundFax(faxId: string, caller: AuthedCaller): Promise<SendFaxResult> {
  if (!srfaxConfig()) return { ok: false, status: 503, error: 'Fax service is not configured on the portal yet.' };
  const ref = adminDb().collection(COL).doc(faxId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, status: 404, error: 'Fax not found.' };
  const d = snap.data() || {};
  if (d.sentStatus !== 'Failed') return { ok: false, status: 409, error: 'Only a failed fax can be resent.' };
  const [bytes] = await adminBucket().file(String(d.storagePath || '')).download();
  await attempt(faxId, String(d.toNumber), String(d.fileName || 'document.pdf'), bytes, { uid: caller.uid, name: caller.profile.displayName || caller.email || '' });
  const after = serializeOutboundFax(faxId, (await ref.get()).data() || {});
  if (after.sentStatus === 'Failed') return { ok: false, status: 502, fax: after, error: after.error || 'The fax could not be queued.' };
  return { ok: true, fax: after };
}

/** The stored copy of what was sent, for the outbox's View button. */
export async function readOutboundFaxPdf(faxId: string): Promise<{ bytes: Buffer; fileName: string } | null> {
  const snap = await adminDb().collection(COL).doc(faxId).get();
  if (!snap.exists) return null;
  const d = snap.data() || {};
  if (!d.storagePath) return null;
  const [bytes] = await adminBucket().file(String(d.storagePath)).download();
  return { bytes, fileName: String(d.fileName || 'fax.pdf') };
}

/**
 * Apply a delivery status read from SRFax. Ignores a status for a superseded
 * attempt (someone hit Retry) and rings the sender's bell on failure.
 */
export async function recordOutboundFaxStatus(faxId: string, st: { sentStatus: string; errorCode?: string; faxDetailsId: string }): Promise<void> {
  const ref = adminDb().collection(COL).doc(faxId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const d = snap.data() || {};
  if (String(d.faxDetailsId || '') !== st.faxDetailsId) return;
  if (d.sentStatus === st.sentStatus) return;
  const patch: Record<string, unknown> = {
    sentStatus: st.sentStatus,
    error: st.sentStatus === 'Failed' ? String(st.errorCode || 'Delivery failed') : '',
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (st.sentStatus === 'Sent') patch.sentAt = FieldValue.serverTimestamp();
  await ref.update(patch);
  if (st.sentStatus === 'Failed' && d.sentBy) {
    const who = [d.recipientName, d.recipientOrg].filter(Boolean).join(', ');
    await createPortalNotification(adminDb(), {
      userId: String(d.sentBy),
      kind: 'fax-failed',
      text: `Your fax to ${who || 'a recipient'} did not go through. Open the Fax Center to resend it.`,
      href: '/admin/fax',
    });
  }
}

/** Ask SRFax for the current status of one in-flight fax and record it. */
export async function refreshOutboundFaxStatus(faxId: string): Promise<boolean> {
  const snap = await adminDb().collection(COL).doc(faxId).get();
  const faxDetailsId = String((snap.data() || {}).faxDetailsId || '');
  if (!snap.exists || !faxDetailsId) return false;
  const st = await srfaxGetFaxStatus(faxDetailsId);
  if (!st.ok || !st.sentStatus || st.sentStatus === 'In Progress' || st.sentStatus === 'Sending Email') return false;
  await recordOutboundFaxStatus(faxId, { sentStatus: st.sentStatus, errorCode: st.errorCode, faxDetailsId });
  return true;
}

/**
 * Safety net for missed webhooks: poll faxes still in flight more than
 * `olderThanMs` after queueing. Used by the list route (so the outbox is
 * current when someone looks) and by the every-10-minutes cron.
 */
export async function pollInFlightFaxes(opts: { olderThanMs: number; limit: number }): Promise<{ polled: number; errors: string[] }> {
  const snap = await adminDb().collection(COL).where('sentStatus', '==', 'In Progress').limit(opts.limit).get();
  let polled = 0;
  const errors: string[] = [];
  for (const doc of snap.docs) {
    const queuedAt = toIso(doc.data().queuedAt);
    if (queuedAt && Date.now() - Date.parse(queuedAt) < opts.olderThanMs) continue;
    try {
      if (await refreshOutboundFaxStatus(doc.id)) polled++;
    } catch (err) {
      errors.push(`fax ${doc.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { polled, errors };
}

export async function listOutboundFaxes(limit: number): Promise<OutboundFax[]> {
  const snap = await adminDb().collection(COL).orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((d) => serializeOutboundFax(d.id, d.data() || {}));
}
