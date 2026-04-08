import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  query,
  orderBy,
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
  createdAt?: unknown;
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
 * Add a new patient to Firestore
 * Returns the new document ID
 */
export async function addPatient(patient: Patient): Promise<string> {
  try {
    const patientsRef = collection(db, 'patients');
    const docRef = await addDoc(patientsRef, {
      ...patient,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error adding patient:', error);
    throw error;
  }
}

/**
 * Update an existing patient
 */
export async function updatePatient(id: string, data: Partial<Patient>): Promise<void> {
  try {
    const patientRef = doc(db, 'patients', id);
    const { id: _id, createdAt: _ca, ...updateData } = data;
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
