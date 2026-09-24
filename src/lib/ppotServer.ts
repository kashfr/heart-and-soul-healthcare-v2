import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';
import { getServerSettings } from './settingsServer';
import { createPortalNotification } from './notificationsServer';
import { getReferral, listReferrals, logReferralActivity } from './referrals';
import { sendOutboundFax, type SendFaxResult } from './faxCenterServer';
import { agencyTodayISO } from './verbalOrderServer';
import { normalizeUSFaxNumber } from './verbalOrderShared';
import { formatDateUS } from './dateFormat';
import { canUseFax } from './faxShared';
import {
  cleanMedicaidId,
  defaultPpotNote,
  latestAuthEnd,
  ppotSubjectFromReferral,
  PPOT_REQUEST_LABEL,
  recertStatus,
  type PpotSendInput,
  type PpotSubject,
  type PpotSubjectKind,
} from './ppotShared';

/**
 * PPOT (GAPP Appendix T) requests, server side.
 *
 *   ppotRequests/{kind_id}          latest request per member (drives "requested this cycle")
 *   ppotRecertReminders/{pid_end}   one reminder per client per authorization end date
 *
 * A request is a Fax Center send (outboundFaxes, kind 'ppot') of the blank
 * public/forms/gapp-appendix-t.pdf behind a cover sheet naming the member.
 * The form itself is never filled in (GAPP manual 913.3).
 */

const REQUESTS = 'ppotRequests';
const REMINDERS = 'ppotRecertReminders';
const APPENDIX_T_PATH = path.join(process.cwd(), 'public', 'forms', 'gapp-appendix-t.pdf');
const CLOSED_REFERRAL_STAGES = new Set(['closed', 'referred_out']);

function requestKey(kind: PpotSubjectKind, id: string): string {
  return `${kind}_${id}`;
}

/** A client as a PPOT subject: directory doc + clinical profile + the
 *  latest authorization end across Letter of Notification and Therap lines. */
async function clientSubjects(ids?: string[]): Promise<PpotSubject[]> {
  const db = adminDb();
  const patientDocs = ids
    ? (await db.getAll(...ids.map((id) => db.collection('patients').doc(id)))).filter((d) => d.exists)
    : (await db.collection('patients').get()).docs;
  if (patientDocs.length === 0) return [];
  const clinical = await db.getAll(...patientDocs.map((d) => d.ref.collection('clinical').doc('profile')));
  const authSnap = ids
    ? await db.collection('hoursAuthorizations').where('patientId', 'in', ids.slice(0, 30)).get()
    : await db.collection('hoursAuthorizations').get();
  const authByPatient = new Map<string, Array<{ to?: string }>>();
  for (const a of authSnap.docs) {
    const d = a.data();
    const pid = String(d.patientId || '');
    if (!authByPatient.has(pid)) authByPatient.set(pid, []);
    authByPatient.get(pid)!.push({ to: String(d.to || '') });
  }
  return patientDocs.map((d, i) => {
    const p = d.data() || {};
    const c = clinical[i]?.data() || {};
    const therap = Array.isArray(p.authorizations) ? (p.authorizations as Array<{ to?: string }>) : [];
    return {
      kind: 'client' as const,
      id: d.id,
      name: String(p.name || ''),
      dob: formatDateUS(String(p.dob || '')),
      medicaidId: cleanMedicaidId(String(c.medicaidId || '')),
      physicianName: String(c.physicianName || ''),
      physicianOffice: '',
      physicianFax: normalizeUSFaxNumber(String(c.physicianFax || '')),
      context: String(p.program || ''),
      authEnd: latestAuthEnd([...(authByPatient.get(d.id) || []), ...therap]),
    };
  });
}

export async function loadPpotSubject(kind: PpotSubjectKind, id: string): Promise<PpotSubject | null> {
  if (kind === 'referral') {
    const r = await getReferral(id);
    return r ? ppotSubjectFromReferral(r) : null;
  }
  const [s] = await clientSubjects([id]);
  return s ?? null;
}

export interface PpotLastRequest {
  sentAt: string | null;
  date: string; // YYYY-MM-DD (agency time)
  requestType: 'new' | 'recert';
  faxId: string;
  byName: string;
}

async function lastRequests(): Promise<Map<string, PpotLastRequest>> {
  const snap = await adminDb().collection(REQUESTS).get();
  const out = new Map<string, PpotLastRequest>();
  for (const d of snap.docs) {
    const x = d.data();
    const t = x.sentAt as { toDate?: () => Date } | undefined;
    out.set(d.id, {
      sentAt: t?.toDate ? t.toDate().toISOString() : null,
      date: String(x.date || ''),
      requestType: x.requestType === 'recert' ? 'recert' : 'new',
      faxId: String(x.faxId || ''),
      byName: String(x.byName || ''),
    });
  }
  return out;
}

export interface PpotSubjectRow extends PpotSubject {
  lastRequest: PpotLastRequest | null;
  /** Clients on GAPP only. */
  recert: { due: boolean; daysLeft: number | null; requestedThisCycle: boolean } | null;
}

/** Everyone a PPOT can be requested for: open referrals and all clients. */
export async function listPpotSubjects(): Promise<{ subjects: PpotSubjectRow[]; recertLeadDays: number }> {
  const [settings, referrals, clients, last] = await Promise.all([
    getServerSettings(),
    listReferrals(),
    clientSubjects(),
    lastRequests(),
  ]);
  const today = agencyTodayISO();
  const lead = settings.fax.recertLeadDays;
  const rows: PpotSubjectRow[] = [];
  for (const r of referrals) {
    if (CLOSED_REFERRAL_STAGES.has(r.stage)) continue;
    const s = ppotSubjectFromReferral(r);
    rows.push({ ...s, lastRequest: last.get(requestKey('referral', r.id)) ?? null, recert: null });
  }
  for (const c of clients) {
    const lr = last.get(requestKey('client', c.id)) ?? null;
    const recert = c.context === 'gapp' ? recertStatus({ today, authEnd: c.authEnd, leadDays: lead, lastRequestDate: lr?.date || '' }) : null;
    rows.push({ ...c, lastRequest: lr, recert });
  }
  return { subjects: rows, recertLeadDays: lead };
}

/**
 * Fax the physician a PPOT request. The member's identity is read fresh from
 * the record (never trusted from the browser); only the Medicaid ID may be
 * supplied by the sender, for a record that doesn't have one yet.
 */
export async function sendPpotRequest(input: PpotSendInput, caller: AuthedCaller): Promise<SendFaxResult> {
  const subject = await loadPpotSubject(input.subjectKind, input.subjectId);
  if (!subject) return { ok: false, status: 404, error: 'That referral or client was not found.' };
  const medicaidId = subject.medicaidId || cleanMedicaidId(input.medicaidId);
  // The member block on the cover carries DOB and Medicaid ID; this line is
  // what the outbox lists and searches.
  const regarding = `Appendix T, ${PPOT_REQUEST_LABEL[input.requestType].toLowerCase()}: ${subject.name}`;
  const pdf = await readFile(APPENDIX_T_PATH);
  const fileName = `Appendix_T_${subject.name.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40) || 'member'}.pdf`;

  const result = await sendOutboundFax({
    input: {
      recipientName: input.recipientName,
      recipientOrg: input.recipientOrg,
      toNumber: input.toNumber,
      confirmNumber: input.confirmNumber,
      regarding,
      note: input.note.trim() || defaultPpotNote(input.requestType, !!medicaidId),
      includeCover: true,
    },
    pdf,
    fileName,
    caller,
    ppot: {
      requestType: input.requestType,
      subjectKind: subject.kind,
      subjectId: subject.id,
      memberName: subject.name,
      dob: subject.dob,
      medicaidId,
    },
  });
  if (!result.fax) return result;

  // Record the request even when SRFax refused it: the outbox row (with its
  // Resend button) is the thing to follow up, and the cycle is started.
  const byName = caller.profile.displayName || caller.email || '';
  const toNumber = normalizeUSFaxNumber(input.toNumber);
  const db = adminDb();
  await db.collection(REQUESTS).doc(requestKey(subject.kind, subject.id)).set({
    subjectKind: subject.kind,
    subjectId: subject.id,
    memberName: subject.name,
    requestType: input.requestType,
    faxId: result.fax.id,
    date: agencyTodayISO(),
    sentAt: FieldValue.serverTimestamp(),
    byUid: caller.uid,
    byName,
  });

  // Save what we learned back to the record so the next request fills itself.
  try {
    if (subject.kind === 'client') {
      const patch: Record<string, unknown> = { physicianFax: toNumber, updatedAt: FieldValue.serverTimestamp() };
      if (!subject.physicianName) patch.physicianName = input.recipientName.trim();
      if (!subject.medicaidId && medicaidId) patch.medicaidId = medicaidId;
      await db.collection('patients').doc(subject.id).collection('clinical').doc('profile').set(patch, { merge: true });
    } else {
      await logReferralActivity(subject.id, {
        type: 'contact',
        text: `Plan of treatment (Appendix T) request faxed to ${input.recipientName.trim()}${input.recipientOrg.trim() ? `, ${input.recipientOrg.trim()}` : ''} at ${toNumber.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')}${result.ok ? '' : ' (the fax failed; resend it from the Fax Center)'}`,
        byUid: caller.uid,
        byName,
        byRole: caller.role,
      });
    }
  } catch (err) {
    console.error('PPOT request: save-back failed (non-fatal):', err);
  }
  return result;
}

/** Everyone who should hear about recertifications: Fax Center users. */
async function faxRecipientUids(): Promise<string[]> {
  const settings = await getServerSettings();
  if (!settings.fax.enabled) return [];
  const snap = await adminDb().collection('users').where('role', 'in', ['admin', 'supervisor', 'va']).get();
  return snap.docs
    .filter((d) => (d.data() as { active?: boolean }).active !== false)
    .filter((d) => canUseFax(settings.fax, d.id, (d.data() as { role?: 'admin' | 'supervisor' | 'va' }).role))
    .map((d) => d.id);
}

/**
 * Recertification sweep (runs with the 10-minute verbal-order cron; the
 * create() guard makes it once per client per authorization end date).
 * A GAPP client inside the lead window with no PPOT request this cycle rings
 * the bell of everyone with Fax Center access.
 */
export async function runPpotRecertSweep(): Promise<{ reminded: number; errors: string[] }> {
  const settings = await getServerSettings();
  if (!settings.fax.enabled) return { reminded: 0, errors: [] };
  const today = agencyTodayISO();
  const [clients, last] = await Promise.all([clientSubjects(), lastRequests()]);
  const db = adminDb();
  let reminded = 0;
  const errors: string[] = [];
  let recipients: string[] | null = null;
  for (const c of clients) {
    if (c.context !== 'gapp' || !c.authEnd) continue;
    const lr = last.get(requestKey('client', c.id));
    const st = recertStatus({ today, authEnd: c.authEnd, leadDays: settings.fax.recertLeadDays, lastRequestDate: lr?.date || '' });
    if (!st.due) continue;
    try {
      await db.collection(REMINDERS).doc(`${c.id}_${c.authEnd}`).create({ patientId: c.id, authEnd: c.authEnd, remindedAt: FieldValue.serverTimestamp() });
    } catch {
      continue; // already reminded for this authorization period
    }
    try {
      recipients ??= await faxRecipientUids();
      const when = st.daysLeft !== null && st.daysLeft >= 0 ? `ends in ${st.daysLeft} day${st.daysLeft === 1 ? '' : 's'}` : 'has ended';
      for (const uid of recipients) {
        await createPortalNotification(db, {
          userId: uid,
          kind: 'ppot-recert-due',
          text: `${c.name}'s GAPP authorization ${when} (${formatDateUS(c.authEnd)}). Request a new Appendix T from the physician in the Fax Center.`,
          href: `/admin/fax?ppot=client:${c.id}`,
        });
      }
      reminded++;
    } catch (err) {
      errors.push(`ppot recert ${c.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { reminded, errors };
}
