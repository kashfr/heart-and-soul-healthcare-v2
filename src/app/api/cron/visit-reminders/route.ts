import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { sendSms } from '@/lib/sms/sendSms';
import { sendVisitNotice } from '@/lib/emails/visitNotice';
import { createPortalNotification } from '@/lib/notificationsServer';
import {
  needsMorningNudge,
  visitSmsBody,
  whenPhrase,
  type VisitNotifyFacts,
} from '@/lib/visitNotifyShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A calendar date in the AGENCY's timezone, offset by whole days — visits
 *  are Georgia days, not UTC days (the cron fires at a fixed local hour). */
function agencyDateISO(offsetDays: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Visit reminders (Cloud Scheduler, twice daily) in two windows:
 *
 *  - ?window=evening (~6 PM agency time): reminds EVERY scheduled visit dated
 *    TOMORROW — this is the primary reminder, early enough for a nurse with a
 *    5:00 or 7:30 AM start to plan around. Stamps reminderSentAt.
 *  - ?window=morning (~7 AM, and the default): a day-of nudge for TODAY's
 *    visits starting at or after 9:30 AM only — earlier starts already had
 *    their useful reminder the evening before, and a 7 AM text would land
 *    after (or minutes before) the shift began. Stamps morningNudgeSentAt,
 *    separate from the evening stamp so the two windows never block each other.
 *
 * Every reminded assignee gets the full channel sweep: PHI-free SMS + email,
 * plus an in-portal bell notification (which may name the client — it's
 * behind the login). The per-window stamp means a cron retry can never
 * double-text a nurse. Fails closed on the CRON_SECRET check like the other
 * cron. Known tradeoff: a visit created after the 6 PM sweep for an
 * early-morning shift next day gets neither window — but the 'assigned'
 * notification already fired at creation, so the nurse was told.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const window =
    new URL(request.url).searchParams.get('window') === 'evening' ? 'evening' : 'morning';
  const targetDate = agencyDateISO(window === 'evening' ? 1 : 0);
  const stampField = window === 'evening' ? 'reminderSentAt' : 'morningNudgeSentAt';
  const smsEvent = window === 'evening' ? ('reminder_tomorrow' as const) : ('reminder' as const);
  const dayWord = window === 'evening' ? 'tomorrow' : 'today';

  const db = adminDb();

  try {
    const snap = await db
      .collection('patientVisits')
      .where('date', '==', targetDate)
      .where('status', '==', 'scheduled')
      .get();

    let reminded = 0;
    let skipped = 0;

    for (const docSnap of snap.docs) {
      // One bad or transiently-failing visit must never abort the rest of the
      // sweep — everything per-visit is isolated here. Send-then-stamp order
      // is deliberate: a lost stamp risks one duplicate text on retry, but a
      // stamp-before-send would silently eat the reminder entirely.
      try {
        const v = docSnap.data() as {
          patientId?: string;
          startTime?: string;
          type?: string;
          nurseId?: string;
          reminderSentAt?: unknown;
          morningNudgeSentAt?: unknown;
        };
        const alreadyStamped =
          window === 'evening' ? Boolean(v.reminderSentAt) : Boolean(v.morningNudgeSentAt);
        if (!v.nurseId || alreadyStamped) {
          skipped++;
          continue;
        }
        // Day-of nudges only make sense for later starts; early shifts were
        // covered by the evening-before window.
        if (window === 'morning' && !needsMorningNudge(v.startTime)) {
          skipped++;
          continue;
        }

        const userSnap = await db.collection('users').doc(v.nurseId).get();
        const assignee = userSnap.exists
          ? (userSnap.data() as { displayName?: string; phone?: string; email?: string; active?: boolean })
          : null;
        if (!assignee || assignee.active === false) {
          skipped++;
          continue;
        }

        const facts: VisitNotifyFacts = {
          date: targetDate,
          startTime: v.startTime || undefined,
          type: v.type === 'supervisory' ? 'supervisory' : 'shift',
        };

        // .doc('') throws synchronously, so guard rather than .catch().
        const patientSnap = v.patientId
          ? await db.collection('patients').doc(String(v.patientId)).get().catch(() => null)
          : null;
        const clientName = patientSnap?.exists ? String((patientSnap.data() as { name?: string }).name || '') : '';
        const what = facts.type === 'supervisory' ? 'supervisory visit' : 'shift visit';
        const bellText = `Reminder: ${what} ${dayWord}${clientName ? ` for ${clientName}` : ''}, ${whenPhrase(facts)}`;

        await Promise.all([
          sendSms(assignee.phone || '', visitSmsBody(smsEvent, facts)),
          sendVisitNotice({
            to: assignee.email || '',
            recipientName: assignee.displayName || '',
            event: smsEvent,
            facts,
          }),
          createPortalNotification(db, {
            userId: v.nurseId,
            kind: 'visit-reminder',
            text: bellText,
            href: `/admin/clients/${String(v.patientId || '')}?tab=schedule`,
          }),
        ]);

        await docSnap.ref.update({ [stampField]: FieldValue.serverTimestamp() });
        reminded++;
      } catch (err) {
        console.error(`Visit reminder failed for ${docSnap.id} (continuing sweep):`, err);
        skipped++;
      }
    }

    return NextResponse.json({
      ok: true,
      window,
      date: targetDate,
      reminded,
      skipped,
      totalScheduled: snap.size,
    });
  } catch (err) {
    console.error('Visit reminder sweep failed:', err);
    return NextResponse.json({ error: 'Sweep failed.' }, { status: 500 });
  }
}
