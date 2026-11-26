import { NextResponse } from 'next/server';
import { AdminAuthError, requireRole } from '@/lib/adminAuthGuard';
import { HealthcarePlanError, listHealthcarePlans } from '@/lib/healthcarePlanReviewServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/healthcare-plans?patientId=...
 *
 * The client's current healthcare plans with the caller's own read receipts.
 * Staff also get every clinician's progress (the read-status table).
 */
export async function GET(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor', 'nurse']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const patientId = new URL(request.url).searchParams.get('patientId') || '';
  try {
    return NextResponse.json(await listHealthcarePlans(patientId, caller));
  } catch (err) {
    if (err instanceof HealthcarePlanError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('healthcare plan list failed:', err);
    return NextResponse.json({ error: 'Could not load the healthcare plans.' }, { status: 500 });
  }
}
