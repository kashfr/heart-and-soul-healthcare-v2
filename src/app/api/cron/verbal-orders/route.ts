import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { srfaxConfigured, srfaxGetFaxStatus, srfaxGetInbox } from '@/lib/fax/srfax';
import {
  agencyTodayISO,
  faxVerbalOrder,
  notifyStaff,
  notifyStaffGeneric,
  recordFaxStatus,
  serializeVerbalOrder,
  verbalOrderThresholds,
} from '@/lib/verbalOrderServer';
import { pollInFlightFaxes } from '@/lib/faxCenterServer';
import { faxRecipientUids, listOpenPpotRequests, ppotInboundBellText, runPpotRecertSweep, runPpotReminderSweep } from '@/lib/ppotServer';
import { createPortalNotification } from '@/lib/notificationsServer';
import { ppotCandidatesForInbound } from '@/lib/ppotShared';
import { candidateOrdersForInboundFax, inboundFaxSender, verbalOrderUrgency } from '@/lib/verbalOrderShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ymd(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).replace(/-/g, '');
}

/**
 * Verbal-order sweep (Cloud Scheduler, every 10 minutes). Four jobs, each
 * isolated so one failure never stops the rest:
 *
 *  1. Inbound: list unread SRFax faxes from the last 14 days and record each
 *     under verbalOrderInbound with the open orders whose physician fax matches
 *     the sender ('suggested') or none ('unmatched'), then ring staff. Nothing
 *     is filed automatically: a person opens the fax and matches it on the
 *     queue, which is what files it and marks the order signed. The fax stays
 *     unread in SRFax until then.
 *  2. Outbound status: poll any 'In Progress' fax older than 5 minutes (the
 *     webhook usually beats this; polling is the safety net).
 *  3. Reminders: an open order at the overdue threshold is re-faxed once and
 *     staff are told.
 *  4. Escalation: an open order at the escalation threshold rings the admin
 *     bell once.
 *  5. Fax Center: poll outbound faxes still 'In Progress' (same safety net
 *     as step 2, for faxes sent from /admin/fax).
 *     Faxes from a number an open PPOT (Appendix T) request went to are also
 *     suggested as that signed PPOT and ring Fax Center users instead.
 *  6. PPOT recertification: a GAPP client whose authorization ends within
 *     the Settings lead time, with no Appendix T request sent this cycle,
 *     rings everyone with Fax Center access (once per authorization period;
 *     checked hourly during weekday office hours).
 *  7. PPOT follow-up: a request still unsigned at the Verbal Orders overdue
 *     threshold is re-faxed once as a second request; at the escalation
 *     threshold Fax Center users are rung to call the office. Same hourly,
 *     office-hours slot as step 6, so the re-fax lands while the office is
 *     open.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const db = adminDb();
  const today = agencyTodayISO();
  const thresholds = await verbalOrderThresholds();
  const summary = { inboundSeen: 0, inboundUnmatched: 0, statusPolled: 0, reminded: 0, escalated: 0, faxCenterPolled: 0, ppotRecertReminded: 0, ppotRefaxed: 0, ppotEscalated: 0, errors: [] as string[] };

  const openSnap = await db.collection('verbalOrders').where('status', 'in', ['taken', 'faxed']).get();
  const open = openSnap.docs.map((d) => serializeVerbalOrder(d.id, d.data() || {}));

  // 1. Inbound: record, suggest, never file. A returned fax is only ever
  // attached to an order by a staff member who has looked at it (the queue's
  // "Match to an order" flow). Auto-filing on caller ID alone would let a lab
  // result from the same office become a "signed physician order".
  if (srfaxConfigured()) {
    try {
      const end = new Date();
      const start = new Date(Date.now() - 14 * 86400000);
      const inbox = await srfaxGetInbox({ startYmd: ymd(start), endYmd: ymd(end), unreadOnly: true });
      // Open PPOT (Appendix T) requests: a fax back from a number we sent one
      // to is suggested as the signed copy in the Fax Center.
      const openPpot = await listOpenPpotRequests().catch(() => []);
      let ppotRecipients: string[] | null = null;
      if (!inbox.ok) summary.errors.push(`inbox: ${inbox.error || 'failed'}`);
      for (const fax of inbox.faxes) {
        summary.inboundSeen++;
        if (!fax.faxDetailsId) continue;
        const seenRef = db.collection('verbalOrderInbound').doc(fax.faxDetailsId);
        const candidates = candidateOrdersForInboundFax([fax.callerId, fax.remoteId], open);
        const ppotCandidateKeys = ppotCandidatesForInbound([fax.callerId, fax.remoteId], openPpot);
        // create() is the race guard: two overlapping sweeps can't both record
        // (and bell) the same fax.
        try {
          await seenRef.create({
            fileName: fax.fileName,
            callerId: fax.callerId,
            remoteId: fax.remoteId,
            pages: fax.pages,
            receivedAt: fax.date,
            epochTime: fax.epochTime,
            status: candidates.length > 0 || ppotCandidateKeys.length > 0 ? 'suggested' : 'unmatched',
            candidateOrderIds: candidates,
            ppotCandidateKeys,
            matchedOrderId: '',
            firstSeenAt: FieldValue.serverTimestamp(),
          });
        } catch {
          continue; // already recorded
        }
        summary.inboundUnmatched++;
        if (ppotCandidateKeys.length > 0) {
          ppotRecipients ??= await faxRecipientUids();
          const text = ppotInboundBellText(inboundFaxSender(fax.callerId, fax.remoteId).from, openPpot.filter((r) => ppotCandidateKeys.includes(r.key)));
          for (const uid of ppotRecipients) await createPortalNotification(db, { userId: uid, kind: 'ppot-returned', text, href: '/admin/fax' });
          // A fax from a PPOT physician with no open verbal order from that
          // number is almost certainly the PPOT: don't also ring the
          // verbal-order bell for it.
          if (candidates.length === 0) continue;
        }
        if (candidates.length === 1) {
          const o = open.find((x) => x.id === candidates[0]);
          if (o) await notifyStaff('fax-returned', o, `/admin/verbal-orders?vo=${o.id}`);
        } else {
          await notifyStaffGeneric('A fax arrived on the portal line that may be a signed verbal order. Match it under Verbal orders.', '/admin/verbal-orders');
        }
      }
    } catch (err) {
      summary.errors.push(`inbound: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Outbound status poll
  if (srfaxConfigured()) {
    for (const o of open) {
      if (o.status !== 'faxed' || o.fax?.provider !== 'srfax' || !o.fax.faxDetailsId) continue;
      if (o.fax.sentStatus !== 'In Progress' && o.fax.sentStatus !== '') continue;
      const queuedMs = o.fax.queuedAt ? Date.parse(o.fax.queuedAt) : 0;
      if (Date.now() - queuedMs < 5 * 60 * 1000) continue;
      try {
        const st = await srfaxGetFaxStatus(o.fax.faxDetailsId);
        if (st.ok && st.sentStatus && st.sentStatus !== 'In Progress') {
          await recordFaxStatus(o.id, { sentStatus: st.sentStatus, errorCode: st.errorCode, dateSent: st.dateSent });
          summary.statusPolled++;
        }
      } catch (err) {
        summary.errors.push(`status ${o.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 3 + 4. Reminders and escalation
  for (const o of open) {
    if (o.status === 'signed') continue;
    const urgency = verbalOrderUrgency(o, today, thresholds);
    const ref = db.collection('verbalOrders').doc(o.id);
    try {
      if ((urgency === 'overdue' || urgency === 'escalated') && !o.reminderSentAt) {
        // Stamp first so a slow fax call can't double-remind on the next tick.
        await ref.update({ reminderSentAt: FieldValue.serverTimestamp() });
        if (srfaxConfigured()) await faxVerbalOrder(o.id, { uid: '', name: 'Portal (reminder)' });
        await notifyStaff('overdue', o, `/admin/verbal-orders?vo=${o.id}`);
        summary.reminded++;
      }
      if (urgency === 'escalated' && !o.escalatedAt) {
        await ref.update({ escalatedAt: FieldValue.serverTimestamp() });
        await notifyStaff('escalated', o, `/admin/verbal-orders?vo=${o.id}`);
        summary.escalated++;
      }
    } catch (err) {
      summary.errors.push(`remind ${o.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 5. Fax Center outbound status
  if (srfaxConfigured()) {
    try {
      const r = await pollInFlightFaxes({ olderThanMs: 5 * 60 * 1000, limit: 50 });
      summary.faxCenterPolled = r.polled;
      summary.errors.push(...r.errors);
    } catch (err) {
      summary.errors.push(`fax center: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 6. PPOT recertification reminders. Once an hour (the first tick of the
  // hour), office hours only, so the bell rings while someone can act on it
  // and the roster isn't re-read every ten minutes.
  const et = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date());
  const etHour = Number(et.find((x) => x.type === 'hour')?.value ?? -1);
  const etWeekday = et.find((x) => x.type === 'weekday')?.value ?? '';
  if (new Date().getUTCMinutes() < 10 && etHour >= 8 && etHour < 18 && etWeekday !== 'Sat' && etWeekday !== 'Sun') {
    try {
      const r = await runPpotRecertSweep();
      summary.ppotRecertReminded = r.reminded;
      summary.errors.push(...r.errors);
    } catch (err) {
      summary.errors.push(`ppot recert: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      const r = await runPpotReminderSweep(thresholds, srfaxConfigured());
      summary.ppotRefaxed = r.refaxed;
      summary.ppotEscalated = r.escalated;
      summary.errors.push(...r.errors);
    } catch (err) {
      summary.errors.push(`ppot reminders: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ ok: summary.errors.length === 0, faxConfigured: srfaxConfigured(), ...summary });
}
