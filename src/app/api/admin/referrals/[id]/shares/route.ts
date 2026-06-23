import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { getReferral, referOutOnShare } from '@/lib/referrals';
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

  let body: {
    partnerAgency?: string;
    partnerEmail?: string;
    expiresInDays?: number;
    moveToReferredOut?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  // Default: sharing hands the referral off, so move it to Referred Out unless
  // the caller explicitly opts out (a visibility-only share).
  const shouldMove = body.moveToReferredOut !== false;

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

  // Hand-off: move the card to Referred Out (non-fatal — the share already
  // succeeded; a move hiccup shouldn't fail the request).
  let moved = false;
  if (shouldMove) {
    try {
      moved = await referOutOnShare(id, caller);
    } catch (err) {
      console.error('referOutOnShare failed (non-fatal):', err);
    }
  }

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
    moved,
    emailSent: emailResult.ok,
    emailError: emailResult.ok ? undefined : emailResult.error,
  });
}
