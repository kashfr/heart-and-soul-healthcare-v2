import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { revertChange } from '@/lib/marServer';

/**
 * POST /api/admin/records/change-requests/[id]/revert
 *
 * Undo an applied medication change: void an order that was added or created by
 * a change, restore an order that was discontinued, or put back the values a
 * correction overwrote. The change request itself is kept and stamped reverted,
 * so the record still shows what was done, by whom, and that it was undone.
 *
 * Supervisor/admin only. A nurse can make a change (it's within her scope) but
 * unwinding a live order is a supervisory call, and the reason is required so
 * the audit trail says why.
 *
 * Refused when doses have already been charted against an order the revert
 * would remove: administrations are append-only and legally immutable.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const reason = String(body?.reason || '').trim();
  if (!reason) {
    return NextResponse.json({ error: 'A reason for the revert is required.' }, { status: 400 });
  }

  const result = await revertChange(id, caller, reason);
  if (!result.ok) {
    const status =
      result.reason === 'not-found'
        ? 404
        : result.reason === 'missing-reason'
          ? 400
          : 409;
    return NextResponse.json({ error: result.message, reason: result.reason }, { status });
  }
  return NextResponse.json({ ok: true, reqId: result.reqId });
}
