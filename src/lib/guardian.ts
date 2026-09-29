import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { normalizeGuardian, type GuardianRecord } from './guardianShared';

// patients/{id}/clinical/guardian, beside the clinical profile, so it
// inherits the care-team read and staff-only write rules.
const GUARDIAN_DOC_ID = 'guardian';

export async function getGuardian(patientId: string): Promise<GuardianRecord | null> {
  const snap = await getDoc(doc(db, 'patients', patientId, 'clinical', GUARDIAN_DOC_ID));
  return snap.exists() ? (snap.data() as GuardianRecord) : null;
}

export async function saveGuardian(patientId: string, rec: GuardianRecord, updatedByName: string): Promise<void> {
  await setDoc(doc(db, 'patients', patientId, 'clinical', GUARDIAN_DOC_ID), {
    ...normalizeGuardian(rec),
    updatedByName,
    updatedAt: serverTimestamp(),
  });
}
