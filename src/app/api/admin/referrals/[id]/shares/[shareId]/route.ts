import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { revokeReferralShare } from '@/lib/referralShares';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Revoke a share. Nested under the referral for consistency; the shareId is the
// share document id (the token hash) returned by the list endpoint.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; shareId: string }> }
) {
  const { shareId } = await params;

  let caller;
  try {
    caller = await requireRole(request, ['admin', 'va']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const ok = await revokeReferralShare(shareId, caller);
  if (!ok) {
    return NextResponse.json({ error: 'Share not found.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
