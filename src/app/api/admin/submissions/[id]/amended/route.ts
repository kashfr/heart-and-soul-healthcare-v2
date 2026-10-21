import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { recordFlaggedNoteAmended } from '@/lib/clarificationServer';

/**
 * POST /api/admin/submissions/[id]/amended
 *
 * Fired by the note forms right after the AUTHOR saves an amendment. If the
 * note has an OPEN flag (a correction, blocking or advisory, or a
 * clarification), the server verifies a real amendment exists (editHistory),
 * appends a thread line, and notifies whoever flagged it plus the corrections
 * reviewer and admins. It never lifts a block — only a reviewer does that.
 * Idempotent-ish: a note with no open flag answers 409 'no-open-flag'.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor', 'nurse']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const result = await recordFlaggedNoteAmended(id, caller);
  if (!result.ok) {
    const status =
      result.reason === 'not-found' ? 404 : result.reason === 'forbidden' ? 403 : 409;
    return NextResponse.json({ error: result.message, reason: result.reason }, { status });
  }
  return NextResponse.json({ ok: true, blockLifted: result.blockLifted === true });
}
