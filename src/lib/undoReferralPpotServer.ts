import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import { documentRevision, ReferralDocumentError } from './referralDocumentsServer';

/** Atomically correct a mistaken PPOT receipt while retaining the latest PDF. */
export async function undoReferralPpot(p: {
  referralId: string; revision: string; title: string; category: string; docDate: string;
  by: { uid: string; name: string; role: string };
}): Promise<string> {
  const db = adminDb();
  const referralRef = db.collection('referrals').doc(p.referralId);
  const key = `referral_${p.referralId}`;
  const requestRef = db.collection('ppotRequests').doc(key);
  const documentRef = db.collection('referralDocuments').doc();
  return db.runTransaction(async (tx) => {
    const [referral, request] = await Promise.all([tx.get(referralRef), tx.get(requestRef)]);
    if (!referral.exists || !request.exists) throw new ReferralDocumentError('Referral or PPOT request not found.', 404);
    const req = request.data()!;
    if (referral.data()?.patientId || req.movedToPatientId || req.received?.documentId) {
      throw new ReferralDocumentError('This referral has a client record. This action is only available before client conversion.', 409);
    }
    if (req.subjectKind !== 'referral' || req.subjectId !== p.referralId || req.status !== 'received' || !req.received?.storagePath) {
      throw new ReferralDocumentError('This referral no longer has a signed PPOT to undo. Refresh the documents.', 409);
    }
    const received = req.received;
    if (documentRevision(String(received.storagePath), String(received.revisionId || '')) !== p.revision) {
      throw new ReferralDocumentError('The PDF changed. Refresh and review the latest copy before undoing its filing.', 409);
    }
    const faxId = String(received.inboundFaxId || '');
    if (!/^(up_)?[A-Za-z0-9_-]{1,40}$/.test(faxId)) throw new ReferralDocumentError('The original fax link is missing. No changes were made.', 409);
    const inboundRef = db.collection('verbalOrderInbound').doc(faxId);
    const inbound = await tx.get(inboundRef);
    if (!inbound.exists || inbound.data()?.status !== 'filed' || inbound.data()?.matchedPpotKey !== key || inbound.data()?.filedDocumentId) {
      throw new ReferralDocumentError('The fax filing has changed. Refresh before trying again.', 409);
    }
    const at = FieldValue.serverTimestamp();
    // Reuse immutable bytes, including any replacement/trimmed copy. All future
    // replacements allocate new paths; the original fax and revision files stay.
    tx.set(documentRef, {
      referralId: p.referralId, title: p.title.trim(), category: p.category, docDate: p.docDate,
      storagePath: received.storagePath, fileName: 'Received_Document.pdf', size: Number(received.size || 0),
      contentType: 'application/pdf', uploadedAt: at, uploadedBy: p.by.uid,
      uploadedByName: p.by.name, uploadedByRole: p.by.role, patientDocumentId: '', inboundFaxId: faxId,
      correctedFromPpotRequestKey: key,
    });
    tx.set(requestRef.collection('filingCorrections').doc(documentRef.id), {
      previousReceived: received, previousListHidden: req.listHidden === true,
      referralDocumentId: documentRef.id, at, byUid: p.by.uid, byName: p.by.name, byRole: p.by.role,
    });
    // Preserve original sent date and reminder/escalation history. Future cron
    // checks may resume follow-ups; this action never sends a fax itself.
    tx.update(requestRef, { status: 'sent', received: null, listHidden: false });
    tx.update(inboundRef, {
      matchedPpotKey: FieldValue.delete(), filedReferralId: p.referralId, filedDocumentId: documentRef.id,
      filedAt: at, filedBy: p.by.uid, filedByName: p.by.name,
      filingBy: FieldValue.delete(), filingAt: FieldValue.delete(),
    });
    tx.update(referralRef, { updatedAt: at });
    tx.set(referralRef.collection('activity').doc(documentRef.id), {
      type: 'note', text: `Signed PPOT filing undone; fax refiled as "${p.title.trim()}" (${p.category}). PPOT request returned to Waiting on Physicians.`,
      at, byUid: p.by.uid, byName: p.by.name, byRole: p.by.role,
    });
    return documentRef.id;
  });
}
