import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createReferral, type ReferralInput } from '@/lib/referrals';
import { sendReferralNotification } from '@/lib/emails/referralNotification';
import { formatDateUS } from '@/lib/dateFormat';
import { sendReferralConfirmation } from '@/lib/emails/referralConfirmation';
import { paidCaregiverDiagnosisFlag, paidCaregiverAgeFlag } from '@/lib/diagnosisScreening';
import {
  CATALOG_VERSION,
  behaviorRiskLabel,
  currentServiceLabels,
  equipmentLabels,
  inferService,
  type BehaviorRisk,
} from '@/lib/diagnosisCatalog';

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
    /** Readable diagnosis text. Composed by the form from the structured
     *  answers below (or typed free-hand by older form builds), and stored
     *  verbatim as the Diagnosis row so nothing downstream had to change. */
    diagnosis?: string;
    /** Structured intake (src/lib/diagnosisCatalog.ts). Absent on submissions
     *  from a form build that predates the checkboxes — every consumer below
     *  degrades to the free-text diagnosis in that case. */
    diagnoses?: string[];
    diagnosisOther?: string;
    equipment?: string[];
    behaviorRisk?: BehaviorRisk;
    currentServices?: string[];
    /** The catalog the submitting form was built against. */
    catalogVersion?: string;
    comments?: string;
    provideLater?: boolean;
    dob?: string;
    careNeeds?: '' | 'personal' | 'nursing' | 'behavioral' | 'unsure';
    seekingPaidCaregiver?: '' | 'yes' | 'no';
  };
}

const CARE_LABEL: Record<string, string> = {
  personal: 'Hands-on personal care',
  nursing: 'Skilled medical / nursing care',
  behavioral: 'Behavioral / autism support',
  unsure: 'Not sure',
};

const SERVICE_LABEL: Record<string, string> = {
  nursing: 'Skilled Nursing',
  pss: 'Personal Support Services (PSS)',
  behavioral: 'Behavioral Support Aide Services (BSS)',
};

// Age label for the staff view, e.g. "2 years" or "8 months". Empty if the date
// of birth is missing or unparseable.
function ageLabel(dob?: string): string {
  if (!dob) return '';
  const birth = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return '';
  const now = new Date();
  if (birth > now) return '';
  let months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) return '';
  const years = Math.floor(months / 12);
  return years < 1
    ? `${months} month${months === 1 ? '' : 's'}`
    : `${years} year${years === 1 ? '' : 's'}`;
}

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

  const seekingValue =
    r.seekingPaidCaregiver === 'yes'
      ? 'Yes'
      : r.seekingPaidCaregiver === 'no'
      ? 'No'
      : '';
  // Backstop flag: the GAPP form blocks most paid-caregiver-for-behavioral
  // requests, but flag any that reach us so staff can triage at a glance.
  const reviewFlag = paidCaregiverDiagnosisFlag(r.diagnosis, r.seekingPaidCaregiver);
  // Young-child advisory: paid family hours cover only care beyond age-typical
  // needs, so a request for a toddler is unlikely to be approved as-is.
  const ageFlag = paidCaregiverAgeFlag(r.dob, r.seekingPaidCaregiver);

  // Which GAPP service line the family's answers point to, and whether that
  // disagrees with the care need they selected. Advisory: it drives the board's
  // partner matching and flags the card, it never decides eligibility (which
  // Alliant determines on medical necessity, GAPP manual §702.1.1).
  const inferred = inferService(r);
  const inferredValue = inferred.service
    ? `${SERVICE_LABEL[inferred.service]} (${inferred.reason})`
    : '';

  // A form built against a different catalog than this one is speaking a
  // vocabulary we may not fully understand, so say so on the card rather than
  // silently dropping codes we don't recognize.
  const catalogDrift =
    r.catalogVersion && r.catalogVersion !== CATALOG_VERSION
      ? `Submitted by a form using catalog ${r.catalogVersion}; this portal expects ${CATALOG_VERSION}. Some answers may be missing.`
      : null;

  return {
    source: 'gapp-website',
    externalId: payload.id,
    clientName: r.fullName ?? '',
    clientEmail: r.emailAddress ?? '',
    clientPhone: r.phoneNumber ?? '',
    county: r.county ?? '',
    program: 'GAPP - Georgia Pediatric Program',
    referrerName: r.submitterName || undefined,
    service: inferred.service,
    details: [
      ...(reviewFlag ? [{ label: '⚠ Review', value: reviewFlag }] : []),
      ...(ageFlag ? [{ label: '⚠ Young child', value: ageFlag }] : []),
      ...(inferred.conflict
        ? [{ label: '⚠ Care need unclear', value: inferred.conflict }]
        : []),
      ...(catalogDrift ? [{ label: '⚠ Form version', value: catalogDrift }] : []),
      { label: 'Date of birth', value: formatDateUS(r.dob ?? '') },
      { label: 'Age', value: ageLabel(r.dob) },
      { label: 'Address', value: address },
      { label: "Member's Medicaid ID", value: medicaid },
      { label: 'Diagnosis', value: r.diagnosis ?? '' },
      { label: 'Equipment & daily care', value: equipmentLabels(r.equipment).join(', ') },
      { label: 'Behavior risk', value: behaviorRiskLabel(r.behaviorRisk) },
      { label: 'Current services', value: currentServiceLabels(r.currentServices).join(', ') },
      { label: 'Comments', value: r.comments ?? '' },
      {
        label: 'Primary care need',
        value: CARE_LABEL[r.careNeeds ?? ''] ?? '',
      },
      { label: 'Inferred service need', value: inferredValue },
      { label: 'Seeking paid caregiver', value: seekingValue },
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
