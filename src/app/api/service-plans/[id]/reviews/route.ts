import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { createServicePlanReview } from '@/lib/servicePlanServer';
import { sanitizeReviewInput, validateReview } from '@/lib/servicePlanShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 600_000;
const SIG_RE = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
const SIG_MAX = 400_000;

/** POST /api/service-plans/[id]/reviews  "reviewed, no changes" on the
 *  client's current plan. Supervisors and admins. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const input = sanitizeReviewInput(body);
  const errors = validateReview(input);
  if (input.signature && (input.signature.length > SIG_MAX || !SIG_RE.test(input.signature))) errors.signature = 'The signature could not be read. Clear it and sign again.';
  if (Object.keys(errors).length) return NextResponse.json({ error: 'Please correct the highlighted fields.', fields: errors }, { status: 400 });
  const r = await createServicePlanReview(id, input, caller);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, id: r.review.id, filed: r.filed });
}
