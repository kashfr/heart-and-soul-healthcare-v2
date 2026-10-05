import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminBucket, adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';
import { getReferral, logReferralActivity, moveReferral } from './referrals';
import { convertBlocker, planFromReferral, type ConvertPlan } from './referralConvertShared';
import { moveReferralDocumentsToPatient } from './referralDocumentsServer';
import { formatDateUS } from './dateFormat';

/**
 * Create a client record from a referral, the way the Clients page would by
 * hand: the directory doc (with the next record number from counters/
 * patients), the clinical profile, and then everything that arrived for the
 * referral (filed faxes, the signed Appendix T) copied into the client's
 * Documents. The referral keeps its history, gets patientId, and moves to
 * Active. One conversion per referral: a second call returns the first
 * record's id.
 */
export interface ConvertResult {
  ok: boolean;
  status?: number;
  error?: string;
  patientId?: string;
  mrn?: string;
  documentsMoved?: number;
  plan?: ConvertPlan;
}

/** What "Create Client Record" will do, for the confirm dialog. */
export async function previewReferralConversion(referralId: string): Promise<ConvertResult> {
  const r = await getReferral(referralId);
  if (!r) return { ok: false, status: 404, error: 'Referral not found.' };
  const blocker = convertBlocker(r);
  if (blocker) return { ok: false, status: 409, error: blocker, patientId: r.patientId || undefined };
  return { ok: true, plan: planFromReferral(r) };
}

export async function convertReferralToClient(
  referralId: string,
  overrides: Partial<Pick<ConvertPlan, 'dob' | 'program' | 'diagnosis'>>,
  caller: AuthedCaller,
): Promise<ConvertResult> {
  const r = await getReferral(referralId);
  if (!r) return { ok: false, status: 404, error: 'Referral not found.' };
  const blocker = convertBlocker(r);
  if (blocker) return { ok: false, status: 409, error: blocker, patientId: r.patientId || undefined };
  const plan = planFromReferral(r);
  const dob = overrides.dob || plan.dob;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return { ok: false, status: 400, error: 'Enter the client\'s date of birth to create the record.' };
  const program = overrides.program ?? plan.program;
  const diagnosis = (overrides.diagnosis ?? plan.diagnosis).trim();
  const by = { uid: caller.uid, name: caller.profile.displayName || caller.email || '', role: caller.role };

  const db = adminDb();
  const referralRef = db.collection('referrals').doc(referralId);
  const counterRef = db.collection('counters').doc('patients');
  const patientRef = db.collection('patients').doc();
  // The record is created and the referral claimed in one transaction, so two
  // people clicking at once can't make two clients for one referral.
  const claim = await db.runTransaction(async (tx) => {
    const [ref, counter] = await Promise.all([tx.get(referralRef), tx.get(counterRef)]);
    const existing = String(ref.data()?.patientId || '');
    if (existing) return { existing };
    const next = counter.exists ? Number(counter.data()?.nextRecordNumber || 1) : 1;
    const mrn = String(next).padStart(6, '0');
    tx.set(patientRef, {
      name: plan.name,
      dob,
      diagnosis,
      street: plan.street,
      city: plan.city,
      state: plan.state,
      zip: plan.zip,
      mrn,
      program,
      serviceLevel: '',
      requiresMar: false,
      assignedNurseIds: [],
      referralId,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(counterRef, { nextRecordNumber: next + 1 }, { merge: true });
    tx.update(referralRef, { patientId: patientRef.id, convertedAt: FieldValue.serverTimestamp(), convertedBy: caller.uid, convertedByName: by.name, updatedAt: FieldValue.serverTimestamp() });
    return { mrn };
  });
  if ('existing' in claim) return { ok: false, status: 409, error: 'This referral already has a client record.', patientId: claim.existing };

  const c = plan.clinical;
  const clinical: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (c.physicianName) clinical.physicianName = c.physicianName;
  if (c.physicianPhone) clinical.physicianPhone = c.physicianPhone;
  if (c.physicianFax) clinical.physicianFax = c.physicianFax;
  if (c.medicaidId) clinical.medicaidId = c.medicaidId;
  await patientRef.collection('clinical').doc('profile').set(clinical, { merge: true });

  let documentsMoved = 0;
  try {
    documentsMoved += await moveReferralDocumentsToPatient(referralId, patientRef.id, by);
    documentsMoved += await moveSignedPpot(referralId, patientRef.id, by);
  } catch (err) {
    // The record exists; the papers can still be re-filed by hand.
    console.error('Referral conversion: document move failed (non-fatal):', err);
  }

  await logReferralActivity(referralId, {
    type: 'stage_change',
    text: `Client record created (record #${claim.mrn})${documentsMoved ? `, with ${documentsMoved} document${documentsMoved === 1 ? '' : 's'} filed to it` : ''}.`,
    byUid: caller.uid,
    byName: by.name,
    byRole: caller.role,
  });
  if (r.stage !== 'active') {
    await moveReferral(referralId, { stage: 'active' }, caller).catch((err) => console.error('Referral conversion: stage move failed (non-fatal):', err));
  }
  return { ok: true, patientId: patientRef.id, mrn: claim.mrn, documentsMoved, plan };
}

/**
 * A signed Appendix T filed while this was a referral lives with the PPOT
 * request (ppot/signed/...). Copy it under the client's Documents, and carry
 * the request over under the client's key so recertification tracking knows
 * a PPOT was already requested this cycle.
 */
async function moveSignedPpot(referralId: string, patientId: string, by: { uid: string; name: string; role: string }): Promise<number> {
  const db = adminDb();
  const fromRef = db.collection('ppotRequests').doc(`referral_${referralId}`);
  const snap = await fromRef.get();
  if (!snap.exists) return 0;
  const x = snap.data() || {};
  const toRef = db.collection('ppotRequests').doc(`client_${patientId}`);
  if ((await toRef.get()).exists) return 0;
  const received = (x.received || null) as Record<string, unknown> | null;
  let moved = 0;
  let documentId = String(received?.documentId || '');
  let storagePath = String(received?.storagePath || '');
  if (x.status === 'received' && storagePath && !documentId) {
    const docRef = db.collection('patientDocuments').doc();
    const fileName = storagePath.split('/').pop() || 'Appendix_T_Signed.pdf';
    const dest = `patients/${patientId}/documents/${docRef.id}/${fileName}`;
    await adminBucket().file(storagePath).copy(adminBucket().file(dest));
    const [meta] = await adminBucket().file(dest).getMetadata();
    await docRef.set({
      patientId,
      category: 'ISP / Plan of Treatment',
      title: `Signed Appendix T (PPOT), ${x.requestType === 'recert' ? 'recertification' : 'new case'}${x.recipientName ? `: ${x.recipientName}` : ''} (${formatDateUS(String(received?.signedDate || ''))})`,
      fileName,
      storagePath: dest,
      contentType: 'application/pdf',
      size: Number(meta.size || 0),
      docDate: String(received?.signedDate || ''),
      uploadedBy: by.uid,
      uploadedByName: by.name,
      uploadedByRole: by.role,
      uploadedAt: FieldValue.serverTimestamp(),
      archived: false,
      ppotRequestKey: `client_${patientId}`,
      inboundFaxId: String(received?.inboundFaxId || ''),
      referralId,
    });
    documentId = docRef.id;
    storagePath = dest;
    moved = 1;
  }
  await toRef.set({
    ...x,
    subjectKind: 'client',
    subjectId: patientId,
    received: received ? { ...received, documentId, storagePath } : null,
    movedFromReferralId: referralId,
  });
  await fromRef.update({ movedToPatientId: patientId });
  return moved;
}
