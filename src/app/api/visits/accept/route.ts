import { NextResponse } from 'next/server';
import { acceptOfferedVisit } from '@/lib/supervisorySchedulingServer';
import { readVisitBody, requireSupervisoryActor } from '../_shared';

/** POST /api/visits/accept: take an open supervisory visit (first to accept wins). */
export async function POST(request: Request) {
  const caller = await requireSupervisoryActor(request);
  if (caller instanceof NextResponse) return caller;
  const body = await readVisitBody(request);
  if (body instanceof NextResponse) return body;
  const r = await acceptOfferedVisit(body.visitId, caller);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.message || 'Could not accept the visit.' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
