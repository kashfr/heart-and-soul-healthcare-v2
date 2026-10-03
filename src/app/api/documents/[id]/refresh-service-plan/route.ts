import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { refreshServicePlanDocument } from '@/lib/servicePlanServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/documents/[id]/refresh-service-plan  re-render a filed service
 *  plan or review PDF in place with the current layout. Staff only. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(request, ['admin', 'supervisor']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  const r = await refreshServicePlanDocument(id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
