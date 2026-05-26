import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { findExactPatientId, type RosterPatientLite } from '@/lib/levenshtein';

/**
 * POST /api/care-team/auto-add-author
 * Body: { noteId: string }
 *
 * Two things in one endpoint, both triggered after a nurse submits a
 * progress note:
 *
 *   1. Auto-link (server-side fallback for the maintenance queue):
 *      If the note has no `patientId` but its typed `q3_clientName` +
 *      `q4_dateofBirth` exact-match a roster patient (same logic as
 *      the one-time backfill), set `patientId` here. Catches the case
 *      where the nurse typed the patient identity manually instead of
 *      picking from the roster dropdown — without this, those notes
 *      would silently accumulate in /admin/maintenance/link-notes.
 *      Only EXACT matches are auto-linked; near matches still go to
 *      admin review (where the "did you mean" normalization applies).
 *
 *   2. Care-team membership: once a `patientId` is known (either set
 *      by the form or just inferred above), arrayUnion the caller's
 *      uid into that patient's `assignedNurseIds`. Means a nurse
 *      picking up a new shift gets read access to the rest of the
 *      team's notes automatically — no admin click needed.
 *
 * Security: the caller's uid MUST match the note's nurseId. This
 * prevents anyone from granting themselves access to an arbitrary
 * patient by guessing a noteId they didn't author.
 *
 * Failure is non-fatal at the caller — the note is already saved by
 * the time we get here. Worst case the nurse doesn't get auto-added
 * and an admin can either link the note from the maintenance page or
 * add her manually from the Patients page.
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
  let patientId = (noteData.patientId as string | null | undefined) || null;
  let autoLinked = false;

  // Caller must be the author of the note. Without this check a nurse
  // could pass any noteId and grant herself access to any patient.
  if (noteNurseId !== caller.uid) {
    return NextResponse.json(
      { error: 'You can only auto-add yourself for notes you authored.' },
      { status: 403 },
    );
  }

  // Step 1 — auto-link fallback. If the form didn't capture patientId
  // (nurse typed the identity manually instead of picking from the
  // dropdown), try to recover it here via the same exact name+DOB
  // match the one-time backfill uses. Near matches are intentionally
  // NOT auto-linked — those still go to the admin review queue so
  // the "did you mean" normalization step can apply.
  if (!patientId) {
    const typedName = (noteData.q3_clientName as string) || '';
    const typedDob = (noteData.q4_dateofBirth as string) || '';
    if (typedName && typedDob) {
      const patientsSnap = await db.collection('patients').get();
      const roster: RosterPatientLite[] = patientsSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: (data.name as string) || '',
          dob: (data.dob as string) || '',
        };
      });
      const match = findExactPatientId(typedName, typedDob, roster);
      if (match) {
        await noteRef.update({ patientId: match });
        patientId = match;
        autoLinked = true;
      }
    }
  }

  // Still no patient link after the auto-link pass → can't add to a
  // team. Returned as a no-op rather than an error so the fire-and-
  // forget caller doesn't show a scary log line.
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
    autoLinked,
    careTeamSize: team.length,
  });
}
