import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { getReferral, recordProviderListSent } from '@/lib/referrals';
import { sendProviderListEmail } from '@/lib/emails/providerList';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Final rung of the refer-out ladder: no partner agency matches, so the family
// gets the official GAPP provider list (hosted Appendix P link). Sends the
// email (unless the no-email path is used), records it on the referral, logs
// the activity, and moves the card to Referred Out. Send-then-record order is
// deliberate: a failed email must never leave a "sent" record behind.
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

  let body: { email?: string; noEmail?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const referral = await getReferral(id);
  if (!referral) {
    return NextResponse.json({ error: 'Referral not found.' }, { status: 404 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const noEmail = body.noEmail === true;

  if (!noEmail) {
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Enter a valid family email.' }, { status: 400 });
    }
    const sent = await sendProviderListEmail({ to: email, childName: referral.clientName });
    if (!sent.ok) {
      return NextResponse.json(
        { error: `The email could not be sent (${sent.error ?? 'unknown error'}). Nothing was recorded — try again or copy the link instead.` },
        { status: 502 }
      );
    }
  }

  const result = await recordProviderListSent(id, noEmail ? '' : email, caller);
  if (!result.ok) {
    return NextResponse.json({ error: 'Referral not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, emailSent: !noEmail, moved: result.moved });
}
