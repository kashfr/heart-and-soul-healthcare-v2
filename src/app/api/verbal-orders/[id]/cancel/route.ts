import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { cancelVerbalOrder, getVerbalOrder } from '@/lib/verbalOrderServer';
import { VERBAL_ORDER_CANCEL_REASON_MAX } from '@/lib/verbalOrderShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/verbal-orders/[id]/cancel   { reason }
 *
 * Void an order that was entered in error or that the physician will not
 * sign. Staff, or the nurse who took it. Only unsigned orders can be
 * cancelled; the record is kept (never deleted) with who, when, and why.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor', 'nurse']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const reason = String(body.reason || '').trim();
  if (!reason) return NextResponse.json({ error: 'Enter the reason for cancelling.' }, { status: 400 });
  if (reason.length > VERBAL_ORDER_CANCEL_REASON_MAX) {
    return NextResponse.json({ error: `Keep the reason under ${VERBAL_ORDER_CANCEL_REASON_MAX} characters.` }, { status: 400 });
  }
  const order = await getVerbalOrder(id);
  if (!order) return NextResponse.json({ error: 'Verbal order not found.' }, { status: 404 });
  if (caller.role === 'nurse' && order.nurseId !== caller.uid) {
    return NextResponse.json({ error: 'Only the nurse who took the order or the office can cancel it.' }, { status: 403 });
  }
  const result = await cancelVerbalOrder({ orderId: id, reason, actor: { uid: caller.uid, name: caller.profile.displayName || caller.email || '' } });
  if (!result.ok) return NextResponse.json({ error: result.error || 'Could not cancel the order.' }, { status: result.status || 500 });
  return NextResponse.json({ ok: true, marOrderId: order.marOrderId });
}
