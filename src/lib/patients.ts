import {
  collection,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  setDoc,
  doc,
  query,
  orderBy,
  runTransaction,
  Query,
  DocumentData,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export interface Patient {
  id?: string;
  name: string;
  dob: string; // YYYY-MM-DD
  diagnosis: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  mrn?: string;
  /**
   * Whether this client requires a Medication Administration Record (MAR).
   * Not all clients need one; this flag gates the MAR surfaces and drives the
   * roster indicator. Lives on the directory doc (not sensitive PHI).
   */
  requiresMar?: boolean;
  createdAt?: unknown;
  /**
   * Care team — list of nurse uids who can read all progressNotes for
   * this patient (regardless of who authored each note). Populated by:
   *   - the backfill script (seeds from historical authors)
   *   - auto-add on note submission (Phase 3)
   *   - admin/supervisor editing the patient (Phase 3)
   * Reads are still author-only when this list is empty or missing.
   */
  assignedNurseIds?: string[];
}

/**
 * Get all patients from Firestore 'patients' collection
 */
export async function getPatients(): Promise<Patient[]> {
  try {
    const patientsRef = collection(db, 'patients');
    const q: Query<DocumentData> = query(patientsRef, orderBy('name', 'asc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Patient[];
  } catch (error) {
    console.error('Error fetching patients:', error);
    return [];
  }
}

/**
 * Get a single patient by id. Returns null when not found.
 */
export async function getPatient(id: string): Promise<Patient | null> {
  try {
    const ref = doc(db, 'patients', id);
    const snap = await getDoc(ref);
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Patient) : null;
  } catch (error) {
    console.error('Error fetching patient:', error);
    return null;
  }
}

/**
 * Add a new patient to Firestore. The record number (mrn) is auto-assigned
 * from an atomic counter (counters/patients) inside a transaction, so two
 * simultaneous creations can never collide and numbers are never reused.
 * Any caller-supplied mrn is ignored — the system owns this identifier.
 * Returns the new document ID.
 */
export async function addPatient(patient: Patient): Promise<string> {
  try {
    const counterRef = doc(db, 'counters', 'patients');
    const newRef = doc(collection(db, 'patients'));
    await runTransaction(db, async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const next = counterSnap.exists() ? Number(counterSnap.data().nextRecordNumber || 1) : 1;
      const { id: _id, mrn: _mrn, createdAt: _ca, ...data } = patient;
      tx.set(newRef, {
        ...data,
        mrn: String(next).padStart(6, '0'),
        createdAt: serverTimestamp(),
      });
      tx.set(counterRef, { nextRecordNumber: next + 1 }, { merge: true });
    });
    return newRef.id;
  } catch (error) {
    console.error('Error adding patient:', error);
    throw error;
  }
}

/**
 * Update an existing patient. The record number (mrn) is stripped along with
 * id/createdAt: it's system-assigned and must never drift through an edit.
 */
export async function updatePatient(id: string, data: Partial<Patient>): Promise<void> {
  try {
    const patientRef = doc(db, 'patients', id);
    const { id: _id, createdAt: _ca, mrn: _mrn, ...updateData } = data;
    await updateDoc(patientRef, updateData);
  } catch (error) {
    console.error('Error updating patient:', error);
    throw error;
  }
}

/**
 * Delete a patient by ID
 */
export async function removePatient(id: string): Promise<void> {
  try {
    const patientRef = doc(db, 'patients', id);
    await deleteDoc(patientRef);
  } catch (error) {
    console.error('Error removing patient:', error);
    throw error;
  }
}

/**
 * Sensitive clinical profile for a client (sex, allergies, attending
 * physician, diet/special instructions). Stored in a separate, care-team-gated
 * sub-record — NOT on the directory doc — so the full roster stays readable to
 * any signed-in staff member (for the progress-note picker) while this PHI is
 * visible only to staff and the client's assigned care team. Feeds the MAR
 * header and any future allergy banners.
 */
export interface PatientClinical {
  sex?: string;
  allergies?: string;
  physicianName?: string; // standing attending / primary physician
  physicianPhone?: string;
  diet?: string; // diet / special instructions
  updatedAt?: unknown;
}

// Single well-known doc id under patients/{id}/clinical.
const CLINICAL_DOC_ID = 'profile';
const CLINICAL_FIELDS = ['sex', 'allergies', 'physicianName', 'physicianPhone', 'diet'] as const;

/**
 * Read a client's clinical profile. Returns null when none has been saved yet.
 */
export async function getPatientClinical(patientId: string): Promise<PatientClinical | null> {
  try {
    const ref = doc(db, 'patients', patientId, 'clinical', CLINICAL_DOC_ID);
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data() as PatientClinical) : null;
  } catch (error) {
    console.error('Error fetching patient clinical profile:', error);
    return null;
  }
}

/**
 * Create or update a client's clinical profile (merge). Only defined fields are
 * written, so a partially-loaded form can never blank out stored values.
 */
export async function savePatientClinical(patientId: string, data: PatientClinical): Promise<void> {
  try {
    const ref = doc(db, 'patients', patientId, 'clinical', CLINICAL_DOC_ID);
    const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
    for (const key of CLINICAL_FIELDS) {
      const value = data[key];
      if (value !== undefined) payload[key] = value;
    }
    await setDoc(ref, payload, { merge: true });
  } catch (error) {
    console.error('Error saving patient clinical profile:', error);
    throw error;
  }
}
