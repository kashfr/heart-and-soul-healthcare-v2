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
