import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  readSeizureEntries,
  seizureDurationSeconds,
  sortSeizuresByStart,
  type SeizureEntry,
} from './seizureShared';

/**
 * Seizure event records: the indexed clinical log behind the note's seizure
 * blocks. Written once per seizure when a note is first submitted; append-only
 * (rules deny update/delete). The note itself remains the legal record and
 * is what a nurse amends; `amends` is reserved for a future superseding-record
 * correction flow (resolveCurrentSeizureEvents already honors it) but nothing
 * writes it yet, so an edited note's seizure blocks are NOT re-synced to the
 * log today.
 */
export interface SeizureEvent {
  id?: string;
  patientId: string;
  date: string; // YYYY-MM-DD, the note's date of service
  sourceNoteId: string;
  documentedBy: string;
  documentedByName: string;
  documentedByCredential: string;
  startTime: string;
  endTime: string;
  durationSeconds: number | null;
  seizureType: string;
  witnessedBy: string;
  observations: string;
  interventions: string;
  rescueMed: string;
  rescueMedTime: string;
  response: string;
  postState: string;
  minutesToBaseline: string;
  physicianNotified: string;
  physicianNotifiedTime: string;
  familyNotified: string;
  notes: string;
  /** Index of the block on the note (1-based). */
  noteEntryIndex: number;
  amends?: string;
  createdAt?: Timestamp | null;
}

export interface SeizureDocumenter {
  uid: string;
  name: string;
  credential: string;
}

/**
 * Write one record per seizure block on the note. Batched so a partial write
 * can never leave the log claiming fewer seizures than the note does. Skips
 * silently when the note attests "No" or has no blocks. Never throws into
 * the submit path: the note is the record; a failed log write is logged.
 */
export async function writeSeizureEvents(
  values: Record<string, unknown>,
  meta: { patientId: string; date: string; sourceNoteId: string; documenter: SeizureDocumenter },
): Promise<number> {
  if (String(values.q30_seizureEvent || '') !== 'Yes') return 0;
  const entries = sortSeizuresByStart(readSeizureEntries(values));
  if (entries.length === 0 || !meta.patientId) return 0;
  const batch = writeBatch(db);
  const col = collection(db, 'seizureEvents');
  for (const e of entries) {
    batch.set(doc(col), { ...toEventFields(e, meta), createdAt: serverTimestamp() });
  }
  await batch.commit();
  return entries.length;
}

function toEventFields(
  e: SeizureEntry,
  meta: { patientId: string; date: string; sourceNoteId: string; documenter: SeizureDocumenter },
): Omit<SeizureEvent, 'id' | 'createdAt'> {
  return {
    patientId: meta.patientId,
    date: meta.date,
    sourceNoteId: meta.sourceNoteId,
    documentedBy: meta.documenter.uid,
    documentedByName: meta.documenter.name,
    documentedByCredential: meta.documenter.credential,
    startTime: e.startTime,
    endTime: e.endTime,
    durationSeconds: seizureDurationSeconds(e),
    seizureType: e.seizureType,
    witnessedBy: e.witnessedBy,
    observations: e.observations,
    interventions: e.interventions,
    rescueMed: e.rescueMed.trim(),
    rescueMedTime: e.rescueMedTime,
    response: e.response,
    postState: e.postState,
    minutesToBaseline: e.minutesToBaseline,
    physicianNotified: e.physicianNotified,
    physicianNotifiedTime: e.physicianNotifiedTime,
    familyNotified: e.familyNotified,
    notes: e.notes.trim(),
    noteEntryIndex: e.index,
  };
}

/** All events for a client, newest date first (then newest write). */
export async function getSeizureEventsForPatient(patientId: string): Promise<SeizureEvent[]> {
  const q = query(collection(db, 'seizureEvents'), where('patientId', '==', patientId), orderBy('date', 'desc'));
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SeizureEvent, 'id'>) }));
  return resolveCurrentSeizureEvents(list);
}

/** Collapse amendment chains: a record that is `amends`-pointed-to is superseded. */
export function resolveCurrentSeizureEvents<T extends { id?: string; amends?: string }>(list: T[]): T[] {
  const superseded = new Set<string>();
  for (const r of list) if (r.amends) superseded.add(r.amends);
  return list.filter((r) => !(r.id && superseded.has(r.id)));
}
