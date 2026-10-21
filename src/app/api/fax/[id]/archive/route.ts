import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireFaxAccess, setOutboundFaxArchived } from '@/lib/faxCenterServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/fax/[id]/archive { archived }  hide a sent fax from the outbox, or restore it. */
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
  const body = (await request.json().catch(() => ({}))) as { archived?: unknown };
  const ok = await setOutboundFaxArchived(id, body.archived !== false, caller);
  if (!ok) return NextResponse.json({ error: 'Fax not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
