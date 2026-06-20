import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createReferral, type ReferralInput } from '@/lib/referrals';
import { sendReferralNotification } from '@/lib/emails/referralNotification';
import { sendReferralConfirmation } from '@/lib/emails/referralConfirmation';

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
  referral?: {
    submitterName?: string;
    fullName?: string;
    phoneNumber?: string;
    emailAddress?: string;
    streetAddress?: string;
    city?: string;
    zip?: string;
    county?: string;
    childsMedicaidID?: string;
    diagnosis?: string;
    comments?: string;
    provideLater?: boolean;
    seekingPaidCaregiver?: '' | 'yes' | 'no';
    paidCaregiverEligibility?: '' | 'yes' | 'no' | 'unsure';
  };
}

const ELIGIBILITY_LABEL: Record<string, string> = {
  yes: 'Yes',
  no: 'No',
  unsure: 'Not sure',
};

// Map the GAPP website's payload into a unified referral.
function toReferralInput(payload: IncomingPayload): ReferralInput {
  const r = payload.referral ?? {};
  const address = [r.streetAddress, r.city, r.zip ? `GA ${r.zip}` : '']
    .filter(Boolean)
    .join(', ');
  const medicaid = r.childsMedicaidID
    ? r.childsMedicaidID
    : r.provideLater
    ? 'Will provide later'
    : '';

  const seeking = r.seekingPaidCaregiver === 'yes';
  const seekingValue =
    r.seekingPaidCaregiver === 'yes'
      ? 'Yes'
      : r.seekingPaidCaregiver === 'no'
      ? 'No'
      : '';

  return {
    source: 'gapp-website',
    externalId: payload.id,
    clientName: r.fullName ?? '',
    clientEmail: r.emailAddress ?? '',
    clientPhone: r.phoneNumber ?? '',
    county: r.county ?? '',
    program: 'GAPP - Georgia Pediatric Program',
    referrerName: r.submitterName || undefined,
    details: [
      { label: 'Address', value: address },
      { label: "Member's Medicaid ID", value: medicaid },
      { label: 'Diagnosis', value: r.diagnosis ?? '' },
      { label: 'Comments', value: r.comments ?? '' },
      { label: 'Seeking paid caregiver', value: seekingValue },
      ...(seeking
        ? [
            {
              label: 'Has Medicaid + medical needs',
              value: ELIGIBILITY_LABEL[r.paidCaregiverEligibility ?? ''] ?? '',
            },
          ]
        : []),
    ],
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
      sendReferralNotification(input),
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
