'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { getPatients, type Patient } from '@/lib/patients';
import { saveSubmission, getSubmission, updateSubmission, type ProgressNoteFormData } from '@/lib/submissions';
import { useAuth } from '@/components/AuthProvider';
import { setRadio, radioState, clearRadioStorage } from './components/DeselectableRadio';
import type { FormValues } from './types';
import styles from './page.module.css';
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
  const { user, profile, role } = useAuth();
  const isNurse = role === 'nurse';
  const editId = searchParams.get('edit');
  const [isEditMode, setIsEditMode] = useState(false);
  const [editLoaded, setEditLoaded] = useState(false);
  const savedDraft = typeof window !== 'undefined' ? localStorage.getItem('progress-note-draft') : null;
  const savedParsed = savedDraft ? JSON.parse(savedDraft) : {};
  const [initialClientName, setInitialClientName] = useState(savedParsed.q3_clientName || '');
  const [initialSignature, setInitialSignature] = useState('');
  const [initialTotalHours, setInitialTotalHours] = useState('');

  const savedPage = typeof window !== 'undefined' ? parseInt(localStorage.getItem('progress-note-page') || '1', 10) : 1;
  const [currentPage, setCurrentPageState] = useState(savedPage);
  const setCurrentPage = (page: number) => {
    setCurrentPageState(page);
    // Don't persist page number in edit mode — it would leak into new-form sessions
    if (!isEditMode) {
      localStorage.setItem('progress-note-page', String(page));
    }
  };
  const [credential, setCredential] = useState<CredentialTier>((savedParsed.q12_credential as CredentialTier) || '');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [firebaseLoaded, setFirebaseLoaded] = useState(false);
  const [formReady, setFormReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const STORAGE_KEY = 'progress-note-draft';
  const savedData = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  const defaultValues = savedData ? JSON.parse(savedData) : {};

  // Ensure date of service defaults to today if not already saved
  if (!defaultValues.q6_dateofService) {
    const now = new Date();
    defaultValues.q6_dateofService = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  const { register, watch, setValue, getValues, reset, control } = useForm<FormValues>({
    defaultValues,
  });

  const CHECKBOX_STORAGE_KEY = 'progress-note-checkbox-draft';

  // Auto-save react-hook-form values to localStorage
  useEffect(() => {
    const subscription = watch((values) => {
      if (!isEditMode) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
      }
    });
    return () => subscription.unsubscribe();
  }, [watch, isEditMode]);

  // Auto-save checkbox states to localStorage
  useEffect(() => {
    const form = formRef.current;
    if (!form || isEditMode) return;

    const saveCheckboxes = () => {
      const checkboxData: Record<string, string[]> = {};
      form.querySelectorAll('input[type="checkbox"]').forEach((el) => {
        const cb = el as HTMLInputElement;
        if (!checkboxData[cb.name]) checkboxData[cb.name] = [];
        if (cb.checked) checkboxData[cb.name].push(cb.value);
      });
      localStorage.setItem(CHECKBOX_STORAGE_KEY, JSON.stringify(checkboxData));
    };

    form.addEventListener('change', saveCheckboxes);
    return () => form.removeEventListener('change', saveCheckboxes);
  }, [isEditMode, firebaseLoaded]);

  // Restore checkbox states from localStorage on mount, then mark form as ready
  useEffect(() => {
    if (!firebaseLoaded) return;

    const savedCheckboxes = localStorage.getItem(CHECKBOX_STORAGE_KEY);
    if (!savedCheckboxes || !formRef.current || isEditMode) {
      setFormReady(true);
      return;
    }

    const checkboxData = JSON.parse(savedCheckboxes) as Record<string, string[]>;
    // Delay to ensure DOM is rendered, then restore and reveal
    setTimeout(() => {
      for (const [name, values] of Object.entries(checkboxData)) {
        const checkboxes = formRef.current?.querySelectorAll(`input[type="checkbox"][name="${name}"]`);
        checkboxes?.forEach((el) => {
          const cb = el as HTMLInputElement;
          cb.checked = values.includes(cb.value);
        });
      }
      setFormReady(true);
    }, 300);
  }, [firebaseLoaded, isEditMode]);

  const activePages = getActivePages(credential);
  const totalActivePages = activePages.length;
  const activeIndex = activePages.indexOf(currentPage);
  const isLastPage = activeIndex === totalActivePages - 1;
  const isFirstPage = activeIndex === 0;

  // When a signed-in nurse (or any staff with a profile) loads the form in new-note
  // mode, prefill their name + credential from their profile so submissions are
  // tied to the right person and the credential-based page filter kicks in.
  const applyProfilePrefill = () => {
    if (isEditMode || !profile) return;
    if (profile.displayName) setValue('q11_nurseName', profile.displayName);
    if (profile.credential) {
      setValue('q12_credential', profile.credential);
      setCredential(profile.credential as CredentialTier);
    }
  };

  useEffect(() => {
    applyProfilePrefill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, isEditMode]);

  const handleCredentialChange = (value: string) => {
    const oldCredential = credential;
    const newCredential = value as CredentialTier;
    setCredential(newCredential);
    // If current page is not in the new active pages, go to page 1
    const newActivePages = getActivePages(newCredential);
    if (!newActivePages.includes(currentPage)) {
      setCurrentPage(1);
    }
    // Clear LPN/RN-only radio values when downgrading to HHA/CNA
    const wasLpnRn = oldCredential === 'LPN' || oldCredential === 'RN';
    const isNowLpnRn = newCredential === 'LPN' || newCredential === 'RN';
    if (wasLpnRn && !isNowLpnRn) {
      // Clear radio values for skilled nursing (page 5) and LPN/RN-only sections
      const lpnRnRadioKeys = Object.keys(radioState).filter(key =>
        key.startsWith('q43_') || key.startsWith('q41_goal') || key.startsWith('q52_physician') ||
        key.startsWith('q55_') || key.startsWith('q41_overallCarePlan')
      );
      lpnRnRadioKeys.forEach(key => setRadio(key, null));
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
          router.push('/admin/submissions');
          return;
        }

        // Cast to Record for dynamic access
        const rawData = data as unknown as Record<string, string>;

        // Set credential first to ensure correct pages are shown
        if (rawData.q12_credential) {
          handleCredentialChange(rawData.q12_credential);
        }

        // Reset the entire form with saved data (synchronous for RHF fields)
        reset(rawData);

        // Set React-controlled fields
        setInitialClientName(rawData.q3_clientName || '');
        if (rawData.q61_signature) setInitialSignature(rawData.q61_signature);

        // Wait for DOM to render all pages, then populate radio/checkbox fields
        setTimeout(() => {
          if (!formRef.current) return;

          // Set radio buttons via global store
          for (const [key, value] of Object.entries(rawData)) {
            if (!value || key === 'submittedAt' || key === 'lastUpdatedAt' || key === 'status') continue;
            const radioEl = formRef.current?.querySelector(`input[type="radio"][name="${key}"]`);
            if (radioEl) setRadio(key, value);
          }

          // Set checkboxes from comma-separated values
          const checkboxNames = new Set<string>();
          formRef.current?.querySelectorAll('input[type="checkbox"]').forEach((el) => {
            checkboxNames.add((el as HTMLInputElement).name);
          });
          for (const [key, value] of Object.entries(rawData)) {
            if (!value || !checkboxNames.has(key)) continue;
            const values = value.split(', ');
            const checkboxes = formRef.current?.querySelectorAll(`input[type="checkbox"][name="${key}"]`);
            checkboxes?.forEach((cb) => {
              (cb as HTMLInputElement).checked = values.includes((cb as HTMLInputElement).value);
            });
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
        router.push('/admin/submissions');
      }
    };

    loadEditData();
  }, [editId, editLoaded]);

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

    // Check if an element or any ancestor is hidden or disabled
    const isElementVisible = (el: HTMLElement): boolean => {
      let current: HTMLElement | null = el;
      while (current && current !== formRef.current) {
        if (current.style.display === 'none') return false;
        // Detect credential-gated sections (opacity overlay with pointerEvents: none)
        if (current.style.pointerEvents === 'none' && current.style.opacity !== '') return false;
        current = current.parentElement;
      }
      return true;
    };

    // Validate signature first (stored via react-hook-form setValue)
    const signatureValue = getValues('q61_signature');
    if (!signatureValue || signatureValue.trim() === '') {
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

    // Validate client name (stored in hidden input, which HTML validation skips)
    const clientName = getValues('q3_clientName');
    if (!clientName || clientName.trim() === '') {
      setCurrentPage(1);
      setTimeout(() => {
        const nameInput = formRef.current?.querySelector('#q3_clientNameSearch') as HTMLInputElement;
        if (nameInput) {
          nameInput.style.border = '2px solid #c62828';
          nameInput.style.background = '#fff5f5';
          nameInput.focus();
          nameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      alert('Please enter the client name before submitting.');
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

      // Skip fields hidden by credential-conditional display:none or overlay
      if (!isElementVisible(el)) continue;

      // For checkboxes, check the .checked property (not .value)
      if (el.type === 'checkbox') {
        if (!(el as HTMLInputElement).checked) {
          const parentLabel = el.closest('label');
          const rawLabel = parentLabel?.textContent || el.name;
          const fieldName = rawLabel.replace(/\s*\*\s*/g, '').trim();

          const page = getFieldPage(el);
          setCurrentPage(page);
          setTimeout(() => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);

          alert(`Please check "${fieldName}" on page ${page} before submitting.`);
          return;
        }
        continue;
      }

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

      // Collect all react-hook-form values
      const values = getValues();

      // Merge radio values from global store
      for (const [name, value] of Object.entries(radioState)) {
        if (value) values[name] = value;
      }

      // Merge checkbox values from DOM
      const checkboxNames = new Set<string>();
      formRef.current.querySelectorAll('input[type="checkbox"]').forEach((el) => {
        checkboxNames.add((el as HTMLInputElement).name);
      });
      for (const name of checkboxNames) {
        const checked = formRef.current.querySelectorAll(`input[type="checkbox"][name="${name}"]:checked`);
        const vals: string[] = [];
        checked?.forEach((cb) => vals.push((cb as HTMLInputElement).value));
        values[name] = vals.join(', ');
      }

      const submission = values;

      if (isEditMode && editId) {
        if (!user || !role) {
          throw new Error('You must be signed in to update a note.');
        }
        await updateSubmission(
          editId,
          submission as unknown as Partial<ProgressNoteFormData>,
          {
            uid: user.uid,
            displayName: profile?.displayName ?? user.displayName ?? user.email,
            role,
          }
        );
        alert('Progress note updated successfully!');
        window.location.href = `/admin/submissions/${editId}`;
        return;
      }

      const docId = await saveSubmission(
        submission as unknown as ProgressNoteFormData,
        user ? { nurseId: user.uid } : undefined
      );
      alert(`Progress note submitted successfully!\nSubmission ID: ${docId}`);
      reset();
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(CHECKBOX_STORAGE_KEY);
      localStorage.removeItem('progress-note-page');
      clearRadioStorage();
      formRef.current.reset();
      // Re-apply the nurse identity prefill since reset() blew it away.
      applyProfilePrefill();
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
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #e0e0e0',
            borderTop: '4px solid #27ae60',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px',
          }} />
          <p style={{ color: '#666', fontSize: '15px', margin: 0 }}>Loading patient data...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  const ref = formRef as React.RefObject<HTMLFormElement>;
  const pageStyle = (page: number) => ({
    display: currentPage === page ? 'block' : 'none',
  });

  return (
    <div className={`${styles.container} ${styles.wrap}`} style={!formReady ? { opacity: 0, pointerEvents: 'none', maxHeight: '100vh', overflow: 'hidden' } : undefined}>
      {isEditMode && editId && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px', padding: '10px 16px', marginBottom: '16px', fontSize: '14px', color: '#856404', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✏️ You are editing an existing progress note. Make your changes and click Update.</span>
          <button
            type="button"
            onClick={() => router.push(`/admin/submissions/${editId}`)}
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
        {!isEditMode && (
          <button
            type="button"
            onClick={() => setShowClearModal(true)}
            style={{
              background: '#e74c3c',
              color: 'white',
              border: 'none',
              padding: '10px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              marginRight: '8px',
            }}
          >
            Clear Form
          </button>
        )}
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
        <div style={pageStyle(1)}><FormPageOne formRef={ref} register={register} watch={watch} setValue={setValue} control={control} onCredentialChange={handleCredentialChange} patients={patients} initialClientName={initialClientName} lockIdentity={isNurse && !isEditMode} /></div>
        <div style={pageStyle(2)}><FormPageTwo formRef={ref} register={register} watch={watch} setValue={setValue} control={control} credential={credential} ageStr={watch('q5_ageYears')} dob={watch('q4_dateofBirth')} /></div>
        <div style={pageStyle(3)}><FormPageThree formRef={ref} register={register} watch={watch} setValue={setValue} control={control} credential={credential} /></div>
        <div style={pageStyle(4)}><FormPageFour formRef={ref} register={register} watch={watch} setValue={setValue} control={control} /></div>
        <div style={pageStyle(5)}><FormPageFive formRef={ref} register={register} watch={watch} setValue={setValue} control={control} credential={credential} /></div>
        <div style={pageStyle(6)}><FormPageSix formRef={ref} register={register} watch={watch} setValue={setValue} control={control} credential={credential} /></div>
        <div style={pageStyle(7)}><FormPageSeven formRef={ref} register={register} watch={watch} setValue={setValue} control={control} credential={credential} initialSignature={initialSignature} initialTotalHours={initialTotalHours} /></div>

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

      {/* Clear Form Confirmation Modal */}
      {showClearModal && (
        <div className={`${styles.confirmModal} ${styles.active}`}>
          <div className={styles.modalContent}>
            <h2 style={{ color: '#c62828', marginTop: 0 }}>Clear Form?</h2>
            <p style={{ color: '#555', lineHeight: 1.6, marginBottom: '20px' }}>
              Are you sure you want to clear the entire form? All entered data will be permanently lost. This action cannot be undone.
            </p>
            <div className={styles.modalButtons}>
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                className={styles.cancelBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  // Clear all localStorage
                  localStorage.removeItem(STORAGE_KEY);
                  localStorage.removeItem(CHECKBOX_STORAGE_KEY);
                  localStorage.removeItem('progress-note-page');
                  localStorage.removeItem('progress-note-radio-draft');
                  // Reload the page so everything resets cleanly
                  window.location.href = '/progress-note';
                }}
                style={{
                  background: '#c62828',
                  color: 'white',
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                Yes, Clear Everything
              </button>
            </div>
          </div>
        </div>
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
