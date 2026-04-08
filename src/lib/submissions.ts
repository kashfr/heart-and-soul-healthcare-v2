import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
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

  // Page 3: System Assessments
  q30_neuroAssessment: string;
  q30_neuroNotes: string;
  q31_cardioAssessment: string;
  q31_cardioNotes: string;
  q32_respAssessment: string;
  q32_respNotes: string;
  q33_giAssessment: string;
  q33_giNotes: string;
  q34_guAssessment: string;
  q34_guNotes: string;
  q35_reproAssessment: string;
  q35_reproNotes: string;
  q36_skinAssessment: string;
  q36_skinNotes: string;
  q37_behaveAssessment: string;
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
  q56_incidents: string;
  q57_incidentDetails: string;
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
 * Returns the document ID.
 */
export async function saveSubmission(data: ProgressNoteFormData): Promise<string> {
  try {
    const notesRef = collection(db, 'progressNotes');
    const docRef = await addDoc(notesRef, {
      ...data,
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
 * Get all progress note submissions, ordered by date descending.
 */
export async function getSubmissions(): Promise<SubmissionSummary[]> {
  try {
    const notesRef = collection(db, 'progressNotes');
    const q = query(notesRef, orderBy('submittedAt', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((d) => {
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

  // Determine system statuses
  function systemStatus(assessment: string, defaultNormal: string): string {
    if (!assessment) return 'WNL';
    const values = assessment.split(',').map((v) => v.trim());
    // If only the "normal" value is checked, it's WNL
    if (values.length === 1 && values[0].toLowerCase().includes(defaultNormal.toLowerCase())) {
      return 'WNL';
    }
    // If any non-normal values, it's abnormal
    const hasAbnormal = values.some(
      (v) => !v.toLowerCase().includes(defaultNormal.toLowerCase())
    );
    return hasAbnormal ? 'ABNORMAL' : 'WNL';
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

  // Build incidents string
  let incidents = form.q56_incidents || 'No incidents';
  if (form.q57_incidentDetails) {
    incidents += `: ${form.q57_incidentDetails}`;
  }

  // Build follow-up string
  let followUp = form.q58_followup || 'None';
  if (form.q59_followupDetails) {
    followUp += `. ${form.q59_followupDetails}`;
  }

  return {
    client: {
      name: form.q3_clientName || '',
      dob: formatDateUS(form.q4_dateofBirth),
      age: parseInt(form.q5_ageYears || '0', 10),
      diagnosis: form.q10_primaryDiagnosis || '',
      address,
    },
    shift: {
      dateOfService: formatDateUS(form.q6_dateofService),
      startTime: form.q7_shiftStart || '',
      endTime: form.q8_shiftEnd || '',
      totalHours: form.q9_totalHours || '',
    },
    nurse: {
      name: form.q11_nurseName || '',
      credential: form.q12_credential || '',
    },
    status: {
      alertness: form.q13_orientationLevel || '',
      orientation: form.q14_behavior || '',
      appearance: form.q15_appearance || '',
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
        status: systemStatus(form.q30_neuroAssessment, 'alert and oriented'),
        notes: [form.q30_neuroAssessment, form.q30_neuroNotes].filter(Boolean).join('. '),
      },
      {
        system: 'Cardiovascular',
        status: systemStatus(form.q31_cardioAssessment, 'heart rate regular'),
        notes: [form.q31_cardioAssessment, form.q31_cardioNotes].filter(Boolean).join('. '),
      },
      {
        system: 'Respiratory',
        status: systemStatus(form.q32_respAssessment, 'clear bilaterally'),
        notes: [form.q32_respAssessment, form.q32_respNotes].filter(Boolean).join('. '),
      },
      {
        system: 'Gastrointestinal',
        status: systemStatus(form.q33_giAssessment, 'appetite adequate'),
        notes: [form.q33_giAssessment, form.q33_giNotes].filter(Boolean).join('. '),
      },
      {
        system: 'Genitourinary',
        status: systemStatus(form.q34_guAssessment, 'normal urination'),
        notes: [form.q34_guAssessment, form.q34_guNotes].filter(Boolean).join('. '),
      },
      {
        system: 'Reproductive',
        status: systemStatus(form.q35_reproAssessment, 'no abnormalities'),
        notes: [form.q35_reproAssessment, form.q35_reproNotes].filter(Boolean).join('. '),
      },
      {
        system: 'Skin/Integumentary',
        status: systemStatus(form.q36_skinAssessment, 'intact'),
        notes: [form.q36_skinAssessment, form.q36_skinNotes].filter(Boolean).join('. '),
      },
      {
        system: 'Behavioral/Emotional',
        status: systemStatus(form.q37_behaveAssessment, 'calm'),
        notes: [form.q37_behaveAssessment, form.q37_behaveNotes].filter(Boolean).join('. '),
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
      incidents,
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
