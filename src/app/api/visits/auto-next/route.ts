import { NextResponse } from 'next/server';
import { notifyAutoNextVisit } from '@/lib/supervisorySchedulingServer';
import { readVisitBody, requireSupervisoryActor } from '../_shared';

/** POST /api/visits/auto-next: bell + email the supervisor about the next
 *  supervisory visit the portal put on the calendar for her. */
export async function POST(request: Request) {
  const caller = await requireSupervisoryActor(request);
  if (caller instanceof NextResponse) return caller;
  const body = await readVisitBody(request);
  if (body instanceof NextResponse) return body;
  const r = await notifyAutoNextVisit(body.visitId, caller);
  return NextResponse.json({ ok: r.ok });
}
