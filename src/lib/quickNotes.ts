import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { authedFetch } from './authedFetch';

/**
 * Quick notes: lightweight free-text jottings a care-team member makes about
 * a client — a post-shift recollection, something the physician said at an
 * appointment, a concern worth flagging. Deliberately NOT a progress note:
 * the only required input is the text; author and timestamp are captured
 * automatically. Immutable once written (rules deny update/delete) — a
 * mistake is corrected by adding a follow-up note.
 */

export type QuickNoteCategory = 'observation' | 'physician' | 'concern' | 'followup' | 'other';

export const QUICK_NOTE_CATEGORIES: { value: QuickNoteCategory; label: string }[] = [
  { value: 'observation', label: 'Observation' },
  { value: 'physician', label: 'Physician / appointment' },
  { value: 'concern', label: 'Concern' },
  { value: 'followup', label: 'Follow-up needed' },
  { value: 'other', label: 'Other' },
];

export function quickNoteCategoryLabel(value: string | undefined): string {
  return QUICK_NOTE_CATEGORIES.find((c) => c.value === value)?.label || 'Other';
}

export interface QuickNote {
  id?: string;
  patientId: string;
  authorId: string;
  authorName: string;
  text: string;
  category: QuickNoteCategory;
  /** Optional YYYY-MM-DD the note refers to (e.g. "during Friday's shift").
   *  The trustworthy record time is always createdAt regardless. */
  aboutDate?: string;
  createdAt?: unknown;
}

export interface AddQuickNoteResult {
  id: string;
  /** True when this was a Concern and the bell alert to staff was sent OK.
   *  Alert failure never fails the note — the note is the record. */
  concernAlertOk: boolean;
}

export async function addQuickNote(params: {
  patientId: string;
  authorId: string;
  authorName: string;
  text: string;
  category: QuickNoteCategory;
  aboutDate?: string;
}): Promise<AddQuickNoteResult> {
  const ref = await addDoc(collection(db, 'quickNotes'), {
    patientId: params.patientId,
    authorId: params.authorId,
    authorName: params.authorName,
    text: params.text.trim(),
    category: params.category,
    aboutDate: params.aboutDate || '',
    createdAt: serverTimestamp(),
  });

  // Concern escalation: bell-only alert to active admins + supervisors so a
  // flagged concern never just sits waiting to be stumbled on. Fired AFTER
  // the note write succeeds — the note is the record; a failed alert only
  // changes what the toast reports.
  let concernAlertOk = false;
  if (params.category === 'concern') {
    try {
      const res = await authedFetch('/api/quick-notes/concern-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId: ref.id }),
      });
      concernAlertOk = res.ok;
    } catch (err) {
      console.error('Concern alert failed (note saved):', err);
    }
  }

  return { id: ref.id, concernAlertOk };
}

export async function getQuickNotesForPatient(
  patientId: string,
  max: number = 50,
): Promise<QuickNote[]> {
  const q = query(
    collection(db, 'quickNotes'),
    where('patientId', '==', patientId),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<QuickNote, 'id'>) }));
}

/** One note by id, for deep links (the concern bell links straight to the
 *  note). Returns null when missing, unreadable, or belonging to a different
 *  client than the page it was requested from (defense against a stale or
 *  hand-edited link opening another chart's note in this client's context). */
export async function getQuickNote(
  noteId: string,
  expectedPatientId: string,
): Promise<QuickNote | null> {
  try {
    const snap = await getDoc(doc(db, 'quickNotes', noteId));
    if (!snap.exists()) return null;
    const data = snap.data() as Omit<QuickNote, 'id'>;
    if (data.patientId !== expectedPatientId) return null;
    return { id: snap.id, ...data };
  } catch (err) {
    console.error('Quick note load failed:', err);
    return null;
  }
}
