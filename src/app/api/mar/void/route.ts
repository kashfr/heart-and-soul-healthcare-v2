import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { voidMarAdministration } from '@/lib/marServer';

/**
 * Remove a recorded medication administration as entered in error. The entry
 * is never deleted: it is stamped voided (who/when/why) for the audit trail
 * and dropped from every live MAR view, reopening the slot. Same credential
 * gate as amending (RN/LPN or supervisor/admin); per-record permission (the
 * documenting nurse herself, or an RN/supervisor/admin) is enforced in
 * voidMarAdministration.
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
      { error: 'Only RN/LPN nurses or supervisors can remove an administration entry.' },
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

  const result = await voidMarAdministration(
    adminId,
    { voidReason: String(body?.voidReason || '') },
    caller,
  );

  if (!result.ok) {
    const httpStatus =
      result.reason === 'not-found' ? 404 : result.reason === 'forbidden' ? 403 : 400;
    return NextResponse.json({ error: result.message || 'Remove failed.' }, { status: httpStatus });
  }
  return NextResponse.json(result);
}
