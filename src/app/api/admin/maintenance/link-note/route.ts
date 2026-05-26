import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';

/**
 * POST /api/admin/maintenance/link-note
 * Body: { noteId: string, patientId?: string | null }
 *
 *   - patientId = "abc": link this note to patient `abc`. Also:
 *       * normalizes q3_clientName + q4_dateofBirth on the note to match
 *         the roster patient's canonical values (when they differ)
 *       * adds the note's author to the patient's assignedNurseIds
 *         (arrayUnion) so the care-team stays in sync
 *       * writes a progressNotes/{id}/editHistory entry capturing the
 *         original typed values, who normalized, and when — the full
 *         audit trail of every overwrite
 *   - patientId = null/undefined: mark the note as reviewed-but-skipped
 *     (sets `linkReviewed: true`). Note stays unlinked and author-only.
 *     No data is overwritten on skip.
 *
 * Why we normalize (overwriting clinical record fields):
 *   Wrong patient names + DOBs on submitted notes cause downstream
 *   billing problems and break the care-team membership query (which
 *   relies on patientId being correctly resolvable from the typed
 *   identity). Admin has clinical authority to correct data-entry
 *   errors on signed notes; the editHistory entry preserves the
 *   pre-correction state for audit.
 *
 * Admin-only.
 */
export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ['admin']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let body: { noteId?: string; patientId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const noteId = (body.noteId || '').trim();
  if (!noteId) {
    return NextResponse.json({ error: 'noteId is required.' }, { status: 400 });
  }

  const db = adminDb();
  const noteRef = db.collection('progressNotes').doc(noteId);
  const noteSnap = await noteRef.get();
  if (!noteSnap.exists) {
    return NextResponse.json({ error: 'Note not found.' }, { status: 404 });
  }
  const noteData = noteSnap.data() || {};

  // Skip path: mark reviewed, change nothing else.
  if (!body.patientId) {
    await noteRef.update({ linkReviewed: true });
    return NextResponse.json({ ok: true, action: 'skipped', noteId });
  }

  // Link path: validate the target patient actually exists.
  const patientId = body.patientId.trim();
  const patientRef = db.collection('patients').doc(patientId);
  const patientSnap = await patientRef.get();
  if (!patientSnap.exists) {
    return NextResponse.json({ error: 'Target patient not found.' }, { status: 404 });
  }
  const patientData = patientSnap.data() || {};
  const canonicalName = (patientData.name as string) || '';
  const canonicalDob = (patientData.dob as string) || '';

  // Build the diff so editHistory captures pre-correction state.
  // Only fields that ACTUALLY changed get logged.
  const previousName = (noteData.q3_clientName as string) || '';
  const previousDob = (noteData.q4_dateofBirth as string) || '';
  const changes: Record<string, { from: string; to: string }> = {};
  const noteUpdate: Record<string, unknown> = {
    patientId,
    linkReviewed: true,
  };

  if (canonicalName && canonicalName !== previousName) {
    changes.q3_clientName = { from: previousName, to: canonicalName };
    noteUpdate.q3_clientName = canonicalName;
  }
  if (canonicalDob && canonicalDob !== previousDob) {
    changes.q4_dateofBirth = { from: previousDob, to: canonicalDob };
    noteUpdate.q4_dateofBirth = canonicalDob;
  }

  // Batch the note update + editHistory entry + care-team add so they
  // either all succeed or all fail. Keeps the audit trail tightly
  // coupled to the data change.
  const batch = db.batch();
  batch.update(noteRef, noteUpdate);

  if (Object.keys(changes).length > 0) {
    const historyRef = db.collection('progressNotes').doc(noteId).collection('editHistory').doc();
    batch.set(historyRef, {
      editedBy: caller.uid,
      editedByName: caller.profile.displayName || caller.email || '',
      editedByRole: caller.role,
      editedAt: FieldValue.serverTimestamp(),
      changes,
      action: 'maintenance:link-normalize',
    });
  }

  const authorUid = (noteData.nurseId as string) || '';
  if (authorUid) {
    batch.update(patientRef, {
      assignedNurseIds: FieldValue.arrayUnion(authorUid),
    });
  }

  await batch.commit();

  return NextResponse.json({
    ok: true,
    action: 'linked',
    noteId,
    patientId,
    normalized: Object.keys(changes),
    careTeamUpdated: !!authorUid,
  });
}
