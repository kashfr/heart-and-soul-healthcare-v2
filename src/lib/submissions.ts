import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import type { Role } from './auth';
import { db } from './firebase';
import { hasAnyAbnormalVital, type VitalRangesOverride } from './vitalRanges';

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
  q21_oxygenSource: string;

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

  // RN co-signature (written by /api/admin/submissions/[id]/cosign).
  // Only populated for HHA/CNA/LPN notes after an RN has signed off.
  cosignedAt?: Timestamp | null;
  cosignedBy?: string;
  cosignedByName?: string;
  cosignedCredential?: string;
  cosignedSignature?: string;

  // Link to the canonical patient roster doc. Populated by:
  //   - the backfill script (matches existing notes to patients by name+DOB)
  //   - the form's auto-fill picker (when a nurse selects from roster)
  // When null/missing, the note was submitted with a free-text patient name
  // that didn't match the roster — care-team visibility doesn't extend to
  // these notes and they stay author-only.
  patientId?: string | null;
  /**
   * Admin marker: this note appeared in the maintenance link-review queue
   * and the admin explicitly chose to skip it. Keeps it out of subsequent
   * review queues. Independent of `patientId` — a note can be both
   * reviewed-and-skipped (no link possible) and reviewed-and-linked.
   */
  linkReviewed?: boolean;
}

export interface SubmissionSummary {
  id: string;
  clientName: string;
  nurseName: string;
  /** Author's clinical credential at submit time: HHA | CNA | LPN | RN. */
  credential: string;
  /** Author's Firebase uid (used by the cosign self-author guard + nurse-only filtering). */
  nurseId: string;
  diagnosis: string;
  dateOfService: string;
  submittedAt: Date | null;
  status: string;
  archivedAt: Date | null;
  nurseArchivedAt: Date | null;
  hasAbnormalVitals: boolean;
  hasIncident: boolean;
  physicianNotified: boolean;
  // --- RN co-signature (only populated for HHA/CNA/LPN notes once an RN signs off) ---
  cosignedAt: Date | null;
  cosignedByName: string;
  cosignedCredential: string;
}

export type ArchiveScope = 'staff' | 'nurse';
export type ArchiveView = 'active' | 'archived';

// Re-export so existing import sites (`import { needsCosign } from '@/lib/submissions'`)
// keep working. The helper lives in cosignClient.ts so its tests don't drag in
// the Firebase SDK that this module initializes.
export { needsCosign } from './cosignClient';

/**
 * Save a progress note form submission to Firestore.
 * Pass { nurseId } to link the note to the signed-in nurse (enables her
 * per-role filter on /admin/submissions).
 * Returns the document ID.
 */
export async function saveSubmission(
  data: ProgressNoteFormData,
  options?: { nurseId?: string; submissionId?: string }
): Promise<string> {
  try {
    const payload = {
      ...data,
      ...(options?.nurseId ? { nurseId: options.nurseId } : {}),
      submittedAt: serverTimestamp(),
      status: 'submitted',
    };
    // When a stable submissionId is supplied, write to that exact doc id so
    // a flaky-network retry overwrites the same note instead of creating a
    // duplicate. Callers guard against overwriting an already-written note
    // via submissionExists() first, so this is a fresh create in practice.
    if (options?.submissionId) {
      const docRef = doc(db, 'progressNotes', options.submissionId);
      await setDoc(docRef, payload);
      return docRef.id;
    }
    const notesRef = collection(db, 'progressNotes');
    const docRef = await addDoc(notesRef, payload);
    return docRef.id;
  } catch (error) {
    console.error('Error saving submission:', error);
    throw error;
  }
}

/**
 * Does a progress note with this exact doc id already exist? Used by the
 * form before writing so an idempotent retry (same submissionId) is treated
 * as an already-successful submission rather than re-written.
 */
export async function submissionExists(id: string): Promise<boolean> {
  if (!id) return false;
  const snap = await getDoc(doc(db, 'progressNotes', id));
  return snap.exists();
}

export interface DuplicateMatch {
  id: string;
  clientName: string;
  dateOfService: string;
  submittedAt: Date | null;
}

/**
 * Look for an already-submitted note for the same nurse + date of service +
 * patient (or typed client name when no patient is linked). Used to warn a
 * nurse who starts a brand-new note for a shift she already documented —
 * the deterministic-id retry path can't catch this because a new draft gets
 * a new submissionId. Pass `excludeId` so the note being written now (on a
 * retry) doesn't match itself.
 */
export async function findDuplicateSubmission(args: {
  nurseId?: string;
  dateOfService: string;
  patientId?: string;
  clientName?: string;
  excludeId?: string;
}): Promise<DuplicateMatch | null> {
  const { nurseId, dateOfService, patientId, clientName, excludeId } = args;
  if (!nurseId || !dateOfService) return null;

  const notesRef = collection(db, 'progressNotes');
  const constraints = [
    where('nurseId', '==', nurseId),
    where('q6_dateofService', '==', dateOfService),
  ];
  // Prefer the strong key (patientId); fall back to the typed client name
  // when the note isn't linked to a roster patient.
  if (patientId) {
    constraints.push(where('patientId', '==', patientId));
  } else if (clientName) {
    constraints.push(where('q3_clientName', '==', clientName));
  } else {
    return null;
  }

  const snapshot = await getDocs(query(notesRef, ...constraints, limit(2)));
  for (const d of snapshot.docs) {
    if (excludeId && d.id === excludeId) continue;
    const data = d.data();
    const submittedAt = data.submittedAt as Timestamp | null;
    return {
      id: d.id,
      clientName: String(data.q3_clientName || ''),
      dateOfService: String(data.q6_dateofService || ''),
      submittedAt: submittedAt ? submittedAt.toDate() : null,
    };
  }
  return null;
}

// "No incident" sentinel values from the radio options — treat as clean.
// Shared between getSubmissions and the care-team variant via the
// mapping helper below.
const NO_INCIDENT_VALUES = new Set([
  '',
  'none',
  'no',
  'no incidents',
  'no incident',
  'n/a',
  'na',
]);

// Map a single progressNotes Firestore doc to the dashboard's
// SubmissionSummary shape. Extracted so getSubmissions +
// getNurseAccessibleSubmissions agree on every derived field
// (hasIncident, hasAbnormalVitals, cosigned info, etc.). Update one
// place, not two.
function mapDocToSummary(
  d: {
    id: string;
    data(): Record<string, unknown>;
  },
  vitalsOverride?: VitalRangesOverride,
): SubmissionSummary {
  const data = d.data();
  const submittedAt = data.submittedAt as Timestamp | null;
  const archivedAt = data.archivedAt as Timestamp | null | undefined;
  const nurseArchivedAt = data.nurseArchivedAt as Timestamp | null | undefined;
  const incidentType = String(data.q56_incidents || '').trim();
  const incidentDetails = String(data.q57_incidentDetails || '').trim();
  const hasIncident = Boolean(
    incidentDetails || !NO_INCIDENT_VALUES.has(incidentType.toLowerCase())
  );
  const cosignedAt = data.cosignedAt as Timestamp | null | undefined;
  return {
    id: d.id,
    clientName: (data.q3_clientName as string) || '',
    nurseName: (data.q11_nurseName as string) || '',
    credential: (data.q12_credential as string) || '',
    nurseId: (data.nurseId as string) || '',
    diagnosis: (data.q10_primaryDiagnosis as string) || '',
    dateOfService: formatDateUS((data.q6_dateofService as string) || ''),
    submittedAt: submittedAt ? submittedAt.toDate() : null,
    status: (data.status as string) || 'submitted',
    archivedAt: archivedAt ? archivedAt.toDate() : null,
    nurseArchivedAt: nurseArchivedAt ? nurseArchivedAt.toDate() : null,
    hasAbnormalVitals: hasAnyAbnormalVital(data, vitalsOverride),
    hasIncident,
    physicianNotified: String(data.q52_physicianNotify || '').toLowerCase() === 'yes',
    cosignedAt: cosignedAt ? cosignedAt.toDate() : null,
    cosignedByName: (data.cosignedByName as string) || '',
    cosignedCredential: (data.cosignedCredential as string) || '',
  };
}

/**
 * Get progress note submissions, ordered by date descending.
 * Pass { nurseId } to scope the list to a single nurse (used by nurses viewing
 * their own notes; admin + supervisor call with no args to see everything).
 */
export async function getSubmissions(
  options?: { nurseId?: string; vitalsOverride?: VitalRangesOverride },
): Promise<SubmissionSummary[]> {
  try {
    const notesRef = collection(db, 'progressNotes');
    const q = options?.nurseId
      ? query(notesRef, where('nurseId', '==', options.nurseId))
      : query(notesRef, orderBy('submittedAt', 'desc'));
    const snapshot = await getDocs(q);

    const rows = snapshot.docs.map((d) => mapDocToSummary(d, options?.vitalsOverride));

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

// Firestore caps `in` queries at 30 values. We chunk patientIds at
// that boundary when querying the care-team's notes; anything above
// would fire as separate query batches.
const FIRESTORE_IN_LIMIT = 30;

/**
 * Get every progress note this nurse is allowed to read — her own
 * authored notes PLUS notes for any patient she's on the care team
 * for. Powers the nurse view of /admin/submissions in Phase 3.
 *
 * Three reads:
 *   1. patients where assignedNurseIds array-contains uid → collect
 *      patientIds she has team access to.
 *   2. progressNotes where nurseId == uid → her authored set
 *      (covers notes with NO patientId — those stay author-only).
 *   3. progressNotes where patientId in [chunk] → care-team notes,
 *      chunked at the Firestore `in` cap.
 *
 * Merged by doc id (set-based dedupe so notes she authored for a
 * care-team patient aren't double-counted), then sorted by
 * submittedAt descending client-side. Each row maps to the same
 * SubmissionSummary shape as getSubmissions — no new fields, so
 * downstream filters/scopes work unchanged.
 *
 * Aligned with the Firestore rule's allow-read disjuncts: any note
 * fetched here is either author-matched or care-team-matched.
 */
export async function getNurseAccessibleSubmissions(
  uid: string,
  options?: { vitalsOverride?: VitalRangesOverride },
): Promise<SubmissionSummary[]> {
  try {
    // Step 1: which patients is this nurse on the care team for?
    const patientsSnap = await getDocs(
      query(collection(db, 'patients'), where('assignedNurseIds', 'array-contains', uid)),
    );
    const teamPatientIds = patientsSnap.docs.map((d) => d.id);

    // Step 2: her own authored notes. Always runs even if step 1 is
    // empty — she has notes she wrote regardless of any patient links.
    const authoredSnap = await getDocs(
      query(collection(db, 'progressNotes'), where('nurseId', '==', uid)),
    );

    // Step 3: care-team notes via patientId. Skipped when step 1 was
    // empty (no team patients → no extra notes to fetch).
    const vitalsOverride = options?.vitalsOverride;
    const teamChunks: Array<ReturnType<typeof mapDocToSummary>[]> = [];
    for (let i = 0; i < teamPatientIds.length; i += FIRESTORE_IN_LIMIT) {
      const chunk = teamPatientIds.slice(i, i + FIRESTORE_IN_LIMIT);
      const snap = await getDocs(
        query(collection(db, 'progressNotes'), where('patientId', 'in', chunk)),
      );
      teamChunks.push(snap.docs.map((d) => mapDocToSummary(d, vitalsOverride)));
    }

    // Merge + dedupe by note id. A note authored by this nurse for a
    // care-team patient would otherwise appear in both step 2 and
    // step 3.
    const seen = new Set<string>();
    const merged: SubmissionSummary[] = [];
    for (const row of [...authoredSnap.docs.map((d) => mapDocToSummary(d, vitalsOverride)), ...teamChunks.flat()]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }

    // No composite index → sort client-side, same pattern as the
    // nurseId-filtered path of getSubmissions.
    merged.sort((a, b) => (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0));
    return merged;
  } catch (error) {
    console.error('Error fetching nurse-accessible submissions:', error);
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
