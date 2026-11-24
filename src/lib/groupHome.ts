import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { normalizeGroupHome, type GroupHome } from './groupHomeShared';

// Lives beside the clinical profile (patients/{id}/clinical/groupHome) so it
// inherits the same care-team-gated read and staff-only write rule as the day
// program: where a client lives and who staffs the home is PHI.
const GROUP_HOME_DOC_ID = 'groupHome';

export async function getGroupHome(patientId: string): Promise<GroupHome | null> {
  const snap = await getDoc(doc(db, 'patients', patientId, 'clinical', GROUP_HOME_DOC_ID));
  return snap.exists() ? (snap.data() as GroupHome) : null;
}

export async function saveGroupHome(patientId: string, data: GroupHome, updatedByName: string): Promise<void> {
  await setDoc(doc(db, 'patients', patientId, 'clinical', GROUP_HOME_DOC_ID), {
    ...normalizeGroupHome(data),
    updatedByName,
    updatedAt: serverTimestamp(),
  });
}
