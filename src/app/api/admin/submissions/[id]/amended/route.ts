import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { recordCorrectionAmended } from '@/lib/clarificationServer';

/**
 * POST /api/admin/submissions/[id]/amended
 *
 * Fired by the progress-note form right after the AUTHOR saves an amendment to
 * a note whose open correction blocks her from new documentation. The server
 * verifies a real, recent amendment exists (editHistory), lifts the note's
 * block, recomputes her users-doc block mirror, and notifies the corrections
 * reviewer + admins. Idempotent-ish: a second call finds no blocking
 * correction and no-ops with 'no-block'.
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

  const result = await recordCorrectionAmended(id, caller);
  if (!result.ok) {
    const status =
      result.reason === 'not-found' ? 404 : result.reason === 'forbidden' ? 403 : 409;
    return NextResponse.json({ error: result.message, reason: result.reason }, { status });
  }
  return NextResponse.json({ ok: true, blockLifted: result.blockLifted === true });
}
