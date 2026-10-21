import { NextResponse } from 'next/server';
import { releaseVisit } from '@/lib/supervisorySchedulingServer';
import { agencyToday, readVisitBody, requireSupervisoryActor } from '../_shared';

/** POST /api/visits/release: hand a supervisory visit to a named supervisor
 *  (toUid), or release it to every other supervisor (toUid ''). */
export async function POST(request: Request) {
  const caller = await requireSupervisoryActor(request);
  if (caller instanceof NextResponse) return caller;
  const body = await readVisitBody(request);
  if (body instanceof NextResponse) return body;
  const r = await releaseVisit(body.visitId, caller, { toUid: body.toUid, reason: body.reason, todayISO: agencyToday() });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.message || 'Could not hand off the visit.' }, { status: 400 });
  return NextResponse.json({ ok: true, notified: r.notified });
}
