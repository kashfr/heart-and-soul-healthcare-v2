import { NextResponse } from 'next/server';
import { offerVisitToSupervisors } from '@/lib/supervisorySchedulingServer';
import { agencyToday, readVisitBody, requireSupervisoryActor } from '../_shared';

/** POST /api/visits/offer: offer a scheduled supervisory visit to every supervisor. */
export async function POST(request: Request) {
  const caller = await requireSupervisoryActor(request);
  if (caller instanceof NextResponse) return caller;
  const body = await readVisitBody(request);
  if (body instanceof NextResponse) return body;
  const r = await offerVisitToSupervisors(
    body.visitId,
    { uid: caller.uid, name: caller.profile.displayName || caller.email || '' },
    { todayISO: agencyToday() },
  );
  if (!r.ok) return NextResponse.json({ ok: false, error: r.message || 'Could not offer the visit.' }, { status: 400 });
  return NextResponse.json({ ok: true, notified: r.notified });
}
