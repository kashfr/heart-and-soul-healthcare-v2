'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getPatients, addPatient, updatePatient, removePatient, type Patient } from '@/lib/patients';
import { saveSubmission, getSubmission, updateSubmission, type ProgressNoteFormData } from '@/lib/submissions';
import { setRadio, radioState } from './components/DeselectableRadio';
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
  const [initialTotalHours, setInitialTotalHours] = useState('');

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

          // Cast to Record for dynamic access
          const rawData = data as unknown as Record<string, string>;

          // Set React-controlled fields
          setInitialClientName(rawData.q3_clientName || '');
          if (rawData.q61_signature) setInitialSignature(rawData.q61_signature);

          // Collect DOM element types for smart field population
          const radioNames = new Set<string>();
          formRef.current?.querySelectorAll('input[type="radio"]').forEach((el) => {
            radioNames.add((el as HTMLInputElement).name);
          });
          const checkboxNames = new Set<string>();
          formRef.current?.querySelectorAll('input[type="checkbox"]').forEach((el) => {
            checkboxNames.add((el as HTMLInputElement).name);
          });
          const selectNames = new Set<string>();
          formRef.current?.querySelectorAll('select').forEach((el) => {
            selectNames.add((el as HTMLSelectElement).name);
          });

          // Dynamically populate ALL fields from saved data
          for (const [key, value] of Object.entries(rawData)) {
            if (!value || key === 'submittedAt' || key === 'lastUpdatedAt' || key === 'status') continue;

            if (radioNames.has(key)) {
              setRadio(key, value);
            } else if (checkboxNames.has(key)) {
              setCheckboxes(key, value);
            } else if (selectNames.has(key)) {
              const sel = formRef.current?.querySelector(`select[name="${key}"]`) as HTMLSelectElement;
              if (sel) sel.value = value;
            } else {
              setField(key, value);
            }
          }

          setIsEditMode(true);
          setEditLoaded(true);

          // Calculate total hours from saved start/end times via React state
          if (rawData.q7_shiftStart && rawData.q62_shiftEndTime) {
            const [sH, sM] = rawData.q7_shiftStart.split(':').map(Number);
            const [eH, eM] = rawData.q62_shiftEndTime.split(':').map(Number);
            let startMin = sH * 60 + sM;
            let endMin = eH * 60 + eM;
            if (endMin < startMin) endMin += 24 * 60;
            setInitialTotalHours(((endMin - startMin) / 60).toFixed(2));
          }
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

      // Dynamically collect ALL form fields — captures every input, select,
      // textarea, checkbox, and radio across all pages automatically.
      // This prevents fields from being missed when new ones are added.
      const formData = new FormData(formRef.current);
      const submission: Record<string, string> = {};

      // Track which checkbox names we've seen to collect them as comma-separated
      const checkboxNames = new Set<string>();
      formRef.current.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        checkboxNames.add((cb as HTMLInputElement).name);
      });

      // Collect all FormData entries (text, date, time, number, textarea, select, hidden, checkbox)
      for (const [key, value] of formData.entries()) {
        if (typeof value !== 'string') continue;
        if (checkboxNames.has(key)) {
          // Checkboxes: collect all checked values as comma-separated
          if (submission[key]) {
            submission[key] += ', ' + value;
          } else {
            submission[key] = value;
          }
        } else {
          submission[key] = value;
        }
      }

      // Collect all DeselectableRadio values from global store
      // (they are controlled components and don't appear in FormData)
      for (const [name, value] of Object.entries(radioState)) {
        if (value) submission[name] = value;
      }

      if (isEditMode && editId) {
        await updateSubmission(editId, submission as unknown as Partial<ProgressNoteFormData>);
        alert('Progress note updated successfully!');
        window.location.href = `/progress-note/submissions/${editId}`;
        return;
      }

      const docId = await saveSubmission(submission as unknown as ProgressNoteFormData);
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
          <button
            type="button"
            onClick={() => {
              if (formRef.current) {
                formRef.current.requestSubmit();
              }
            }}
            disabled={submitting}
            style={{
              background: '#27ae60',
              color: 'white',
              border: 'none',
              padding: '6px 16px',
              borderRadius: '4px',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Updating...' : 'Update'}
          </button>
        </div>
      )}

      <div className={styles.header}>
        <h1>Heart and Soul Healthcare - Progress Note</h1>
        <p>Home Health Progress Note</p>
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
          >
            {index + 1}
          </div>
        ))}
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className={styles.form} noValidate>
        <div style={pageStyle(1)}><FormPageOne formRef={ref} onCredentialChange={handleCredentialChange} patients={patients} initialClientName={initialClientName} /></div>
        <div style={pageStyle(2)}><FormPageTwo formRef={ref} credential={credential} /></div>
        <div style={pageStyle(3)}><FormPageThree formRef={ref} credential={credential} /></div>
        <div style={pageStyle(4)}><FormPageFour formRef={ref} /></div>
        <div style={pageStyle(5)}><FormPageFive formRef={ref} credential={credential} /></div>
        <div style={pageStyle(6)}><FormPageSix formRef={ref} credential={credential} /></div>
        <div style={pageStyle(7)}><FormPageSeven formRef={ref} credential={credential} initialSignature={initialSignature} initialTotalHours={initialTotalHours} /></div>

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
