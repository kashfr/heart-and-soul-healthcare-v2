import { NextResponse } from 'next/server';
import { AdminAuthError, requireRole } from '@/lib/adminAuthGuard';
import { HealthcarePlanError, openHealthcarePlan } from '@/lib/healthcarePlanReviewServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/healthcare-plans/[documentId]/file
 *
 * The plan's bytes, for the in-portal viewer. Serving them records that the
 * caller opened this version, which unlocks her acknowledgment.
 */
export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor', 'nurse']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    const { bytes, contentType } = await openHealthcarePlan(documentId, caller);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    if (err instanceof HealthcarePlanError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('healthcare plan open failed:', err);
    return NextResponse.json({ error: 'Could not open the healthcare plan.' }, { status: 500 });
  }
}
