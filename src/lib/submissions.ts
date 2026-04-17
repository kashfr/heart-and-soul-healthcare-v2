import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import type { Role } from './auth';
import { db } from './firebase';

/**
 * All form fields from the 7-page progress note form.
 */
export interface ProgressNoteFormData {
  // Page 1: Client Information
  q3_clientName: string;
  q4_dateofBirth: string;
  q5_ageYears: string;
  q10_primaryDiagnosis: string;
  q200_addr_line1: string;
  q200_city: string;
  q200_state: string;
  q200_postal: string;

  // Page 1: Shift Information
  q6_dateofService: string;
  q7_shiftStart: string;
  q8_shiftEnd: string;
  q9_totalHours: string;

  // Page 1: Nurse / Caregiver
  q11_nurseName: string;
  q12_credential: string;

  // Page 2: Client Status
  q13_orientationLevel: string;
  q14_behavior: string;
  q15_appearance: string;

  // Page 2: Vital Signs
  q16_temperature: string;
  q17_bloodPressure: string;
  q18_pulse: string;
  q19_respiration: string;
  q20_oxygenSaturation: string;
  q21_bloodGlucose: string;

  // Page 2: Additional Observations
  q22_additionalObservations: string;

  // Page 3: Observations During Shift
  q23_activityLevel: string;
  q24_painLevel: string;
  q25_painLocation: string;
  q26_painDescription: string;

  // Page 3: System Assessments (status fields set via DeselectableRadio, accessed as dynamic keys)
  q30_neuroNotes: string;
  q31_cardioNotes: string;
  q32_respNotes: string;
  q33_giNotes: string;
  q34_guNotes: string;
  q35_reproNotes: string;
  q36_skinNotes: string;
  q37_behaveNotes: string;

  // Page 4: Skilled Nursing Interventions
  q38_interventions: string;
  q39_interventionDetails: string;
  q40_skillJustification: string;
  q41_patientEduc: string;
  q42_patientResponse: string;

  // Page 5: Medications & Treatments
  q43_medicationsGiven: string;
  q44_medicationCompliance: string;
  q45_medicationSideEffects: string;
  q46_treatments: string;
  q47_equipment: string;
  q48_equipmentIssues: string;
  q49_homeEnvironment: string;
  q50_caregiverObs: string;

  // Page 6: Communication
  q51_communication: string;
  q52_physicianNotify: string;
  q53_physicianName: string;
  q54_notificationTime: string;
  q55_physicianOrders: string;
  q58_followup: string;
  q59_followupDetails: string;
  q60_nextShiftPlan: string;

  // Page 7: Signature & Completion
  q61_signature: string;
  q62_shiftEndDate: string;
  q62_shiftEndTime: string;
  q63_clinicalSummary: string;
  q64_carePlanStatus: string;
  q65_certification: string;
  q66_additionalNotes: string;

  // Metadata
  submittedAt?: Timestamp | ReturnType<typeof serverTimestamp>;
  status?: string;
}

export interface SubmissionSummary {
  id: string;
  clientName: string;
  nurseName: string;
  credential: string;
  dateOfService: string;
  submittedAt: Date | null;
  status: string;
}

/**
 * Save a progress note form submission to Firestore.
 * Pass { nurseId } to link the note to the signed-in nurse (enables her
 * per-role filter on /admin/submissions).
 * Returns the document ID.
 */
export async function saveSubmission(
  data: ProgressNoteFormData,
  options?: { nurseId?: string }
): Promise<string> {
  try {
    const notesRef = collection(db, 'progressNotes');
    const docRef = await addDoc(notesRef, {
      ...data,
      ...(options?.nurseId ? { nurseId: options.nurseId } : {}),
      submittedAt: serverTimestamp(),
      status: 'submitted',
    });
    return docRef.id;
  } catch (error) {
    console.error('Error saving submission:', error);
    throw error;
  }
}

/**
 * Get progress note submissions, ordered by date descending.
 * Pass { nurseId } to scope the list to a single nurse (used by nurses viewing
 * their own notes; admin + supervisor call with no args to see everything).
 */
export async function getSubmissions(options?: { nurseId?: string }): Promise<SubmissionSummary[]> {
  try {
    const notesRef = collection(db, 'progressNotes');
    const q = options?.nurseId
      ? query(notesRef, where('nurseId', '==', options.nurseId))
      : query(notesRef, orderBy('submittedAt', 'desc'));
    const snapshot = await getDocs(q);

    const rows = snapshot.docs.map((d) => {
      const data = d.data();
      const submittedAt = data.submittedAt as Timestamp | null;
      return {
        id: d.id,
        clientName: data.q3_clientName || '',
        nurseName: data.q11_nurseName || '',
        credential: data.q12_credential || '',
        dateOfService: formatDateUS(data.q6_dateofService || ''),
        submittedAt: submittedAt ? submittedAt.toDate() : null,
        status: data.status || 'submitted',
      };
    });

    // When filtering by nurseId we skip the orderBy (avoids needing a composite
    // index) and sort client-side instead.
    if (options?.nurseId) {
      rows.sort((a, b) => (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0));
    }
    return rows;
  } catch (error) {
    console.error('Error fetching submissions:', error);
    return [];
  }
}

/**
 * Get a single progress note submission by ID.
 */
export async function getSubmission(id: string): Promise<ProgressNoteFormData | null> {
  try {
    const docRef = doc(db, 'progressNotes', id);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    return snapshot.data() as ProgressNoteFormData;
  } catch (error) {
    console.error('Error fetching submission:', error);
    return null;
  }
}

export interface SubmissionEditor {
  uid: string;
  displayName?: string | null;
  role: Role;
}

/**
 * Fields that shouldn't count as "edits" (metadata / system-managed).
 */
const SKIP_DIFF_FIELDS = new Set([
  'submittedAt',
  'lastUpdatedAt',
  'status',
  'nurseId',
  'claimedAt',
  'claimedBy',
]);

function normalizeForDiff(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * Update a progress note submission. When an `editor` is supplied, the update
 * is batched with a write to `progressNotes/{id}/editHistory` recording who
 * changed what and when — this is the audit trail supervisors review.
 */
export async function updateSubmission(
  id: string,
  data: Partial<ProgressNoteFormData>,
  editor?: SubmissionEditor
): Promise<void> {
  try {
    const docRef = doc(db, 'progressNotes', id);

    if (editor) {
      const existingSnap = await getDoc(docRef);
      if (!existingSnap.exists()) {
        throw new Error('Submission not found.');
      }
      const oldData = existingSnap.data() as Record<string, unknown>;
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const [key, newVal] of Object.entries(data)) {
        if (SKIP_DIFF_FIELDS.has(key)) continue;
        const oldVal = oldData[key];
        if (normalizeForDiff(oldVal) !== normalizeForDiff(newVal)) {
          changes[key] = { from: oldVal ?? null, to: newVal ?? null };
        }
      }

      const batch = writeBatch(db);
      batch.update(docRef, {
        ...data,
        lastUpdatedAt: serverTimestamp(),
      });
      if (Object.keys(changes).length > 0) {
        const historyRef = doc(collection(docRef, 'editHistory'));
        batch.set(historyRef, {
          editedBy: editor.uid,
          editedByName: editor.displayName || '',
          editedByRole: editor.role,
          editedAt: serverTimestamp(),
          changes,
        });
      }
      await batch.commit();
      return;
    }

    // Legacy path: caller didn't supply editor info. Plain update, no audit entry.
    await updateDoc(docRef, {
      ...data,
      lastUpdatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating submission:', error);
    throw error;
  }
}

export interface EditHistoryEntry {
  id: string;
  editedBy: string;
  editedByName: string;
  editedByRole: Role;
  editedAt: Date | null;
  changes: Record<string, { from: unknown; to: unknown }>;
}

/**
 * Fetch the edit history for a progress note, most recent first.
 * Visible to staff (admin/supervisor) per Firestore rules.
 */
export async function getEditHistory(id: string): Promise<EditHistoryEntry[]> {
  try {
    const historyRef = collection(db, 'progressNotes', id, 'editHistory');
    const q = query(historyRef, orderBy('editedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      const editedAt = data.editedAt as Timestamp | null;
      return {
        id: d.id,
        editedBy: data.editedBy || '',
        editedByName: data.editedByName || '',
        editedByRole: (data.editedByRole || 'nurse') as Role,
        editedAt: editedAt ? editedAt.toDate() : null,
        changes: (data.changes || {}) as Record<string, { from: unknown; to: unknown }>,
      };
    });
  } catch (error) {
    console.error('Error fetching edit history:', error);
    return [];
  }
}

/**
 * Delete a progress note submission.
 */
export async function deleteSubmission(id: string): Promise<void> {
  try {
    const docRef = doc(db, 'progressNotes', id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting submission:', error);
    throw error;
  }
}

/**
 * Convert YYYY-MM-DD to MM/DD/YYYY (US format)
 */
function formatDateUS(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[1]}/${parts[2]}/${parts[0]}`;
  }
  return dateStr; // Return as-is if not in expected format
}

/**
 * Convert raw ProgressNoteFormData into the ProgressNoteData structure
 * used by the PDF generator.
 */
export function toProgressNoteData(
  form: ProgressNoteFormData
): import('@/lib/pdf/ProgressNotePDF').ProgressNoteData {
  // Build address
  const addressParts = [
    form.q200_addr_line1,
    form.q200_city,
    form.q200_state,
    form.q200_postal,
  ].filter(Boolean);
  const address = addressParts.join(', ');

  // System assessment status — the form now uses DeselectableRadio with WNL/Abnormal values
  function systemStatus(statusValue: string): string {
    if (!statusValue) return 'WNL';
    return statusValue === 'Abnormal' ? 'ABNORMAL' : 'WNL';
  }

  // Build pain assessment string
  const painParts: string[] = [];
  if (form.q24_painLevel) painParts.push(`Level: ${form.q24_painLevel}/10`);
  if (form.q25_painLocation) painParts.push(`Location: ${form.q25_painLocation}`);
  if (form.q26_painDescription) painParts.push(form.q26_painDescription);
  const painAssessment = painParts.join('; ') || 'No pain reported';

  // Build physician notification string
  let physicianNotified = form.q52_physicianNotify || 'No notification required';
  if (form.q53_physicianName) {
    physicianNotified += ` - Dr. ${form.q53_physicianName}`;
    if (form.q54_notificationTime) physicianNotified += ` at ${form.q54_notificationTime}`;
  }
  if (form.q55_physicianOrders) {
    physicianNotified += `. Orders: ${form.q55_physicianOrders}`;
  }

  // Build follow-up string
  let followUp = form.q58_followup || 'None';
  if (form.q59_followupDetails) {
    followUp += `. ${form.q59_followupDetails}`;
  }

  // Access dynamic fields from the form data (radio/checkbox values merged at submit time)
  const formAny = form as unknown as Record<string, string>;

  return {
    client: {
      name: form.q3_clientName || '',
      dob: formatDateUS(form.q4_dateofBirth),
      age: form.q5_ageYears || '0',
      diagnosis: form.q10_primaryDiagnosis || '',
      address,
    },
    shift: {
      dateOfService: formatDateUS(form.q6_dateofService),
      startTime: form.q7_shiftStart || '',
      endTime: form.q62_shiftEndTime || form.q8_shiftEnd || '',
      totalHours: form.q9_totalHours || '',
    },
    nurse: {
      name: form.q11_nurseName || '',
      credential: form.q12_credential || '',
    },
    status: {
      alertness: formAny.q13_alertnessLevel || '',
      orientation: formAny.q13_orientationLevel || '',
      appearance: formAny.q15_appearance || '',
    },
    vitals: {
      temp: form.q16_temperature || '',
      bp: form.q17_bloodPressure || '',
      pulse: form.q18_pulse || '',
      resp: form.q19_respiration || '',
      spo2: form.q20_oxygenSaturation || '',
      bloodGlucose: form.q21_bloodGlucose || '',
    },
    observations: {
      activity: form.q23_activityLevel || '',
      pain: painAssessment,
    },
    systems: [
      {
        system: 'Neurological',
        status: systemStatus(formAny.q30_neuroStatus),
        notes: [formAny.q30_neuroStatus, form.q30_neuroNotes].filter(Boolean).join('. '),
      },
      {
        system: 'Cardiovascular',
        status: systemStatus(formAny.q31_cardioStatus),
        notes: [formAny.q31_cardioStatus, form.q31_cardioNotes].filter(Boolean).join('. '),
      },
      {
        system: 'Respiratory',
        status: systemStatus(formAny.q32_respStatus),
        notes: [formAny.q32_respStatus, form.q32_respNotes].filter(Boolean).join('. '),
      },
      {
        system: 'Gastrointestinal',
        status: systemStatus(formAny.q33_giStatus),
        notes: [formAny.q33_giStatus, form.q33_giNotes].filter(Boolean).join('. '),
      },
      {
        system: 'Genitourinary',
        status: systemStatus(formAny.q34_guStatus),
        notes: [formAny.q34_guStatus, form.q34_guNotes].filter(Boolean).join('. '),
      },
      {
        system: 'Reproductive',
        status: systemStatus(formAny.q35_reproStatus),
        notes: [formAny.q35_reproStatus, form.q35_reproNotes].filter(Boolean).join('. '),
      },
      {
        system: 'Skin/Integumentary',
        status: systemStatus(formAny.q36_skinStatus),
        notes: [formAny.q36_skinStatus, form.q36_skinNotes].filter(Boolean).join('. '),
      },
      {
        system: 'Behavioral/Emotional',
        status: systemStatus(formAny.q37_behaveStatus),
        notes: [formAny.q37_behaveStatus, form.q37_behaveNotes].filter(Boolean).join('. '),
      },
    ],
    interventions: {
      performed: form.q38_interventions || '',
      justification: form.q40_skillJustification || '',
      education: form.q41_patientEduc || '',
      patientResponse: form.q42_patientResponse || '',
    },
    medications: {
      given: form.q43_medicationsGiven || '',
      compliance: form.q44_medicationCompliance || '',
      sideEffects: form.q45_medicationSideEffects || 'None noted',
      treatments: form.q46_treatments || '',
      equipment: form.q47_equipment || '',
    },
    communication: {
      physicianNotified,
      followUp,
      nextShiftPlan: form.q60_nextShiftPlan || '',
    },
    signature: {
      printedName: form.q11_nurseName || '',
      credential: form.q12_credential || '',
      dateSigned: formatDateUS(form.q62_shiftEndDate),
      clinicalSummary: form.q63_clinicalSummary || '',
      signatureImage: form.q61_signature || '',
    },
  };
}
