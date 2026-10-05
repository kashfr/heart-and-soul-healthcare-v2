import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminBucket, adminDb } from './firebaseAdmin';

/**
 * Papers that arrive for a referral before it has a client record: records a
 * physician's office faxes back, intake paperwork, a signed Appendix T. They
 * live under referralDocuments/{id} with the file in Cloud Storage, show on
 * the referral's card, and move into the client's Documents when the record
 * is created (see referralConvertServer). Server-only; firestore.rules deny
 * the collection to the browser.
 */

const COL = 'referralDocuments';

export interface ReferralDocument {
  id: string;
  referralId: string;
  category: string;
  title: string;
  fileName: string;
  size: number;
  docDate: string;
  uploadedAt: string | null;
  uploadedByName: string;
  /** Set once the referral became a client and the file moved to Documents. */
  patientDocumentId: string;
}

function toIso(ts: unknown): string | null {
  const t = ts as { toDate?: () => Date } | undefined;
  return t?.toDate ? t.toDate().toISOString() : null;
}

export function serializeReferralDocument(id: string, x: FirebaseFirestore.DocumentData): ReferralDocument {
  return {
    id,
    referralId: String(x.referralId || ''),
    category: String(x.category || ''),
    title: String(x.title || ''),
    fileName: String(x.fileName || ''),
    size: Number(x.size || 0),
    docDate: String(x.docDate || ''),
    uploadedAt: toIso(x.uploadedAt),
    uploadedByName: String(x.uploadedByName || ''),
    patientDocumentId: String(x.patientDocumentId || ''),
  };
}

export async function listReferralDocuments(referralId: string): Promise<ReferralDocument[]> {
  const snap = await adminDb().collection(COL).where('referralId', '==', referralId).get();
  return snap.docs.map((d) => serializeReferralDocument(d.id, d.data())).sort((a, b) => b.docDate.localeCompare(a.docDate) || String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
}

export async function readReferralDocument(referralId: string, docId: string): Promise<{ bytes: Buffer; fileName: string } | null> {
  const snap = await adminDb().collection(COL).doc(docId).get();
  const x = snap.data() || {};
  if (!snap.exists || x.referralId !== referralId || !x.storagePath) return null;
  const [bytes] = await adminBucket().file(String(x.storagePath)).download();
  return { bytes, fileName: String(x.fileName || 'document.pdf') };
}

/** Store a PDF against a referral. Returns the new document id. */
export async function addReferralDocument(p: {
  referralId: string;
  pdf: Buffer;
  category: string;
  title: string;
  fileName: string;
  docDate: string;
  by: { uid: string; name: string; role: string };
  inboundFaxId?: string;
}): Promise<string> {
  const db = adminDb();
  const ref = db.collection(COL).doc();
  const storagePath = `referrals/${p.referralId}/documents/${ref.id}/${p.fileName}`;
  await adminBucket().file(storagePath).save(p.pdf, { contentType: 'application/pdf', resumable: false });
  await ref.set({
    referralId: p.referralId,
    category: p.category,
    title: p.title,
    fileName: p.fileName,
    storagePath,
    contentType: 'application/pdf',
    size: p.pdf.length,
    docDate: p.docDate,
    uploadedBy: p.by.uid,
    uploadedByName: p.by.name,
    uploadedByRole: p.by.role,
    uploadedAt: FieldValue.serverTimestamp(),
    inboundFaxId: p.inboundFaxId || '',
    patientDocumentId: '',
  });
  return ref.id;
}

/**
 * Copy every document still on a referral into a client's Documents. The
 * referral's copies stay (marked with the Documents id) so the referral card
 * keeps its history; the bytes are copied, not moved, so neither side can
 * dangle. Returns how many were filed.
 */
export async function moveReferralDocumentsToPatient(referralId: string, patientId: string, by: { uid: string; name: string; role: string }): Promise<number> {
  const db = adminDb();
  const snap = await db.collection(COL).where('referralId', '==', referralId).get();
  let moved = 0;
  for (const d of snap.docs) {
    const x = d.data();
    if (x.patientDocumentId || !x.storagePath) continue;
    const docRef = db.collection('patientDocuments').doc();
    const fileName = String(x.fileName || 'document.pdf');
    const dest = `patients/${patientId}/documents/${docRef.id}/${fileName}`;
    await adminBucket().file(String(x.storagePath)).copy(adminBucket().file(dest));
    await docRef.set({
      patientId,
      category: String(x.category || 'Other'),
      title: String(x.title || fileName),
      fileName,
      storagePath: dest,
      contentType: 'application/pdf',
      size: Number(x.size || 0),
      docDate: String(x.docDate || ''),
      uploadedBy: by.uid,
      uploadedByName: by.name,
      uploadedByRole: by.role,
      uploadedAt: FieldValue.serverTimestamp(),
      archived: false,
      referralId,
      referralDocumentId: d.id,
      inboundFaxId: String(x.inboundFaxId || ''),
    });
    await d.ref.update({ patientDocumentId: docRef.id, movedToPatientId: patientId, movedAt: FieldValue.serverTimestamp() });
    moved++;
  }
  return moved;
}
