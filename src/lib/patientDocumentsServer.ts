import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminBucket, adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';
import { renderNotePdf, notePdfFilename, isoFromAnyDate } from './notePdfServer';
import type { ProgressNoteFormData } from './pdf/ProgressNotePDF';
import { formatDateUS } from './dateFormat';

/**
 * Privileged (Admin SDK) side of client documents:
 *
 *  - fileNoteAsDocument: render a submitted note to PDF and file it under the
 *    client's Documents tab, keyed by sourceNoteId so a re-run (amendment,
 *    sync) replaces the bytes in place instead of adding a second copy.
 *  - syncNoteDocumentsForPatient: file every eligible note that has no
 *    document yet (backfill + self-heal when an auto-file failed).
 *  - deleteDocumentWithAudit: admin hard-delete of a document (bytes +
 *    metadata) with a deletedDocuments snapshot, like deleted notes.
 *  - cleanupReplacedFiles: after a client-side Replace, remove every object in
 *    the document's folder other than the current one so a wrongly uploaded
 *    file (possibly another client's PHI) does not linger.
 *
 * Firestore/Storage rules deny client deletes and file overwrites entirely;
 * these helpers are the only path, and the routes gate them by role.
 */

/** Note types that file themselves into Documents, and where. Adding the
 *  future supervisory-visit form is one line here. */
export const NOTE_DOC_CATEGORY: Record<string, string> = {
  'rn-oversight-visit': 'RN Oversight',
};

export function noteDocTitle(data: Record<string, unknown>): string {
  const kind = NOTE_DOC_CATEGORY[String(data.noteType || '')] || 'Note';
  const date = formatDateUS(isoFromAnyDate(String(data.q6_dateofService || '')));
  const nurse = String(data.q11_nurseName || '').trim();
  return `${kind} Visit, ${date}${nurse ? `, ${nurse}` : ''}`;
}

export type FileNoteResult =
  | { ok: true; documentId: string; replaced: boolean }
  | { ok: false; reason: 'not-found' | 'not-eligible' | 'no-patient' | 'forbidden'; message: string };

/**
 * Render + file one note. Caller must be staff or the note's author. The
 * document is owned by the note's author (uploadedBy = nurseId) so the
 * Documents list reads "uploaded by <nurse>", matching who documented it.
 */
export async function fileNoteAsDocument(noteId: string, caller: AuthedCaller): Promise<FileNoteResult> {
  const noteSnap = await adminDb().collection('progressNotes').doc(noteId).get();
  if (!noteSnap.exists) return { ok: false, reason: 'not-found', message: 'Note not found.' };
  const data = noteSnap.data() as Record<string, unknown>;
  const category = NOTE_DOC_CATEGORY[String(data.noteType || '')];
  if (!category) return { ok: false, reason: 'not-eligible', message: 'Only RN oversight visit notes file into Documents.' };
  const patientId = String(data.patientId || '');
  if (!patientId) return { ok: false, reason: 'no-patient', message: 'The note is not linked to a client on the roster.' };
  const isStaff = caller.role === 'admin' || caller.role === 'supervisor';
  if (!isStaff && String(data.nurseId || '') !== caller.uid) {
    return { ok: false, reason: 'forbidden', message: 'Only the author or staff can file this note.' };
  }
  if ((data.status as string) === 'archived' || data.archivedAt) {
    return { ok: false, reason: 'not-eligible', message: 'Archived notes are not filed.' };
  }

  // Firestore Timestamps and other non-string values are not part of the
  // rendered form; keep the strings the renderer reads.
  const form: ProgressNoteFormData = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string') form[k] = v;
  }
  const buffer = await renderNotePdf(form, noteId);
  const fileName = notePdfFilename(form);

  // One document per note: reuse the existing metadata doc when present.
  const existing = await adminDb().collection('patientDocuments').where('sourceNoteId', '==', noteId).limit(1).get();
  const docRef = existing.empty ? adminDb().collection('patientDocuments').doc() : existing.docs[0].ref;
  const storagePath = `patients/${patientId}/documents/${docRef.id}/${fileName}`;

  await adminBucket().file(storagePath).save(buffer, {
    contentType: 'application/pdf',
    resumable: false,
    metadata: { metadata: { sourceNoteId: noteId } },
  });
  // Drop any earlier rendering that lived under a different file name (a
  // date or client-name amendment changes the PDF file name).
  await cleanupFolderExcept(patientId, docRef.id, storagePath);

  const docDate = isoFromAnyDate(String(data.q6_dateofService || ''));
  const base = {
    patientId,
    category,
    title: noteDocTitle(data),
    fileName,
    storagePath,
    contentType: 'application/pdf',
    size: buffer.length,
    docDate: /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? docDate : '',
    sourceNoteId: noteId,
    autoFiled: true,
    autoFiledAt: FieldValue.serverTimestamp(),
  };
  if (existing.empty) {
    await docRef.set({
      ...base,
      uploadedBy: String(data.nurseId || caller.uid),
      uploadedByName: String(data.q11_nurseName || caller.profile.displayName || ''),
      uploadedByRole: 'nurse',
      uploadedAt: FieldValue.serverTimestamp(),
      archived: false,
    });
  } else {
    await docRef.set(base, { merge: true });
  }
  return { ok: true, documentId: docRef.id, replaced: !existing.empty };
}

/** File every eligible, unfiled note for one client. Returns what happened. */
export async function syncNoteDocumentsForPatient(
  patientId: string,
  caller: AuthedCaller,
): Promise<{ filed: number; skipped: number; errors: string[] }> {
  const notes = await adminDb().collection('progressNotes').where('patientId', '==', patientId).get();
  const filedDocs = await adminDb().collection('patientDocuments').where('patientId', '==', patientId).get();
  const already = new Set(filedDocs.docs.map((d) => String(d.data().sourceNoteId || '')).filter(Boolean));
  let filed = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const n of notes.docs) {
    const d = n.data();
    if (!NOTE_DOC_CATEGORY[String(d.noteType || '')]) continue;
    if ((d.status as string) === 'archived' || d.archivedAt) continue;
    if (already.has(n.id)) {
      skipped += 1;
      continue;
    }
    try {
      const r = await fileNoteAsDocument(n.id, caller);
      if (r.ok) filed += 1;
      else errors.push(`${n.id}: ${r.message}`);
    } catch (err) {
      errors.push(`${n.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { filed, skipped, errors };
}

/** Remove the auto-filed document for a note (used when the note is hard-deleted). */
export async function deleteNoteDocument(noteId: string, caller: AuthedCaller): Promise<void> {
  const snap = await adminDb().collection('patientDocuments').where('sourceNoteId', '==', noteId).get();
  for (const d of snap.docs) {
    await deleteDocumentWithAudit(d.id, caller, `note ${noteId} deleted`);
  }
}

async function cleanupFolderExcept(patientId: string, docId: string, keepPath: string): Promise<number> {
  const [files] = await adminBucket().getFiles({ prefix: `patients/${patientId}/documents/${docId}/` });
  let removed = 0;
  for (const f of files) {
    if (f.name === keepPath) continue;
    await f.delete({ ignoreNotFound: true });
    removed += 1;
  }
  return removed;
}

/**
 * After a Replace, delete the previous file(s). The metadata doc already
 * points at the new object; anything else in the folder is the old upload.
 */
export async function cleanupReplacedFiles(documentId: string): Promise<{ ok: boolean; removed: number }> {
  const snap = await adminDb().collection('patientDocuments').doc(documentId).get();
  if (!snap.exists) return { ok: false, removed: 0 };
  const d = snap.data() as { patientId?: string; storagePath?: string };
  if (!d.patientId || !d.storagePath) return { ok: false, removed: 0 };
  const removed = await cleanupFolderExcept(d.patientId, documentId, d.storagePath);
  return { ok: true, removed };
}

export type MoveDocumentResult =
  | { ok: true; documentId: string }
  | { ok: false; reason: 'not-found' | 'no-target' | 'same-client' | 'auto-filed'; message: string };

/**
 * Move a document to another client (a file uploaded to the wrong chart).
 * The Storage path embeds the client and patientId is immutable in rules,
 * so a move is copy-then-delete: copy the object into a NEW document folder
 * under the target client, write fresh metadata there (ownership and upload
 * time carried over, plus where it came from), then delete the original
 * through the audited delete. Auto-filed notes cannot be moved; the note
 * itself would have to be re-linked.
 */
export async function moveDocumentToPatient(
  documentId: string,
  toPatientId: string,
  caller: AuthedCaller,
  opts: { title?: string; docDate?: string; category?: string } = {},
): Promise<MoveDocumentResult> {
  const ref = adminDb().collection('patientDocuments').doc(documentId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: 'not-found', message: 'Document not found.' };
  const data = snap.data() as Record<string, unknown>;
  if (data.autoFiled) return { ok: false, reason: 'auto-filed', message: 'This document was filed from a note; move the note instead.' };
  const fromPatientId = String(data.patientId || '');
  if (fromPatientId === toPatientId) return { ok: false, reason: 'same-client', message: 'The document is already on that client.' };
  const target = await adminDb().collection('patients').doc(toPatientId).get();
  if (!target.exists) return { ok: false, reason: 'no-target', message: 'Target client not found.' };

  const fileName = String(data.fileName || 'document');
  const newRef = adminDb().collection('patientDocuments').doc();
  const newPath = `patients/${toPatientId}/documents/${newRef.id}/${fileName}`;
  await adminBucket().file(String(data.storagePath)).copy(adminBucket().file(newPath));

  // Carry everything over except the archive state (a moved document starts
  // active on the target chart).
  const rest: Record<string, unknown> = { ...data };
  for (const k of ['archived', 'archivedBy', 'archivedByName', 'archivedAt']) delete rest[k];
  await newRef.set({
    ...rest,
    patientId: toPatientId,
    storagePath: newPath,
    ...(opts.title?.trim() ? { title: opts.title.trim() } : {}),
    ...(opts.docDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.docDate) ? { docDate: opts.docDate } : {}),
    ...(opts.category ? { category: opts.category } : {}),
    archived: false,
    movedFrom: { patientId: fromPatientId, documentId },
    movedAt: FieldValue.serverTimestamp(),
    movedBy: caller.uid,
    movedByName: caller.profile.displayName || caller.email || '',
  });

  const targetName = String(target.data()?.name || toPatientId);
  await deleteDocumentWithAudit(documentId, caller, `moved to ${targetName} (${newRef.id})`);
  return { ok: true, documentId: newRef.id };
}

/**
 * Hard-delete a document: snapshot the metadata into deletedDocuments (with
 * who/when/why), delete the metadata doc, then remove every file in its
 * folder. Metadata first so the list never shows a document whose bytes are
 * gone; an orphaned file after a failed storage delete is invisible.
 */
export async function deleteDocumentWithAudit(
  documentId: string,
  caller: AuthedCaller,
  reason?: string,
): Promise<{ ok: true } | { ok: false; reason: 'not-found' }> {
  const ref = adminDb().collection('patientDocuments').doc(documentId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: 'not-found' };
  const data = snap.data() as Record<string, unknown>;
  const batch = adminDb().batch();
  batch.set(adminDb().collection('deletedDocuments').doc(documentId), {
    document: data,
    originalId: documentId,
    deletedAt: FieldValue.serverTimestamp(),
    deletedBy: caller.uid,
    deletedByName: caller.profile.displayName || caller.email || '',
    deletedByRole: caller.role,
    ...(reason ? { reason } : {}),
  });
  batch.delete(ref);
  await batch.commit();
  const patientId = String(data.patientId || '');
  if (patientId) {
    try {
      await cleanupFolderExcept(patientId, documentId, '');
    } catch (err) {
      console.error('Document file cleanup failed (metadata already deleted):', err);
    }
  }
  return { ok: true };
}
