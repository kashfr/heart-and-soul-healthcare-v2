import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { deleteNoteWithAudit } from '@/lib/deleteSubmissionServer';

/**
 * DELETE /api/admin/submissions/[id]
 *
 * Permanently delete a progress note. Admin only — not supervisors, not the
 * authoring nurse. The note is snapshotted into `deletedNotes` first so the
 * deletion stays forensically recoverable. Firestore rules deny client-side
 * deletes entirely; this privileged route (Admin SDK) is the only path.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let caller;
  try {
    caller = await requireRole(request, ['admin']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const result = await deleteNoteWithAudit(id, caller);
  if (!result.ok) {
    return NextResponse.json({ error: result.message, reason: result.reason }, { status: 404 });
  }

  return NextResponse.json({ noteId: result.noteId, ok: true });
}
