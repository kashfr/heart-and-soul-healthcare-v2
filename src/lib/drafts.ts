/**
 * Progress note drafts — cross-device autosave.
 *
 * One active draft per user (keyed by uid) so a nurse who starts a note on
 * her phone can finish it on a laptop. On submit we delete the matching
 * draft so submitted notes and in-progress notes never coexist.
 */

import {
  doc,
  getDoc,
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

export async function loadDraft(uid: string): Promise<NoteDraft | null> {
  const snap = await getDoc(draftRef(uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  const createdAt = data.createdAt as Timestamp | null | undefined;
  const updatedAt = data.updatedAt as Timestamp | null | undefined;
  return {
    nurseId: String(data.nurseId || ''),
    nurseName: String(data.nurseName || ''),
    clientName: String(data.clientName || ''),
    dateOfService: String(data.dateOfService || ''),
    currentPage: Number(data.currentPage || 1),
    formValues: (data.formValues || {}) as Record<string, unknown>,
    radioState: (data.radioState || {}) as Record<string, string>,
    checkboxState: (data.checkboxState || {}) as Record<string, string[]>,
    createdAt: createdAt ? createdAt.toDate() : null,
    updatedAt: updatedAt ? updatedAt.toDate() : null,
  };
}

export async function deleteDraft(uid: string): Promise<void> {
  await deleteDoc(draftRef(uid));
}
