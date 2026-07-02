import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { recordPrnOutcome } from '@/lib/marServer';

/**
 * POST /api/mar/outcome
 *
 * Record the result (effectiveness) of a given PRN dose — the follow-up leg of
 * the why-given -> given -> what-happened loop. Write-once on the original
 * administration doc (nothing is being corrected, so no superseding record);
 * later changes go through /api/mar/amend. Documenting is RN/LPN scope (plus
 * admin/supervisor); per-record permission (documenting nurse, or an
 * RN/supervisor/admin) is enforced in recordPrnOutcome.
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

  const credential = caller.profile.credential || '';
  const isStaff = caller.role === 'admin' || caller.role === 'supervisor';
  if (!isStaff && credential !== 'RN' && credential !== 'LPN') {
    return NextResponse.json(
      { error: 'Only RN/LPN nurses or supervisors can record a dose result.' },
      { status: 403 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const adminId = String(body?.adminId || '').trim();
  if (!adminId) {
    return NextResponse.json({ error: 'adminId is required.' }, { status: 400 });
  }

  const result = await recordPrnOutcome(adminId, String(body?.outcome || ''), caller);
  if (!result.ok) {
    const status =
      result.reason === 'not-found'
        ? 404
        : result.reason === 'forbidden'
          ? 403
          : result.reason === 'superseded' || result.reason === 'already-recorded'
            ? 409
            : 400;
    return NextResponse.json({ error: result.message || 'Failed to record the result.' }, { status });
  }
  return NextResponse.json(result);
}
