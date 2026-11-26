import { NextResponse } from 'next/server';
import { AdminAuthError, requireRole } from '@/lib/adminAuthGuard';
import { HealthcarePlanError, acknowledgeHealthcarePlan } from '@/lib/healthcarePlanReviewServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/healthcare-plans/[documentId]/review
 *
 * The caller's "I have read this plan" for the plan's current version.
 * Refused until the server has served her that version.
 */
export async function POST(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor', 'nurse']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    return NextResponse.json(await acknowledgeHealthcarePlan(documentId, caller));
  } catch (err) {
    if (err instanceof HealthcarePlanError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('healthcare plan acknowledgment failed:', err);
    return NextResponse.json({ error: 'Could not save your review.' }, { status: 500 });
  }
}
