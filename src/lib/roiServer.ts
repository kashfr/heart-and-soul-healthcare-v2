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
import RoiLetterPDF from './pdf/RoiLetterPDF';
import {
  defaultRoiFaxNote,
  ROI_DIRECTION_LABEL,
  roiCopies,
  roiExpiresOn,
  roiIntroParagraphs,
  type RoiDirection,
  type RoiDuration,
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
    patientId: String(x.patientId || ''),
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
  };
}

export interface RoiClient {
  id: string;
  name: string;
  dob: string; // MM/DD/YYYY
  program: string;
}

/** Everything the Fax Center's Release of Information list and dialog need. */
export async function listRois(): Promise<{ rois: RoiRecord[]; clients: RoiClient[] }> {
  const db = adminDb();
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
  const patient = await db.collection('patients').doc(input.patientId).get();
  if (!patient.exists) return { ok: false, status: 404, error: 'That client was not found.' };
  const p = patient.data() || {};
  const ref = db.collection(COL).doc();
  await ref.set({
    patientId: input.patientId,
    memberName: String(p.name || ''),
    dob: String(p.dob || ''),
    program: String(p.program || ''),
    direction: input.direction,
    facility: input.facility,
    information: input.information,
    purpose: input.purpose,
    duration: input.duration,
    status: 'awaiting-signature',
    signed: null,
    faxes: [],
    hidden: false,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: caller.uid,
    createdByName: caller.profile.displayName || caller.email || '',
  });
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
  const docRef = db.collection('patientDocuments').doc();
  const fileName = `Release_of_Information_Signed_${formatDateUSFile(p.signedDate)}.pdf`;
  const storagePath = `patients/${r.patientId}/documents/${docRef.id}/${fileName}`;
  await adminBucket().file(storagePath).save(p.pdf, { contentType: 'application/pdf', resumable: false });
  const dir = ROI_DIRECTION_LABEL[r.direction].toLowerCase();
  await docRef.set({
    patientId: r.patientId,
    category: DOC_CATEGORY,
    title: `Release of Information: ${r.facility.name} (${dir}), signed ${formatDateUS(p.signedDate)}`,
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
      expiresOn: roiExpiresOn(p.signedDate, r.duration),
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
    paragraphs: roiIntroParagraphs({ memberName: r.memberName, program: String(x.program || ''), facilityName: r.facility.name, direction: r.direction }),
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
      note: p.note.trim() || defaultRoiFaxNote(r.memberName),
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
    await ref.update({ status: 'cancelled', cancelledAt: FieldValue.serverTimestamp(), cancelledBy: caller.uid, cancelledByName: by });
    return { ok: true };
  }
  await ref.update({ hidden: action === 'hide', hiddenBy: action === 'hide' ? caller.uid : FieldValue.delete() });
  return { ok: true };
}
