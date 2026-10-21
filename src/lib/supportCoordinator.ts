import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { normalizeCoordinator, type SupportCoordinator } from './supportCoordinatorShared';

// patients/{id}/clinical/supportCoordinator, beside the clinical profile, so
// it inherits the care-team read and staff-only write rules.
const DOC_ID = 'supportCoordinator';

export async function getSupportCoordinator(patientId: string): Promise<SupportCoordinator | null> {
  const snap = await getDoc(doc(db, 'patients', patientId, 'clinical', DOC_ID));
  return snap.exists() ? (snap.data() as SupportCoordinator) : null;
}

export async function saveSupportCoordinator(patientId: string, data: SupportCoordinator, updatedByName: string): Promise<void> {
  await setDoc(doc(db, 'patients', patientId, 'clinical', DOC_ID), {
    ...normalizeCoordinator(data),
    updatedByName,
    updatedAt: serverTimestamp(),
  });
}
