import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';

export type DeleteFailureReason = 'not-found';

export interface DeleteSuccess {
  ok: true;
  noteId: string;
}

export interface DeleteFailure {
  ok: false;
  noteId: string;
  reason: DeleteFailureReason;
  message: string;
}

export type DeleteResult = DeleteSuccess | DeleteFailure;

/**
 * Hard-delete a progress note, but first snapshot its full contents into a
 * `deletedNotes/{noteId}` audit record so the deletion is forensically
 * recoverable. Admin-only — the route gates on role before calling this.
 *
 * The snapshot + delete run as a batch so we never end up with the note
 * gone but no audit trail (or vice versa). The MAR administrations this note
 * recorded (top-level `marAdministrations`, linked by `sourceNoteId`) are
 * snapshotted into the audit and deleted in the SAME batch — so hard-deleting a
 * note fully removes what it recorded instead of leaving orphaned dose records
 * that keep driving the "already documented today" guard from a note that no
 * longer exists. (Archiving never reaches here, so archived notes keep their
 * doses.) Any editHistory subcollection is removed afterward via
 * recursiveDelete; its prior state isn't part of the snapshot, but the final
 * note contents + who/when of the deletion are.
 */
export async function deleteNoteWithAudit(
  noteId: string,
  caller: AuthedCaller,
): Promise<DeleteResult> {
  const noteRef = adminDb().collection('progressNotes').doc(noteId);
  const snap = await noteRef.get();
  if (!snap.exists) {
    return { ok: false, noteId, reason: 'not-found', message: 'Note not found.' };
  }

  const data = snap.data() || {};
  const auditRef = adminDb().collection('deletedNotes').doc(noteId);

  // The MAR doses this note recorded (separate top-level collection, linked
  // only by sourceNoteId). Snapshot them for recovery, then delete them in the
  // same batch so a hard-delete leaves no orphaned administrations.
  const adminsSnap = await adminDb()
    .collection('marAdministrations')
    .where('sourceNoteId', '==', noteId)
    .get();
  const marAdministrations = adminsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const batch = adminDb().batch();
  batch.set(auditRef, {
    note: data,
    marAdministrations,
    originalId: noteId,
    deletedAt: FieldValue.serverTimestamp(),
    deletedBy: caller.uid,
    deletedByName: caller.profile.displayName || caller.email || '',
    deletedByRole: caller.role,
  });
  batch.delete(noteRef);
  for (const d of adminsSnap.docs) {
    batch.delete(d.ref);
  }
  await batch.commit();

  // Clean up the append-only editHistory subcollection (not covered by the
  // batch delete above). Best-effort — the note + audit are already
  // consistent; an orphaned history entry is harmless if this throws.
  try {
    await adminDb().recursiveDelete(noteRef);
  } catch {
    /* ignore */
  }

  return { ok: true, noteId };
}
