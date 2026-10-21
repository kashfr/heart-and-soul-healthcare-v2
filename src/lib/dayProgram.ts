import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { normalizeDayProgram, type DayProgram } from './dayProgramShared';

// Lives beside the clinical profile (patients/{id}/clinical/dayProgram) so it
// inherits the same care-team-gated read and staff-only write rule: which
// program a client attends and who staffs it is PHI, not roster data.
const DAY_PROGRAM_DOC_ID = 'dayProgram';

export async function getDayProgram(patientId: string): Promise<DayProgram | null> {
  const snap = await getDoc(doc(db, 'patients', patientId, 'clinical', DAY_PROGRAM_DOC_ID));
  return snap.exists() ? (snap.data() as DayProgram) : null;
}

export async function saveDayProgram(patientId: string, data: DayProgram, updatedByName: string): Promise<void> {
  await setDoc(doc(db, 'patients', patientId, 'clinical', DAY_PROGRAM_DOC_ID), {
    ...normalizeDayProgram(data),
    updatedByName,
    updatedAt: serverTimestamp(),
  });
}
