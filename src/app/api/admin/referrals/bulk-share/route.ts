import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { referOutOnShare } from '@/lib/referrals';
import { createReferralSharesBatch, shareUrl } from '@/lib/referralShares';
import { sendReferralShareBatchEmail } from '@/lib/emails/referralShare';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BATCH = 100;

export async function POST(request: Request) {
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
    referralIds?: unknown;
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
  // One decision for the whole batch: move every shared card to Referred Out
  // unless the caller opted out.
  const shouldMove = body.moveToReferredOut !== false;

  const referralIds = Array.isArray(body.referralIds)
    ? body.referralIds.filter((x): x is string => typeof x === 'string')
    : [];
  const partnerAgency = (body.partnerAgency ?? '').trim();
  const partnerEmail = (body.partnerEmail ?? '').trim().toLowerCase();

  if (referralIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one referral.' }, { status: 400 });
  }
  if (referralIds.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Cannot share more than ${MAX_BATCH} referrals at once.` },
      { status: 400 }
    );
  }
  if (!partnerAgency) {
    return NextResponse.json({ error: 'Partner agency name is required.' }, { status: 400 });
  }
  if (!EMAIL_RE.test(partnerEmail)) {
    return NextResponse.json({ error: 'A valid partner email is required.' }, { status: 400 });
  }

  const { created, failed } = await createReferralSharesBatch(
    referralIds,
    { partnerAgency, partnerEmail, expiresInDays: body.expiresInDays },
    caller
  );

  // Hand-off: move each successfully-shared card to Referred Out (per-item
  // non-fatal; anything already terminal is skipped by referOutOnShare).
  let movedCount = 0;
  if (shouldMove) {
    for (const item of created) {
      try {
        if (await referOutOnShare(item.referralId, caller)) movedCount++;
      } catch (err) {
        console.error('referOutOnShare failed (non-fatal) for', item.referralId, err);
      }
    }
  }

  let emailSent = false;
  let emailError: string | undefined;
  if (created.length > 0) {
    const origin = new URL(request.url).origin;
    const result = await sendReferralShareBatchEmail({
      to: partnerEmail,
      partnerAgency,
      sharedByName: caller.profile.displayName || undefined,
      items: created.map((c) => ({ clientName: c.clientName, link: shareUrl(origin, c.token) })),
      expiresAt: created[0]?.share.expiresAt ?? null,
    });
    emailSent = result.ok;
    emailError = result.ok ? undefined : result.error;
  }

  return NextResponse.json({
    ok: true,
    createdCount: created.length,
    failedCount: failed.length,
    movedCount,
    emailSent,
    emailError,
  });
}
