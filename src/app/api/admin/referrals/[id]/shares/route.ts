import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { getReferral } from '@/lib/referrals';
import {
  createReferralShare,
  listReferralShares,
  shareUrl,
} from '@/lib/referralShares';
import { sendReferralShareEmail } from '@/lib/emails/referralShare';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await requireRole(request, ['admin', 'va']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const shares = await listReferralShares(id);
  return NextResponse.json({ shares });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let caller;
  try {
    caller = await requireRole(request, ['admin', 'va']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let body: { partnerAgency?: string; partnerEmail?: string; expiresInDays?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  let token: string;
  let share;
  try {
    const result = await createReferralShare(
      id,
      {
        partnerAgency: body.partnerAgency ?? '',
        partnerEmail: body.partnerEmail ?? '',
        expiresInDays: body.expiresInDays,
      },
      caller
    );
    token = result.token;
    share = result.share;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create share.';
    const status = message === 'Referral not found.' ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  const link = shareUrl(new URL(request.url).origin, token);

  // Email the partner (non-fatal: the link is also returned for copy/paste).
  const referral = await getReferral(id);
  const emailResult = await sendReferralShareEmail({
    to: share.partnerEmail,
    partnerAgency: share.partnerAgency,
    link,
    sharedByName: caller.profile.displayName || undefined,
    clientName: referral?.clientName,
    expiresAt: share.expiresAt,
  });

  return NextResponse.json({
    ok: true,
    token,
    link,
    share,
    emailSent: emailResult.ok,
    emailError: emailResult.ok ? undefined : emailResult.error,
  });
}
