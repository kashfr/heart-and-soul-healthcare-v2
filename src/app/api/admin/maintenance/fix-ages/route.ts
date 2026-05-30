import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { computeAgeString } from '@/lib/age';

/**
 * POST /api/admin/maintenance/fix-ages
 *
 * Recomputes each progress note's stored age (`q5_ageYears`) from its DOB
 * (`q4_dateofBirth`) as-of the date of service (`q6_dateofService`), using the
 * same logic as the progress-note form. Fixes notes whose age went stale when
 * an earlier backfill corrected the DOB but not the age (e.g. a 2022-born
 * client left showing "0 days").
 *
 * Body: { apply?: boolean }
 *   - apply omitted / false → DRY RUN: returns the list of proposed changes,
 *     writes nothing.
 *   - apply: true           → writes the corrected ages.
 *
 * Idempotent: notes already showing the correct age are skipped, so re-running
 * is a no-op. Notes missing a DOB or date of service (can't compute an as-of
 * age) are reported separately rather than guessed.
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

  let apply = false;
  try {
    const body = await request.json();
    apply = body?.apply === true;
  } catch {
    // No body → dry run.
  }

  const db = adminDb();
  const snap = await db.collection('progressNotes').get();

  interface Change {
    noteId: string;
    clientName: string;
    dob: string;
    dateOfService: string;
    oldAge: string;
    newAge: string;
  }
  const changes: Change[] = [];
  let skippedNoDob = 0;
  let skippedNoService = 0;
  let skippedBadDate = 0;

  const refsToUpdate: { ref: FirebaseFirestore.DocumentReference; oldAge: string; newAge: string }[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const dob = String(data.q4_dateofBirth || '').trim();
    const svc = String(data.q6_dateofService || '').trim();
    const stored = String(data.q5_ageYears || '').trim();

    if (!dob) { skippedNoDob++; continue; }
    if (!svc) { skippedNoService++; continue; }

    const expected = computeAgeString(dob, svc);
    if (!expected) { skippedBadDate++; continue; }

    if (stored !== expected) {
      changes.push({
        noteId: doc.id,
        clientName: String(data.q3_clientName || ''),
        dob,
        dateOfService: svc,
        oldAge: stored || '(empty)',
        newAge: expected,
      });
      refsToUpdate.push({ ref: doc.ref, oldAge: stored, newAge: expected });
    }
  }

  if (apply && refsToUpdate.length > 0) {
    const BATCH_LIMIT = 450;
    let batch = db.batch();
    let pending = 0;
    for (const { ref, oldAge, newAge } of refsToUpdate) {
      batch.update(ref, {
        q5_ageYears: newAge,
        ageRecalculatedAt: FieldValue.serverTimestamp(),
        ageRecalculatedBy: caller.uid,
        ageRecalculatedFrom: oldAge,
      });
      pending++;
      if (pending >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }
    if (pending > 0) await batch.commit();
  }

  return NextResponse.json({
    ranBy: caller.email ?? caller.uid,
    applied: apply,
    notesScanned: snap.size,
    changeCount: changes.length,
    changes,
    skippedNoDob,
    skippedNoService,
    skippedBadDate,
  });
}
