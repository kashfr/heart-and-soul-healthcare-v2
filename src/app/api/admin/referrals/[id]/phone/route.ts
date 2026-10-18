import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { updatePhoneReferral } from '@/lib/referrals';
import { agencyTodayISO } from '@/lib/verbalOrderServer';
import { phoneReferralFromBody, validatePhoneReferral } from '@/lib/phoneReferralShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PUT /api/admin/referrals/[id]/phone  correct a phone referral's answers.
 * Body: the Log Phone Referral form (assignment is changed on the card, not
 * here). Same roles that can log one.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'va']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const input = phoneReferralFromBody(body);
  const today = agencyTodayISO();
  const errors = validatePhoneReferral(input, today);
  if (Object.keys(errors).length) {
    return NextResponse.json({ error: Object.values(errors)[0], fieldErrors: errors }, { status: 400 });
  }
  const result = await updatePhoneReferral(id, input, today, caller);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, changed: result.changed });
}
