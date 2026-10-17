import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import type { Role } from '@/lib/auth';
import { assignReferral, createReferral, listReferrals } from '@/lib/referrals';
import { summarizeSharesByReferral } from '@/lib/referralShares';
import { adminDb } from '@/lib/firebaseAdmin';
import { agencyTodayISO } from '@/lib/verbalOrderServer';
import { createPortalNotification } from '@/lib/notificationsServer';
import {
  emptyPhoneReferral, formatPhone, phoneReferralDetails, programLabel, validatePhoneReferral,
  type PhoneReferralInput,
} from '@/lib/phoneReferralShared';
import type { ServiceKey } from '@/lib/diagnosisCatalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireRole(request, ['admin', 'va']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Fetch the referrals and the per-referral share roll-up in parallel, then
  // attach each summary so the board/table can render the "Shared" badge without
  // a second round-trip. A share-summary hiccup must not sink the whole list.
  const [referrals, shareMap] = await Promise.all([
    listReferrals(),
    summarizeSharesByReferral().catch((err) => {
      console.error('summarizeSharesByReferral failed (non-fatal):', err);
      return {} as Record<string, never>;
    }),
  ]);

  const withShares = referrals.map((r) => ({ ...r, shareSummary: shareMap[r.id] ?? null }));
  return NextResponse.json({ referrals: withShares });
}

/** Who a phone referral can be handed to: the people who work the board. */
const BOARD_ROLES: Role[] = ['admin', 'va'];

/**
 * POST /api/admin/referrals  log a referral taken over the phone.
 * Body: PhoneReferralInput. Creates a 'phone' referral in New, records who
 * took the call, and, when handed to someone else, assigns it and rings
 * their bell. No family or office email: the caller is already talking to us.
 */
export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, BOARD_ROLES);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const input = emptyPhoneReferral();
  for (const k of Object.keys(input) as (keyof PhoneReferralInput)[]) {
    if (typeof body[k] === 'string') (input as unknown as Record<string, string>)[k] = String(body[k]).slice(0, 5000);
  }
  if (!['', 'nursing', 'pss', 'behavioral'].includes(input.service)) input.service = '';
  const today = agencyTodayISO();
  const errors = validatePhoneReferral(input, today);
  if (Object.keys(errors).length) {
    return NextResponse.json({ error: Object.values(errors)[0], fieldErrors: errors }, { status: 400 });
  }

  let assignee: { uid: string; name: string } | null = null;
  if (input.assigneeUid) {
    const u = await adminDb().collection('users').doc(input.assigneeUid).get();
    const d = u.data() || {};
    if (!u.exists || d.active === false || !BOARD_ROLES.includes(String(d.role || '') as Role)) {
      return NextResponse.json({ error: 'That person can’t be assigned referrals.' }, { status: 400 });
    }
    assignee = { uid: u.id, name: String(d.displayName || '') };
  }

  const takenBy = caller.profile.displayName || '';
  const { id } = await createReferral(
    {
      source: 'phone',
      clientName: input.clientName.trim(),
      clientEmail: input.callerEmail.trim(),
      clientPhone: formatPhone(input.callerPhone),
      county: input.county,
      program: programLabel(input.program),
      referrerName: input.callerName.trim(),
      service: (input.service || null) as ServiceKey | null,
      details: phoneReferralDetails(input, today, takenBy),
    },
    { caller, text: `Phone referral logged${takenBy ? ` by ${takenBy}` : ''}` },
  );

  if (assignee) {
    await assignReferral(id, assignee, caller);
    if (assignee.uid !== caller.uid) {
      await createPortalNotification(adminDb(), {
        userId: assignee.uid,
        kind: 'referral',
        text: `${takenBy || 'A team member'} logged a phone referral for ${input.clientName.trim()} and assigned it to you. Please follow up with ${input.callerName.trim()}.`,
        href: `/admin/referrals?open=${encodeURIComponent(id)}`,
      });
    }
  }
  return NextResponse.json({ ok: true, id });
}
