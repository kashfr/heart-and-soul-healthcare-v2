import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createReferral, type ReferralInput } from '@/lib/referrals';
import { sendReferralNotification } from '@/lib/emails/referralNotification';
import { sendReferralConfirmation } from '@/lib/emails/referralConfirmation';
import { buildGappReferral, gappRefusal, type GappAnswers } from '@/lib/websiteIntake';

// Public intake for referrals submitted from external sites (the GAPP website).
// Authenticated with a shared secret (not a user session), since the caller is
// a server, not a logged-in staff member.
//
// Why this exists: Jotform does not fire notification emails or integrations for
// submissions created via its API, so the GAPP site forwards here instead. This
// endpoint stores the referral in Firestore (powering the admin Referrals tab)
// and emails info@heartandsoulhc.org.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A referral payload is a few hundred bytes; cap well above that so an oversized
// body can't be buffered, parsed, or stored.
const MAX_BODY_BYTES = 16 * 1024;

function secretOk(provided: string | null): boolean {
  const expected = process.env.REFERRAL_SHARED_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface IncomingPayload {
  source?: string;
  id?: string;
  submittedAt?: string;
  referral?: GappAnswers;
}

// Map the GAPP website's payload into a unified referral. The card is built
// by the shared builder (src/lib/websiteIntake.ts), which also rebuilds it
// when staff edit the screened answers, and the answers themselves are kept
// on the referral for that.
function toReferralInput(payload: IncomingPayload): ReferralInput {
  const answers = payload.referral ?? {};
  return {
    source: 'gapp-website',
    externalId: payload.id,
    ...buildGappReferral(answers),
    intakeAnswers: answers,
  };
}

export async function POST(req: Request) {
  if (!secretOk(req.headers.get('x-referral-secret'))) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  if (Number(req.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
  }

  let payload: IncomingPayload;
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
    }
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const input = toReferralInput(payload);
  if (!input.clientName || !input.clientEmail || !input.clientPhone) {
    return NextResponse.json(
      { error: 'Missing required referral fields.' },
      { status: 400 }
    );
  }

  // Hard stops, mirrored from the GAPP site's form and route: the paid-caregiver
  // dead ends are refused, not stored, and not emailed. There is nothing the
  // agency can do with them. 422 (not 5xx) so the site treats it as a refusal
  // rather than an outage and does not fire its portal-down fallback email.
  // Declining agency staff is refused whether or not pay is sought, so it
  // runs after (and outside) the paid-only checks, matching the forms.
  const refusal = gappRefusal(payload.referral ?? {});
  if (refusal) {
    return NextResponse.json(
      { error: refusal.reason, refused: refusal.code },
      { status: 422 }
    );
  }

  let created;
  try {
    created = await createReferral(input);
  } catch (err) {
    console.error('Referral intake: createReferral failed:', err);
    return NextResponse.json({ error: 'Could not store referral.' }, { status: 500 });
  }

  // Only email on first delivery, so a retried POST never re-emails: one
  // notification to the team and one confirmation to the submitter.
  let emailSent = false;
  let confirmationSent = false;
  if (!created.deduped) {
    const r = payload.referral ?? {};
    const [notif, confirm] = await Promise.all([
      sendReferralNotification(input, created.id),
      sendReferralConfirmation({
        to: input.clientEmail,
        submitterName: r.submitterName,
        childName: input.clientName,
        seekingPaidCaregiver: r.seekingPaidCaregiver === 'yes',
        // GAPP site has its own callback number, distinct from Heart & Soul's.
        phone: '(470) 635-5774',
      }),
    ]);
    emailSent = notif.ok;
    confirmationSent = confirm.ok;
  }

  return NextResponse.json({
    ok: true,
    id: created.id,
    deduped: created.deduped,
    emailSent,
    confirmationSent,
  });
}
