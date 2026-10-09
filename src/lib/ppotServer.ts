import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { FieldValue } from 'firebase-admin/firestore';
import { adminBucket, adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';
import { getServerSettings } from './settingsServer';
import { createPortalNotification } from './notificationsServer';
import { getReferral, listReferrals, logReferralActivity } from './referrals';
import { sendOutboundFax, type FaxSender, type SendFaxResult } from './faxCenterServer';
import { agencyTodayISO } from './verbalOrderServer';
import { PDFDocument } from 'pdf-lib';
import { candidateOrdersForInboundFax, formatUSFaxNumber, normalizeUSFaxNumber, type VerbalOrder } from './verbalOrderShared';
import { readInboundFaxBytes } from './inboundFaxPdf';
import { addReferralDocument } from './referralDocumentsServer';
import { formatDateUS, formatDateUSFile } from './dateFormat';
import { stampAppendixTIdentity } from './pdf/appendixTStamp';
import { ppotDueMilestone, ppotAge } from './ppotSchedule';
import { srfaxConfig } from './fax/srfax';
import { canUseFax } from './faxShared';
import { validateFileFaxToClient, type FileFaxToClientInput } from './docCategories';
import {
  cleanMedicaidId,
  defaultPpotNote,
  ppotCandidatesForInbound,
  latestAuthEnd,
  ppotSubjectFromReferral,
  PPOT_REQUEST_LABEL,
  ppotReminderNote,
  ppotRequestUrgency,
  recertStatus,
  shouldAdvanceOrderDate,
  type PpotOpenRequest,
  type PpotOrderLine,
  type PpotRequestType,
  type PpotSendInput,
  type PpotSubject,
  type PpotSubjectKind,
} from './ppotShared';

/**
 * PPOT (GAPP Appendix T) requests, server side.
 *
 *   ppotRequests/{kind_id}          latest request per member (drives "requested this cycle");
 *                                   reminderDate/escalatedAt mark the automatic follow-ups
 *   ppotRecertReminders/{pid_end}   one reminder per client per authorization end date
 *
 * A request is a Fax Center send (outboundFaxes, kind 'ppot') of the blank
 * public/forms/gapp-appendix-t.pdf behind a cover sheet naming the member.
 * The form goes out blank (GAPP manual 913.3), unless an admin turns on
 * Settings > Fax Center > "Print name and Medicaid ID on the Appendix T",
 * which prints only those two identity fields.
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
    // A cancelled request doesn't count: the member is back to "no request
    // this cycle", so recertification reminders resume.
    if (x.status === 'cancelled') continue;
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
  recert: { due: boolean; daysLeft: number | null; requestedThisCycle: boolean; dismissed: boolean } | null;
}

/** Reminder docs someone dismissed ("not needed this cycle"), by `${pid}_${authEnd}`. */
async function dismissedRecerts(): Promise<Set<string>> {
  const snap = await adminDb().collection(REMINDERS).where('dismissed', '==', true).get();
  return new Set(snap.docs.map((d) => d.id));
}

/** Everyone a PPOT can be requested for: open referrals and all clients. */
export async function listPpotSubjects(): Promise<{ subjects: PpotSubjectRow[]; recertLeadDays: number }> {
  const [settings, referrals, clients, last, dismissed] = await Promise.all([
    getServerSettings(),
    listReferrals(),
    clientSubjects(),
    lastRequests(),
    dismissedRecerts(),
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
    let recert: PpotSubjectRow['recert'] = null;
    if (c.context === 'gapp') {
      const st = recertStatus({ today, authEnd: c.authEnd, leadDays: lead, lastRequestDate: lr?.date || '' });
      const isDismissed = dismissed.has(`${c.id}_${c.authEnd}`);
      recert = { ...st, due: st.due && !isDismissed, dismissed: isDismissed };
    }
    rows.push({ ...c, lastRequest: lr, recert });
  }
  return { subjects: rows, recertLeadDays: lead };
}

/**
 * The form that goes out. Blank by default. With the Settings opt-in, only
 * the identity line (name, Medicaid ID) is printed; the physician completes
 * everything else.
 */
async function appendixTForFax(memberName: string, medicaidId: string): Promise<{ pdf: Buffer; fileName: string }> {
  const blank = await readFile(APPENDIX_T_PATH);
  const settings = await getServerSettings();
  const pdf = settings.fax.ppotPrefillIdentity ? await stampAppendixTIdentity(blank, { name: memberName, medicaidId }) : blank;
  const fileName = `Appendix_T_${memberName.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40) || 'member'}.pdf`;
  return { pdf, fileName };
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
  const { pdf, fileName } = await appendixTForFax(subject.name, medicaidId);

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
    // Where it went, so a returned fax from the same number is suggested as
    // the signed copy (see ppotCandidatesForInbound).
    toNumber,
    recipientName: input.recipientName.trim(),
    // 'sent' until the signed form is filed; a new request starts over.
    status: 'sent',
    received: null,
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
export async function faxRecipientUids(): Promise<string[]> {
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

/** Follow up at configured PPOT milestones and notify staff at escalation.
 * Legacy installations inherit Verbal Orders thresholds until PPOT settings are saved.
 * Manual and scheduled sends share a transactional duplicate-send guard.
 */
export async function runPpotReminderSweep(
  thresholds: { overdueDays: number; escalateDays: number },
  canFax: boolean,
): Promise<{ refaxed: number; escalated: number; errors: string[] }> {
  const out = { refaxed: 0, escalated: 0, errors: [] as string[] };
  const settings = await getServerSettings();
  if (!settings.fax.enabled) return out;
  const db = adminDb();
  const today = agencyTodayISO();
  const snap = await db.collection(REQUESTS).where('status', '==', 'sent').get();
  const schedule = settings.fax.ppotFollowupDays ?? [settings.fax.ppotOverdueDays ?? thresholds.overdueDays];
  let recipients: string[] | null = null;
  const ring = async (text: string) => {
    recipients ??= await faxRecipientUids();
    for (const uid of recipients) await createPortalNotification(db, { userId: uid, kind: 'ppot-overdue', text, href: '/admin/fax' });
  };
  for (const d of snap.docs) {
    const x = d.data();
    const urgency = ppotRequestUrgency(String(x.date || ''), today, { overdueDays: settings.fax.ppotOverdueDays ?? thresholds.overdueDays, escalateDays: settings.fax.ppotEscalateDays ?? thresholds.escalateDays });
    const due = ppotDueMilestone(String(x.date || ''), today, schedule, x);
    if (due === null && urgency !== 'escalated') continue;
    const memberName = String(x.memberName || 'a member');
    const sentUS = formatDateUS(String(x.date || ''));
    try {
      if (due !== null && canFax) {
        const result = await sendPpotFollowup(d.id, undefined, true);
        if (result.ok) {
          await ring(`The Appendix T request for ${memberName} (sent ${sentUS}) is still outstanding. A follow-up fax was submitted to ${x.recipientName || 'the physician'}. Check Sent Faxes for delivery.`);
          out.refaxed++;
        } else if (result.status !== 409) {
          out.errors.push(`ppot reminder ${d.id}: ${result.error}`);
          await ring(`The automatic Appendix T follow-up for ${memberName} could not be submitted. Check Sent Faxes before trying again.`);
        }
      }
      if (urgency === 'escalated' && !x.escalatedAt) {
        await d.ref.update({ escalatedAt: FieldValue.serverTimestamp() });
        await ring(`The Appendix T for ${memberName} is still not back ${daysSinceText(String(x.date || ''), today)} after it was requested. Please call ${x.recipientName || 'the physician'}'s office.`);
        out.escalated++;
      }
    } catch (err) {
      out.errors.push(`ppot reminder ${d.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}

function daysSinceText(fromYmd: string, today: string): string {
  const n = Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86_400_000));
  return `${n} day${n === 1 ? '' : 's'}`;
}

/** One follow-up attempt per calendar day, shared by staff and scheduled sends.
 * Persist the claim before the provider call: an unknown outcome must not cause duplicate faxes.
 */
export async function sendPpotFollowup(key: string, caller?: AuthedCaller, automatic = false): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!srfaxConfig()) return { ok: false, status: 503, error: 'Fax sending is unavailable on this server.' };
  const settings = await getServerSettings();
  if (!settings.fax.enabled) return { ok: false, status: 403, error: 'Fax Center is disabled.' };
  const db = adminDb();
  const ref = db.collection(REQUESTS).doc(key);
  const today = agencyTodayISO();
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const req = snap.data();
    if (!req || req.status !== 'sent') return null;
    if (req.followupPending || req.followupAttemptDate === today || req.reminderDate === today) return null;
    const schedule = settings.fax.ppotFollowupDays ?? [settings.fax.ppotOverdueDays ?? 14];
    const due = ppotDueMilestone(String(req.date || ''), today, schedule, req);
    if (automatic && due === null) return null;
    tx.update(ref, { followupPending: true, followupAttemptDate: today, followupCoveredThroughDay: Math.max(0, ppotAge(String(req.date || ''), today)), ...(automatic ? { reminderSentAt: FieldValue.serverTimestamp(), followupMilestoneDay: due } : {}) });
    return req;
  });
  if (!claimed) return { ok: false, status: 409, error: 'This request is no longer waiting, or a follow-up was already attempted today or is still being processed. Check Sent Faxes before sending again.' };
  try {
    const result = await refaxPpotRequest(claimed, caller);
    await ref.update({ followupPending: false, followupError: result.ok ? '' : (result.error || 'Fax could not be submitted.'),
      ...(result.fax ? { followupFaxId: result.fax.id } : {}),
      ...(result.ok ? { followupDate: today, followupCount: FieldValue.increment(1), followupByName: caller?.profile.displayName || caller?.email || 'Portal (scheduled follow-up)', ...(automatic ? { reminderDate: today, reminderFaxId: result.fax?.id || '' } : {}) } : {}),
    });
    return result.ok ? { ok: true } : { ok: false, status: result.status || 502, error: `${result.error || 'Fax could not be submitted.'} Check Sent Faxes; failed faxes can be retried there.` };
  } catch (err) {
    // Leave the claim held when the provider outcome is unknown. Do not resend blindly.
    console.error('PPOT follow-up outcome unknown:', err);
    return { ok: false, status: 502, error: 'The follow-up outcome could not be confirmed. Check Sent Faxes before any further attempt; this request is locked to prevent duplicates.' };
  }
}

async function refaxPpotRequest(req: FirebaseFirestore.DocumentData, caller?: AuthedCaller): Promise<SendFaxResult> {
  const kind: PpotSubjectKind = req.subjectKind === 'client' ? 'client' : 'referral';
  const subject = await loadPpotSubject(kind, String(req.subjectId || ''));
  if (!subject) return { ok: false, status: 404, error: 'The referral or client was not found.' };
  const firstFax = req.faxId ? await adminDb().collection('outboundFaxes').doc(String(req.faxId)).get() : null;
  const first = firstFax?.data() || {};
  const firstPpot = (first.ppot || {}) as { medicaidId?: string };
  const medicaidId = subject.medicaidId || cleanMedicaidId(String(firstPpot.medicaidId || ''));
  const requestType: PpotRequestType = req.requestType === 'recert' ? 'recert' : 'new';
  const { pdf, fileName } = await appendixTForFax(subject.name, medicaidId);
  const toNumber = String(req.toNumber || '');
  const sender: FaxSender = caller || { uid: String(req.byUid || ''), email: null, profile: { displayName: String(req.byName || 'Heart and Soul Healthcare') } };
  const result = await sendOutboundFax({
    input: {
      recipientName: String(req.recipientName || first.recipientName || 'Physician'),
      recipientOrg: String(first.recipientOrg || ''),
      toNumber,
      confirmNumber: toNumber,
      regarding: `Follow-up request, Appendix T, ${PPOT_REQUEST_LABEL[requestType].toLowerCase()}: ${subject.name}`,
      note: ppotReminderNote(requestType, formatDateUS(String(req.date || '')), !!medicaidId),
      includeCover: true,
    },
    pdf,
    fileName,
    caller: sender,
    ppot: { requestType, subjectKind: subject.kind, subjectId: subject.id, memberName: subject.name, dob: subject.dob, medicaidId },
  });
  // A fax that SRFax refused still has an outbox row (with Resend).
  return result;
}

// ---------------------------------------------------------------------------
// Order dates on the care plan and MAR
// ---------------------------------------------------------------------------

/**
 * A client's active care-plan tasks and MAR medications, for the filing
 * dialog's "update the Appendix T date on" checklist. The Appendix T is the
 * physician order behind a GAPP member's treatments and meds, so a signed one
 * renews their signed-order date; staff untick anything the form left off.
 */
export async function listPpotOrderLines(requestKey: string): Promise<PpotOrderLine[] | null> {
  const req = await adminDb().collection(REQUESTS).doc(requestKey).get();
  if (!req.exists) return null;
  if (req.data()?.subjectKind !== 'client') return [];
  return activeOrderLines(String(req.data()?.subjectId || ''));
}

async function activeOrderLines(patientId: string): Promise<PpotOrderLine[]> {
  if (!patientId) return [];
  const db = adminDb();
  const [tasks, meds] = await Promise.all([
    db.collection('careTasks').where('patientId', '==', patientId).get(),
    db.collection('marOrders').where('patientId', '==', patientId).get(),
  ]);
  const lines: PpotOrderLine[] = [];
  for (const d of tasks.docs) {
    const x = d.data();
    if (x.status !== 'active') continue;
    lines.push({ id: d.id, kind: 'task', name: String(x.name || 'Treatment'), orderSignedDate: String(x.orderSignedDate || '') });
  }
  for (const d of meds.docs) {
    const x = d.data();
    if (x.status !== 'active') continue;
    const dose = [x.dose, x.units].filter(Boolean).join(' ');
    lines.push({ id: d.id, kind: 'med', name: [x.medName || 'Medication', dose].filter(Boolean).join(' '), orderSignedDate: String(x.orderSignedDate || x.startDate || '') });
  }
  const order = (l: PpotOrderLine) => (l.kind === 'task' ? 0 : 1);
  return lines.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
}

/**
 * Move the signed-order date forward on the chosen lines. Only lines that are
 * this client's and still active are touched (ids from the browser are never
 * trusted), and never backward. RN approval is kept: what the task or med
 * says hasn't changed, only the date of the order behind it (the same as the
 * signed verbal-order filing does on the MAR).
 */
async function advanceOrderDates(patientId: string, lineIds: string[], signedDate: string, by: { uid: string; name: string }): Promise<number> {
  const wanted = new Set(lineIds);
  const lines = (await activeOrderLines(patientId)).filter((l) => wanted.has(`${l.kind}:${l.id}`) && shouldAdvanceOrderDate(l.orderSignedDate, signedDate));
  if (lines.length === 0) return 0;
  const db = adminDb();
  const batch = db.batch();
  for (const l of lines) {
    batch.update(db.collection(l.kind === 'task' ? 'careTasks' : 'marOrders').doc(l.id), {
      orderSignedDate: signedDate,
      lastEditedAt: FieldValue.serverTimestamp(),
      lastEditedBy: by.uid,
      lastEditedByName: `${by.name} (signed Appendix T filed)`,
    });
  }
  await batch.commit();
  return lines.length;
}

// ---------------------------------------------------------------------------
// Signed PPOT coming back
// ---------------------------------------------------------------------------

const INBOUND = 'verbalOrderInbound'; // the portal fax line's inbox (shared with verbal orders)
const OPEN_INBOUND = ['unmatched', 'suggested'];

/** Requests still waiting on the signed form. */
export async function listOpenPpotRequests(): Promise<PpotOpenRequest[]> {
  const snap = await adminDb().collection(REQUESTS).where('status', '==', 'sent').get();
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      key: d.id,
      subjectKind: x.subjectKind === 'client' ? 'client' : 'referral',
      subjectId: String(x.subjectId || ''),
      memberName: String(x.memberName || ''),
      requestType: x.requestType === 'recert' ? 'recert' : 'new',
      recipientName: String(x.recipientName || ''),
      toNumber: String(x.toNumber || ''),
      date: String(x.date || ''),
      remindedDate: String(x.reminderDate || ''),
      followupDate: String(x.followupDate || x.reminderDate || ''),
      followupAttemptDate: String(x.followupAttemptDate || ''),
      followupPending: x.followupPending === true,
      followupError: String(x.followupError || ''),
    };
  });
}

export interface IncomingFax {
  id: string; // SRFax FaxDetailsID
  callerId: string;
  remoteId: string;
  pages: number;
  receivedAt: string;
  /** Open PPOT requests sent to the number this fax came from. */
  ppotCandidateKeys: string[];
  /** Open verbal orders the sweep tied to it (it may be one of those instead). */
  verbalOrderCandidates: number;
}

/** Unfiled faxes on the portal line, newest first. */
export async function listIncomingFaxes(): Promise<IncomingFax[]> {
  const snap = await adminDb().collection(INBOUND).where('status', 'in', OPEN_INBOUND).orderBy('epochTime', 'desc').limit(50).get();
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      callerId: String(x.callerId || ''),
      remoteId: String(x.remoteId || ''),
      pages: Number(x.pages || 0),
      receivedAt: String(x.receivedAt || ''),
      ppotCandidateKeys: Array.isArray(x.ppotCandidateKeys) ? (x.ppotCandidateKeys as string[]) : [],
      verbalOrderCandidates: Array.isArray(x.candidateOrderIds) ? (x.candidateOrderIds as string[]).length : 0,
      source: x.source === 'upload' ? 'upload' : 'line',
      note: String(x.note || ''),
    };
  });
}

/**
 * Record a fax that did not arrive on the portal line (it came to another
 * fax number, or on paper) so it can be filed like any other: the PDF is
 * stored, the sender is matched against open PPOT requests and verbal
 * orders, and it joins Incoming Faxes.
 */
export async function addUploadedInboundFax(p: {
  pdf: Buffer;
  fromNumber: string;
  receivedDate: string; // YYYY-MM-DD
  note: string;
  caller: AuthedCaller;
}): Promise<{ ok: boolean; status?: number; error?: string; id?: string; pages?: number; suggested?: string[] }> {
  if (p.pdf.subarray(0, 5).toString() !== '%PDF-') return { ok: false, status: 400, error: 'The file must be a PDF.' };
  let pages = 0;
  try {
    pages = (await PDFDocument.load(p.pdf)).getPageCount();
  } catch {
    return { ok: false, status: 400, error: 'That PDF could not be read. Try saving or printing it to a new PDF.' };
  }
  const from = normalizeUSFaxNumber(p.fromNumber);
  const db = adminDb();
  const [openPpot, ordersSnap] = await Promise.all([
    listOpenPpotRequests().catch(() => []),
    db.collection('verbalOrders').where('status', 'in', ['taken', 'faxed']).get(),
  ]);
  const openOrders: Pick<VerbalOrder, 'id' | 'physicianFax' | 'status'>[] = ordersSnap.docs.map((d) => ({ id: d.id, physicianFax: String(d.data().physicianFax || ''), status: d.data().status === 'faxed' ? 'faxed' : 'taken' }));
  const ppotCandidateKeys = from ? ppotCandidatesForInbound([from], openPpot) : [];
  const candidates = from ? candidateOrdersForInboundFax([from], openOrders) : [];
  const ref = db.collection(INBOUND).doc(`up_${db.collection(INBOUND).doc().id}`);
  const storagePath = `faxes/inbound-uploads/${ref.id}/fax.pdf`;
  await adminBucket().file(storagePath).save(p.pdf, { contentType: 'application/pdf', resumable: false });
  const when = new Date(`${p.receivedDate}T12:00:00-04:00`);
  await ref.set({
    source: 'upload',
    // The verbal-order flows key a fax by the "|id" suffix of its file name.
    fileName: `upload|${ref.id}`,
    storagePath,
    callerId: '',
    remoteId: from,
    pages,
    receivedAt: formatDateUS(p.receivedDate),
    epochTime: Math.floor(when.getTime() / 1000),
    note: p.note.trim().slice(0, 300),
    status: candidates.length > 0 || ppotCandidateKeys.length > 0 ? 'suggested' : 'unmatched',
    candidateOrderIds: candidates,
    ppotCandidateKeys,
    matchedOrderId: '',
    addedBy: p.caller.uid,
    addedByName: p.caller.profile.displayName || p.caller.email || '',
    firstSeenAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, id: ref.id, pages, suggested: openPpot.filter((r) => ppotCandidateKeys.includes(r.key)).map((r) => r.memberName) };
}

/**
 * File an inbound fax against a referral that has no client record yet.
 * The copy stays with the referral (referralDocuments) and moves into the
 * client's Documents when the record is created.
 */
export async function fileInboundFaxToReferral(p: { faxId: string; referralId: string; category: string; title: string; docDate: string; caller: AuthedCaller }): Promise<{ ok: boolean; status?: number; error?: string; documentId?: string }> {
  const invalid = validateFileFaxToClient({ ...p, patientId: p.referralId }, agencyTodayISO());
  const firstError = Object.values(invalid)[0];
  if (firstError) return { ok: false, status: 400, error: firstError };
  const referral = await getReferral(p.referralId);
  if (!referral) return { ok: false, status: 404, error: 'That referral was not found.' };

  const db = adminDb();
  const inboundRef = db.collection(INBOUND).doc(p.faxId);
  const byName = p.caller.profile.displayName || p.caller.email || '';
  const claim = await db.runTransaction(async (tx) => {
    const inb = await tx.get(inboundRef);
    if (!inb.exists || !OPEN_INBOUND.includes(String(inb.data()?.status || ''))) return { error: 'That fax has already been filed or dismissed.', status: 409 };
    tx.update(inboundRef, { status: 'filing', filingBy: p.caller.uid, filingAt: FieldValue.serverTimestamp() });
    return { fileName: String(inb.data()?.fileName || ''), storagePath: String(inb.data()?.storagePath || ''), prevStatus: String(inb.data()?.status || 'unmatched') };
  });
  if ('error' in claim) return { ok: false, status: claim.status, error: claim.error };
  const release = () => inboundRef.update({ status: claim.prevStatus, filingBy: FieldValue.delete(), filingAt: FieldValue.delete() }).catch(() => undefined);
  const got = await readInboundFaxBytes(claim, true);
  if (!got.ok || !got.pdf) {
    await release();
    return { ok: false, status: 502, error: got.error || 'Could not download the fax.' };
  }
  const title = p.title.trim();
  const safe = title.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'Fax';
  let documentId = '';
  try {
    documentId = await addReferralDocument({
      referralId: p.referralId,
      pdf: got.pdf,
      category: p.category,
      title,
      fileName: `${safe}_${formatDateUSFile(p.docDate)}.pdf`,
      docDate: p.docDate,
      by: { uid: p.caller.uid, name: byName, role: p.caller.role },
      inboundFaxId: p.faxId,
    });
  } catch (err) {
    await release();
    console.error('Fax filing to referral failed:', err);
    return { ok: false, status: 500, error: 'Could not save the fax to the referral. Please try again.' };
  }
  await inboundRef.update({ status: 'filed', filedReferralId: p.referralId, filedDocumentId: documentId, filedAt: FieldValue.serverTimestamp(), filedBy: p.caller.uid, filedByName: byName });
  try {
    await logReferralActivity(p.referralId, {
      type: 'contact',
      text: `Fax filed to this referral: "${title}" (${p.category}). It moves to the client's Documents when the client record is created.`,
      byUid: p.caller.uid,
      byName,
      byRole: p.caller.role,
    });
  } catch (err) {
    console.error('Fax filing to referral: activity failed (non-fatal):', err);
  }
  return { ok: true, documentId };
}

/** Download an unfiled inbound fax for preview (stays unread in SRFax). */
export async function readIncomingFaxPdf(faxId: string): Promise<{ ok: boolean; pdf?: Buffer; error?: string; status?: number }> {
  const snap = await adminDb().collection(INBOUND).doc(faxId).get();
  const d = snap.data() || {};
  if (!snap.exists || (!d.fileName && !d.storagePath)) return { ok: false, status: 404, error: 'Fax not found.' };
  const got = await readInboundFaxBytes(d, false);
  if (!got.ok || !got.pdf) return { ok: false, status: 502, error: got.error || 'Could not download the fax.' };
  return { ok: true, pdf: got.pdf };
}

export interface FilePpotResult {
  ok: boolean;
  status?: number;
  error?: string;
  documentId?: string;
  /** Care-plan tasks and MAR meds whose signed-order date moved forward. */
  ordersUpdated?: number;
}

/**
 * File an inbound fax as the signed PPOT for an open request. A client's copy
 * goes under Documents (ISP / Plan of Treatment); a referral has no record
 * yet, so its copy is kept with the request and noted on the referral's
 * timeline. The inbound fax is claimed in a transaction first, so two people
 * matching it at once can't both file it.
 */
export async function fileSignedPpot(p: {
  faxId: string;
  requestKey: string;
  signedDate: string;
  caller: AuthedCaller;
  /** Order lines (see listPpotOrderLines) to date with signedDate. Client requests only. */
  orderLineIds?: string[];
}): Promise<FilePpotResult> {
  const db = adminDb();
  const inboundRef = db.collection(INBOUND).doc(p.faxId);
  const requestRef = db.collection(REQUESTS).doc(p.requestKey);
  const byName = p.caller.profile.displayName || p.caller.email || '';

  const claim = await db.runTransaction(async (tx) => {
    const [inb, req] = await Promise.all([tx.get(inboundRef), tx.get(requestRef)]);
    if (!inb.exists || !OPEN_INBOUND.includes(String(inb.data()?.status || ''))) return { error: 'That fax has already been filed or dismissed.', status: 409 };
    if (!req.exists) return { error: 'That PPOT request was not found.', status: 404 };
    if (req.data()?.status !== 'sent') return { error: 'That PPOT request already has a signed copy on file.', status: 409 };
    tx.update(inboundRef, { status: 'filing', filingBy: p.caller.uid, filingAt: FieldValue.serverTimestamp() });
    return { fileName: String(inb.data()?.fileName || ''), storagePath: String(inb.data()?.storagePath || ''), prevStatus: String(inb.data()?.status || 'unmatched'), request: req.data() || {} };
  });
  if ('error' in claim) return { ok: false, status: claim.status, error: claim.error };

  const release = () => inboundRef.update({ status: claim.prevStatus, filingBy: FieldValue.delete(), filingAt: FieldValue.delete() }).catch(() => undefined);
  const got = await readInboundFaxBytes(claim, true);
  if (!got.ok || !got.pdf) {
    await release();
    return { ok: false, status: 502, error: got.error || 'Could not download the fax from SRFax.' };
  }

  const req = claim.request;
  const kind: PpotSubjectKind = req.subjectKind === 'client' ? 'client' : 'referral';
  const subjectId = String(req.subjectId || '');
  const memberName = String(req.memberName || '');
  const typeLabel = req.requestType === 'recert' ? 'recertification' : 'new case';
  const fileName = `Appendix_T_Signed_${formatDateUSFile(p.signedDate)}.pdf`;
  let documentId = '';
  let storagePath = '';
  try {
    if (kind === 'client') {
      const docRef = db.collection('patientDocuments').doc();
      documentId = docRef.id;
      storagePath = `patients/${subjectId}/documents/${docRef.id}/${fileName}`;
      await adminBucket().file(storagePath).save(got.pdf, { contentType: 'application/pdf', resumable: false });
      await docRef.set({
        patientId: subjectId,
        category: 'ISP / Plan of Treatment',
        title: `Signed Appendix T (PPOT), ${typeLabel}${req.recipientName ? `: ${req.recipientName}` : ''} (${formatDateUS(p.signedDate)})`,
        fileName,
        storagePath,
        contentType: 'application/pdf',
        size: got.pdf.length,
        docDate: p.signedDate,
        uploadedBy: p.caller.uid,
        uploadedByName: byName,
        uploadedByRole: p.caller.role,
        uploadedAt: FieldValue.serverTimestamp(),
        archived: false,
        ppotRequestKey: p.requestKey,
        inboundFaxId: p.faxId,
      });
    } else {
      storagePath = `ppot/signed/${p.requestKey}/${p.faxId}/${fileName}`;
      await adminBucket().file(storagePath).save(got.pdf, { contentType: 'application/pdf', resumable: false });
    }
  } catch (err) {
    await release();
    console.error('PPOT filing failed:', err);
    return { ok: false, status: 500, error: 'Could not save the signed copy. Please try again.' };
  }

  await requestRef.update({
    status: 'received',
    received: {
      signedDate: p.signedDate,
      inboundFaxId: p.faxId,
      documentId,
      storagePath,
      byUid: p.caller.uid,
      byName,
      at: FieldValue.serverTimestamp(),
    },
  });
  await inboundRef.update({
    status: 'filed',
    matchedPpotKey: p.requestKey,
    filedAt: FieldValue.serverTimestamp(),
    filedBy: p.caller.uid,
    filedByName: byName,
  });
  if (kind === 'referral') {
    try {
      await logReferralActivity(subjectId, {
        type: 'contact',
        text: `Signed plan of treatment (Appendix T) received by fax, signed ${formatDateUS(p.signedDate)}. The copy is in the Fax Center under Signed PPOTs.`,
        byUid: p.caller.uid,
        byName,
        byRole: p.caller.role,
      });
    } catch (err) {
      console.error('PPOT filing: referral activity failed (non-fatal):', err);
    }
  }
  let ordersUpdated = 0;
  if (kind === 'client' && p.orderLineIds && p.orderLineIds.length > 0) {
    try {
      ordersUpdated = await advanceOrderDates(subjectId, p.orderLineIds, p.signedDate, { uid: p.caller.uid, name: byName });
    } catch (err) {
      // The signed copy is filed; the dates can still be set by hand.
      console.error('PPOT filing: order date update failed (non-fatal):', err);
    }
  }
  console.info(`PPOT filed: ${p.requestKey} (${memberName}) from inbound fax ${p.faxId}; ${ordersUpdated} order date(s) updated`);
  return { ok: true, documentId, ordersUpdated };
}

/**
 * File an incoming fax into a client's Documents: records a facility sent back
 * on a release of information, labs, a discharge summary. Same claim/release
 * pattern as fileSignedPpot so two people can't file one fax twice, and the
 * fax leaves Incoming Faxes (and the Verbal Orders queue) once filed.
 */
export async function fileInboundFaxToClient(p: FileFaxToClientInput & { faxId: string; caller: AuthedCaller }): Promise<{ ok: boolean; status?: number; error?: string; documentId?: string }> {
  const invalid = validateFileFaxToClient(p, agencyTodayISO());
  const firstError = Object.values(invalid)[0];
  if (firstError) return { ok: false, status: 400, error: firstError };

  const db = adminDb();
  const inboundRef = db.collection(INBOUND).doc(p.faxId);
  const patientRef = db.collection('patients').doc(p.patientId);
  const byName = p.caller.profile.displayName || p.caller.email || '';

  const claim = await db.runTransaction(async (tx) => {
    const [inb, pat] = await Promise.all([tx.get(inboundRef), tx.get(patientRef)]);
    if (!inb.exists || !OPEN_INBOUND.includes(String(inb.data()?.status || ''))) return { error: 'That fax has already been filed or dismissed.', status: 409 };
    if (!pat.exists) return { error: 'That client was not found.', status: 404 };
    tx.update(inboundRef, { status: 'filing', filingBy: p.caller.uid, filingAt: FieldValue.serverTimestamp() });
    return { fileName: String(inb.data()?.fileName || ''), storagePath: String(inb.data()?.storagePath || ''), prevStatus: String(inb.data()?.status || 'unmatched'), patientName: String(pat.data()?.name || '') };
  });
  if ('error' in claim) return { ok: false, status: claim.status, error: claim.error };

  const release = () => inboundRef.update({ status: claim.prevStatus, filingBy: FieldValue.delete(), filingAt: FieldValue.delete() }).catch(() => undefined);
  const got = await readInboundFaxBytes(claim, true);
  if (!got.ok || !got.pdf) {
    await release();
    return { ok: false, status: 502, error: got.error || 'Could not download the fax from SRFax.' };
  }

  const title = p.title.trim();
  const safe = title.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'Fax';
  const fileName = `${safe}_${formatDateUSFile(p.docDate)}.pdf`;
  const docRef = db.collection('patientDocuments').doc();
  const storagePath = `patients/${p.patientId}/documents/${docRef.id}/${fileName}`;
  try {
    await adminBucket().file(storagePath).save(got.pdf, { contentType: 'application/pdf', resumable: false });
    await docRef.set({
      patientId: p.patientId,
      category: p.category,
      title,
      fileName,
      storagePath,
      contentType: 'application/pdf',
      size: got.pdf.length,
      docDate: p.docDate,
      uploadedBy: p.caller.uid,
      uploadedByName: byName,
      uploadedByRole: p.caller.role,
      uploadedAt: FieldValue.serverTimestamp(),
      archived: false,
      inboundFaxId: p.faxId,
    });
  } catch (err) {
    await release();
    console.error('Fax filing to client failed:', err);
    return { ok: false, status: 500, error: 'Could not save the fax to the client. Please try again.' };
  }

  await inboundRef.update({
    status: 'filed',
    filedPatientId: p.patientId,
    filedDocumentId: docRef.id,
    filedAt: FieldValue.serverTimestamp(),
    filedBy: p.caller.uid,
    filedByName: byName,
  });
  console.info(`Inbound fax ${p.faxId} filed to client ${p.patientId} as "${title}" (${p.category})`);
  return { ok: true, documentId: docRef.id };
}

export interface ReceivedPpot {
  key: string;
  subjectKind: PpotSubjectKind;
  memberName: string;
  requestType: PpotRequestType;
  recipientName: string;
  signedDate: string;
  byName: string;
  documentId: string;
}

/** The most recent signed copies filed, for the Fax Center list. */
export async function listReceivedPpots(limit = 25): Promise<ReceivedPpot[]> {
  const snap = await adminDb().collection(REQUESTS).where('status', '==', 'received').get();
  return snap.docs
    .filter((d) => d.data().listHidden !== true)
    .map((d) => {
      const x = d.data();
      const r = (x.received || {}) as Record<string, unknown>;
      return {
        key: d.id,
        subjectKind: (x.subjectKind === 'client' ? 'client' : 'referral') as PpotSubjectKind,
        memberName: String(x.memberName || ''),
        requestType: (x.requestType === 'recert' ? 'recert' : 'new') as PpotRequestType,
        recipientName: String(x.recipientName || ''),
        signedDate: String(r.signedDate || ''),
        byName: String(r.byName || ''),
        documentId: String(r.documentId || ''),
      };
    })
    .sort((a, b) => b.signedDate.localeCompare(a.signedDate))
    .slice(0, limit);
}

/** The filed signed copy for a request (client or referral). */
export async function readSignedPpotPdf(requestKey: string): Promise<{ bytes: Buffer; fileName: string } | null> {
  const snap = await adminDb().collection(REQUESTS).doc(requestKey).get();
  const path = String(((snap.data() || {}).received || {}).storagePath || '');
  if (!snap.exists || !path) return null;
  const [bytes] = await adminBucket().file(path).download();
  return { bytes, fileName: path.split('/').pop() || 'Appendix_T_Signed.pdf' };
}

/** Bell text for the inbound sweep when a fax looks like a signed PPOT. */
export function ppotInboundBellText(fromNumber: string, candidates: PpotOpenRequest[]): string {
  const from = fromNumber ? ` from ${formatUSFaxNumber(fromNumber)}` : '';
  if (candidates.length === 1) {
    return `A fax${from} may be the signed Appendix T for ${candidates[0].memberName}. Check it and file it in the Fax Center.`;
  }
  return `A fax${from} may be a signed Appendix T. Check it and file it in the Fax Center.`;
}

// ---------------------------------------------------------------------------
// Clearing the lists
// ---------------------------------------------------------------------------

function actor(caller: AuthedCaller) {
  return { uid: caller.uid, name: caller.profile.displayName || caller.email || '' };
}

/**
 * Withdraw an open PPOT request (sent to the wrong office, not needed after
 * all, or a test). It leaves "Waiting on physicians" and stops counting as
 * this cycle's request. The outbox keeps the fax itself.
 */
export async function cancelPpotRequest(key: string, caller: AuthedCaller): Promise<{ ok: boolean; status?: number; error?: string }> {
  const ref = adminDb().collection(REQUESTS).doc(key);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, status: 404, error: 'Request not found.' };
  if (snap.data()?.status !== 'sent') return { ok: false, status: 409, error: 'Only a request still waiting on the physician can be cancelled.' };
  const a = actor(caller);
  await ref.update({ status: 'cancelled', cancelled: { byUid: a.uid, byName: a.name, at: FieldValue.serverTimestamp() } });
  return { ok: true };
}

/** Take a filed PPOT off the "Signed PPOTs" list. The copy stays filed. */
export async function hideReceivedPpot(key: string, caller: AuthedCaller): Promise<{ ok: boolean; status?: number; error?: string }> {
  const ref = adminDb().collection(REQUESTS).doc(key);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.status !== 'received') return { ok: false, status: 404, error: 'Signed PPOT not found.' };
  const a = actor(caller);
  await ref.update({ listHidden: true, listHiddenBy: a.uid, listHiddenByName: a.name, listHiddenAt: FieldValue.serverTimestamp() });
  return { ok: true };
}

/**
 * "Not needed this cycle" for a recertification (discharged, transferred,
 * handled another way). Keyed to the authorization end date, so the next
 * authorization period reminds as usual. Also stops the bell for this one.
 */
export async function dismissRecert(patientId: string, authEnd: string, caller: AuthedCaller): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(authEnd)) return { ok: false, status: 400, error: 'Bad authorization date.' };
  const a = actor(caller);
  await adminDb()
    .collection(REMINDERS)
    .doc(`${patientId}_${authEnd}`)
    .set({ patientId, authEnd, dismissed: true, dismissedBy: a.uid, dismissedByName: a.name, dismissedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
}

/**
 * Dismiss an inbound fax that isn't anything to file (junk, a duplicate, a
 * test). Admins and supervisors only (the route checks): the same line
 * receives signed verbal orders, which the Verbal Orders queue owns.
 */
export async function dismissIncomingFax(faxId: string, caller: AuthedCaller): Promise<{ ok: boolean; status?: number; error?: string }> {
  const ref = adminDb().collection(INBOUND).doc(faxId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, status: 404, error: 'Fax not found.' };
  if (!OPEN_INBOUND.includes(String(snap.data()?.status || ''))) return { ok: true };
  const a = actor(caller);
  await ref.update({ status: 'ignored', ignoredAt: FieldValue.serverTimestamp(), ignoredBy: a.uid, ignoredByName: a.name });
  return { ok: true };
}
