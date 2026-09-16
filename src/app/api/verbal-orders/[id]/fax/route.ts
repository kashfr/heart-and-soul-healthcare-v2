import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { faxVerbalOrder, getVerbalOrder } from '@/lib/verbalOrderServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Send (or resend) the authentication form to the physician. Staff, or the
 *  nurse who took the order. */
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
  const order = await getVerbalOrder(id);
  if (!order) return NextResponse.json({ error: 'Verbal order not found.' }, { status: 404 });
  if (caller.role === 'nurse' && order.nurseId !== caller.uid) {
    return NextResponse.json({ error: 'Only the nurse who took the order or the office can resend it.' }, { status: 403 });
  }
  const result = await faxVerbalOrder(id, { uid: caller.uid, name: caller.profile.displayName || caller.email || '' });
  if (!result.ok) return NextResponse.json({ error: result.error || 'Fax failed.', configured: result.configured }, { status: result.configured ? 502 : 409 });
  return NextResponse.json({ ok: true });
}
