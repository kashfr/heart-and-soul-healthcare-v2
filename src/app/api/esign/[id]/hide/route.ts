import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireFaxAccess } from '@/lib/faxCenterServer';
import { setPacketHidden } from '@/lib/pandadocServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/esign/[id]/hide { hidden }  remove a packet from the list, or restore it. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let caller;
  try {
    caller = await requireFaxAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { hidden?: unknown };
  const ok = await setPacketHidden(id, body.hidden !== false, caller);
  if (!ok) return NextResponse.json({ error: 'Packet not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
