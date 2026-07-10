import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { sendSms } from '@/lib/sms/sendSms';
import { sendVisitNotice } from '@/lib/emails/visitNotice';
import { createPortalNotification } from '@/lib/notificationsServer';
import { visitSmsBody, whenPhrase, type VisitNotifyFacts } from '@/lib/visitNotifyShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Today's calendar date in the AGENCY's timezone — visits are Georgia days,
 *  not UTC days (the cron fires at a fixed UTC hour). */
function agencyTodayISO(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Morning-of visit reminders (Vercel Cron, daily). Every scheduled visit
 * dated today whose assignee has a portal account gets the full channel
 * sweep: PHI-free SMS + email, plus an in-portal bell notification (which
 * may name the client — it's behind the login). Each visit is stamped with
 * reminderSentAt so a cron retry can never double-text a nurse. Fails closed
 * on the CRON_SECRET check like the other cron.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = adminDb();
  const today = agencyTodayISO();

  try {
    const snap = await db
      .collection('patientVisits')
      .where('date', '==', today)
      .where('status', '==', 'scheduled')
      .get();

    let reminded = 0;
    let skipped = 0;

    for (const docSnap of snap.docs) {
      const v = docSnap.data() as {
        patientId?: string;
        startTime?: string;
        type?: string;
        nurseId?: string;
        reminderSentAt?: unknown;
      };
      if (!v.nurseId || v.reminderSentAt) {
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
        date: today,
        startTime: v.startTime || undefined,
        type: v.type === 'supervisory' ? 'supervisory' : 'shift',
      };

      const patientSnap = await db.collection('patients').doc(String(v.patientId || '')).get().catch(() => null);
      const clientName = patientSnap?.exists ? String((patientSnap.data() as { name?: string }).name || '') : '';
      const what = facts.type === 'supervisory' ? 'supervisory visit' : 'shift visit';
      const bellText = `Reminder: ${what} today${clientName ? ` for ${clientName}` : ''}, ${whenPhrase(facts)}`;

      await Promise.all([
        sendSms(assignee.phone || '', visitSmsBody('reminder', facts)),
        sendVisitNotice({
          to: assignee.email || '',
          recipientName: assignee.displayName || '',
          event: 'reminder',
          facts,
        }),
        createPortalNotification(db, {
          userId: v.nurseId,
          kind: 'visit-reminder',
          text: bellText,
          href: `/admin/clients/${String(v.patientId || '')}?tab=schedule`,
        }),
      ]);

      await docSnap.ref.update({ reminderSentAt: FieldValue.serverTimestamp() });
      reminded++;
    }

    return NextResponse.json({ ok: true, date: today, reminded, skipped, totalScheduledToday: snap.size });
  } catch (err) {
    console.error('Visit reminder sweep failed:', err);
    return NextResponse.json({ error: 'Sweep failed.' }, { status: 500 });
  }
}
