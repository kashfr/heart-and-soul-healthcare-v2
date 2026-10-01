import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError, type AuthedCaller } from '@/lib/adminAuthGuard';

/** Agency-local (America/New_York) calendar date, not container-local. */
export function agencyToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Supervisory visits are taken by supervisors; admins may act on the
 *  schedule too. Field nurses never see these buttons. */
export async function requireSupervisoryActor(request: Request): Promise<AuthedCaller | NextResponse> {
  try {
    return await requireRole(request, ['admin', 'supervisor']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function readVisitBody(request: Request): Promise<{ visitId: string; toUid: string; reason: string } | NextResponse> {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const visitId = String(body?.visitId || '').trim();
  if (!visitId) return NextResponse.json({ error: 'visitId is required.' }, { status: 400 });
  return { visitId, toUid: String(body?.toUid || '').trim(), reason: String(body?.reason || '').trim() };
}
