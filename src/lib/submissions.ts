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
import { hasAnyAbnormalVital } from './vitalRanges';

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
  diagnosis: string;
  dateOfService: string;
  submittedAt: Date | null;
  status: string;
  archivedAt: Date | null;
  nurseArchivedAt: Date | null;
  hasAbnormalVitals: boolean;
  hasIncident: boolean;
  physicianNotified: boolean;
}

export type ArchiveScope = 'staff' | 'nurse';
export type ArchiveView = 'active' | 'archived';

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
      const archivedAt = data.archivedAt as Timestamp | null | undefined;
      const nurseArchivedAt = data.nurseArchivedAt as Timestamp | null | undefined;
      const incidentType = String(data.q56_incidents || '').trim();
      const incidentDetails = String(data.q57_incidentDetails || '').trim();
      // "No incident" sentinel values from the radio options — treat as clean.
      const NO_INCIDENT_VALUES = new Set([
        '',
        'none',
        'no',
        'no incidents',
        'no incident',
        'n/a',
        'na',
      ]);
      const hasIncident = Boolean(
        incidentDetails || !NO_INCIDENT_VALUES.has(incidentType.toLowerCase())
      );
      return {
        id: d.id,
        clientName: data.q3_clientName || '',
        nurseName: data.q11_nurseName || '',
        credential: data.q12_credential || '',
        diagnosis: data.q10_primaryDiagnosis || '',
        dateOfService: formatDateUS(data.q6_dateofService || ''),
        submittedAt: submittedAt ? submittedAt.toDate() : null,
        status: data.status || 'submitted',
        archivedAt: archivedAt ? archivedAt.toDate() : null,
        nurseArchivedAt: nurseArchivedAt ? nurseArchivedAt.toDate() : null,
        hasAbnormalVitals: hasAnyAbnormalVital(data),
        hasIncident,
        physicianNotified: String(data.q52_physicianNotify || '').toLowerCase() === 'yes',
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
  'archivedAt',
  'archivedBy',
  'nurseArchivedAt',
  'nurseArchivedBy',
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
 * Archive (staff scope) or personally archive (nurse scope) a batch of notes.
 * Writes an audit entry to each note's editHistory subcollection recording
 * who archived/restored and under which scope.
 */
export async function setSubmissionsArchive(
  ids: string[],
  scope: ArchiveScope,
  action: 'archive' | 'restore',
  editor: SubmissionEditor
): Promise<void> {
  if (ids.length === 0) return;
  const batch = writeBatch(db);
  const timestamp = serverTimestamp();
  const fieldAt = scope === 'staff' ? 'archivedAt' : 'nurseArchivedAt';
  const fieldBy = scope === 'staff' ? 'archivedBy' : 'nurseArchivedBy';

  for (const id of ids) {
    const docRef = doc(db, 'progressNotes', id);
    batch.update(docRef, {
      [fieldAt]: action === 'archive' ? timestamp : null,
      [fieldBy]: action === 'archive' ? editor.uid : null,
      lastUpdatedAt: timestamp,
    });
    const historyRef = doc(collection(docRef, 'editHistory'));
    batch.set(historyRef, {
      editedBy: editor.uid,
      editedByName: editor.displayName || '',
      editedByRole: editor.role,
      editedAt: timestamp,
      changes: {},
      action: `${scope}:${action}`,
    });
  }
  await batch.commit();
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

// toProgressNoteData removed: ProgressNotePDF now reads raw form data
// directly, so we don't need a pre-transform step. Batch export and the PDF
// API route both pass ProgressNoteFormData straight to the renderer.
