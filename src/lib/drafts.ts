/**
 * Progress note drafts — cross-device autosave.
 *
 * One active draft per user (keyed by uid) so a nurse who starts a note on
 * her phone can finish it on a laptop. On submit we delete the matching
 * draft so submitted notes and in-progress notes never coexist.
 */

import {
  doc,
  collection,
  query,
  where,
  onSnapshot,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  deleteField,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

/**
 * A nurse's request to be allowed to submit a SECOND note for a client she's
 * already documented on that date. Lives on her draft (one draft per nurse),
 * so it rides along in the In-Progress inspector and self-clears when the
 * draft is deleted on submit. Approve/deny is admin/supervisor-only and goes
 * through the Admin SDK (the draft rules block staff from writing a nurse's
 * draft directly).
 */
export type DupRequestStatus = 'pending' | 'approved' | 'denied';

export interface DuplicateRequest {
  status: DupRequestStatus;
  /** Snapshot of what the request is for, so we only honor an approval that
      still matches the note she ends up submitting. */
  clientName: string;
  dateOfService: string;
  patientId?: string;
  reason: string;
  requestedAt: Date | null;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: Date | null;
  denyNote?: string;
}

export interface NoteDraftPayload {
  nurseId: string;
  nurseName: string;
  clientName: string;
  dateOfService: string;
  currentPage: number;
  formValues: Record<string, unknown>;
  radioState: Record<string, string>;
  checkboxState: Record<string, string[]>;
  // MAR dose marks (Page 5 Given/Held/Refused cards), persisted as an array of
  // { key, ...record } entries from the marAdminStore so a mid-note reload
  // doesn't lose them. Stored as an array (not a map) because store keys
  // contain user-derived text (med names) that isn't safe as Firestore field
  // names. Optional for drafts written before this field.
  marAdminState?: Array<{ key: string } & Record<string, unknown>>;
  // Stable id reserved for the eventual submission. Carrying it on the
  // draft means a retry after a reload (or on another device) reuses the
  // same progressNotes doc id, so a flaky-network resubmit overwrites
  // rather than duplicating. Optional for drafts written before this field.
  submissionId?: string;
}

export interface NoteDraft extends NoteDraftPayload {
  createdAt: Date | null;
  updatedAt: Date | null;
  dupRequest?: DuplicateRequest;
}

const draftRef = (uid: string) => doc(db, 'noteDrafts', uid);

/**
 * Upsert the draft keyed by uid. createdAt is only written on first save.
 */
export async function saveDraft(payload: NoteDraftPayload): Promise<void> {
  const ref = draftRef(payload.nurseId);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    await setDoc(
      ref,
      { ...payload, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } else {
    await setDoc(ref, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

function mapDupRequest(raw: unknown): DuplicateRequest | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const status = r.status as DupRequestStatus | undefined;
  if (status !== 'pending' && status !== 'approved' && status !== 'denied') return undefined;
  const requestedAt = r.requestedAt as Timestamp | null | undefined;
  const decidedAt = r.decidedAt as Timestamp | null | undefined;
  return {
    status,
    clientName: String(r.clientName || ''),
    dateOfService: String(r.dateOfService || ''),
    patientId: r.patientId ? String(r.patientId) : undefined,
    reason: String(r.reason || ''),
    requestedAt: requestedAt ? requestedAt.toDate() : null,
    decidedBy: r.decidedBy ? String(r.decidedBy) : undefined,
    decidedByName: r.decidedByName ? String(r.decidedByName) : undefined,
    decidedAt: decidedAt ? decidedAt.toDate() : null,
    denyNote: r.denyNote ? String(r.denyNote) : undefined,
  };
}

function mapDraftDoc(id: string, data: Record<string, unknown>): NoteDraft {
  const createdAt = data.createdAt as Timestamp | null | undefined;
  const updatedAt = data.updatedAt as Timestamp | null | undefined;
  return {
    nurseId: String(data.nurseId || id),
    nurseName: String(data.nurseName || ''),
    clientName: String(data.clientName || ''),
    dateOfService: String(data.dateOfService || ''),
    submissionId: data.submissionId ? String(data.submissionId) : undefined,
    currentPage: Number(data.currentPage || 1),
    formValues: (data.formValues || {}) as Record<string, unknown>,
    radioState: (data.radioState || {}) as Record<string, string>,
    checkboxState: (data.checkboxState || {}) as Record<string, string[]>,
    marAdminState: (data.marAdminState || []) as Array<{ key: string } & Record<string, unknown>>,
    createdAt: createdAt ? createdAt.toDate() : null,
    updatedAt: updatedAt ? updatedAt.toDate() : null,
    dupRequest: mapDupRequest(data.dupRequest),
  };
}

export async function loadDraft(uid: string): Promise<NoteDraft | null> {
  const snap = await getDoc(draftRef(uid));
  if (!snap.exists()) return null;
  return mapDraftDoc(snap.id, snap.data());
}

/**
 * List every in-progress draft, newest-updated first. Staff-only at the rules
 * layer (admins + supervisors can read all drafts). Powers the In-Progress
 * inspector so staff can see who's mid-note and what's blocking them.
 */
export async function listDrafts(): Promise<NoteDraft[]> {
  const snap = await getDocs(collection(db, 'noteDrafts'));
  const drafts = snap.docs.map((d) => mapDraftDoc(d.id, d.data()));
  drafts.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
  return drafts;
}

export async function deleteDraft(uid: string): Promise<void> {
  await deleteDoc(draftRef(uid));
}

/** Remove the duplicate request from a draft (e.g. the nurse changed client/date). */
export async function clearDuplicateRequest(uid: string): Promise<void> {
  await setDoc(draftRef(uid), { dupRequest: deleteField() }, { merge: true });
}

/**
 * Subscribe to the nurse's OWN draft so the form reacts live when an
 * admin/supervisor approves or denies her duplicate request (no refresh
 * needed). Returns an unsubscribe function. Emits undefined when there's no
 * request on the draft.
 */
export function subscribeOwnDupRequest(
  uid: string,
  cb: (req: DuplicateRequest | undefined) => void
): () => void {
  return onSnapshot(
    draftRef(uid),
    (snap) => cb(snap.exists() ? mapDupRequest(snap.data()?.dupRequest) : undefined),
    (err) => {
      console.error('Own duplicate-request subscription failed:', err);
      cb(undefined);
    }
  );
}

/**
 * Live count of drafts with a PENDING duplicate-approval request. Powers the
 * badge in the sidebar / dashboard for admins + supervisors. Returns an
 * unsubscribe function. Uses the auto single-field index on dupRequest.status.
 */
export function subscribePendingDupCount(cb: (count: number) => void): () => void {
  const q = query(collection(db, 'noteDrafts'), where('dupRequest.status', '==', 'pending'));
  return onSnapshot(
    q,
    (snap) => cb(snap.size),
    (err) => {
      console.error('Pending duplicate-request count subscription failed:', err);
      cb(0);
    }
  );
}
