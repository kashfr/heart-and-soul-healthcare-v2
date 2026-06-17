import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { updateReferralStatus, type ReferralStatus } from '@/lib/referrals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID: ReferralStatus[] = ['new', 'contacted', 'archived'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
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

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const status = body.status as ReferralStatus;
  if (!VALID.includes(status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  }

  const ok = await updateReferralStatus(id, status, caller);
  if (!ok) {
    return NextResponse.json({ error: 'Referral not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id, status });
}
