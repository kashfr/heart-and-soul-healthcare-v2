import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import { createPortalNotification } from './notificationsServer';
import { recordCommunication } from './communicationsServer';
import { listServicePlans } from './servicePlanServer';
import { sendServicePlanReminderEmail } from './emails/servicePlanReminder';
import { SUPERVISORY_NOTE_TYPE } from './supervisoryVisit';
import { normalizeDateISO } from './clientDashboardShared';
import { SERVICE_PLAN_DOC_CATEGORY, servicePlanStatus } from './servicePlanShared';
import {
  pickServicePlanReminderRecipients,
  SERVICE_PLAN_BELL_DIGEST_AFTER,
  SERVICE_PLAN_REMINDER_SOON_DAYS,
  servicePlanBellText,
  servicePlanDigestBellText,
  servicePlanReminderEmail,
  shouldSendServicePlanReminder,
  type ReminderItem,
  type ReminderState,
} from './servicePlanReminders';

/**
 * Daily service plan reminders (run from the morning visit-reminder cron).
 * Per client: status from portal plans and filed "Service Plan" documents;
 * whether a reminder is due (servicePlanReminders.ts); who hears about it.
 * Per recipient: one portal bell per client (one bell listing them all past
 * three clients) and one PHI-free digest email.
 * Every send is recorded in the Communications log. Reminder state lives in
 * `servicePlanReminders/{patientId}` (server-only, default deny).
 */
const STATE = 'servicePlanReminders';

export async function sweepServicePlanReminders(todayISO: string): Promise<{ clientsDue: number; recipients: number }> {
  const db = adminDb();
  const [patients, users, visits, notes, docs, states] = await Promise.all([
    db.collection('patients').get(),
    db.collection('users').get(),
    db.collection('patientVisits').where('type', '==', 'supervisory').get(),
    db.collection('progressNotes').where('noteType', '==', SUPERVISORY_NOTE_TYPE).get(),
    db.collection('patientDocuments').where('category', '==', SERVICE_PLAN_DOC_CATEGORY).get(),
    db.collection(STATE).get(),
  ]);

  const people = new Map<string, { name: string; email: string }>();
  const eligible = new Set<string>();
  const admins: string[] = [];
  for (const u of users.docs) {
    const x = u.data();
    if (x.active === false || x.isTestAccount === true) continue;
    people.set(u.id, { name: String(x.displayName || ''), email: String(x.email || '') });
    if (x.role === 'admin' || x.role === 'supervisor') eligible.add(u.id);
    if (x.role === 'admin') admins.push(u.id);
  }

  // Next scheduled supervisory visit per client (earliest today or later).
  const nextVisit = new Map<string, { date: string; nurseId: string }>();
  for (const d of visits.docs) {
    const v = d.data();
    if (v.status !== 'scheduled' || !v.nurseId || String(v.date || '') < todayISO) continue;
    const cur = nextVisit.get(String(v.patientId || ''));
    if (!cur || String(v.date) < cur.date) nextVisit.set(String(v.patientId || ''), { date: String(v.date), nurseId: String(v.nurseId) });
  }
  // Author of the latest supervisory visit per client.
  const lastVisit = new Map<string, { date: string; nurseId: string }>();
  for (const d of notes.docs) {
    const n = d.data();
    if (n.status === 'archived' || n.archivedAt || !n.nurseId) continue;
    const date = normalizeDateISO(String(n.q6_dateofService || ''));
    const cur = lastVisit.get(String(n.patientId || ''));
    if (!cur || date > cur.date) lastVisit.set(String(n.patientId || ''), { date, nurseId: String(n.nurseId) });
  }
  const docDates = new Map<string, string[]>();
  for (const d of docs.docs) {
    const x = d.data();
    if (x.archived === true) continue;
    const list = docDates.get(String(x.patientId || '')) ?? [];
    list.push(String(x.docDate || ''));
    docDates.set(String(x.patientId || ''), list);
  }
  const prevState = new Map<string, ReminderState>();
  for (const d of states.docs) {
    const x = d.data();
    prevState.set(d.id, { stage: String(x.stage || ''), dueISO: String(x.dueISO || ''), lastSentISO: String(x.lastSentISO || '') });
  }

  const byRecipient = new Map<string, ReminderItem[]>();
  const stateWrites: { patientId: string; state: ReminderState }[] = [];
  for (const p of patients.docs) {
    const x = p.data();
    const name = String(x.name || '');
    if (!name) continue;
    // Not started yet: nothing is due.
    if (typeof x.serviceStartedOn === 'string' && x.serviceStartedOn > todayISO) continue;
    const plans = await listServicePlans(p.id);
    const status = servicePlanStatus(plans[0] || null, todayISO, SERVICE_PLAN_REMINDER_SOON_DAYS, docDates.get(p.id) ?? []);
    const prev = prevState.get(p.id) ?? null;
    if (!shouldSendServicePlanReminder(prev, status, todayISO)) {
      // Remember a plan that became current, so its next "due soon" is news.
      if (prev && prev.stage !== status.stage) stateWrites.push({ patientId: p.id, state: { ...prev, stage: status.stage, dueISO: status.dueISO } });
      continue;
    }
    const to = pickServicePlanReminderRecipients({
      nextVisitNurseId: nextVisit.get(p.id)?.nurseId || '',
      lastVisitAuthorId: lastVisit.get(p.id)?.nurseId || '',
      eligible,
      admins,
    });
    for (const uid of to) {
      const list = byRecipient.get(uid) ?? [];
      list.push({ patientId: p.id, clientName: name, stage: status.stage, dueISO: status.dueISO });
      byRecipient.set(uid, list);
    }
    stateWrites.push({ patientId: p.id, state: { stage: status.stage, dueISO: status.dueISO, lastSentISO: todayISO } });
  }

  for (const [uid, items] of byRecipient) {
    const person = people.get(uid) ?? { name: '', email: '' };
    const firstName = person.name.trim().split(/\s+/)[0] || '';
    const mail = servicePlanReminderEmail(items, firstName);
    const sent = await sendServicePlanReminderEmail({ to: person.email, subject: mail.subject, body: mail.body });
    const digest = items.length > SERVICE_PLAN_BELL_DIGEST_AFTER ? servicePlanDigestBellText(items) : '';
    if (digest) {
      // The Communications page lists each client with a link to open it.
      await createPortalNotification(db, { userId: uid, kind: 'service-plan-reminder', text: digest, href: '/admin/communications' });
    }
    for (const item of items) {
      const bell = digest || servicePlanBellText(item);
      if (!digest) {
        await createPortalNotification(db, { userId: uid, kind: 'service-plan-reminder', text: bell, href: `/admin/clients/${item.patientId}?tab=serviceplan` });
      }
      await recordCommunication({
        source: 'automated',
        event: 'service-plan-reminder',
        direction: 'outbound',
        patientId: item.patientId,
        patientName: item.clientName,
        staffUid: uid,
        staffName: person.name,
        counterpartyName: '',
        summary: servicePlanBellText(item),
        channels: [
          { channel: 'email', to: person.email, ok: sent.ok, ...(sent.ok ? {} : { error: sent.error || 'Not sent.' }), subject: mail.subject, body: mail.body },
          { channel: 'portal', to: person.name, ok: true, body: bell },
        ],
        relatedVisitId: '',
        loggedByUid: '',
        loggedByName: 'Portal (daily service plan reminder)',
      });
    }
  }

  // Stamp after sending: a lost stamp risks one repeat reminder, never a skipped one.
  for (const w of stateWrites) {
    await db.collection(STATE).doc(w.patientId).set({ ...w.state, updatedAt: FieldValue.serverTimestamp() });
  }
  return { clientsDue: stateWrites.filter((w) => w.state.lastSentISO === todayISO).length, recipients: byRecipient.size };
}
