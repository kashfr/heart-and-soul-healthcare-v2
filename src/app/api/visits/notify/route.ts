import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { adminDb } from '@/lib/firebaseAdmin';
import { sendSms } from '@/lib/sms/sendSms';
import { sendVisitNotice } from '@/lib/emails/visitNotice';
import { visitSmsBody, whenPhrase, type VisitNotifyEvent, type VisitNotifyFacts } from '@/lib/visitNotifyShared';
import { createPortalNotification } from '@/lib/notificationsServer';

const EVENTS: VisitNotifyEvent[] = ['assigned', 'cancelled', 'restored'];

/**
 * POST /api/visits/notify — text + email the staff member a visit was
 * assigned to (or whose visit was cancelled / put back on the schedule).
 * Called by the dashboard right after the schedule write succeeds; the visit
 * exists regardless of what happens here (notifications are best-effort, and
 * each channel reports back so the scheduler's toast can say what landed).
 *
 * Staff-only, mirroring the schedule-maintenance gate: only admin/supervisor
 * can create or change visits, so only they can trigger the notice.
 *
 * PHI-FREE: the composed messages carry the visit's date/time/type and a
 * portal link only (SMS is outside the Quo BAA; email is PHI-free by policy).
 * The send is stamped onto the visit (lastNotification) via Admin SDK for the
 * "was she told?" audit trail.
 */
export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const visitId = String(body?.visitId || '').trim();
  const event = String(body?.event || '') as VisitNotifyEvent;
  if (!visitId) {
    return NextResponse.json({ error: 'visitId is required.' }, { status: 400 });
  }
  if (!EVENTS.includes(event)) {
    return NextResponse.json({ error: 'event must be assigned, cancelled, or restored.' }, { status: 400 });
  }

  const db = adminDb();
  const visitSnap = await db.collection('patientVisits').doc(visitId).get();
  if (!visitSnap.exists) {
    return NextResponse.json({ error: 'Visit not found.' }, { status: 404 });
  }
  const visit = visitSnap.data() as {
    date?: string;
    startTime?: string;
    type?: string;
    nurseId?: string;
  };

  const assigneeUid = (visit.nurseId || '').trim();
  if (!assigneeUid) {
    // Free-text assignee (no portal account) — nothing to notify. Not an error.
    return NextResponse.json({ skipped: true, reason: 'no-account' });
  }

  const userSnap = await db.collection('users').doc(assigneeUid).get();
  if (!userSnap.exists) {
    return NextResponse.json({ skipped: true, reason: 'no-account' });
  }
  const assignee = userSnap.data() as {
    displayName?: string;
    phone?: string;
    email?: string;
    active?: boolean;
  };
  if (assignee.active === false) {
    return NextResponse.json({ skipped: true, reason: 'inactive' });
  }

  const facts: VisitNotifyFacts = {
    date: visit.date || '',
    startTime: visit.startTime || undefined,
    type: visit.type === 'supervisory' ? 'supervisory' : 'shift',
  };

  // In-portal bell text lives behind the login, so it may name the client —
  // the detail the PHI-free SMS/email deliberately omit.
  const patientSnap = await db.collection('patients').doc(String((visit as { patientId?: string }).patientId || '')).get().catch(() => null);
  const clientName = patientSnap?.exists ? String((patientSnap.data() as { name?: string }).name || '') : '';
  const when = whenPhrase(facts);
  const what = facts.type === 'supervisory' ? 'Supervisory visit' : 'Shift visit';
  const bellText =
    event === 'assigned'
      ? `${what} assigned to you${clientName ? ` for ${clientName}` : ''}: ${when}`
      : event === 'cancelled'
        ? `${what}${clientName ? ` for ${clientName}` : ''} on ${when} was cancelled`
        : `${what}${clientName ? ` for ${clientName}` : ''} on ${when} is back on the schedule`;

  const [sms, email] = await Promise.all([
    sendSms(assignee.phone || '', visitSmsBody(event, facts)),
    sendVisitNotice({
      to: assignee.email || '',
      recipientName: assignee.displayName || '',
      event,
      facts,
    }),
    createPortalNotification(db, {
      userId: assigneeUid,
      kind: `visit-${event}`,
      text: bellText,
      href: `/admin/clients/${String((visit as { patientId?: string }).patientId || '')}?tab=schedule`,
    }),
  ]);

  // Audit stamp (Admin SDK bypasses the client-update allowlist by design).
  await visitSnap.ref.update({
    lastNotification: {
      event,
      to: assigneeUid,
      at: FieldValue.serverTimestamp(),
      by: caller.uid,
      smsOk: sms.ok,
      emailOk: email.ok,
    },
  });

  return NextResponse.json({
    smsOk: sms.ok,
    emailOk: email.ok,
    smsError: sms.ok ? undefined : sms.error,
    emailError: email.ok ? undefined : email.error,
  });
}
