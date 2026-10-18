import 'server-only';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { FieldValue } from 'firebase-admin/firestore';
import { adminBucket, adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';
import { addReferralDocument } from './referralDocumentsServer';
import { logReferralActivity } from './referrals';
import { formatDateUS, formatDateUSFile } from './dateFormat';

/**
 * Upload Document on a referral's card: any PDF, however it arrived
 * (PandaDoc, email, the family, a scan), filed the same way a fax filed to the
 * referral is (referralDocuments, moved to the client's Documents on Create
 * Client Record). A signed Appendix T can instead be filed against the
 * referral's open PPOT request, exactly as "File as Signed PPOT" does for a
 * fax, so PPOT tracking and the card's Signed PPOT row stay right.
 */

export const REFERRAL_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export type UploadResult = { ok: true; documentId: string } | { ok: false; status: number; error: string };

async function opens(pdf: Buffer): Promise<boolean> {
  if (pdf.subarray(0, 5).toString() !== '%PDF-') return false;
  try {
    await PDFDocument.load(pdf);
    return true;
  } catch {
    return false;
  }
}

function fileStem(title: string): string {
  return title.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'Document';
}

async function referralForUpload(referralId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const snap = await adminDb().collection('referrals').doc(referralId).get();
  if (!snap.exists) return { ok: false, status: 404, error: 'That referral was not found.' };
  if (snap.data()?.patientId) {
    return { ok: false, status: 409, error: 'This referral already has a client record. Upload it on the client’s Documents tab instead.' };
  }
  return { ok: true };
}

/** Whether the referral has a PPOT request still waiting on the signed Appendix T. */
export async function openPpotForReferral(referralId: string): Promise<{ open: boolean; recipientName: string }> {
  const snap = await adminDb().collection('ppotRequests').doc(`referral_${referralId}`).get();
  const x = snap.data() || {};
  return { open: snap.exists && x.status === 'sent', recipientName: String(x.recipientName || '') };
}

export async function uploadReferralDocument(p: {
  referralId: string;
  pdf: Buffer;
  category: string;
  title: string;
  docDate: string;
  caller: AuthedCaller;
}): Promise<UploadResult> {
  const ready = await referralForUpload(p.referralId);
  if (!ready.ok) return ready;
  if (!(await opens(p.pdf))) return { ok: false, status: 400, error: 'The file must be a PDF that opens (not password protected).' };
  const by = { uid: p.caller.uid, name: p.caller.profile.displayName || p.caller.email || '', role: p.caller.role };
  const documentId = await addReferralDocument({
    referralId: p.referralId,
    pdf: p.pdf,
    category: p.category,
    title: p.title,
    fileName: `${fileStem(p.title)}_${formatDateUSFile(p.docDate)}.pdf`,
    docDate: p.docDate,
    by,
  });
  await adminDb().collection('referrals').doc(p.referralId).update({ updatedAt: FieldValue.serverTimestamp() });
  await logReferralActivity(p.referralId, {
    type: 'note',
    text: `Document uploaded: "${p.title}" (${p.category}, ${formatDateUS(p.docDate)}). It moves to the client’s Documents when the client record is created.`,
    byUid: by.uid,
    byName: by.name,
    byRole: by.role,
  }).catch((err) => console.error('Referral upload: activity failed (non-fatal):', err));
  return { ok: true, documentId };
}

/**
 * File an uploaded signed Appendix T against the referral's open PPOT request.
 * Kept with the request (ppot/signed/...), like a faxed one, so the Fax Center
 * stops following up and Create Client Record copies it to Documents. The
 * claim is transactional: two people can't file one request twice.
 */
export async function uploadSignedPpotForReferral(p: {
  referralId: string;
  pdf: Buffer;
  signedDate: string;
  caller: AuthedCaller;
}): Promise<UploadResult> {
  const ready = await referralForUpload(p.referralId);
  if (!ready.ok) return ready;
  if (!(await opens(p.pdf))) return { ok: false, status: 400, error: 'The file must be a PDF that opens (not password protected).' };
  const db = adminDb();
  const key = `referral_${p.referralId}`;
  const requestRef = db.collection('ppotRequests').doc(key);
  const byName = p.caller.profile.displayName || p.caller.email || '';
  const fileName = `Appendix_T_Signed_${formatDateUSFile(p.signedDate)}.pdf`;
  const storagePath = `ppot/signed/${key}/upload_${randomUUID()}/${fileName}`;
  await adminBucket().file(storagePath).save(p.pdf, { contentType: 'application/pdf', resumable: false });

  const claimed = await db.runTransaction(async (tx) => {
    const req = await tx.get(requestRef);
    if (!req.exists) return { status: 404, error: 'This referral has no PPOT request. Upload it as a document instead.' };
    const x = req.data() || {};
    if (x.subjectKind !== 'referral' || x.subjectId !== p.referralId) return { status: 409, error: 'That PPOT request belongs to someone else. Refresh and try again.' };
    if (x.status !== 'sent') return { status: 409, error: 'This PPOT request already has a signed copy on file.' };
    tx.update(requestRef, {
      status: 'received',
      received: {
        signedDate: p.signedDate,
        inboundFaxId: '',
        source: 'upload',
        documentId: '',
        storagePath,
        size: p.pdf.length,
        byUid: p.caller.uid,
        byName,
        at: FieldValue.serverTimestamp(),
      },
    });
    return null;
  });
  if (claimed) {
    await adminBucket().file(storagePath).delete().catch(() => undefined);
    return { ok: false, ...claimed };
  }
  await db.collection('referrals').doc(p.referralId).update({ updatedAt: FieldValue.serverTimestamp() });
  await logReferralActivity(p.referralId, {
    type: 'contact',
    text: `Signed plan of treatment (Appendix T) uploaded, signed ${formatDateUS(p.signedDate)}. The PPOT request is marked received.`,
    byUid: p.caller.uid,
    byName,
    byRole: p.caller.role,
  }).catch((err) => console.error('PPOT upload: activity failed (non-fatal):', err));
  return { ok: true, documentId: 'signed-ppot' };
}
