import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';

/**
 * POST /api/admin/maintenance/link-note
 * Body: { noteId: string, patientId?: string | null }
 *
 *   - patientId = "abc": link this note to patient `abc`. Also adds the
 *     note's author to that patient's `assignedNurseIds` (arrayUnion),
 *     so the care-team membership stays in sync with the data.
 *   - patientId = null/undefined: mark the note as reviewed-but-skipped
 *     (sets `linkReviewed: true`) so it stops appearing in the candidate
 *     queue. Note stays unlinked and author-only.
 *
 * Per the "link-only" audit policy: this endpoint NEVER rewrites the
 * note's typed name/DOB. Only `patientId` (and `linkReviewed`) are touched.
 *
 * Admin-only.
 */
export async function POST(request: Request) {
  try {
    await requireRole(request, ['admin']);
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

  // Skip path
  if (!body.patientId) {
    await noteRef.update({ linkReviewed: true });
    return NextResponse.json({ ok: true, action: 'skipped', noteId });
  }

  // Link path: validate the target patient actually exists before
  // pointing a note at it.
  const patientId = body.patientId.trim();
  const patientRef = db.collection('patients').doc(patientId);
  const patientSnap = await patientRef.get();
  if (!patientSnap.exists) {
    return NextResponse.json({ error: 'Target patient not found.' }, { status: 404 });
  }

  // Link the note + add the note's author to the patient's care team.
  // Done as separate writes (not a batch) because they're cheap and the
  // failure mode is tolerable — even if the care-team add fails, the
  // link succeeds and the next backfill run picks up the orphan.
  await noteRef.update({
    patientId,
    linkReviewed: true,
  });

  const authorUid = (noteData.nurseId as string) || '';
  if (authorUid) {
    await patientRef.update({
      assignedNurseIds: FieldValue.arrayUnion(authorUid),
    });
  }

  return NextResponse.json({
    ok: true,
    action: 'linked',
    noteId,
    patientId,
    careTeamUpdated: !!authorUid,
  });
}
