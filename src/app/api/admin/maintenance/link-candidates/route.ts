import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { findPatientCandidates, type RosterPatientLite } from '@/lib/levenshtein';

/**
 * GET /api/admin/maintenance/link-candidates
 *
 * Returns the queue of progressNotes that still need admin review:
 *   - no `patientId` set
 *   - not previously skipped via `linkReviewed: true`
 *   - has at least one plausible roster match (Levenshtein ≤ 3, exact
 *     DOB, or first-name + close DOB)
 *
 * Notes with zero matches are NOT returned — they're treated as
 * legitimately new patients not yet in the roster, and would require a
 * separate "add-to-roster" workflow we haven't built yet.
 *
 * Each item is a `{ note, candidates[] }` pair so the UI can render the
 * typed values alongside the suggested matches.
 *
 * Admin-only.
 */
export async function GET(request: Request) {
  try {
    await requireRole(request, ['admin']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const db = adminDb();
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

  const items: Array<{
    noteId: string;
    typedName: string;
    typedDob: string;
    nurseName: string;
    dateOfService: string;
    candidates: ReturnType<typeof findPatientCandidates>;
  }> = [];

  for (const noteDoc of notesSnap.docs) {
    const data = noteDoc.data();
    if (data.patientId) continue;
    if (data.linkReviewed) continue;

    const typedName = (data.q3_clientName as string) || '';
    const typedDob = (data.q4_dateofBirth as string) || '';
    if (!typedName) continue;

    const candidates = findPatientCandidates(typedName, typedDob, roster);
    if (candidates.length === 0) continue;

    items.push({
      noteId: noteDoc.id,
      typedName,
      typedDob,
      nurseName: (data.q11_nurseName as string) || '',
      dateOfService: (data.q6_dateofService as string) || '',
      candidates,
    });
  }

  // Sort by date of service descending so the admin sees recent notes first.
  items.sort((a, b) => (b.dateOfService || '').localeCompare(a.dateOfService || ''));

  return NextResponse.json({ items });
}
