import {
  collection,
  getDocs,
  addDoc,
  doc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { buildTarEntryFields, type TarEntryFieldInput, type TarEntryFieldMeta, type TarStatus } from './tarShared';

/**
 * Treatment Administration Record entries — one document per care task per day
 * per slot, in a top-level `careTaskAdministrations` collection linked by
 * patientId. This is the treatment twin of `marAdministrations`.
 *
 * The care plan (`careTasks`) stays the single ORDER list; this collection is
 * the ledger of what was actually carried out. Entries are append-only: a
 * correction is a NEW document pointing at the one it supersedes via `amends`,
 * so the record of who documented what, and when, is never rewritten.
 *
 * Why a ledger rather than reading it back out of progress notes: a note only
 * exists on days a nurse visited. For clients whose family performs the daily
 * care between monthly RN oversight visits, the TAR has to be able to record a
 * treatment on a day nobody from the agency was in the home.
 */
export interface TarEntry {
  id?: string;
  patientId: string;
  taskId: string;
  date: string; // 'YYYY-MM-DD'
  slotIndex: number;
  status: TarStatus;
  performedByType: string;
  performerName: string;
  initials: string;
  time: string;
  reason: string;
  note: string;
  taskNameSnapshot: string;
  categoryLabelSnapshot: string;
  frequencySnapshot: string;
  levelSnapshot: string;
  sourceNoteId?: string;
  documentedBy: string;
  documentedByName: string;
  documentedByCredential: string;
  /** Set when this entry corrects an earlier one (append-only audit trail). */
  amends?: string;
  amendReason?: string;
  at?: unknown;
}

/** Record one treatment as carried out (or not). Returns the new doc id. */
export async function recordTarEntry(
  input: TarEntryFieldInput,
  meta: TarEntryFieldMeta,
): Promise<string> {
  const ref = await addDoc(collection(db, 'careTaskAdministrations'), {
    ...buildTarEntryFields(input, meta),
    at: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Correct an existing entry. Never edits in place: writes a new document that
 * carries `amends` (the superseded id) plus the reason for the correction, so
 * both the original and the correction survive an audit.
 */
export async function amendTarEntry(
  supersededId: string,
  amendReason: string,
  input: TarEntryFieldInput,
  meta: TarEntryFieldMeta,
): Promise<string> {
  const ref = await addDoc(collection(db, 'careTaskAdministrations'), {
    ...buildTarEntryFields(input, meta),
    amends: supersededId,
    amendReason: amendReason.trim(),
    at: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Every entry for a client within a date range. Equality on patientId plus a
 * range on date needs only a single-field index Firestore creates
 * automatically. Fails open to [] so a permission miss never blanks the UI
 * into looking like "nothing was done".
 */
export async function getTarEntriesForRange(
  patientId: string,
  startDate: string,
  endDate: string,
): Promise<TarEntry[]> {
  try {
    return await getTarEntriesForRangeStrict(patientId, startDate, endDate);
  } catch (error) {
    console.error('Error fetching TAR entries:', error);
    return [];
  }
}

/** Throwing variant, for callers that must tell "none" from "couldn't check". */
export async function getTarEntriesForRangeStrict(
  patientId: string,
  startDate: string,
  endDate: string,
): Promise<TarEntry[]> {
  const q = query(
    collection(db, 'careTaskAdministrations'),
    where('patientId', '==', patientId),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
  );
  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as TarEntry[];
  // Oldest first, so a same-cell correction written later wins when indexed.
  return rows.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
}

/** All entries documented against one care task (its history across months). */
export async function getTarEntriesForTask(taskId: string): Promise<TarEntry[]> {
  try {
    const q = query(collection(db, 'careTaskAdministrations'), where('taskId', '==', taskId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as TarEntry[];
  } catch (error) {
    console.error('Error fetching TAR entries for task:', error);
    return [];
  }
}

/** Reference to one entry, for callers that need the doc path. */
export function tarEntryRef(id: string) {
  return doc(db, 'careTaskAdministrations', id);
}
