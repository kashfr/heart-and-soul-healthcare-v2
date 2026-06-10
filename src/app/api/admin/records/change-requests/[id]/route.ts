import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { acknowledgeReview } from '@/lib/marServer';

/**
 * RN/supervisor review acknowledgment. Medication changes auto-apply at note
 * submit (no approval), so this just marks an applied change as reviewed.
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

  const result = await acknowledgeReview(id, caller);
  if (!result.ok) {
    const status = result.reason === 'not-found' ? 404 : 409;
    return NextResponse.json({ error: result.message, reason: result.reason }, { status });
  }
  return NextResponse.json({ ok: true, reqId: result.reqId });
}
