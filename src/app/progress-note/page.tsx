'use client';

import { useState, useEffect, useRef } from 'react';
import { getPatients, addPatient, removePatient, type Patient } from '@/lib/patients';
import { saveSubmission, type ProgressNoteFormData } from '@/lib/submissions';
import styles from './page.module.css';
import PatientSearch from './components/PatientSearch';
import SettingsPanel from './components/SettingsPanel';
import FormPageOne from './components/FormPageOne';
import FormPageTwo from './components/FormPageTwo';
import FormPageThree from './components/FormPageThree';
import FormPageFour from './components/FormPageFour';
import FormPageFive from './components/FormPageFive';
import FormPageSix from './components/FormPageSix';
import FormPageSeven from './components/FormPageSeven';

const TOTAL_PAGES = 7;

export default function ProgressNotePage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [firebaseLoaded, setFirebaseLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Load patients from Firebase on mount
  useEffect(() => {
    const loadPatients = async () => {
      try {
        setFirebaseLoaded(true);
        const data = await getPatients();
        setPatients(data);
      } catch (error) {
        console.error('Failed to load patients:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPatients();
  }, []);

  const handleAddPatient = async (patient: Patient) => {
    try {
      const newId = await addPatient(patient);
      setPatients([...patients, { ...patient, id: newId }]);
    } catch (error) {
      console.error('Failed to add patient:', error);
      alert('Failed to add patient. Please try again.');
    }
  };

  const handleRemovePatient = async (patientId: string) => {
    if (!window.confirm('Are you sure you want to remove this patient?')) {
      return;
    }
    try {
      await removePatient(patientId);
      setPatients(patients.filter(p => p.id !== patientId));
    } catch (error) {
      console.error('Failed to remove patient:', error);
      alert('Failed to remove patient. Please try again.');
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      window.scrollTo(0, 0);
    }
  };

  const handleNextPage = () => {
    if (currentPage < TOTAL_PAGES) {
      setCurrentPage(currentPage + 1);
      window.scrollTo(0, 0);
    }
  };

  // Find which page a form element belongs to (1-7)
  const getFieldPage = (element: HTMLElement): number => {
    // Walk up to find the page wrapper div
    let parent = element.parentElement;
    while (parent && parent !== formRef.current) {
      // The page wrapper divs are direct children of the form
      if (parent.parentElement === formRef.current && parent.style.display !== undefined) {
        // Find its index among siblings
        const siblings = Array.from(formRef.current!.children);
        const pageIndex = siblings.indexOf(parent);
        // Offset by 1 for the hidden iframe, and 1 for 0-based index
        if (pageIndex >= 1 && pageIndex <= 7) return pageIndex;
      }
      parent = parent.parentElement;
    }
    return 1;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formRef.current) return;

    // Custom validation: find all required fields that are empty
    const requiredFields = formRef.current.querySelectorAll(
      'input[required], select[required], textarea[required]'
    );

    for (const field of requiredFields) {
      const el = field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

      // Skip hidden inputs
      if (el.type === 'hidden') continue;

      if (!el.value || el.value.trim() === '') {
        // Find the label for this field
        const fieldId = el.id;
        const label = fieldId ? formRef.current!.querySelector(`label[for="${fieldId}"]`) : null;
        const parentLabel = el.closest('div')?.querySelector('label');
        const rawLabel = label?.textContent || parentLabel?.textContent || el.name;
        const fieldName = rawLabel.replace(/\s*\*\s*/g, '').replace(/\s*⚠\s*/g, '').trim();

        // Navigate to the page containing this field
        const page = getFieldPage(el);
        setCurrentPage(page);

        // Wait for page to render, then focus and highlight
        setTimeout(() => {
          el.style.border = '2px solid #c62828';
          el.style.background = '#fff5f5';
          el.focus();
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);

        alert(`Please fill in "${fieldName}" on page ${page} before submitting.`);
        return;
      }
    }

    try {
      setSubmitting(true);

      // Collect all form data
      const formData = new FormData(formRef.current);

      // Helper to get a single text value
      const getVal = (name: string): string => {
        return (formData.get(name) as string) || '';
      };

      // Helper to get all checked checkbox values as comma-separated string
      const getChecked = (name: string): string => {
        const values = formData.getAll(name) as string[];
        return values.join(', ');
      };

      // Helper to get radio value (DeselectableRadio uses a global store,
      // so query the DOM for the checked radio)
      const getRadio = (name: string): string => {
        const checked = formRef.current!.querySelector(
          `input[type="radio"][name="${name}"]:checked`
        ) as HTMLInputElement | null;
        return checked?.value || '';
      };

      const submission: ProgressNoteFormData = {
        // Page 1: Client Information
        q3_clientName: getVal('q3_clientName'),
        q4_dateofBirth: getVal('q4_dateofBirth'),
        q5_ageYears: getVal('q5_ageYears'),
        q10_primaryDiagnosis: getVal('q10_primaryDiagnosis'),
        q200_addr_line1: getVal('q200_addr_line1'),
        q200_city: getVal('q200_city'),
        q200_state: getVal('q200_state'),
        q200_postal: getVal('q200_postal'),

        // Page 1: Shift Information
        q6_dateofService: getVal('q6_dateofService'),
        q7_shiftStart: getVal('q7_shiftStart'),
        q8_shiftEnd: getVal('q8_shiftEnd'),
        q9_totalHours: getVal('q9_totalHours'),

        // Page 1: Nurse / Caregiver
        q11_nurseName: getVal('q11_nurseName'),
        q12_credential: getVal('q12_credential'),

        // Page 2: Client Status
        q13_orientationLevel: getRadio('q13_orientationLevel'),
        q14_behavior: getRadio('q14_behavior'),
        q15_appearance: getChecked('q15_appearance'),

        // Page 2: Vital Signs
        q16_temperature: getVal('q16_temperature'),
        q17_bloodPressure: getVal('q17_bloodPressure'),
        q18_pulse: getVal('q18_pulse'),
        q19_respiration: getVal('q19_respiration'),
        q20_oxygenSaturation: getVal('q20_oxygenSaturation'),
        q21_bloodGlucose: getVal('q21_bloodGlucose'),

        // Page 2: Additional Observations
        q22_additionalObservations: getVal('q22_additionalObservations'),

        // Page 3: Observations
        q23_activityLevel: getRadio('q23_activityLevel'),
        q24_painLevel: getVal('q24_painLevel'),
        q25_painLocation: getVal('q25_painLocation'),
        q26_painDescription: getVal('q26_painDescription'),

        // Page 3: System Assessments
        q30_neuroAssessment: getChecked('q30_neuroAssessment'),
        q30_neuroNotes: getVal('q30_neuroNotes'),
        q31_cardioAssessment: getChecked('q31_cardioAssessment'),
        q31_cardioNotes: getVal('q31_cardioNotes'),
        q32_respAssessment: getChecked('q32_respAssessment'),
        q32_respNotes: getVal('q32_respNotes'),
        q33_giAssessment: getChecked('q33_giAssessment'),
        q33_giNotes: getVal('q33_giNotes'),
        q34_guAssessment: getChecked('q34_guAssessment'),
        q34_guNotes: getVal('q34_guNotes'),
        q35_reproAssessment: getChecked('q35_reproAssessment'),
        q35_reproNotes: getVal('q35_reproNotes'),
        q36_skinAssessment: getChecked('q36_skinAssessment'),
        q36_skinNotes: getVal('q36_skinNotes'),
        q37_behaveAssessment: getChecked('q37_behaveAssessment'),
        q37_behaveNotes: getVal('q37_behaveNotes'),

        // Page 4: Interventions
        q38_interventions: getChecked('q38_interventions'),
        q39_interventionDetails: getVal('q39_interventionDetails'),
        q40_skillJustification: getVal('q40_skillJustification'),
        q41_patientEduc: getChecked('q41_patientEduc'),
        q42_patientResponse: getVal('q42_patientResponse'),

        // Page 5: Medications & Treatments
        q43_medicationsGiven: getVal('q43_medicationsGiven'),
        q44_medicationCompliance: getRadio('q44_medicationCompliance'),
        q45_medicationSideEffects: getVal('q45_medicationSideEffects'),
        q46_treatments: getChecked('q46_treatments'),
        q47_equipment: getChecked('q47_equipment'),
        q48_equipmentIssues: getVal('q48_equipmentIssues'),
        q49_homeEnvironment: getChecked('q49_homeEnvironment'),
        q50_caregiverObs: getVal('q50_caregiverObs'),

        // Page 6: Communication
        q51_communication: getVal('q51_communication'),
        q52_physicianNotify: getRadio('q52_physicianNotify'),
        q53_physicianName: getVal('q53_physicianName'),
        q54_notificationTime: getVal('q54_notificationTime'),
        q55_physicianOrders: getVal('q55_physicianOrders'),
        q56_incidents: getRadio('q56_incidents'),
        q57_incidentDetails: getVal('q57_incidentDetails'),
        q58_followup: getChecked('q58_followup'),
        q59_followupDetails: getVal('q59_followupDetails'),
        q60_nextShiftPlan: getVal('q60_nextShiftPlan'),

        // Page 7: Signature & Completion
        q61_signature: getVal('q61_signature'),
        q62_shiftEndDate: getVal('q62_shiftEndDate'),
        q62_shiftEndTime: getVal('q62_shiftEndTime'),
        q63_clinicalSummary: getVal('q63_clinicalSummary'),
        q64_carePlanStatus: getRadio('q64_carePlanStatus'),
        q65_certification: getChecked('q65_certification'),
        q66_additionalNotes: getVal('q66_additionalNotes'),
      };

      const docId = await saveSubmission(submission);

      alert(`Progress note submitted successfully!\nSubmission ID: ${docId}`);
      formRef.current.reset();
      setCurrentPage(1);
      window.scrollTo(0, 0);
    } catch (error) {
      console.error('Submission error:', error);
      alert('Failed to submit progress note. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!firebaseLoaded) {
    return (
      <div className={`${styles.container} ${styles.wrap}`}>
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  const ref = formRef as React.RefObject<HTMLFormElement>;
  const pageStyle = (page: number) => ({
    display: currentPage === page ? 'block' : 'none',
  });

  return (
    <div className={`${styles.container} ${styles.wrap}`}>
      <div className={styles.header}>
        <h1>Heart and Soul Home Health - Progress Note</h1>
        <p>Nurse Documentation Form</p>
      </div>

      <div className={styles.headerControls}>
        <PatientSearch patients={patients} formRef={ref} />
        <button
          className={styles.settingsBtn}
          onClick={() => setShowSettings(!showSettings)}
          title="Patient Management"
        >
          ⚙️ Settings
        </button>
      </div>

      <div className={styles.progressBar} id="progressBar">
        {Array.from({ length: TOTAL_PAGES }).map((_, index) => (
          <div
            key={index + 1}
            className={`${styles.progressDot} ${
              index + 1 === currentPage ? styles.active : ''
            } ${index + 1 < currentPage ? styles.completed : ''}`}
            onClick={() => {
              setCurrentPage(index + 1);
              window.scrollTo(0, 0);
            }}
          />
        ))}
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className={styles.form} noValidate>
        <div style={pageStyle(1)}><FormPageOne formRef={ref} /></div>
        <div style={pageStyle(2)}><FormPageTwo formRef={ref} /></div>
        <div style={pageStyle(3)}><FormPageThree formRef={ref} /></div>
        <div style={pageStyle(4)}><FormPageFour formRef={ref} /></div>
        <div style={pageStyle(5)}><FormPageFive formRef={ref} /></div>
        <div style={pageStyle(6)}><FormPageSix formRef={ref} /></div>
        <div style={pageStyle(7)}><FormPageSeven formRef={ref} /></div>

        <div className={styles.navigationControls}>
          <button
            type="button"
            onClick={handlePreviousPage}
            disabled={currentPage === 1}
            className={styles.navBtn}
          >
            ← Previous
          </button>

          {currentPage === TOTAL_PAGES ? (
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNextPage}
              disabled={currentPage === TOTAL_PAGES}
              className={styles.navBtn}
            >
              Next →
            </button>
          )}
        </div>
      </form>

      {showSettings && (
        <SettingsPanel
          patients={patients}
          onAddPatient={handleAddPatient}
          onRemovePatient={handleRemovePatient}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
