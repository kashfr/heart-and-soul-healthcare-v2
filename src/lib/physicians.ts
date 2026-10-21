import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { normalizePhysicians, type Physician, type PhysicianList } from './physiciansShared';

// patients/{id}/clinical/physicians, beside the clinical profile, so it
// inherits the care-team read and staff-only write rules.
const PHYSICIANS_DOC_ID = 'physicians';

export async function getPhysicians(patientId: string): Promise<PhysicianList | null> {
  const snap = await getDoc(doc(db, 'patients', patientId, 'clinical', PHYSICIANS_DOC_ID));
  return snap.exists() ? (snap.data() as PhysicianList) : null;
}

export async function savePhysicians(patientId: string, list: Physician[], updatedByName: string): Promise<void> {
  await setDoc(doc(db, 'patients', patientId, 'clinical', PHYSICIANS_DOC_ID), {
    list: normalizePhysicians(list),
    updatedByName,
    updatedAt: serverTimestamp(),
  });
}
