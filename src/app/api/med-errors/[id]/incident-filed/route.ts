import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { markMedErrorIncidentFiled } from '@/lib/medErrorServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST { filedDate }: the office records when the DBHDD incident report was
 *  filed, after the nursing review. Staff only; write-once. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  let body: { filedDate?: string };
  try {
    body = (await request.json()) as { filedDate?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const filedDate = String(body.filedDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(filedDate)) return NextResponse.json({ error: 'filedDate must be YYYY-MM-DD.' }, { status: 400 });
  const r = await markMedErrorIncidentFiled(id, filedDate, { uid: caller.uid, name: caller.profile.displayName || caller.email || '' });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
