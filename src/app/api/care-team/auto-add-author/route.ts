import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';

/**
 * POST /api/care-team/auto-add-author
 * Body: { noteId: string }
 *
 * Self-healing care-team membership: after a nurse submits a progress
 * note that links to a roster patient (patientId is set), this endpoint
 * adds the author's uid to that patient's `assignedNurseIds`. Means a
 * nurse picking up a new shift for a patient gets read access to the
 * rest of the care team's notes automatically — no admin click needed.
 *
 * Security: the caller's uid MUST match the note's nurseId. This
 * prevents anyone from granting themselves access to an arbitrary
 * patient by guessing or supplying a noteId they didn't author. The
 * note is also required to have a patientId — free-text notes that
 * weren't roster-matched can't be used to escalate membership.
 *
 * Failure is non-fatal at the caller — the note is already saved by
 * the time we get here. Worst case the nurse just doesn't get
 * auto-added and an admin can add her manually from the Patients page.
 *
 * Allowed callers: nurse, supervisor, admin (any signed-in staff who
 * might author a note for a patient).
 */
export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor', 'nurse']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let body: { noteId?: string };
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
  const noteNurseId = (noteData.nurseId as string) || '';
  const patientId = (noteData.patientId as string | null | undefined) || null;

  // Caller must be the author of the note. Without this check a nurse
  // could pass any noteId and grant herself access to any patient.
  if (noteNurseId !== caller.uid) {
    return NextResponse.json(
      { error: 'You can only auto-add yourself for notes you authored.' },
      { status: 403 },
    );
  }

  // No patient link → nothing to add to. Not an error — the form may
  // have submitted a free-text patient name. Tell the caller it was a
  // no-op so it can no-op in turn.
  if (!patientId) {
    return NextResponse.json({ added: false, reason: 'no-patient-link' });
  }

  const patientRef = db.collection('patients').doc(patientId);
  const patientSnap = await patientRef.get();
  if (!patientSnap.exists) {
    return NextResponse.json(
      { added: false, reason: 'patient-missing', patientId },
      { status: 404 },
    );
  }

  // arrayUnion is a no-op if the uid is already present, so this is
  // safe to call repeatedly (e.g. for every shift a nurse logs).
  await patientRef.update({
    assignedNurseIds: FieldValue.arrayUnion(caller.uid),
  });

  // Re-read so we can return the up-to-date team size — useful for the
  // form's success log and for tests.
  const fresh = (await patientRef.get()).data() || {};
  const team = Array.isArray(fresh.assignedNurseIds) ? fresh.assignedNurseIds : [];

  return NextResponse.json({
    added: true,
    patientId,
    careTeamSize: team.length,
  });
}
