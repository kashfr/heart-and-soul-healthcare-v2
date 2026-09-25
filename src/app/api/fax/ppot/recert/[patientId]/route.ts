import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireFaxAccess } from '@/lib/faxCenterServer';
import { dismissRecert } from '@/lib/ppotServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/fax/ppot/recert/[patientId] { authEnd }  "not needed this cycle" for a recertification. */
export async function POST(request: Request, { params }: { params: Promise<{ patientId: string }> }) {
  let caller;
  try {
    caller = await requireFaxAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { patientId } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(patientId)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { authEnd?: unknown };
  const result = await dismissRecert(patientId, String(body.authEnd || ''), caller);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 500 });
  return NextResponse.json({ ok: true });
}
