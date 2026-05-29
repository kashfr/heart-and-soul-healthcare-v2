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
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export interface NoteDraftPayload {
  nurseId: string;
  nurseName: string;
  clientName: string;
  dateOfService: string;
  currentPage: number;
  formValues: Record<string, unknown>;
  radioState: Record<string, string>;
  checkboxState: Record<string, string[]>;
  // Stable id reserved for the eventual submission. Carrying it on the
  // draft means a retry after a reload (or on another device) reuses the
  // same progressNotes doc id, so a flaky-network resubmit overwrites
  // rather than duplicating. Optional for drafts written before this field.
  submissionId?: string;
}

export interface NoteDraft extends NoteDraftPayload {
  createdAt: Date | null;
  updatedAt: Date | null;
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
    createdAt: createdAt ? createdAt.toDate() : null,
    updatedAt: updatedAt ? updatedAt.toDate() : null,
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
