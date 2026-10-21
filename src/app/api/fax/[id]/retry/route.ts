import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireFaxAccess, retryOutboundFax } from '@/lib/faxCenterServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/fax/[id]/retry  resend the stored copy of a failed fax. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let caller;
  try {
    caller = await requireFaxAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  const result = await retryOutboundFax(id, caller);
  if (!result.ok) return NextResponse.json({ error: result.error, fax: result.fax }, { status: result.status || 500 });
  return NextResponse.json({ ok: true, fax: result.fax });
}
