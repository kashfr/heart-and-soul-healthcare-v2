import 'server-only';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';
import { sendSms } from './sms/sendSms';
import { sendVisitNotice } from './emails/visitNotice';
import { createPortalNotification } from './notificationsServer';
import { recordCommunication } from './communicationsServer';
import { normalizeDateISO } from './clientDashboardShared';
import { SUPERVISORY_NOTE_TYPE } from './supervisoryVisit';
import { visitEmailBody, visitEmailSubject, visitSmsBody, whenPhrase, type VisitNotifyFacts } from './visitNotifyShared';
import { autoOfferVisitNote, dailySupervisoryAction, supervisoryStageLabel, type SchedVisitLite } from './supervisoryScheduling';

/**
 * Supervisory visits that are offered to every supervisor (the first to
 * accept takes it), accepted, handed to a named supervisor, or released back
 * to all; plus the daily sweep that creates an open visit for any client whose
 * next supervisory visit is due within 7 days, overdue, or has never happened
 * and nothing is on the calendar. Rules in supervisoryScheduling.ts. All
 * writes here are Admin SDK: the client-side update rule's key list does not
 * cover the offer fields, and accepting must be a transaction.
 */

/** Documents filed under this category count as a supervisory visit on record
 *  (the client page's currency tile reads the same category). */
const SUPERVISORY_DOC_CATEGORY = 'Supervisory Visit';
const PORTAL_SOURCE = 'Portal (supervisory visit scheduling)';

interface Person {
  uid: string;
  name: string;
  email: string;
  phone: string;
}

async function loadSupervisors(db: Firestore): Promise<Person[]> {
  const snap = await db.collection('users').where('role', '==', 'supervisor').where('active', '==', true).get();
  return snap.docs
    .map((d) => {
      const u = d.data();
      return { uid: d.id, name: String(u.displayName || ''), email: String(u.email || ''), phone: String(u.phone || '') };
    })
    .filter((p) => p.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function loadPerson(db: Firestore, uid: string): Promise<Person | null> {
  if (!uid) return null;
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const u = snap.data() || {};
  if (u.active === false) return null;
  return { uid, name: String(u.displayName || ''), email: String(u.email || ''), phone: String(u.phone || '') };
}

async function clientNameOf(db: Firestore, patientId: string): Promise<string> {
  if (!patientId) return '';
  const snap = await db.collection('patients').doc(patientId).get().catch(() => null);
  return snap?.exists ? String((snap.data() || {}).name || '') : '';
}

function factsOf(v: FirebaseFirestore.DocumentData): VisitNotifyFacts {
  return { date: String(v.date || ''), startTime: v.startTime ? String(v.startTime) : undefined, type: v.type === 'supervisory' ? 'supervisory' : 'shift' };
}

/** The full channel sweep to one person: PHI-free text + email, a bell that
 *  names the client, and a Communications log entry with every channel. */
async function notifyPerson(
  db: Firestore,
  p: Person,
  event: 'offered' | 'assigned' | 'auto_next',
  facts: VisitNotifyFacts,
  ctx: { visitId: string; patientId: string; clientName: string; bellText: string; commEvent: string; loggedByUid: string; loggedByName: string; sms: boolean },
): Promise<{ smsOk: boolean; emailOk: boolean }> {
  const firstName = p.name.trim().split(/\s+/)[0] || '';
  const [sms, email] = await Promise.all([
    ctx.sms ? sendSms(p.phone, visitSmsBody(event, facts)) : Promise.resolve({ ok: false, skipped: true as const, error: 'Not sent for this notice.' }),
    sendVisitNotice({ to: p.email, recipientName: p.name, event, facts }),
    createPortalNotification(db, { userId: p.uid, kind: `visit-${event.replace('_', '-')}`, text: ctx.bellText, href: `/admin/clients/${ctx.patientId}?tab=schedule` }),
  ]);
  await recordCommunication({
    source: 'automated',
    event: ctx.commEvent,
    direction: 'outbound',
    patientId: ctx.patientId,
    patientName: ctx.clientName,
    staffUid: p.uid,
    staffName: p.name,
    counterpartyName: '',
    summary: ctx.bellText,
    channels: [
      { channel: 'email', to: p.email, ok: email.ok, ...(email.ok ? {} : { error: email.error || 'Not sent.' }), subject: visitEmailSubject(event, facts), body: visitEmailBody(event, facts, firstName) },
      ...(ctx.sms ? [{ channel: 'sms' as const, to: p.phone, ok: sms.ok, ...(sms.ok ? {} : { error: sms.error || 'Not sent.', skipped: !!sms.skipped }), body: visitSmsBody(event, facts) }] : []),
      { channel: 'portal' as const, to: p.name, ok: true, body: ctx.bellText },
    ],
    relatedVisitId: ctx.visitId,
    loggedByUid: ctx.loggedByUid,
    loggedByName: ctx.loggedByName,
  });
  return { smsOk: sms.ok, emailOk: email.ok };
}

export interface OfferResult {
  ok: boolean;
  notified: number;
  message?: string;
}

/**
 * Offer a scheduled supervisory visit to every active supervisor except
 * `exceptUid` (the person releasing it). Clears the assignee, marks the visit
 * open, stamps when it was offered, and notifies each supervisor by text,
 * email and bell. Used by the schedule modal ("offer to all"), by a release,
 * and by the daily sweep (which passes the agency date for the stamp).
 */
export async function offerVisitToSupervisors(
  visitId: string,
  by: { uid: string; name: string },
  opts: { exceptUid?: string; todayISO: string; reason?: string },
): Promise<OfferResult> {
  const db = adminDb();
  const ref = db.collection('patientVisits').doc(visitId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, notified: 0, message: 'Visit not found.' };
  const v = snap.data() || {};
  if (v.type !== 'supervisory') return { ok: false, notified: 0, message: 'Only supervisory visits can be offered to the supervisors.' };
  if (v.status !== 'scheduled') return { ok: false, notified: 0, message: 'Only a scheduled visit can be offered.' };

  await ref.update({
    nurseId: '',
    nurseName: '',
    offeredToAll: true,
    lastOfferedISO: opts.todayISO,
    lastOfferedAt: FieldValue.serverTimestamp(),
    offeredBy: by.uid,
    offeredByName: by.name,
    ...(opts.reason ? { releaseReason: opts.reason } : {}),
    updatedBy: by.uid,
    updatedByName: by.name,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const patientId = String(v.patientId || '');
  const clientName = await clientNameOf(db, patientId);
  const facts = factsOf(v);
  const bellText = `Supervisory visit${clientName ? ` for ${clientName}` : ''} on ${whenPhrase(facts)} needs a supervisor${opts.reason ? ` (${by.name} cannot make it: ${opts.reason})` : ''}. The first to accept takes it.`;
  const supervisors = (await loadSupervisors(db)).filter((p) => p.uid !== opts.exceptUid);
  let notified = 0;
  for (const p of supervisors) {
    try {
      await notifyPerson(db, p, 'offered', facts, {
        visitId, patientId, clientName, bellText, commEvent: 'visit-offered', loggedByUid: by.uid, loggedByName: by.name, sms: true,
      });
      notified += 1;
    } catch (err) {
      console.error(`Offer notice failed for ${p.uid} (continuing):`, err);
    }
  }
  return { ok: true, notified };
}

export interface AcceptResult {
  ok: boolean;
  message?: string;
}

/** Take an open supervisory visit. Transactional: the first supervisor to
 *  accept wins; everyone else sees "already taken". The other supervisors
 *  get a bell so the offer stops nagging them. */
export async function acceptOfferedVisit(visitId: string, caller: AuthedCaller): Promise<AcceptResult> {
  const db = adminDb();
  const ref = db.collection('patientVisits').doc(visitId);
  const name = caller.profile.displayName || caller.email || '';
  const credential = caller.profile.credential || '';
  const label = `${name}${credential ? `, ${credential}` : ''}`;
  const outcome = await db.runTransaction(async (tx): Promise<{ ok: true; data: FirebaseFirestore.DocumentData } | { ok: false; message: string }> => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) return { ok: false, message: 'Visit not found.' };
    const v = fresh.data() || {};
    if (v.type !== 'supervisory' || v.status !== 'scheduled') return { ok: false, message: 'This visit is no longer open.' };
    if (v.nurseId) return { ok: false, message: `${v.nurseName || 'Another supervisor'} already took this visit.` };
    if (v.offeredToAll !== true) return { ok: false, message: 'This visit was not offered to the supervisors.' };
    tx.update(ref, {
      nurseId: caller.uid,
      nurseName: label,
      offeredToAll: false,
      acceptedAt: FieldValue.serverTimestamp(),
      acceptedBy: caller.uid,
      acceptedByName: name,
      updatedBy: caller.uid,
      updatedByName: name,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, data: v };
  });
  if (!outcome.ok) return outcome;

  const v = outcome.data;
  const patientId = String(v.patientId || '');
  const clientName = await clientNameOf(db, patientId);
  const when = whenPhrase(factsOf(v));
  const bellText = `${name} accepted the supervisory visit${clientName ? ` for ${clientName}` : ''} on ${when}.`;
  const others = (await loadSupervisors(db)).filter((p) => p.uid !== caller.uid);
  for (const p of others) {
    await createPortalNotification(db, { userId: p.uid, kind: 'visit-accepted', text: bellText, href: `/admin/clients/${patientId}?tab=schedule` });
  }
  await recordCommunication({
    source: 'automated',
    event: 'visit-accepted',
    direction: 'outbound',
    patientId,
    patientName: clientName,
    staffUid: caller.uid,
    staffName: name,
    counterpartyName: '',
    summary: bellText,
    channels: others.map((p) => ({ channel: 'portal' as const, to: p.name, ok: true, body: bellText })),
    relatedVisitId: visitId,
    loggedByUid: caller.uid,
    loggedByName: name,
  });
  return { ok: true };
}

export interface ReleaseResult {
  ok: boolean;
  notified: number;
  message?: string;
}

/**
 * The assignee (or an admin) cannot make a visit: hand it to a named
 * supervisor, who is notified like any assignment, or release it to every
 * other supervisor as an open offer. The reason travels with the notice and
 * is stamped on the visit.
 */
export async function releaseVisit(
  visitId: string,
  caller: AuthedCaller,
  opts: { toUid: string; reason: string; todayISO: string },
): Promise<ReleaseResult> {
  const db = adminDb();
  const ref = db.collection('patientVisits').doc(visitId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, notified: 0, message: 'Visit not found.' };
  const v = snap.data() || {};
  const name = caller.profile.displayName || caller.email || '';
  if (v.type !== 'supervisory' || v.status !== 'scheduled') return { ok: false, notified: 0, message: 'Only a scheduled supervisory visit can be handed off.' };
  if (caller.role !== 'admin' && String(v.nurseId || '') !== caller.uid) {
    return { ok: false, notified: 0, message: 'Only the supervisor assigned to this visit (or an admin) can hand it off.' };
  }
  const reason = opts.reason.trim();
  if (!reason) return { ok: false, notified: 0, message: 'A reason is required.' };
  const fromName = String(v.nurseName || name);

  if (!opts.toUid) {
    const r = await offerVisitToSupervisors(visitId, { uid: caller.uid, name }, { exceptUid: String(v.nurseId || caller.uid), todayISO: opts.todayISO, reason });
    return { ok: r.ok, notified: r.notified, message: r.message };
  }

  const to = await loadPerson(db, opts.toUid);
  const toRole = (await db.collection('users').doc(opts.toUid).get()).data()?.role;
  if (!to || toRole !== 'supervisor') return { ok: false, notified: 0, message: 'Choose an active supervisor to hand the visit to.' };
  if (to.uid === String(v.nurseId || '')) return { ok: false, notified: 0, message: 'That supervisor already has this visit.' };
  const credential = String((await db.collection('users').doc(opts.toUid).get()).data()?.credential || '');
  await ref.update({
    nurseId: to.uid,
    nurseName: `${to.name}${credential ? `, ${credential}` : ''}`,
    offeredToAll: false,
    handedOffFrom: String(v.nurseId || ''),
    handedOffFromName: fromName,
    handedOffBy: caller.uid,
    handedOffAt: FieldValue.serverTimestamp(),
    releaseReason: reason,
    updatedBy: caller.uid,
    updatedByName: name,
    updatedAt: FieldValue.serverTimestamp(),
  });
  const patientId = String(v.patientId || '');
  const clientName = await clientNameOf(db, patientId);
  const facts = factsOf(v);
  const bellText = `Supervisory visit${clientName ? ` for ${clientName}` : ''} on ${whenPhrase(facts)} was handed to you by ${fromName}: ${reason}`;
  await notifyPerson(db, to, 'assigned', facts, {
    visitId, patientId, clientName, bellText, commEvent: 'visit-handoff', loggedByUid: caller.uid, loggedByName: name, sms: true,
  });
  return { ok: true, notified: 1 };
}

/**
 * The next supervisory visit, created by the portal 30 days after one was
 * filed and assigned to the supervisor who filed it. The visit doc is written
 * by the client (patientVisits.ts, staff rule); this sends her the bell and
 * email (no text: it is her own filing, once a month per client).
 */
export async function notifyAutoNextVisit(visitId: string, caller: AuthedCaller): Promise<{ ok: boolean }> {
  const db = adminDb();
  const snap = await db.collection('patientVisits').doc(visitId).get();
  if (!snap.exists) return { ok: false };
  const v = snap.data() || {};
  const to = await loadPerson(db, String(v.nurseId || ''));
  if (!to) return { ok: false };
  const patientId = String(v.patientId || '');
  const clientName = await clientNameOf(db, patientId);
  const facts = factsOf(v);
  const bellText = `Next supervisory visit${clientName ? ` for ${clientName}` : ''} scheduled for ${whenPhrase(facts)} and assigned to you. Move it or hand it off on the Schedule tab if needed.`;
  await notifyPerson(db, to, 'auto_next', facts, {
    visitId, patientId, clientName, bellText, commEvent: 'visit-auto-next', loggedByUid: caller.uid, loggedByName: to.name, sms: false,
  });
  return { ok: true };
}

/**
 * Daily (morning cron): for every started client, create an open supervisory
 * visit when the next one is due within 7 days, overdue, or there has never
 * been one and nothing is pending; re-offer open visits nobody accepted,
 * weekly. "Last visit" is the newest of: completed supervisory visits on the
 * schedule, filed supervisory visit notes, and documents filed under
 * "Supervisory Visit" (a paper form uploaded to Documents counts).
 */
export async function sweepSupervisoryVisits(todayISO: string): Promise<{ created: number; reoffered: number; notified: number }> {
  const db = adminDb();
  const [patients, visits, notes, docs] = await Promise.all([
    db.collection('patients').get(),
    db.collection('patientVisits').where('type', '==', 'supervisory').get(),
    db.collection('progressNotes').where('noteType', '==', SUPERVISORY_NOTE_TYPE).get(),
    db.collection('patientDocuments').where('category', '==', SUPERVISORY_DOC_CATEGORY).get(),
  ]);

  const visitsByPatient = new Map<string, Array<SchedVisitLite & { id: string }>>();
  const lastByPatient = new Map<string, string>();
  const bump = (pid: string, iso: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso > todayISO) return;
    if ((lastByPatient.get(pid) || '') < iso) lastByPatient.set(pid, iso);
  };
  for (const d of visits.docs) {
    const v = d.data();
    const pid = String(v.patientId || '');
    const list = visitsByPatient.get(pid) ?? [];
    list.push({ id: d.id, type: String(v.type || ''), status: String(v.status || ''), date: String(v.date || ''), nurseId: String(v.nurseId || ''), offeredToAll: v.offeredToAll === true, lastOfferedISO: String(v.lastOfferedISO || '') });
    visitsByPatient.set(pid, list);
    if (v.status === 'completed') bump(pid, String(v.date || ''));
  }
  for (const d of notes.docs) {
    const n = d.data();
    if (n.status === 'archived' || n.archivedAt) continue;
    bump(String(n.patientId || ''), normalizeDateISO(String(n.q6_dateofService || '')));
  }
  for (const d of docs.docs) {
    const x = d.data();
    if (x.archived === true) continue;
    bump(String(x.patientId || ''), String(x.docDate || ''));
  }

  let created = 0;
  let reoffered = 0;
  let notified = 0;
  const by = { uid: '', name: PORTAL_SOURCE };
  for (const p of patients.docs) {
    const x = p.data();
    const name = String(x.name || '');
    if (!name) continue;
    // The declared test client (TEST-ACCOUNT.md) never gets a real visit
    // offered to real supervisors.
    if (/^zz test/i.test(name)) continue;
    // Not started yet: nothing is due.
    if (typeof x.serviceStartedOn === 'string' && x.serviceStartedOn > todayISO) continue;
    try {
      const action = dailySupervisoryAction({ visits: visitsByPatient.get(p.id) ?? [], lastVisitISO: lastByPatient.get(p.id) || '', todayISO });
      if (action.kind === 'none') continue;
      if (action.kind === 'reoffer') {
        const r = await offerVisitToSupervisors(action.visit.id, by, { todayISO });
        if (r.ok) {
          reoffered += 1;
          notified += r.notified;
        }
        continue;
      }
      const ref = await db.collection('patientVisits').add({
        patientId: p.id,
        date: action.date,
        startTime: '',
        endTime: '',
        type: 'supervisory',
        nurseId: '',
        nurseName: '',
        notes: autoOfferVisitNote(action.stage, action.dueISO),
        status: 'scheduled',
        source: 'auto-offer',
        supervisoryStage: action.stage,
        supervisoryDueISO: action.dueISO,
        createdBy: '',
        createdByName: PORTAL_SOURCE,
        createdAt: FieldValue.serverTimestamp(),
      });
      const r = await offerVisitToSupervisors(ref.id, by, { todayISO });
      created += 1;
      notified += r.notified;
      console.log(`Supervisory sweep: offered visit for client ${p.id} (${supervisoryStageLabel(action.stage, action.dueISO)}).`);
    } catch (err) {
      console.error(`Supervisory sweep failed for client ${p.id} (continuing):`, err);
    }
  }
  return { created, reoffered, notified };
}
