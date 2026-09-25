import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireFaxAccess } from '@/lib/faxCenterServer';
import { dismissIncomingFax } from '@/lib/ppotServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/fax/inbound/[faxId]/dismiss  take a fax off Incoming faxes (and
 * the Verbal Orders queue) without filing it. Admins and supervisors only:
 * it could be a signed verbal order someone else has to match.
 */
export async function POST(request: Request, { params }: { params: Promise<{ faxId: string }> }) {
  let caller;
  try {
    caller = await requireFaxAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (caller.role !== 'admin' && caller.role !== 'supervisor') {
    return NextResponse.json({ error: 'Only an admin or supervisor can dismiss an incoming fax.' }, { status: 403 });
  }
  const { faxId } = await params;
  if (!/^[0-9]{1,20}$/.test(faxId)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const result = await dismissIncomingFax(faxId, caller);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 500 });
  return NextResponse.json({ ok: true });
}
