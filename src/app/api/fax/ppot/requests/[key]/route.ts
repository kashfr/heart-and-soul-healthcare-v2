import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireFaxAccess } from '@/lib/faxCenterServer';
import { cancelPpotRequest, hideReceivedPpot } from '@/lib/ppotServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/fax/ppot/requests/[key] { action }
 *   'cancel'  withdraw a request still waiting on the physician
 *   'hide'    take a filed PPOT off the Signed PPOTs list (the copy stays filed)
 */
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  let caller;
  try {
    caller = await requireFaxAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { key } = await params;
  if (!/^(referral|client)_[A-Za-z0-9_-]{1,128}$/.test(key)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  const result =
    body.action === 'cancel' ? await cancelPpotRequest(key, caller) : body.action === 'hide' ? await hideReceivedPpot(key, caller) : null;
  if (!result) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 500 });
  return NextResponse.json({ ok: true });
}
