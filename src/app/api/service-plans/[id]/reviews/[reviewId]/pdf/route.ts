import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { canReadServicePlans, getServicePlanReview, renderServicePlanReviewPdf, servicePlanReviewPdfFileName } from '@/lib/servicePlanServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/service-plans/[id]/reviews/[reviewId]/pdf  the one-page review.
 *  Staff, or a nurse on the client's care team. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; reviewId: string }> }) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor', 'nurse']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id, reviewId } = await params;
  const ok = /^[A-Za-z0-9_-]{1,128}$/;
  if (!ok.test(id) || !ok.test(reviewId)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  const found = await getServicePlanReview(id, reviewId);
  if (!found) return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
  if (!(await canReadServicePlans(caller, found.plan.patientId))) return NextResponse.json({ error: "Not on this client's care team." }, { status: 403 });
  const pdf = await renderServicePlanReviewPdf(found.plan, found.review);
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${servicePlanReviewPdfFileName(found.plan, found.review)}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
