import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { findExactPatientId, type RosterPatientLite } from '@/lib/levenshtein';

/**
 * POST /api/admin/maintenance/backfill
 *
 * One-time (idempotent) data-quality pass for the care-team feature.
 * Two things happen here:
 *
 *   1. For every progressNote without a `patientId`, try to match it to
 *      a roster patient by EXACT name+DOB (after case/whitespace normalize).
 *      Set `patientId` when there's a unique match. Notes that don't match
 *      stay unlinked and surface in the admin review UI (link-candidates).
 *
 *   2. Once notes are linked, walk patients and seed `assignedNurseIds`
 *      from the distinct authors of the notes now linked to each patient.
 *      Uses arrayUnion so re-running is a no-op for existing members.
 *
 * Safe to run any number of times — notes that already have `patientId`
 * are skipped; care-team unions don't dupe.
 *
 * Returns a summary the admin UI can display + a count of unlinked notes
 * still needing review.
 *
 * Admin-only. Supervisors don't need to run this.
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

  const db = adminDb();

  // Load the whole roster + every note once. Both are small (~tens of
  // patients, ~hundreds of notes). One read per doc, sub-second total.
  const [patientsSnap, notesSnap] = await Promise.all([
    db.collection('patients').get(),
    db.collection('progressNotes').get(),
  ]);

  const roster: RosterPatientLite[] = patientsSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: (data.name as string) || '',
      dob: (data.dob as string) || '',
    };
  });

  // --- Pass 1: auto-link by exact name+DOB ---
  // Batched writes for throughput; one set() per linked note. Firestore
  // caps batches at 500 ops — we re-flush before hitting the limit.
  const BATCH_LIMIT = 450;
  let batch = db.batch();
  let pendingWrites = 0;
  let notesLinked = 0;
  let notesAlreadyLinked = 0;
  let notesUnlinked = 0;
  // Track which patientId each newly-linked note belongs to, so we can
  // build assignedNurseIds unions in pass 2 from the same pass-1 results.
  const patientIdToAuthorUids = new Map<string, Set<string>>();

  for (const noteDoc of notesSnap.docs) {
    const data = noteDoc.data();
    const existingPatientId = data.patientId as string | null | undefined;
    if (existingPatientId) {
      notesAlreadyLinked++;
      // Carry forward into the care-team union so Pass 2 covers
      // already-linked notes from prior runs.
      const authorUid = (data.nurseId as string) || '';
      if (authorUid) {
        const set = patientIdToAuthorUids.get(existingPatientId) ?? new Set<string>();
        set.add(authorUid);
        patientIdToAuthorUids.set(existingPatientId, set);
      }
      continue;
    }

    const typedName = (data.q3_clientName as string) || '';
    const typedDob = (data.q4_dateofBirth as string) || '';
    const match = findExactPatientId(typedName, typedDob, roster);
    if (!match) {
      notesUnlinked++;
      continue;
    }

    batch.update(noteDoc.ref, { patientId: match });
    pendingWrites++;
    notesLinked++;

    const authorUid = (data.nurseId as string) || '';
    if (authorUid) {
      const set = patientIdToAuthorUids.get(match) ?? new Set<string>();
      set.add(authorUid);
      patientIdToAuthorUids.set(match, set);
    }

    if (pendingWrites >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      pendingWrites = 0;
    }
  }
  if (pendingWrites > 0) {
    await batch.commit();
  }

  // --- Pass 2: seed assignedNurseIds on each patient ---
  // arrayUnion gracefully handles already-present members + missing field.
  let patientsBackfilled = 0;
  batch = db.batch();
  pendingWrites = 0;
  for (const [patientId, authorSet] of patientIdToAuthorUids) {
    const authorUids = Array.from(authorSet);
    if (authorUids.length === 0) continue;
    const ref = db.collection('patients').doc(patientId);
    batch.update(ref, {
      assignedNurseIds: FieldValue.arrayUnion(...authorUids),
    });
    pendingWrites++;
    patientsBackfilled++;
    if (pendingWrites >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      pendingWrites = 0;
    }
  }
  if (pendingWrites > 0) {
    await batch.commit();
  }

  return NextResponse.json({
    ranBy: caller.email ?? caller.uid,
    notesScanned: notesSnap.size,
    notesLinked,
    notesAlreadyLinked,
    notesUnlinked,
    patientsBackfilled,
  });
}
