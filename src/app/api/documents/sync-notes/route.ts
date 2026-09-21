import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { syncNoteDocumentsForPatient } from '@/lib/patientDocumentsServer';

/**
 * POST /api/documents/sync-notes  { patientId }
 *
 * File every RN oversight visit note for the client that has no document
 * yet (backfill of notes submitted before auto-filing existed, and a repair
 * when an auto-file failed). Staff only; idempotent.
 */
export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = (await request.json().catch(() => ({}))) as { patientId?: string };
  const patientId = String(body.patientId || '').trim();
  if (!patientId) return NextResponse.json({ error: 'patientId is required.' }, { status: 400 });
  try {
    return NextResponse.json(await syncNoteDocumentsForPatient(patientId, caller));
  } catch (err) {
    console.error('sync-notes failed:', err);
    return NextResponse.json({ error: 'Could not sync the notes.' }, { status: 500 });
  }
}
