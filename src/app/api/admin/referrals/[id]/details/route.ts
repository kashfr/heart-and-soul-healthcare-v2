import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { updateWebsiteReferralDetails } from '@/lib/referrals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PUT /api/admin/referrals/[id]/details
 *   { values: { [fieldKey]: string }, screened?: { [answer]: string } }
 * Correct a website referral's editable details (referralEditShared) and,
 * on referrals that kept their answers, the screened answers
 * (screenedAnswers.ts): those are re-screened first and refused (422, with
 * the website's message) exactly when the website would refuse them.
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
  const raw = (body.values && typeof body.values === 'object' ? body.values : {}) as Record<string, unknown>;
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') values[k] = v.slice(0, 5000);
  const rawScreened = (body.screened && typeof body.screened === 'object' ? body.screened : {}) as Record<string, unknown>;
  const screened: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawScreened)) if (typeof v === 'string') screened[k] = v.slice(0, 200);
  const result = await updateWebsiteReferralDetails(id, values, caller, screened);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, fieldErrors: result.fieldErrors, refused: result.refused }, { status: result.status });
  }
  return NextResponse.json({ ok: true, changed: result.changed });
}
