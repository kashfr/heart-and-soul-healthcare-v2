import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { canReadServicePlans, createServicePlan, listServicePlans } from '@/lib/servicePlanServer';
import { sanitizeServicePlanInput, validateServicePlan } from '@/lib/servicePlanShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 2_000_000;
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const SIG_RE = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
const SIG_MAX = 400_000;

/** GET /api/service-plans?patientId=  every signed plan for the client, newest
 *  first. Staff on any client; a nurse on her care team only. */
export async function GET(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor', 'nurse']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const patientId = new URL(request.url).searchParams.get('patientId') || '';
  if (!ID_RE.test(patientId)) return NextResponse.json({ error: 'Invalid client.' }, { status: 400 });
  if (!(await canReadServicePlans(caller, patientId))) return NextResponse.json({ error: "Not on this client's care team." }, { status: 403 });
  return NextResponse.json({ plans: await listServicePlans(patientId) });
}

/** POST /api/service-plans  sign and file a new plan. Supervisors and admins. */
export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const input = sanitizeServicePlanInput(body);
  const errors = validateServicePlan(input);
  if (input.signature && (input.signature.length > SIG_MAX || !SIG_RE.test(input.signature))) errors.signature = 'The signature could not be read. Clear it and sign again.';
  if (input.caregiverSignature && (input.caregiverSignature.length > SIG_MAX || !SIG_RE.test(input.caregiverSignature))) errors.caregiverSignature = 'The caregiver signature could not be read. Clear it and sign again.';
  if (Object.keys(errors).length) return NextResponse.json({ error: 'Please correct the highlighted fields.', fields: errors }, { status: 400 });
  if (!ID_RE.test(input.patientId) || (input.revisesPlanId && !ID_RE.test(input.revisesPlanId))) {
    return NextResponse.json({ error: 'Invalid reference.' }, { status: 400 });
  }
  const r = await createServicePlan(input, caller);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, id: r.plan.id, filed: r.filed });
}
