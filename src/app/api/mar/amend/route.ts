import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { amendMarAdministration } from '@/lib/marServer';

/**
 * Correct a recorded medication administration. Append-only: this writes a
 * superseding record (the original is never mutated). Documenting an
 * administration is RN/LPN scope, so amending one is too (plus admin/supervisor);
 * CNA/HHA cannot. Finer per-record permission (the documenting nurse, or an
 * RN/supervisor/admin) is enforced in amendMarAdministration.
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
      { error: 'Only RN/LPN nurses or supervisors can amend an administration.' },
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

  const result = await amendMarAdministration(
    adminId,
    {
      status: String(body?.status || ''),
      actualTime: String(body?.actualTime || ''),
      reason: String(body?.reason || ''),
      // Only override the stored outcome when the client sends one; otherwise
      // the amendment carries the existing outcome forward.
      ...(body?.outcome !== undefined ? { outcome: String(body.outcome) } : {}),
      // Same pattern for the prescriber-notified attestation (D.4.d): an
      // amendment can add it ("reached Dr. Ali at 2pm") without resending
      // everything; omitted = carry the original forward.
      ...(body?.prescriberNotified !== undefined
        ? { prescriberNotified: body.prescriberNotified === true }
        : {}),
      amendmentReason: String(body?.amendmentReason || ''),
    },
    caller,
  );

  if (!result.ok) {
    const httpStatus =
      result.reason === 'not-found' ? 404 : result.reason === 'forbidden' ? 403 : 400;
    return NextResponse.json({ error: result.message || 'Amendment failed.' }, { status: httpStatus });
  }
  return NextResponse.json(result);
}
