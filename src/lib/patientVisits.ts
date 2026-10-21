import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { authedFetch } from './authedFetch';
import type { VisitNotifyEvent } from './visitNotifyShared';
import { autoNextVisitNote, nextVisitAfterFiling } from './supervisoryScheduling';

export type { VisitNotifyEvent };

/**
 * Scheduled client visits (phase 4). The day-to-day schedule is maintained by
 * admin + supervisors (staff): regular shift visits and RN supervisory visits.
 * The whole care team can read them (the dashboard's Upcoming visits section);
 * nurses don't edit the schedule. Visits are never deleted — a cancellation is
 * a status change, so the schedule keeps its history.
 */
export type VisitType = 'shift' | 'supervisory';
export type VisitStatus = 'scheduled' | 'completed' | 'cancelled';

export interface PatientVisit {
  id?: string;
  patientId: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // 'HH:MM' 24h, optional
  endTime?: string;
  type: VisitType;
  nurseId?: string; // optional care-team assignment
  nurseName?: string;
  notes?: string;
  status: VisitStatus;
  createdBy: string;
  createdByName: string;
  createdAt?: unknown;
  updatedBy?: string;
  updatedByName?: string;
  updatedAt?: unknown;
  /** Supervisory visit offered to every supervisor; the first to accept
   *  takes it (nurseId is '' while open). Server-written; see
   *  supervisorySchedulingServer.ts. */
  offeredToAll?: boolean;
  lastOfferedISO?: string;
  acceptedByName?: string;
  handedOffFromName?: string;
  releaseReason?: string;
  /** 'auto-next' (put on the calendar when a visit was filed), 'auto-offer'
   *  (created by the daily sweep), or absent for a hand-scheduled visit. */
  source?: string;
}

export interface VisitActor {
  uid: string;
  name: string;
}

export interface VisitNotifyResult {
  smsOk: boolean;
  emailOk: boolean;
  skipped: boolean;
}

/**
 * Best-effort SMS + email to the visit's assignee after a scheduling event
 * (assigned / cancelled / restored). Fired AFTER the Firestore write succeeds
 * — the schedule is the source of truth; a failed notification only changes
 * the toast, never the visit. Returns what actually landed so the UI can be
 * honest about it. PHI-free bodies are composed server-side.
 */
export async function notifyVisitAssignee(
  visitId: string,
  event: VisitNotifyEvent,
): Promise<VisitNotifyResult> {
  try {
    const res = await authedFetch('/api/visits/notify', {
      method: 'POST',
      body: JSON.stringify({ visitId, event }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      smsOk?: boolean;
      emailOk?: boolean;
      skipped?: boolean;
    };
    if (!res.ok) return { smsOk: false, emailOk: false, skipped: false };
    if (data.skipped) return { smsOk: false, emailOk: false, skipped: true };
    return { smsOk: !!data.smsOk, emailOk: !!data.emailOk, skipped: false };
  } catch (error) {
    console.error('Visit notification failed:', error);
    return { smsOk: false, emailOk: false, skipped: false };
  }
}

export interface VisitInput {
  patientId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  type: VisitType;
  nurseId?: string;
  nurseName?: string;
  notes?: string;
  source?: string;
}

/** Schedule a visit (staff-only per rules). Returns the new doc id. */
export async function addVisit(input: VisitInput, actor: VisitActor): Promise<string> {
  const ref = await addDoc(collection(db, 'patientVisits'), {
    patientId: input.patientId,
    date: input.date,
    startTime: (input.startTime || '').trim(),
    endTime: (input.endTime || '').trim(),
    type: input.type,
    nurseId: (input.nurseId || '').trim(),
    nurseName: (input.nurseName || '').trim(),
    notes: (input.notes || '').trim(),
    ...(input.source ? { source: input.source } : {}),
    status: 'scheduled' as VisitStatus,
    createdBy: actor.uid,
    createdByName: actor.name,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Mark a visit completed / cancelled / back to scheduled (staff-only). */
export async function setVisitStatus(id: string, status: VisitStatus, actor: VisitActor): Promise<void> {
  await updateDoc(doc(db, 'patientVisits', id), {
    status,
    updatedBy: actor.uid,
    updatedByName: actor.name,
    updatedAt: serverTimestamp(),
  });
}

/** All visits for a client (equality query — care-team read rule applies),
 *  soonest date first. Callers slice/filter for their view. */
export async function getVisitsForPatient(patientId: string): Promise<PatientVisit[]> {
  try {
    const q = query(collection(db, 'patientVisits'), where('patientId', '==', patientId));
    const snap = await getDocs(q);
    const visits = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PatientVisit[];
    return visits.sort((a, b) => {
      const byDate = (a.date || '').localeCompare(b.date || '');
      if (byDate !== 0) return byDate;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });
  } catch (error) {
    console.error('Error fetching patient visits:', error);
    return [];
  }
}

export interface AssigneeOption {
  uid: string;
  name: string;
  credential: string;
}

/**
 * Active RN supervisors — the assignee pool for SUPERVISORY visits. A
 * supervisory visit is performed by a supervisor, not the client's case
 * nurse, so the schedule modal must not offer the care team for it. Queried
 * live from users (role 'supervisor', active) so new supervisors appear
 * without a code change. The users read rule is staff-only for other
 * profiles, matching the staff-only schedule-maintenance gate on the caller.
 */
export async function getActiveSupervisors(): Promise<AssigneeOption[]> {
  try {
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'supervisor'),
      where('active', '==', true),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const u = d.data() as { displayName?: string; credential?: string };
        return { uid: d.id, name: u.displayName || '', credential: u.credential || '' };
      })
      .filter((s) => s.name)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error fetching supervisors:', error);
    return [];
  }
}

/**
 * Active field staff (role 'nurse': HHA, CNA, LPN, RN) — the "Staff
 * Performing Duties" pool on the Home Supervisory Visit form. Same
 * staff-only users read as {@link getActiveSupervisors}.
 */
export async function getActiveFieldStaff(): Promise<AssigneeOption[]> {
  try {
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'nurse'),
      where('active', '==', true),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const u = d.data() as { displayName?: string; credential?: string };
        return { uid: d.id, name: u.displayName || '', credential: u.credential || '' };
      })
      .filter((s) => s.name)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error fetching field staff:', error);
    return [];
  }
}

/** Server-side scheduling actions (supervisorySchedulingServer.ts). Each is
 *  best-effort from the UI's point of view: the response says what happened. */
async function postVisitAction(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; notified: number; message: string }> {
  try {
    const res = await authedFetch(path, { method: 'POST', body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; notified?: number; message?: string; error?: string };
    return { ok: res.ok && data.ok !== false, notified: Number(data.notified || 0), message: String(data.message || data.error || '') };
  } catch (error) {
    console.error('Visit action failed:', error);
    return { ok: false, notified: 0, message: 'Network error. Please try again.' };
  }
}

/** Offer a scheduled supervisory visit to every supervisor. */
export function offerVisitToAll(visitId: string) {
  return postVisitAction('/api/visits/offer', { visitId });
}

/** Take an open supervisory visit (first to accept wins). */
export function acceptOfferedVisit(visitId: string) {
  return postVisitAction('/api/visits/accept', { visitId });
}

/** Hand a supervisory visit to a named supervisor (toUid) or, with toUid '',
 *  release it to every other supervisor. A reason is required. */
export function handOffVisit(visitId: string, toUid: string, reason: string) {
  return postVisitAction('/api/visits/release', { visitId, toUid, reason });
}

/**
 * After a supervisory visit is filed: put the next one on the calendar 30
 * days out, assigned to the filing supervisor, unless the client already has
 * a supervisory visit pending (scheduled by hand, or by an earlier filing).
 * Returns the new visit's date, or '' when nothing was created. The bell and
 * email to the supervisor go through the server (no text: it is her own
 * filing, once a month per client).
 */
export async function scheduleNextSupervisoryVisit(
  patientId: string,
  filedISO: string,
  actor: VisitActor,
  assigneeLabel: string,
  todayISO: string,
): Promise<string> {
  if (!patientId || !filedISO) return '';
  const next = nextVisitAfterFiling(await getVisitsForPatient(patientId), filedISO, todayISO);
  if (!next) return '';
  const visitId = await addVisit(
    {
      patientId,
      date: next.date,
      type: 'supervisory',
      nurseId: actor.uid,
      nurseName: assigneeLabel,
      notes: autoNextVisitNote(filedISO),
      source: 'auto-next',
    },
    actor,
  );
  await postVisitAction('/api/visits/auto-next', { visitId });
  return next.date;
}

/** The scheduled supervisory visit(s) a filed supervisory form satisfies:
 *  same client, same date, still 'scheduled'. Pure so it can be tested. */
export function scheduledSupervisoryVisitsOn(visits: PatientVisit[], date: string): PatientVisit[] {
  return visits.filter(
    (v) => v.type === 'supervisory' && v.status === 'scheduled' && v.date === date && !!v.id,
  );
}

/**
 * After a Home Supervisory Visit form is filed, mark the client's scheduled
 * supervisory visit on that date completed, so the schedule matches the
 * record without a second manual step. Staff-only write (the form is
 * staff-only too). Returns how many visits were marked; nothing scheduled
 * that day is not an error.
 */
export async function completeScheduledSupervisoryVisit(
  patientId: string,
  date: string,
  actor: VisitActor,
): Promise<number> {
  if (!patientId || !date) return 0;
  const matches = scheduledSupervisoryVisitsOn(await getVisitsForPatient(patientId), date);
  await Promise.all(matches.map((v) => setVisitStatus(v.id as string, 'completed', actor)));
  return matches.length;
}
