import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { getReferral, referOutOnShare } from '@/lib/referrals';
import { createReferralShare, listReferralShares } from '@/lib/referralShares';
import { buildShareUrl } from '@/lib/shareLink';
import { sendReferralShareEmail } from '@/lib/emails/referralShare';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_RECIPIENTS = 25;

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
    recipients?: { partnerAgency?: string; partnerEmail?: string }[];
    expiresInDays?: number;
    moveToReferredOut?: boolean;
    manual?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  // Manual = a "referred out, capture-only" record: email optional, no link emailed.
  const manual = body.manual === true;

  // Accept a multi-agency `recipients` array, or fall back to the single-agency
  // body (back-compat). Each recipient gets its own independent link + email.
  const rawRecipients =
    Array.isArray(body.recipients) && body.recipients.length > 0
      ? body.recipients
      : [{ partnerAgency: body.partnerAgency, partnerEmail: body.partnerEmail }];
  const recipients = rawRecipients
    .map((r) => ({ partnerAgency: (r.partnerAgency ?? '').trim(), partnerEmail: (r.partnerEmail ?? '').trim() }))
    .filter((r) => r.partnerAgency || r.partnerEmail);

  if (recipients.length === 0) {
    return NextResponse.json({ error: 'Add at least one agency.' }, { status: 400 });
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: `Cannot share with more than ${MAX_RECIPIENTS} agencies at once.` },
      { status: 400 }
    );
  }

  const referral = await getReferral(id);
  if (!referral) {
    return NextResponse.json({ error: 'Referral not found.' }, { status: 404 });
  }

  // Default: sharing hands the referral off, so move it to Referred Out unless
  // the caller explicitly opts out (a visibility-only share).
  const shouldMove = body.moveToReferredOut !== false;

  // Create one share per agency; a single bad recipient (e.g. invalid email) is
  // collected as a failure rather than sinking the whole request. Manual records
  // skip the email entirely (they're just capturing who it was handed off to).
  const created: { partnerAgency: string; emailSent: boolean }[] = [];
  const failed: string[] = [];
  for (const r of recipients) {
    try {
      const { token, share } = await createReferralShare(
        id,
        { partnerAgency: r.partnerAgency, partnerEmail: r.partnerEmail, expiresInDays: body.expiresInDays, manual },
        caller
      );
      let emailSent = false;
      if (!manual && share.partnerEmail) {
        const emailResult = await sendReferralShareEmail({
          to: share.partnerEmail,
          partnerAgency: share.partnerAgency,
          link: buildShareUrl(token),
          sharedByName: caller.profile.displayName || undefined,
          clientName: referral.clientName,
          expiresAt: share.expiresAt,
        });
        emailSent = emailResult.ok;
      }
      created.push({ partnerAgency: share.partnerAgency, emailSent });
    } catch (err) {
      console.error('Share failed for', r.partnerEmail, err);
      failed.push(r.partnerAgency || r.partnerEmail);
    }
  }

  if (created.length === 0) {
    return NextResponse.json(
      { error: 'Could not create any shares — check the agency emails and try again.' },
      { status: 400 }
    );
  }

  // Hand-off: move the card to Referred Out once, after the shares succeed
  // (non-fatal — a move hiccup shouldn't fail the request).
  let moved = false;
  if (shouldMove) {
    try {
      moved = await referOutOnShare(id, caller);
    } catch (err) {
      console.error('referOutOnShare failed (non-fatal):', err);
    }
  }

  return NextResponse.json({
    ok: true,
    createdCount: created.length,
    failedCount: failed.length,
    emailsSent: created.filter((c) => c.emailSent).length,
    moved,
  });
}
