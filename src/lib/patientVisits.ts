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
