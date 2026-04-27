'use client';

import { useCallback, useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Check, AlertTriangle, Loader2 } from 'lucide-react';
import { getPatients, type Patient } from '@/lib/patients';
import { saveSubmission, getSubmission, updateSubmission, type ProgressNoteFormData } from '@/lib/submissions';
import { saveDraft, loadDraft, deleteDraft, type NoteDraft } from '@/lib/drafts';
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

const PAGE_LABELS: Record<number, { full: string; short: string }> = {
  1: { full: 'Client & Shift', short: 'Client' },
  2: { full: 'Status & Vitals', short: 'Status' },
  3: { full: 'Observations & Systems', short: 'Systems' },
  4: { full: 'Personal Care & Nutrition', short: 'Care' },
  5: { full: 'Meds & Interventions', short: 'Meds' },
  6: { full: 'Education & Notifications', short: 'Alerts' },
  7: { full: 'Summary & Signature', short: 'Summary' },
};

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
  // Derived synchronously from the URL so it's correct from the first render.
  // Previously this was a useState that only flipped to true ~300ms after the
  // submission finished loading — which created a race where RHF's reset()
  // triggered a watch → scheduleAutosave → 3s timer with the OLD closure
  // capturing isEditMode=false. The timer then wrote the submission's data
  // into a draft under the *current viewer's* uid (e.g. an admin opening a
  // nurse's note). Bailing on editId from render zero closes that window.
  const isEditMode = !!editId;
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

  // --- Cross-device draft state (Firestore) ---
  // saveStatus drives the indicator in the sticky header.
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [pendingDraft, setPendingDraft] = useState<NoteDraft | null>(null);
  const [resumeDecided, setResumeDecided] = useState(false); // banner dismissed / acted on
  const [draftHydrated, setDraftHydrated] = useState(false); // autosave gate — don't save before we've loaded
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaveAttemptRef = useRef<number>(0);
  const AUTOSAVE_DEBOUNCE_MS = 3000;
  const AUTOSAVE_MIN_INTERVAL_MS = 10000;

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

  // --- Draft helpers ---

  // Collect the entire form state (react-hook-form values + radio store +
  // checkbox DOM state) into a single payload suitable for Firestore.
  const collectDraftPayload = useCallback(() => {
    const formValues = getValues() as Record<string, unknown>;

    const radioSnapshot: Record<string, string> = {};
    for (const [k, v] of Object.entries(radioState)) {
      if (v) radioSnapshot[k] = v;
    }

    const checkboxSnapshot: Record<string, string[]> = {};
    if (formRef.current) {
      formRef.current.querySelectorAll('input[type="checkbox"]').forEach((el) => {
        const cb = el as HTMLInputElement;
        if (!checkboxSnapshot[cb.name]) checkboxSnapshot[cb.name] = [];
        if (cb.checked) checkboxSnapshot[cb.name].push(cb.value);
      });
    }

    return {
      formValues,
      radioState: radioSnapshot,
      checkboxState: checkboxSnapshot,
    };
  }, [getValues]);

  // Write the current form state to Firestore (used by autosave + Save & exit).
  // Returns true if saved, false if skipped (not signed in / edit mode / empty).
  const persistDraft = useCallback(async (): Promise<boolean> => {
    if (!user || !profile || isEditMode) return false;
    const { formValues, radioState: r, checkboxState: c } = collectDraftPayload();
    // Skip autosave if the form is effectively empty (no client, no real content).
    const clientName = String(formValues.q3_clientName || '').trim();
    const hasAnyContent =
      clientName ||
      Object.keys(r).length > 0 ||
      Object.values(c).some((arr) => arr.length > 0);
    if (!hasAnyContent) return false;

    setSaveStatus('saving');
    try {
      await saveDraft({
        nurseId: user.uid,
        nurseName: profile.displayName || user.email || '',
        clientName,
        dateOfService: String(formValues.q6_dateofService || ''),
        currentPage,
        formValues,
        radioState: r,
        checkboxState: c,
      });
      setSaveStatus('saved');
      setLastSavedAt(new Date());
      lastSaveAttemptRef.current = Date.now();
      return true;
    } catch (err) {
      console.error('Draft save failed:', err);
      setSaveStatus('error');
      return false;
    }
  }, [user, profile, isEditMode, collectDraftPayload, currentPage]);

  // Schedule a debounced autosave. Respects a minimum interval to cap write cost.
  const scheduleAutosave = useCallback(() => {
    if (!draftHydrated || isEditMode || !user) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      const elapsed = Date.now() - lastSaveAttemptRef.current;
      if (elapsed < AUTOSAVE_MIN_INTERVAL_MS) {
        // Re-schedule once the floor has passed.
        autosaveTimerRef.current = setTimeout(() => {
          persistDraft();
        }, AUTOSAVE_MIN_INTERVAL_MS - elapsed);
        return;
      }
      persistDraft();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [draftHydrated, isEditMode, user, persistDraft]);

  // Apply a loaded Firestore draft into the form (RHF + radios + checkboxes + page).
  const hydrateFromDraft = useCallback((draft: NoteDraft) => {
    reset(draft.formValues as FormValues);
    setInitialClientName(String(draft.formValues.q3_clientName || ''));
    if (draft.formValues.q12_credential) {
      const cred = String(draft.formValues.q12_credential) as CredentialTier;
      setCredential(cred);
    }
    if (draft.formValues.q61_signature) {
      setInitialSignature(String(draft.formValues.q61_signature));
    }
    // Restore radio state (persist to localStorage too so DeselectableRadio sees it)
    for (const [k, v] of Object.entries(draft.radioState)) {
      setRadio(k, v);
    }
    // Restore checkbox state after DOM is ready
    setTimeout(() => {
      if (!formRef.current) return;
      for (const [name, values] of Object.entries(draft.checkboxState)) {
        const checkboxes = formRef.current.querySelectorAll(`input[type="checkbox"][name="${name}"]`);
        checkboxes.forEach((el) => {
          const cb = el as HTMLInputElement;
          cb.checked = values.includes(cb.value);
        });
      }
    }, 200);
    setCurrentPage(draft.currentPage || 1);
  }, [reset]);

  // On mount (once auth + firebase are ready), check for an existing Firestore
  // draft. If found, show the resume banner. Autosave is gated on draftHydrated
  // so we never clobber an existing draft with an empty form on first render.
  // If the URL carries ?resume=1 (the nurse clicked Resume on the dashboard
  // banner), the decision is already made — auto-hydrate and skip the banner.
  const autoResume = searchParams.get('resume') === '1';
  useEffect(() => {
    if (!firebaseLoaded || !user || isEditMode || draftHydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const draft = await loadDraft(user.uid);
        if (cancelled) return;
        if (draft) {
          if (autoResume) {
            hydrateFromDraft(draft);
            setResumeDecided(true);
            // Same short delay we use in handleResumeDraft so autosave doesn't
            // fire before the form has finished applying the saved values.
            setTimeout(() => setDraftHydrated(true), 400);
            // Strip ?resume=1 so a later refresh doesn't silently re-hydrate.
            const params = new URLSearchParams(searchParams.toString());
            params.delete('resume');
            const qs = params.toString();
            router.replace(qs ? `/progress-note?${qs}` : '/progress-note');
          } else {
            setPendingDraft(draft);
            // Surface a banner; autosave stays disabled until the nurse decides.
          }
        } else {
          setDraftHydrated(true);
        }
      } catch (err) {
        console.error('Failed to load draft:', err);
        setDraftHydrated(true); // fail open — allow autosave
      }
    })();
    return () => { cancelled = true; };
  }, [firebaseLoaded, user, isEditMode, draftHydrated, autoResume, hydrateFromDraft, router, searchParams]);

  // Autosave on form value changes.
  useEffect(() => {
    if (isEditMode) return;
    const sub = watch(() => scheduleAutosave());
    return () => sub.unsubscribe();
  }, [watch, isEditMode, scheduleAutosave]);

  // Autosave on page change (hard save, bypasses debounce).
  useEffect(() => {
    if (!draftHydrated || isEditMode) return;
    persistDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const handleResumeDraft = () => {
    if (!pendingDraft) return;
    hydrateFromDraft(pendingDraft);
    setPendingDraft(null);
    setResumeDecided(true);
    // Small delay so the hydrate effects land before autosave gate opens.
    setTimeout(() => setDraftHydrated(true), 400);
  };

  const handleStartFresh = async () => {
    if (!user) return;
    try {
      await deleteDraft(user.uid);
    } catch (err) {
      console.error('Failed to clear old draft:', err);
    }
    setPendingDraft(null);
    setResumeDecided(true);
    setDraftHydrated(true);
  };

  const handleSaveAndExit = async () => {
    // Force a save even if the debounce hasn't fired.
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    const saved = await persistDraft();
    if (!saved && saveStatus !== 'error') {
      // Nothing to save — still leave gracefully.
      router.push('/admin/submissions');
      return;
    }
    if (saveStatus === 'error') {
      alert('We couldn\'t save your draft. Check your connection and try again.');
      return;
    }
    router.push('/admin/submissions?draftSaved=1');
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
      // Remove the Firestore draft — submission supersedes it.
      if (user) {
        try { await deleteDraft(user.uid); } catch (err) { console.error('Failed to delete draft after submit:', err); }
      }
      setSaveStatus('idle');
      setLastSavedAt(null);
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

      {/* Resume-draft banner — blocks the form until the nurse chooses. */}
      {pendingDraft && !resumeDecided && !isEditMode && (
        <div
          style={{
            background: '#e8f4fd',
            border: '1px solid #1a3a5c',
            borderRadius: '6px',
            padding: '16px 20px',
            marginBottom: '16px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '14px', color: '#1a3a5c', lineHeight: 1.5 }}>
            <strong>You have an unfinished progress note.</strong>
            {pendingDraft.clientName && <> Client: <strong>{pendingDraft.clientName}</strong>.</>}
            {pendingDraft.updatedAt && (
              <> Last saved{' '}
                {pendingDraft.updatedAt.toLocaleString([], {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
                .
              </>
            )}
            <br />
            Resume where you left off, or start a new blank note (the old draft will be discarded).
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={handleResumeDraft}
              style={{
                background: '#1a3a5c',
                color: 'white',
                border: 'none',
                padding: '10px 18px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              Resume draft
            </button>
            <button
              type="button"
              onClick={handleStartFresh}
              style={{
                background: 'white',
                color: '#1a3a5c',
                border: '1px solid #1a3a5c',
                padding: '10px 18px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              Start fresh
            </button>
          </div>
        </div>
      )}

      {/* Sticky autosave header — visible on every page of the form. */}
      {!isEditMode && user && (
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: 'rgba(255,255,255,0.96)',
            backdropFilter: 'blur(6px)',
            borderBottom: '1px solid #e5e7eb',
            margin: '0 -16px 12px',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '12px',
            fontSize: '13px',
          }}
        >
          <span
            role="status"
            aria-live="polite"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontWeight: 500,
              padding: '4px 10px',
              borderRadius: 999,
              background:
                saveStatus === 'saved' ? '#ecfdf5' :
                saveStatus === 'saving' ? '#eff6ff' :
                saveStatus === 'error' ? '#fef2f2' :
                'transparent',
              color:
                saveStatus === 'saved' ? '#047857' :
                saveStatus === 'saving' ? '#1d4ed8' :
                saveStatus === 'error' ? '#b91c1c' :
                '#6b7280',
              border:
                saveStatus === 'saved' ? '1px solid #a7f3d0' :
                saveStatus === 'saving' ? '1px solid #bfdbfe' :
                saveStatus === 'error' ? '1px solid #fecaca' :
                '1px solid transparent',
            }}
          >
            {saveStatus === 'saving' && (
              <>
                <Loader2 size={13} style={{ animation: 'hs-spin 1s linear infinite' }} aria-hidden />
                Saving…
              </>
            )}
            {saveStatus === 'saved' && lastSavedAt && (
              <>
                <Check size={13} aria-hidden />
                Saved {lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <AlertTriangle size={13} aria-hidden />
                Save failed — check connection
              </>
            )}
            {saveStatus === 'idle' && (
              draftHydrated
                ? 'Not yet saved'
                : pendingDraft && !resumeDecided
                  ? '' /* waiting on resume-banner decision */
                  : 'Loading…'
            )}
          </span>
          <button
            type="button"
            onClick={handleSaveAndExit}
            disabled={saveStatus === 'saving'}
            style={{
              background: '#1a3a5c',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              opacity: saveStatus === 'saving' ? 0.6 : 1,
            }}
            title="Save this draft and return to the submissions dashboard"
          >
            Save &amp; exit
          </button>
        </div>
      )}

      <div className={styles.header}>
        <h1>Heart and Soul Healthcare - Progress Note</h1>
        <p>Home Health Progress Note</p>
      </div>

      {/* Autosave help text — sets expectations once, permanently. Hidden in
          edit mode (staff editing a submitted note) because the save behavior
          is different there. */}
      {!isEditMode && user && (
        <p
          style={{
            textAlign: 'center',
            color: '#6b7280',
            fontSize: 13,
            margin: '0 0 12px',
            fontStyle: 'italic',
          }}
        >
          Your work saves automatically as you type. Use <strong>Save &amp; exit</strong> to leave and come back later.
        </p>
      )}

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
        {activePages.map((page, index) => {
          const label = PAGE_LABELS[page] ?? { full: '', short: '' };
          return (
            <div
              key={page}
              className={`${styles.progressDot} ${
                page === currentPage ? styles.active : ''
              } ${index < activeIndex ? styles.completed : ''}`}
              onClick={() => {
                setCurrentPage(page);
                window.scrollTo(0, 0);
              }}
              title={`${index + 1}. ${label.full}`}
              aria-label={`Step ${index + 1}: ${label.full}`}
            >
              <span className={styles.progressDotNum}>{index + 1}</span>
              <span className={`${styles.progressDotLabel} ${styles.progressDotLabelFull}`}>{label.full}</span>
              <span className={`${styles.progressDotLabel} ${styles.progressDotLabelShort}`}>{label.short}</span>
            </div>
          );
        })}
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
