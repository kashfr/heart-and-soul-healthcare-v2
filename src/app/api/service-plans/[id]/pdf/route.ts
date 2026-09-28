import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { canReadServicePlans, getServicePlan, renderServicePlanPdf, servicePlanPdfFileName } from '@/lib/servicePlanServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/service-plans/[id]/pdf  the signed plan, rebuilt from the record.
 *  Staff, or a nurse on the client's care team. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor', 'nurse']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  const plan = await getServicePlan(id);
  if (!plan) return NextResponse.json({ error: 'Service plan not found.' }, { status: 404 });
  if (!(await canReadServicePlans(caller, plan.patientId))) return NextResponse.json({ error: "Not on this client's care team." }, { status: 403 });
  const pdf = await renderServicePlanPdf(plan);
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${servicePlanPdfFileName(plan)}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
