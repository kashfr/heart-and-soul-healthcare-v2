'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getPatients, addPatient, updatePatient, removePatient, type Patient } from '@/lib/patients';
import { saveSubmission, getSubmission, updateSubmission, type ProgressNoteFormData } from '@/lib/submissions';
import { setRadio } from './components/DeselectableRadio';
import styles from './page.module.css';
import SettingsPanel from './components/SettingsPanel';
import FormPageOne from './components/FormPageOne';
import FormPageTwo from './components/FormPageTwo';
import FormPageThree from './components/FormPageThree';
import FormPageFour from './components/FormPageFour';
import FormPageFive from './components/FormPageFive';
import FormPageSix from './components/FormPageSix';
import FormPageSeven from './components/FormPageSeven';

type CredentialTier = 'HHA' | 'CNA' | 'LPN' | 'RN' | '';

function getActivePages(credential: CredentialTier): number[] {
  switch (credential) {
    case 'HHA':
      return [1, 2, 3, 4, 6, 7]; // Skip page 5 (skilled nursing)
    case 'CNA':
      return [1, 2, 3, 4, 6, 7]; // Skip page 5 (skilled nursing)
    case 'LPN':
    case 'RN':
      return [1, 2, 3, 4, 5, 6, 7]; // All pages
    default:
      return [1, 2, 3, 4, 5, 6, 7]; // Show all by default until credential selected
  }
}

function ProgressNotePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const editId = searchParams.get('edit');
  const [isEditMode, setIsEditMode] = useState(false);
  const [editLoaded, setEditLoaded] = useState(false);
  const [initialClientName, setInitialClientName] = useState('');
  const [initialSignature, setInitialSignature] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [credential, setCredential] = useState<CredentialTier>('');
  const [showSettings, setShowSettings] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [firebaseLoaded, setFirebaseLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const activePages = getActivePages(credential);
  const totalActivePages = activePages.length;
  const activeIndex = activePages.indexOf(currentPage);
  const isLastPage = activeIndex === totalActivePages - 1;
  const isFirstPage = activeIndex === 0;

  const handleCredentialChange = (value: string) => {
    const newCredential = value as CredentialTier;
    setCredential(newCredential);
    // If current page is not in the new active pages, go to page 1
    const newActivePages = getActivePages(newCredential);
    if (!newActivePages.includes(currentPage)) {
      setCurrentPage(1);
    }
  };

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

  // Load submission data when editing
  useEffect(() => {
    if (!editId || editLoaded) return;

    const loadEditData = async () => {
      try {
        const data = await getSubmission(editId);
        if (!data) {
          alert('Submission not found.');
          return;
        }

        // Set credential first to ensure correct pages are shown
        if (data.q12_credential) {
          handleCredentialChange(data.q12_credential);
        }

        // Set client name via React state
        if (data.q3_clientName) {
          setInitialClientName(data.q3_clientName);
        }

        // Wait for DOM to render all pages, then populate fields
        setTimeout(() => {
          if (!formRef.current) return;

          // Helper to set a text/number/date/time input value
          const setField = (name: string, value: string) => {
            const el = formRef.current?.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement;
            if (el && value) el.value = value;
          };

          // Helper to set checkboxes from comma-separated string
          const setCheckboxes = (name: string, csvValues: string) => {
            if (!csvValues) return;
            const values = csvValues.split(', ');
            const checkboxes = formRef.current?.querySelectorAll(`input[type="checkbox"][name="${name}"]`);
            checkboxes?.forEach((cb) => {
              const checkbox = cb as HTMLInputElement;
              checkbox.checked = values.includes(checkbox.value);
            });
          };

          // Page 1: Client Information
          setField('q3_clientName', data.q3_clientName);
          setField('q4_dateofBirth', data.q4_dateofBirth);
          setField('q5_ageYears', data.q5_ageYears);
          setField('q10_primaryDiagnosis', data.q10_primaryDiagnosis);
          setField('q200_addr_line1', data.q200_addr_line1);
          setField('q200_city', data.q200_city);
          setField('q200_state', data.q200_state);
          setField('q200_postal', data.q200_postal);

          // Page 1: Shift Information
          setField('q6_dateofService', data.q6_dateofService);
          setField('q7_shiftStart', data.q7_shiftStart);
          setField('q8_shiftEnd', data.q8_shiftEnd);
          setField('q9_totalHours', data.q9_totalHours);

          // Page 1: Nurse / Caregiver
          setField('q11_nurseName', data.q11_nurseName);
          // Set credential select
          const credSelect = formRef.current?.querySelector('select[name="q12_credential"]') as HTMLSelectElement;
          if (credSelect && data.q12_credential) {
            credSelect.value = data.q12_credential;
          }

          // Page 2: Client Status (radios)
          if (data.q13_orientationLevel) setRadio('q13_orientationLevel', data.q13_orientationLevel);
          if (data.q14_behavior) setRadio('q14_behavior', data.q14_behavior);
          // Page 2: Appearance (checkboxes)
          setCheckboxes('q15_appearance', data.q15_appearance);

          // Page 2: Vital Signs
          setField('q16_temperature', data.q16_temperature);
          setField('q17_bloodPressure', data.q17_bloodPressure);
          setField('q18_pulse', data.q18_pulse);
          setField('q19_respiration', data.q19_respiration);
          setField('q20_oxygenSaturation', data.q20_oxygenSaturation);
          setField('q21_bloodGlucose', data.q21_bloodGlucose);

          // Page 2: Additional Observations
          setField('q22_additionalObservations', data.q22_additionalObservations);

          // Page 3: Observations
          if (data.q23_activityLevel) setRadio('q23_activityLevel', data.q23_activityLevel);
          setField('q24_painLevel', data.q24_painLevel);
          setField('q25_painLocation', data.q25_painLocation);
          setField('q26_painDescription', data.q26_painDescription);

          // Page 3: System Assessments
          setCheckboxes('q30_neuroAssessment', data.q30_neuroAssessment);
          setField('q30_neuroNotes', data.q30_neuroNotes);
          setCheckboxes('q31_cardioAssessment', data.q31_cardioAssessment);
          setField('q31_cardioNotes', data.q31_cardioNotes);
          setCheckboxes('q32_respAssessment', data.q32_respAssessment);
          setField('q32_respNotes', data.q32_respNotes);
          setCheckboxes('q33_giAssessment', data.q33_giAssessment);
          setField('q33_giNotes', data.q33_giNotes);
          setCheckboxes('q34_guAssessment', data.q34_guAssessment);
          setField('q34_guNotes', data.q34_guNotes);
          setCheckboxes('q35_reproAssessment', data.q35_reproAssessment);
          setField('q35_reproNotes', data.q35_reproNotes);
          setCheckboxes('q36_skinAssessment', data.q36_skinAssessment);
          setField('q36_skinNotes', data.q36_skinNotes);
          setCheckboxes('q37_behaveAssessment', data.q37_behaveAssessment);
          setField('q37_behaveNotes', data.q37_behaveNotes);

          // Page 4: Interventions
          setCheckboxes('q38_interventions', data.q38_interventions);
          setField('q39_interventionDetails', data.q39_interventionDetails);
          setField('q40_skillJustification', data.q40_skillJustification);
          setCheckboxes('q41_patientEduc', data.q41_patientEduc);
          setField('q42_patientResponse', data.q42_patientResponse);

          // Page 5: Medications & Treatments
          setField('q43_medicationsGiven', data.q43_medicationsGiven);
          if (data.q44_medicationCompliance) setRadio('q44_medicationCompliance', data.q44_medicationCompliance);
          setField('q45_medicationSideEffects', data.q45_medicationSideEffects);
          setCheckboxes('q46_treatments', data.q46_treatments);
          setCheckboxes('q47_equipment', data.q47_equipment);
          setField('q48_equipmentIssues', data.q48_equipmentIssues);
          setCheckboxes('q49_homeEnvironment', data.q49_homeEnvironment);
          setField('q50_caregiverObs', data.q50_caregiverObs);

          // Page 6: Communication
          setField('q51_communication', data.q51_communication);
          if (data.q52_physicianNotify) setRadio('q52_physicianNotify', data.q52_physicianNotify);
          setField('q53_physicianName', data.q53_physicianName);
          setField('q54_notificationTime', data.q54_notificationTime);
          setField('q55_physicianOrders', data.q55_physicianOrders);
          if (data.q56_incidents) setRadio('q56_incidents', data.q56_incidents);
          setField('q57_incidentDetails', data.q57_incidentDetails);
          setCheckboxes('q58_followup', data.q58_followup);
          setField('q59_followupDetails', data.q59_followupDetails);
          setField('q60_nextShiftPlan', data.q60_nextShiftPlan);

          // Page 7: Signature & Completion
          setField('q61_signature', data.q61_signature);
          if (data.q61_signature) setInitialSignature(data.q61_signature);
          setField('q62_shiftEndDate', data.q62_shiftEndDate);
          setField('q62_shiftEndTime', data.q62_shiftEndTime);
          setField('q63_clinicalSummary', data.q63_clinicalSummary);
          if (data.q64_carePlanStatus) setRadio('q64_carePlanStatus', data.q64_carePlanStatus);
          setCheckboxes('q65_certification', data.q65_certification);
          setField('q66_additionalNotes', data.q66_additionalNotes);

          setIsEditMode(true);
          setEditLoaded(true);
        }, 300);
      } catch (error) {
        console.error('Failed to load submission for editing:', error);
        alert('Failed to load submission data.');
      }
    };

    loadEditData();
  }, [editId, editLoaded]);

  const handleAddPatient = async (patient: Patient) => {
    try {
      const newId = await addPatient(patient);
      setPatients([...patients, { ...patient, id: newId }]);
    } catch (error) {
      console.error('Failed to add patient:', error);
      alert('Failed to add patient. Please try again.');
    }
  };

  const handleUpdatePatient = async (patientId: string, data: Partial<Patient>) => {
    try {
      await updatePatient(patientId, data);
      setPatients(patients.map(p => p.id === patientId ? { ...p, ...data } : p));
    } catch (error) {
      console.error('Failed to update patient:', error);
      alert('Failed to update patient. Please try again.');
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
    if (activeIndex > 0) {
      setCurrentPage(activePages[activeIndex - 1]);
      window.scrollTo(0, 0);
    }
  };

  const handleNextPage = () => {
    if (activeIndex < totalActivePages - 1) {
      setCurrentPage(activePages[activeIndex + 1]);
      window.scrollTo(0, 0);
    }
  };

  // Find which page a form element belongs to (1-7)
  // Page wrapper divs are direct children of the form, pages 1-7 map to indices 0-6
  const getFieldPage = (element: HTMLElement): number => {
    let parent = element.parentElement;
    while (parent && parent !== formRef.current) {
      if (parent.parentElement === formRef.current) {
        const siblings = Array.from(formRef.current!.children);
        const index = siblings.indexOf(parent);
        // indices 0-6 correspond to pages 1-7
        if (index >= 0 && index <= 6) return index + 1;
      }
      parent = parent.parentElement;
    }
    return 1;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formRef.current) return;

    // Check if an element or any ancestor is hidden via display:none
    const isElementVisible = (el: HTMLElement): boolean => {
      let current: HTMLElement | null = el;
      while (current && current !== formRef.current) {
        if (current.style.display === 'none') return false;
        current = current.parentElement;
      }
      return true;
    };

    // Validate signature first (hidden input, special case)
    const signatureInput = formRef.current.querySelector('input[name="q61_signature"]') as HTMLInputElement;
    if (signatureInput && (!signatureInput.value || signatureInput.value.trim() === '')) {
      const lastActivePage = activePages[activePages.length - 1];
      setCurrentPage(lastActivePage);
      setTimeout(() => {
        const canvas = formRef.current?.querySelector('canvas');
        if (canvas) {
          canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      alert('Please sign the form before submitting.');
      return;
    }

    // Custom validation: find all required fields that are empty
    const requiredFields = formRef.current.querySelectorAll(
      'input[required], select[required], textarea[required]'
    );

    for (const field of requiredFields) {
      const el = field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

      // Skip hidden inputs (like signature, handled above)
      if (el.type === 'hidden') continue;

      // Skip fields hidden by credential-conditional display:none
      if (!isElementVisible(el)) continue;

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

      if (isEditMode && editId) {
        await updateSubmission(editId, submission);
        alert('Progress note updated successfully!');
        router.push(`/progress-note/submissions/${editId}`);
        return;
      }

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
      {isEditMode && editId && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px', padding: '10px 16px', marginBottom: '16px', fontSize: '14px', color: '#856404', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✏️ You are editing an existing progress note. Make your changes and click Update.</span>
          <button
            type="button"
            onClick={() => router.push(`/progress-note/submissions/${editId}`)}
            style={{
              background: '#856404',
              color: 'white',
              border: 'none',
              padding: '6px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            Cancel Editing
          </button>
        </div>
      )}

      <div className={styles.header}>
        <h1>Heart and Soul Home Health - Progress Note</h1>
        <p>Nurse Documentation Form</p>
      </div>

      <div className={styles.headerControls}>
        <div style={{ flex: 1 }} />
        <button
          className={styles.settingsBtn}
          onClick={() => setShowSettings(!showSettings)}
          title="Patient Management"
        >
          ⚙️ Settings
        </button>
      </div>

      <div className={styles.progressBar} id="progressBar">
        {activePages.map((page, index) => (
          <div
            key={page}
            className={`${styles.progressDot} ${
              page === currentPage ? styles.active : ''
            } ${index < activeIndex ? styles.completed : ''}`}
            onClick={() => {
              setCurrentPage(page);
              window.scrollTo(0, 0);
            }}
          />
        ))}
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className={styles.form} noValidate>
        <div style={pageStyle(1)}><FormPageOne formRef={ref} onCredentialChange={handleCredentialChange} patients={patients} initialClientName={initialClientName} /></div>
        <div style={pageStyle(2)}><FormPageTwo formRef={ref} credential={credential} /></div>
        <div style={pageStyle(3)}><FormPageThree formRef={ref} credential={credential} /></div>
        <div style={pageStyle(4)}><FormPageFour formRef={ref} /></div>
        <div style={pageStyle(5)}><FormPageFive formRef={ref} credential={credential} /></div>
        <div style={pageStyle(6)}><FormPageSix formRef={ref} credential={credential} /></div>
        <div style={pageStyle(7)}><FormPageSeven formRef={ref} credential={credential} initialSignature={initialSignature} /></div>

        <div className={styles.navigationControls}>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); handlePreviousPage(); }}
            disabled={isFirstPage}
            className={styles.navBtn}
          >
            ← Previous
          </button>

          {isLastPage ? (
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting
                ? (isEditMode ? 'Updating...' : 'Submitting...')
                : (isEditMode ? 'Update' : 'Submit')}
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); handleNextPage(); }}
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
          onUpdatePatient={handleUpdatePatient}
          onRemovePatient={handleRemovePatient}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

export default function ProgressNotePage() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', padding: '40px 20px' }}><p>Loading...</p></div>}>
      <ProgressNotePageInner />
    </Suspense>
  );
}
