import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireFaxAccess } from '@/lib/faxCenterServer';
import { updateRoi } from '@/lib/roiServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/fax/roi/[id] { action }
 *   'cancel'  withdraw a release still waiting on a signature
 *   'hide'    take it off the list (the record and any signed copy stay)
 *   'unhide'  put it back
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let caller;
  try {
    caller = await requireFaxAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9]{1,64}$/.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  const action = body.action;
  if (action !== 'cancel' && action !== 'hide' && action !== 'unhide') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  const result = await updateRoi(id, action, caller);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 500 });
  return NextResponse.json({ ok: true });
}
