import { clientAuditActor } from './clientAuditActor';
import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { PDFDocument } from 'pdf-lib';
import { FieldValue } from 'firebase-admin/firestore';
import { adminBucket, adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';
import { sendOutboundFax, type SendFaxResult } from './faxCenterServer';
import { agencyTodayISO, returnFaxNumber } from './verbalOrderServer';
import { formatDateUS, formatDateUSFile } from './dateFormat';
import { fillRoiForm } from './pdf/roiStamp';
import { ChoaFormError, fillChoaForm } from './pdf/choaStamp';
import { validateChoaRequest } from './choaRoi';
import { getReferral, logReferralActivity } from './referrals';
import { planFromReferral } from './referralConvertShared';
import { addReferralDocument, moveReferralDocumentsToPatient } from './referralDocumentsServer';
import RoiLetterPDF from './pdf/RoiLetterPDF';
import {
  defaultRoiFaxNote,
  describeRoiEdit,
  isOutsideRoi,
  validateRoiEdit,
  type RoiEditField,
  ROI_DIRECTION_LABEL,
  ROI_FORMS,
  ROI_FORM_SHORT,
  roiCopies,
  roiExpiryFor,
  roiIntroParagraphs,
  type RoiDirection,
  type RoiDuration,
  type RoiFormType,
  type RoiInput,
  type RoiParty,
  type RoiRecord,
} from './roiShared';

/**
 * Releases of Information (DBHDD Attachment A), server side.
 *
 *   roiRequests/{id}   one authorization: who, which way, what, why, how
 *                      long; then the signed copy and every fax of it.
 *
 * The flow: the office prepares the form here (the portal prints the parts
 * the agency may fill in), downloads it and sends it for signature (PandaDoc
 * for now), uploads the signed copy (filed under the client's Documents,
 * "Consent / Release (ROI)"), and faxes it to the facility behind an
 * introduction letter. The record is kept as the disclosure trail; it can be
 * hidden from the list but not deleted.
 */

const COL = 'roiRequests';
const FORM_PATH = path.join(process.cwd(), 'public', 'forms', 'dbhdd-roi-attachment-a.pdf');
const DOC_CATEGORY = 'Consent / Release (ROI)';

function toIso(ts: unknown): string | null {
  const t = ts as { toDate?: () => Date } | undefined;
  return t?.toDate ? t.toDate().toISOString() : null;
}

function party(x: unknown): RoiParty {
  const p = (x || {}) as Record<string, unknown>;
  return { name: String(p.name || ''), address: String(p.address || ''), phone: String(p.phone || ''), fax: String(p.fax || '') };
}

function serialize(id: string, x: FirebaseFirestore.DocumentData): RoiRecord {
  const sg = x.signed as Record<string, unknown> | null | undefined;
  const faxes = Array.isArray(x.faxes) ? (x.faxes as Array<Record<string, unknown>>) : [];
  return {
    id,
    formType: (ROI_FORMS.some((f) => f.id === x.formType) ? x.formType : 'dbhdd') as RoiFormType,
    ...(x.formType === 'choa' && x.choa ? { choa: x.choa } : {}),
    patientId: String(x.patientId || ''),
    ...(x.referralId ? { referralId: String(x.referralId) } : {}),
    memberName: String(x.memberName || ''),
    direction: (['to-us', 'from-us', 'both'].includes(x.direction) ? x.direction : 'to-us') as RoiDirection,
    facility: party(x.facility),
    information: String(x.information || ''),
    purpose: String(x.purpose || ''),
    duration: (x.duration === 'transactions' ? 'transactions' : 'year') as RoiDuration,
    status: x.status === 'signed' || x.status === 'cancelled' ? x.status : 'awaiting-signature',
    createdAt: toIso(x.createdAt),
    createdByName: String(x.createdByName || ''),
    signed: sg
      ? { documentId: String(sg.documentId || ''), signedDate: String(sg.signedDate || ''), expiresOn: String(sg.expiresOn || ''), byName: String(sg.byName || '') }
      : null,
    faxes: faxes.map((f) => ({
      faxId: String(f.faxId || ''),
      toNumber: String(f.toNumber || ''),
      recipientName: String(f.recipientName || ''),
      at: String(f.at || ''),
      byName: String(f.byName || ''),
    })),
    hidden: x.hidden === true,
    ...(x.formType === 'outside' ? { outsideExpiresOn: String(x.outsideExpiresOn || '') } : {}),
  };
}

export interface RoiClient {
  id: string;
  name: string;
  dob: string; // MM/DD/YYYY
  program: string;
}

/** Everything the Fax Center's Release of Information list and dialog need. */
export async function listRois(referralId?: string): Promise<{ rois: RoiRecord[]; clients: RoiClient[]; subject?: RoiClient | null }> {
  const db = adminDb();
  if (referralId) {
    const referral = await getReferral(referralId);
    if (!referral) return { rois: [], clients: [], subject: null };
    const plan = planFromReferral(referral);
    const snap = await db.collection(COL).where('referralId', '==', referralId).get();
    return { rois: snap.docs.map((d) => serialize(d.id, d.data())).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))), clients: [], subject: { id: referralId, name: plan.name, dob: plan.dob, program: plan.program } };
  }
  const [snap, patients] = await Promise.all([db.collection(COL).get(), db.collection('patients').get()]);
  const rois = snap.docs
    .map((d) => serialize(d.id, d.data()))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const clients = patients.docs
    .map((d) => {
      const p = d.data() || {};
      return { id: d.id, name: String(p.name || ''), dob: formatDateUS(String(p.dob || '')), program: String(p.program || '') };
    })
    .filter((c) => c.name)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { rois, clients };
}

/** Record a new release, ready to download for signature. */
export async function createRoi(input: RoiInput, caller: AuthedCaller): Promise<{ ok: true; roi: RoiRecord } | { ok: false; status: number; error: string }> {
  const db = adminDb();
  let p: { name?: string; dob?: string; program?: string };
  let patientId = input.patientId;
  if (input.referralId) {
    const referral = await getReferral(input.referralId);
    if (!referral) return { ok: false, status: 404, error: 'That referral was not found.' };
    if (referral.stage === 'closed' || referral.stage === 'referred_out') return { ok: false, status: 409, error: 'Reopen this referral before preparing a release.' };
    const plan = planFromReferral(referral);
    p = { name: plan.name, dob: plan.dob || input.referralDob, program: plan.program };
    patientId = referral.patientId || '';
    if (!p.name || !p.dob) return { ok: false, status: 400, error: 'The referral needs a name and date of birth to prepare a release.' };
  } else {
    const patient = await db.collection('patients').doc(input.patientId).get();
    if (!patient.exists) return { ok: false, status: 404, error: 'That client was not found.' };
    p = patient.data() || {};
  }
  if (input.formType === 'choa' && (!String(p.name || '').trim() || !String(p.dob || '').trim())) {
    return { ok: false, status: 400, error: "Add the client's name and date of birth to their profile before preparing a CHOA request." };
  }
  const ref = db.collection(COL).doc();
  await ref.set({ ...clientAuditActor(caller),
    formType: input.formType || 'dbhdd',
    ...(input.choa ? { choa: input.choa } : {}),
    patientId,
    ...(input.referralId ? { referralId: input.referralId } : {}),
    memberName: String(p.name || ''),
    dob: String(p.dob || ''),
    program: String(p.program || ''),
    direction: input.direction,
    facility: input.facility,
    information: input.information,
    purpose: input.purpose,
    duration: input.duration,
    ...(input.formType === 'outside' ? { outsideExpiresOn: input.outsideExpiresOn || '' } : {}),
    status: 'awaiting-signature',
    signed: null,
    faxes: [],
    hidden: false,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: caller.uid,
    createdByName: caller.profile.displayName || caller.email || '',
  });
  // A release signed elsewhere is logged when its signed copy is filed.
  if (input.referralId && !isOutsideRoi(input.formType)) await logRoiActivity(input.referralId, `Prepared a release of information for ${input.facility.name}.`, caller);
  return { ok: true, roi: serialize(ref.id, (await ref.get()).data() || {}) };
}

function fileStem(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'member';
}

/** The prepared (unsigned) form, rebuilt from the record each time. */
export async function buildRoiForm(id: string): Promise<{ bytes: Buffer; fileName: string } | null> {
  const snap = await adminDb().collection(COL).doc(id).get();
  if (!snap.exists) return null;
  const x = snap.data() || {};
  const r = serialize(id, x);
  if (isOutsideRoi(r.formType)) return null;
  if (r.formType === 'choa') {
    const checked = validateChoaRequest(r.choa);
    if (!checked.value) throw new ChoaFormError('The CHOA request details are incomplete. Prepare a new request.');
    const blank = await readFile(path.join(process.cwd(), 'public', 'forms', 'choa-medical-records-authorization.pdf'));
    const bytes = await fillChoaForm(blank, {
      memberName: r.memberName, dob: formatDateUS(String(x.dob || '')),
      request: checked.value, returnFax: await returnFaxNumber(),
    });
    return { bytes, fileName: `CHOA_Release_${fileStem(r.memberName)}.pdf` };
  }
  const blank = await readFile(FORM_PATH);
  const bytes = await fillRoiForm(blank, {
    memberName: r.memberName,
    dob: formatDateUS(String(x.dob || '')),
    copies: roiCopies(r.direction, r.facility, await returnFaxNumber()),
    information: r.information,
    purpose: r.purpose,
    duration: r.duration,
  });
  return { bytes, fileName: `Release_of_Information_${fileStem(r.memberName)}.pdf` };
}

async function loadPdf(bytes: Buffer): Promise<PDFDocument | null> {
  if (bytes.subarray(0, 5).toString() !== '%PDF-') return null;
  try {
    return await PDFDocument.load(bytes);
  } catch {
    return null;
  }
}

/** The filed copy's title, as fileSignedRoi writes it (and editRoi keeps in step). */
function roiDocTitle(r: Pick<RoiRecord, 'formType' | 'direction'>, facilityName: string, signedDate: string, forClient: boolean): string {
  const kind = isOutsideRoi(r.formType) ? ` (${ROI_FORM_SHORT[r.formType ?? 'dbhdd']})` : '';
  const dir = forClient ? ` (${ROI_DIRECTION_LABEL[r.direction].toLowerCase()})` : '';
  return `Release of Information${kind}: ${facilityName}${dir}, signed ${formatDateUS(signedDate)}`;
}

/**
 * File the signed copy (the PDF downloaded from PandaDoc, or a scan) under the
 * client's Documents and mark the release signed. Uploading again replaces
 * the copy on the record; the earlier document stays in Documents.
 */
export async function fileSignedRoi(p: { id: string; pdf: Buffer; signedDate: string; caller: AuthedCaller }): Promise<{ ok: true; roi: RoiRecord } | { ok: false; status: number; error: string }> {
  const db = adminDb();
  const ref = db.collection(COL).doc(p.id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, status: 404, error: 'That release was not found.' };
  const r = serialize(p.id, snap.data() || {});
  if (r.status === 'cancelled') return { ok: false, status: 409, error: 'That release was cancelled.' };
  if (!(await loadPdf(p.pdf))) return { ok: false, status: 400, error: 'The signed copy must be a PDF that opens (not password protected).' };

  const byName = p.caller.profile.displayName || p.caller.email || '';
  const expiresOn = roiExpiryFor({ formType: r.formType, duration: r.duration, outsideExpiresOn: String(snap.data()?.outsideExpiresOn || '') }, p.signedDate);
  if (r.referralId) {
    const referral = await getReferral(r.referralId);
    if (!referral) return { ok: false, status: 404, error: 'That referral was not found.' };
    const fileName = `Release_of_Information_Signed_${formatDateUSFile(p.signedDate)}.pdf`;
    const by = { uid: p.caller.uid, name: byName, role: p.caller.role };
    const documentId = await addReferralDocument({ referralId: r.referralId, pdf: p.pdf, category: DOC_CATEGORY,
      title: roiDocTitle(r, r.facility.name, p.signedDate, false), fileName, docDate: p.signedDate, by });
    const storagePath = `referrals/${r.referralId}/documents/${documentId}/${fileName}`;
    await ref.update({ status: 'signed', patientId: referral.patientId || '', signed: {
      documentId, storagePath, signedDate: p.signedDate, expiresOn, byUid: p.caller.uid, byName, at: new Date().toISOString(),
    } });
    // Re-read after filing so conversion during upload also receives the copy.
    const latest = await getReferral(r.referralId);
    if (latest?.patientId) await moveReferralDocumentsToPatient(r.referralId, latest.patientId, by);
    await logRoiActivity(r.referralId, `Filed a signed release of information for ${r.facility.name}.`, p.caller);
    return { ok: true, roi: serialize(p.id, (await ref.get()).data() || {}) };
  }
  const docRef = db.collection('patientDocuments').doc();
  const fileName = `Release_of_Information_Signed_${formatDateUSFile(p.signedDate)}.pdf`;
  const storagePath = `patients/${r.patientId}/documents/${docRef.id}/${fileName}`;
  await adminBucket().file(storagePath).save(p.pdf, { contentType: 'application/pdf', resumable: false });
  await docRef.set({
    patientId: r.patientId,
    category: DOC_CATEGORY,
    title: roiDocTitle(r, r.facility.name, p.signedDate, true),
    fileName,
    storagePath,
    contentType: 'application/pdf',
    size: p.pdf.length,
    docDate: p.signedDate,
    uploadedBy: p.caller.uid,
    uploadedByName: byName,
    uploadedByRole: p.caller.role,
    uploadedAt: FieldValue.serverTimestamp(),
    archived: false,
    roiRequestId: p.id,
  });
  await ref.update({
    status: 'signed',
    signed: {
      documentId: docRef.id,
      storagePath,
      signedDate: p.signedDate,
      expiresOn,
      byUid: p.caller.uid,
      byName,
      at: new Date().toISOString(),
    },
  });
  return { ok: true, roi: serialize(p.id, (await ref.get()).data() || {}) };
}

export async function readSignedRoi(id: string): Promise<{ bytes: Buffer; fileName: string } | null> {
  const snap = await adminDb().collection(COL).doc(id).get();
  const sp = String(((snap.data() || {}).signed || {}).storagePath || '');
  if (!snap.exists || !sp) return null;
  const [bytes] = await adminBucket().file(sp).download();
  return { bytes, fileName: sp.split('/').pop() || 'Release_of_Information_Signed.pdf' };
}

/**
 * Fax the signed release to the facility: cover sheet (added by the Fax
 * Center), then the introduction letter, then the signed form.
 */
export async function faxRoi(p: {
  id: string;
  recipientName: string;
  toNumber: string;
  confirmNumber: string;
  note: string;
  caller: AuthedCaller;
}): Promise<SendFaxResult> {
  const db = adminDb();
  const ref = db.collection(COL).doc(p.id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, status: 404, error: 'That release was not found.' };
  const x = snap.data() || {};
  const r = serialize(p.id, x);
  if (r.status !== 'signed') return { ok: false, status: 409, error: 'Upload the signed copy before faxing it.' };
  const signed = await readSignedRoi(p.id);
  if (!signed) return { ok: false, status: 409, error: 'The signed copy could not be found. Upload it again.' };

  const senderName = p.caller.profile.displayName || p.caller.email || '';
  const returnFax = await returnFaxNumber();
  const letter = React.createElement(RoiLetterPDF, {
    date: formatDateUS(agencyTodayISO()),
    facilityName: r.facility.name,
    attention: p.recipientName.trim(),
    facilityAddress: r.facility.address,
    memberName: r.memberName,
    dob: formatDateUS(String(x.dob || '')),
    paragraphs: roiIntroParagraphs({ memberName: r.memberName, program: String(x.program || ''), facilityName: r.facility.name, direction: r.direction, formType: r.formType, isReferral: !!r.referralId }),
    senderName,
    returnFax,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pdf's renderToBuffer wants its own element type
  }) as any;
  const letterDoc = await PDFDocument.load(await renderToBuffer(letter));
  const signedDoc = await loadPdf(signed.bytes);
  if (!signedDoc) return { ok: false, status: 409, error: 'The signed copy on file could not be read. Upload it again.' };
  const merged = await PDFDocument.create();
  for (const pg of await merged.copyPages(letterDoc, letterDoc.getPageIndices())) merged.addPage(pg);
  for (const pg of await merged.copyPages(signedDoc, signedDoc.getPageIndices())) merged.addPage(pg);
  const pdf = Buffer.from(await merged.save());

  const result = await sendOutboundFax({
    input: {
      recipientName: p.recipientName,
      recipientOrg: r.facility.name,
      toNumber: p.toNumber,
      confirmNumber: p.confirmNumber,
      regarding: `Release of Information: ${r.memberName}`,
      note: p.note.trim() || defaultRoiFaxNote({ memberName: r.memberName, direction: r.direction, information: r.information, returnFax: await returnFaxNumber() }),
      includeCover: true,
    },
    pdf,
    fileName: `Release_of_Information_${fileStem(r.memberName)}.pdf`,
    caller: p.caller,
  });
  if (result.fax) {
    await ref.update({
      faxes: FieldValue.arrayUnion({
        faxId: result.fax.id,
        toNumber: result.fax.toNumber,
        recipientName: p.recipientName.trim(),
        at: new Date().toISOString(),
        byName: senderName,
      }),
    });
  }
  if (result.ok && r.referralId) await logRoiActivity(r.referralId, `Submitted the signed release to ${r.facility.name} by fax. Check Sent Faxes for delivery.`, p.caller);
  return result;
}

/** Cancel a release not yet signed, or hide / restore one on the list. */
export async function updateRoi(id: string, action: 'cancel' | 'hide' | 'unhide', caller: AuthedCaller): Promise<{ ok: boolean; status?: number; error?: string }> {
  const ref = adminDb().collection(COL).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, status: 404, error: 'That release was not found.' };
  const by = caller.profile.displayName || caller.email || '';
  if (action === 'cancel') {
    if (snap.data()?.status !== 'awaiting-signature') return { ok: false, status: 409, error: 'Only a release still waiting on a signature can be cancelled.' };
    await ref.update({ ...clientAuditActor(caller), status: 'cancelled', cancelledAt: FieldValue.serverTimestamp(), cancelledBy: caller.uid, cancelledByName: by });
    return { ok: true };
  }
  await ref.update({ ...clientAuditActor(caller), hidden: action === 'hide', hiddenBy: action === 'hide' ? caller.uid : FieldValue.delete() });
  return { ok: true };
}

async function logRoiActivity(referralId: string, text: string, caller: AuthedCaller): Promise<void> {
  try {
    await logReferralActivity(referralId, { type: 'note', text, byUid: caller.uid, byName: caller.profile.displayName || caller.email || '', byRole: caller.role });
  } catch (err) { console.error('ROI referral activity failed:', err); }
}

/**
 * Record a release that was signed outside the portal (a Georgia HIPAA form
 * sent through PandaDoc from our own template, or one from another agency):
 * create the record and file its signed copy in one step, so it lands
 * signed, with its expiry, and never sits as "waiting on signature".
 */
export async function recordOutsideRoi(p: { input: RoiInput; pdf: Buffer; signedDate: string; caller: AuthedCaller }): Promise<{ ok: true; roi: RoiRecord } | { ok: false; status: number; error: string }> {
  if (!isOutsideRoi(p.input.formType)) return { ok: false, status: 400, error: 'Only a release signed elsewhere is recorded this way.' };
  if (!(await loadPdf(p.pdf))) return { ok: false, status: 400, error: 'The signed copy must be a PDF that opens (not password protected).' };
  if (p.input.formType === 'outside' && p.input.outsideExpiresOn && p.input.outsideExpiresOn <= p.signedDate) {
    return { ok: false, status: 400, error: 'The expiration date must be after the date it was signed.' };
  }
  const created = await createRoi(p.input, p.caller);
  if (!created.ok) return created;
  const filed = await fileSignedRoi({ id: created.roi.id, pdf: p.pdf, signedDate: p.signedDate, caller: p.caller });
  if (!filed.ok) {
    // Never leave a half-recorded release on the list.
    await adminDb().collection(COL).doc(created.roi.id).update({ status: 'cancelled', hidden: true, cancelledAt: FieldValue.serverTimestamp(), cancelledReason: 'signed copy failed to file' });
  }
  return filed;
}

/**
 * Correct a release (see roiEditableFields for what may change). Fields the
 * release doesn't allow are ignored. A new signed date (or, for an outside
 * release, a new expiration) recomputes when it expires. Every edit is kept
 * on the record (`edits`) and noted on the referral's timeline; client
 * releases carry the audit actor, so the client's activity history shows it.
 */
export async function editRoi(
  id: string,
  raw: Partial<Record<RoiEditField, unknown>>,
  caller: AuthedCaller,
): Promise<{ ok: true; roi: RoiRecord; changed: number } | { ok: false; status: number; error: string; fields?: Partial<Record<RoiEditField, string>> }> {
  const ref = adminDb().collection(COL).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, status: 404, error: 'That release was not found.' };
  const x = snap.data() || {};
  const r = serialize(id, x);
  if (r.status === 'cancelled') return { ok: false, status: 409, error: 'A cancelled release can’t be edited.' };
  const { errors, changes } = validateRoiEdit(r, raw, agencyTodayISO());
  if (Object.keys(errors).length) return { ok: false, status: 400, error: Object.values(errors)[0] as string, fields: errors };
  const keys = Object.keys(changes) as RoiEditField[];
  if (keys.length === 0) return { ok: true, roi: r, changed: 0 };

  const byName = caller.profile.displayName || caller.email || '';
  const facility = {
    ...r.facility,
    ...(changes.facilityName !== undefined ? { name: changes.facilityName } : {}),
    ...(changes.facilityAddress !== undefined ? { address: changes.facilityAddress } : {}),
    ...(changes.facilityPhone !== undefined ? { phone: changes.facilityPhone } : {}),
    ...(changes.facilityFax !== undefined ? { fax: changes.facilityFax } : {}),
  };
  const update: Record<string, unknown> = { ...clientAuditActor(caller), facility };
  if (changes.information !== undefined) update.information = changes.information;
  if (changes.purpose !== undefined) update.purpose = changes.purpose;
  if (changes.outsideExpiresOn !== undefined) update.outsideExpiresOn = changes.outsideExpiresOn;
  if ((changes.signedDate !== undefined || changes.outsideExpiresOn !== undefined) && r.signed) {
    const signedDate = changes.signedDate ?? r.signed.signedDate;
    update['signed.signedDate'] = signedDate;
    update['signed.expiresOn'] = roiExpiryFor({ formType: r.formType, duration: r.duration, outsideExpiresOn: changes.outsideExpiresOn ?? String(x.outsideExpiresOn || '') }, signedDate);
  }
  const text = describeRoiEdit(r, changes);
  update.edits = FieldValue.arrayUnion({ at: new Date().toISOString(), byUid: caller.uid, byName, text });
  await ref.update(update);
  if ((changes.facilityName !== undefined || changes.signedDate !== undefined) && r.signed?.documentId) {
    await syncRoiDocument(r, changes.facilityName ?? r.facility.name, changes.signedDate ?? r.signed.signedDate).catch((err) => console.error('ROI edit: document title sync failed (non-fatal):', err));
  }
  if (r.referralId) await logRoiActivity(r.referralId, text, caller);
  return { ok: true, roi: serialize(id, (await ref.get()).data() || {}), changed: keys.length };
}

/**
 * After a release's facility or signed date is corrected, bring its filed
 * copy's title and date along (on the referral, and the client's copy once
 * converted). Only where they still read as the portal wrote them, so a title
 * staff renamed by hand is left alone.
 */
async function syncRoiDocument(r: RoiRecord, facilityName: string, signedDate: string): Promise<void> {
  const db = adminDb();
  const oldDate = r.signed?.signedDate || '';
  const apply = async (refPath: FirebaseFirestore.DocumentReference, forClient: boolean) => {
    const snap = await refPath.get();
    if (!snap.exists) return;
    const d = snap.data() || {};
    const patch: Record<string, unknown> = {};
    if (String(d.title || '') === roiDocTitle(r, r.facility.name, oldDate, forClient)) patch.title = roiDocTitle(r, facilityName, signedDate, forClient);
    if (String(d.docDate || '') === oldDate) patch.docDate = signedDate;
    if (Object.keys(patch).length) await refPath.update(patch);
  };
  if (r.referralId) {
    const refDoc = db.collection('referralDocuments').doc(r.signed!.documentId);
    await apply(refDoc, false);
    const moved = String((await refDoc.get()).data()?.patientDocumentId || '');
    if (moved) await apply(db.collection('patientDocuments').doc(moved), false);
  } else {
    await apply(db.collection('patientDocuments').doc(r.signed!.documentId), true);
  }
}
