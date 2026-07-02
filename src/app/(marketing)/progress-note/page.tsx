'use client';

import { useCallback, useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Check, AlertTriangle, Loader2 } from 'lucide-react';
import { getPatients, type Patient } from '@/lib/patients';
import { findNameCandidates, type RosterPatientLite, type MatchCandidate } from '@/lib/levenshtein';
import { saveSubmission, getSubmission, updateSubmission, submissionExists, findDuplicateSubmission, computeSubmissionChanges, type ProgressNoteFormData, type DuplicateMatch } from '@/lib/submissions';
import { saveDraft, loadDraft, deleteDraft, clearDuplicateRequest, subscribeOwnDupRequest, type NoteDraft, type DuplicateRequest } from '@/lib/drafts';
import { getCriticalFindings, summarizeFindings, type CriticalFinding } from '@/lib/criticalVitals';
import { isBpRoutinelyRequired } from '@/lib/vitalRanges';
import { normalizeName } from '@/lib/levenshtein';
import { authedFetch } from '@/lib/authedFetch';
import { useAuth } from '@/components/AuthProvider';
import { useSettings } from '@/components/SettingsProvider';
import { setRadio, radioState, clearRadioStorage } from './components/DeselectableRadio';
import type { FormValues } from './types';
import styles from './page.module.css';
import FormPageOne from './components/FormPageOne';
import FormPageTwo from './components/FormPageTwo';
import FormPageThree from './components/FormPageThree';
import FormPageFour from './components/FormPageFour';
import FormPageFive from './components/FormPageFive';
import { writeMarAdministrations, deleteStagedChangesForNote } from '@/lib/mar';
import {
  getAllMarAdmin,
  clearMarAdmin,
  setMarAdmin,
  selectSubmittableMarks,
  marAdminSubscribe,
  type MarAdminRecord,
} from './components/marAdminStore';
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

/**
 * Whether `optionValue` is present in a comma-joined "a, b, c" string. We
 * deliberately do NOT split on ", " because some checkbox values contain ", "
 * themselves (e.g. "Grooming (nail care, shaving, etc.)") — a naive split
 * shatters them, so they fail to re-check and silently drop on the next save,
 * corrupting the note AND making the edit's audit trail look like the editor
 * removed clinical content. Match the full value bounded by the ", "
 * delimiters or the string ends instead.
 */
function joinedValueIncludes(joined: string, optionValue: string): boolean {
  if (!joined || !optionValue) return false;
  return (
    joined === optionValue ||
    joined.startsWith(optionValue + ', ') ||
    joined.endsWith(', ' + optionValue) ||
    joined.includes(', ' + optionValue + ', ')
  );
}

function ProgressNotePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, profile, role } = useAuth();
  // Org-wide settings from /admin/settings. Read here so the submit
  // handler can enforce patient.allowFreeText and any future form-level
  // toggles without re-fetching per submit.
  const { settings: appSettings } = useSettings();
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
  // Pre-submit "did you mean?" confirmation state. Set when the nurse
  // hits Submit with a typed client name that fuzzy-matches a roster
  // patient but no patientId was ever captured (she never picked from
  // the dropdown or the Page-1 fuzzy banner). Holds the candidate +
  // the typed name so the modal can render both side-by-side.
  const [pendingPatientConfirm, setPendingPatientConfirm] = useState<
    { typedName: string; candidate: MatchCandidate } | null
  >(null);
  // Ref (not state) so the re-submit after the modal closes sees the
  // updated value synchronously — state updates wouldn't have flushed
  // by the time the form re-submits.
  const skipPatientConfirmRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Edit-reason capture. When an already-submitted note is edited and the
  // editor saves an actual change, we interrupt with a modal asking *why*
  // (compliance: corrections/addenda should record a reason). The original
  // loaded data is stashed so we can diff client-side and only prompt when
  // something genuinely changed. editReasonRef holds the captured reason
  // synchronously across the modal-close → requestSubmit() round-trip.
  const originalEditDataRef = useRef<Record<string, unknown> | null>(null);
  const editReasonRef = useRef('');
  const [showEditReasonModal, setShowEditReasonModal] = useState(false);
  const [editReasonText, setEditReasonText] = useState('');

  // Critical-vitals escalation gate. On submit, if a documented vital crosses a
  // provider-notification threshold and escalation isn't already documented, we
  // interrupt to capture the nurse's escalation or a "no escalation needed"
  // acknowledgment. skipCriticalRef lets the post-acknowledgment re-submit
  // pass through.
  const skipCriticalRef = useRef(false);
  const [showCriticalModal, setShowCriticalModal] = useState(false);
  const [criticalFindings, setCriticalFindings] = useState<CriticalFinding[]>([]);
  const [criticalAck, setCriticalAck] = useState<'notified' | 'no_escalation_needed' | ''>('');
  const [criticalNote, setCriticalNote] = useState('');
  // Who the nurse notified — drives the Tab-6 Physician/Supervisor "Notified?"
  // fields so there's one consistent record.
  const [criticalNotifiedSupervisor, setCriticalNotifiedSupervisor] = useState(false);
  const [criticalNotifiedPhysician, setCriticalNotifiedPhysician] = useState(false);

  // Backdated date-of-service confirm. A date of service more than 7 days in the
  // past is usually legitimate (a late entry) but is also where typos land, so
  // we ask once. skipDateConfirmRef passes the re-submit after she confirms.
  const skipDateConfirmRef = useRef(false);
  const [pendingDateConfirm, setPendingDateConfirm] = useState<{ date: string; daysAgo: number } | null>(null);

  // Stable id for the note this form will eventually submit. Generated
  // lazily (first autosave or submit), persisted on the draft, and reused
  // across retries so a flaky-network resubmit overwrites the same doc
  // instead of creating a duplicate. Reset to '' after a successful submit.
  const submissionIdRef = useRef<string>('');
  const ensureSubmissionId = useCallback(() => {
    if (!submissionIdRef.current) submissionIdRef.current = crypto.randomUUID();
    return submissionIdRef.current;
  }, []);

  // Duplicate-note hard stop. `dupBlock` holds the already-submitted match
  // when the nurse is blocked (leaving Page 1 or at submit) from documenting a
  // shift she already has a note for. `dupRequestState` mirrors her draft's
  // approval request (pending / approved / denied), kept live via an own-draft
  // subscription so the modal + banner react the moment an admin acts. The
  // hard stop only lifts when an APPROVED request matches the current client +
  // date; archived/deleted prior notes don't block (handled in the query).
  const [dupBlock, setDupBlock] = useState<DuplicateMatch | null>(null);
  const [dupRequestState, setDupRequestState] = useState<DuplicateRequest | undefined>(undefined);
  const [dupReason, setDupReason] = useState('');
  const [dupFiling, setDupFiling] = useState(false);

  // Success splash shown briefly before redirecting to the confirmation page.
  const [submittedInfo, setSubmittedInfo] = useState<
    { id: string; clientName: string; dateOfService: string } | null
  >(null);

  // --- Cross-device draft state (Firestore) ---
  // saveStatus drives the indicator in the sticky header.
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [pendingDraft, setPendingDraft] = useState<NoteDraft | null>(null);
  const [resumeDecided, setResumeDecided] = useState(false); // banner dismissed / acted on
  const [draftHydrated, setDraftHydrated] = useState(false); // autosave gate — don't save before we've loaded
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaveAttemptRef = useRef<number>(0);
  // Latches true the moment a submit succeeds. After that, autosave must never
  // run again: the post-submit reset() fires the form's watch() subscription,
  // which would otherwise re-arm a debounced autosave and re-create the draft
  // we just deleted (an orphan draft with a fresh submissionId). This guard
  // makes scheduleAutosave + persistDraft hard no-ops once submitted.
  const hasSubmittedRef = useRef(false);
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

  const { register, watch, setValue, getValues, reset, control, formState, trigger } = useForm<FormValues>({
    defaultValues,
    mode: 'onBlur', // Surface validation errors when the field loses focus, not only on submit
  });
  const { errors } = formState;

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
        if (!cb.name) return; // skip nameless UI toggles (e.g. the med-request modal's PRN / dose checkboxes); Firestore rejects an empty field name
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
        if (!cb.name) return; // skip nameless UI toggles; Firestore rejects an empty map key
        if (!checkboxSnapshot[cb.name]) checkboxSnapshot[cb.name] = [];
        if (cb.checked) checkboxSnapshot[cb.name].push(cb.value);
      });
    }

    return {
      formValues,
      radioState: radioSnapshot,
      checkboxState: checkboxSnapshot,
      // MAR dose marks ride along so a reload mid-note doesn't lose them.
      // (Cast: the draft stores them as loose records since lib/drafts.ts
      // doesn't import the component-level MarAdminRecord type.)
      marAdminState: getAllMarAdmin() as unknown as Array<{ key: string } & Record<string, unknown>>,
    };
  }, [getValues]);

  // Write the current form state to Firestore (used by autosave + Save & exit).
  // Returns true if saved, false if skipped (not signed in / edit mode / empty).
  const persistDraft = useCallback(async (): Promise<boolean> => {
    if (!user || !profile || isEditMode || hasSubmittedRef.current) return false;
    const { formValues, radioState: r, checkboxState: c, marAdminState: m } = collectDraftPayload();
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
        submissionId: ensureSubmissionId(),
        currentPage,
        formValues,
        radioState: r,
        checkboxState: c,
        marAdminState: m,
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
  }, [user, profile, isEditMode, collectDraftPayload, currentPage, ensureSubmissionId]);

  // Schedule a debounced autosave. Respects a minimum interval to cap write cost.
  const scheduleAutosave = useCallback(() => {
    if (!draftHydrated || isEditMode || !user || hasSubmittedRef.current) return;
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

  // MAR dose marks live in the module store, not react-hook-form, so the form
  // watch() never sees them — subscribe directly so marking a dose schedules
  // the same debounced autosave as typing in a field.
  useEffect(() => {
    if (isEditMode) return;
    const unsub = marAdminSubscribe(() => scheduleAutosave());
    return () => unsub();
  }, [isEditMode, scheduleAutosave]);

  // The MAR mark store is a module-level singleton shared across the SPA. Reset
  // it when a fresh note mounts and when this page unmounts, so dose marks from
  // one note can never leak into the next (a resumed draft re-populates it via
  // hydrateFromDraft, which also clears first). Without this, "Save & exit" /
  // navigating between notes left marks resident that got submitted under the
  // wrong note.
  useEffect(() => {
    if (isEditMode) return;
    clearMarAdmin();
    return () => clearMarAdmin();
  }, [isEditMode]);

  // Apply a loaded Firestore draft into the form (RHF + radios + checkboxes + page).
  const hydrateFromDraft = useCallback((draft: NoteDraft) => {
    reset(draft.formValues as FormValues);
    // Carry the draft's reserved submission id so a resume-then-submit
    // (or a retry after reload) overwrites the same note rather than
    // duplicating. Drafts written before this field fall back to '' and
    // a fresh id is minted on the next save/submit.
    submissionIdRef.current = draft.submissionId || '';
    setInitialClientName(String(draft.formValues.q3_clientName || ''));
    if (draft.formValues.q12_credential) {
      const cred = String(draft.formValues.q12_credential) as CredentialTier;
      setCredential(cred);
    }
    if (draft.formValues.q61_signature) {
      setInitialSignature(String(draft.formValues.q61_signature));
    }
    // Restore radio state (persist to localStorage too so DeselectableRadio sees
    // it). Clear FIRST so resume REPLACES the radio singleton rather than
    // unioning onto selections left resident from another note in this SPA
    // session (the same cross-note leak class fixed for the MAR mark store).
    clearRadioStorage();
    for (const [k, v] of Object.entries(draft.radioState)) {
      setRadio(k, v);
    }
    // Restore MAR dose marks (Page 5 Given/Held/Refused cards) into the store.
    // Clear FIRST so resume REPLACES the singleton store instead of unioning
    // onto marks left resident from a previous note in this SPA session — those
    // would otherwise ride along and be written under this note (the cross-note
    // "phantom administration" leak).
    clearMarAdmin();
    for (const entry of draft.marAdminState || []) {
      const { key, ...rec } = entry;
      if (key) setMarAdmin(key, rec as unknown as MarAdminRecord);
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
    // Start fresh = a clean MAR store AND radio store too. No navigation/unmount
    // happens here, so the singletons would otherwise keep marks/selections
    // resident from the prior note (the cross-note leak class).
    clearMarAdmin();
    clearRadioStorage();
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

  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  // Discard the current draft entirely: cancel any pending autosave, delete
  // the Firestore draft (if one exists), wipe local form state, and leave
  // the form. Used when a nurse decides not to keep what she's been typing.
  const handleDiscard = async () => {
    if (!user || discarding) return;
    setDiscarding(true);
    try {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      await deleteDraft(user.uid);
      // Remove any medication changes staged on this note so a discarded note
      // leaves nothing behind. Best-effort.
      if (submissionIdRef.current) await deleteStagedChangesForNote(submissionIdRef.current);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(CHECKBOX_STORAGE_KEY);
      localStorage.removeItem('progress-note-page');
      localStorage.removeItem('progress-note-radio-draft');
      clearRadioStorage();
      clearMarAdmin();
      // Hard-navigate so the form unmounts cleanly and any in-flight autosave
      // listeners are torn down.
      window.location.href = '/admin/submissions?discarded=1';
    } catch (err) {
      console.error('Discard failed:', err);
      alert('We couldn\'t discard the draft. Please try again.');
      setDiscarding(false);
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

        // Snapshot the as-loaded values so the submit handler can diff against
        // them and decide whether an edit actually changed anything (gates the
        // "reason for edit" prompt).
        originalEditDataRef.current = { ...(data as unknown as Record<string, unknown>) };

        // Set credential first to ensure correct pages are shown
        if (rawData.q12_credential) {
          handleCredentialChange(rawData.q12_credential);
        }

        // Reset the entire form with saved data (synchronous for RHF fields)
        reset(rawData);

        // Legacy submissions store BP as one "120/80" string; the form now
        // exposes systolic + diastolic as separate numeric inputs. Parse the
        // legacy value into the two new fields so editing an old note works
        // seamlessly.
        if (rawData.q17_bloodPressure) {
          const [sys, dia] = rawData.q17_bloodPressure.split('/').map((p) => p.trim());
          if (sys) setValue('q17_systolic', sys);
          if (dia) setValue('q17_diastolic', dia);
        }

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
            const checkboxes = formRef.current?.querySelectorAll(`input[type="checkbox"][name="${key}"]`);
            checkboxes?.forEach((cb) => {
              (cb as HTMLInputElement).checked = joinedValueIncludes(
                value as string,
                (cb as HTMLInputElement).value
              );
            });
          }

          setEditLoaded(true);

          // Calculate total hours from saved start/end times via React state
          if (rawData.q7_shiftStart && rawData.q62_shiftEndTime) {
            const [sH, sM] = rawData.q7_shiftStart.split(':').map(Number);
            const [eH, eM] = rawData.q62_shiftEndTime.split(':').map(Number);
            const startMin = sH * 60 + sM;
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

  // Keep the nurse's own duplicate-request state live so the modal/banner
  // react the instant an admin approves or denies (no refresh).
  useEffect(() => {
    if (!user || isEditMode) return;
    const unsub = subscribeOwnDupRequest(user.uid, (req) => setDupRequestState(req));
    return () => unsub();
  }, [user, isEditMode]);

  // Does an approval request still apply to the client + date currently in the
  // form? An approval is only honored for the exact shift it was granted for.
  const reqMatchesCurrent = useCallback(
    (req: DuplicateRequest | undefined): boolean => {
      if (!req) return false;
      const dos = String(getValues('q6_dateofService') || '').trim();
      if (req.dateOfService !== dos) return false;
      const pid = String(getValues('patientId') || '').trim();
      if (pid && req.patientId) return req.patientId === pid;
      return normalizeName(req.clientName) === normalizeName(String(getValues('q3_clientName') || ''));
    },
    [getValues]
  );

  // The duplicate hard stop. Returns true if she may proceed. `forSubmit`
  // tightens it: at submit only an APPROVED matching request lets a duplicate
  // through; for navigation a PENDING request also lets her keep working.
  // Admins and edit-mode bypass entirely. Sets `dupBlock` (and surfaces the
  // modal) when blocked.
  const passesDuplicateGate = useCallback(
    async (forSubmit: boolean): Promise<boolean> => {
      if (!user || role === 'admin' || isEditMode) return true;
      const clientName = String(getValues('q3_clientName') || '').trim();
      const dateOfService = String(getValues('q6_dateofService') || '').trim();
      const patientId = String(getValues('patientId') || '').trim();
      if (!clientName || !dateOfService) return true; // not enough to check yet
      const match = await findDuplicateSubmission({
        nurseId: user.uid,
        dateOfService,
        patientId: patientId || undefined,
        clientName,
        excludeId: ensureSubmissionId(),
      });
      if (!match) {
        setDupBlock(null);
        return true;
      }
      const req = dupRequestState;
      const matches = reqMatchesCurrent(req);
      // A request left over from a different client/date no longer applies.
      if (req && !matches && user) {
        void clearDuplicateRequest(user.uid);
      }
      if (matches && req) {
        if (req.status === 'approved') return true;
        if (req.status === 'pending' && !forSubmit) return true;
      }
      setDupBlock(match);
      return false;
    },
    [user, role, isEditMode, getValues, ensureSubmissionId, dupRequestState, reqMatchesCurrent]
  );

  // File (or re-file) the approval request, then let her keep working while it's
  // pending. The own-draft subscription flips dupRequestState to 'pending'.
  const fileDuplicateRequest = useCallback(async () => {
    if (!user) return;
    const clientName = String(getValues('q3_clientName') || '').trim();
    const dateOfService = String(getValues('q6_dateofService') || '').trim();
    const patientId = String(getValues('patientId') || '').trim();
    setDupFiling(true);
    try {
      const res = await authedFetch('/api/duplicate-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName, dateOfService, patientId: patientId || undefined, reason: dupReason.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Request failed (${res.status})`);
      }
      setDupBlock(null);
      setDupReason('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not send the request. Please try again.');
    } finally {
      setDupFiling(false);
    }
  }, [user, getValues, dupReason]);

  const handlePreviousPage = () => {
    if (activeIndex > 0) {
      setCurrentPage(activePages[activeIndex - 1]);
      window.scrollTo(0, 0);
    }
  };

  const handleNextPage = async () => {
    if (activeIndex < totalActivePages - 1) {
      // Catch a duplicate at the start: block leaving Page 1 if she's already
      // documented this client on this date (unless approved / pending).
      if (currentPage === 1) {
        const ok = await passesDuplicateGate(false);
        if (!ok) return;
      }
      setCurrentPage(activePages[activeIndex + 1]);
      window.scrollTo(0, 0);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formRef.current) return;

    // Helper: should this element be validated? We validate required fields on
    // EVERY tab the current credential uses — not just the tab on screen — and
    // jump to the first offender below. Submit lives on the last tab, so a
    // tab-scoped check would let a blank field on an earlier tab slip through.
    // We therefore IGNORE the page-level display:none that merely reflects the
    // active tab, but still skip fields hidden inside a collapsed section or
    // behind a credential overlay (pointerEvents:none), and skip whole tabs
    // this credential doesn't use.
    const isElementValidatable = (el: HTMLElement): boolean => {
      const form = formRef.current;
      if (!form) return false;
      let current: HTMLElement | null = el;
      while (current && current.parentElement && current.parentElement !== form) {
        if (current.style.display === 'none') return false;
        if (current.style.pointerEvents === 'none' && current.style.opacity !== '') return false;
        current = current.parentElement;
      }
      // `current` is now the page-level wrapper (a direct child of the form).
      if (!current || current.parentElement !== form) return false;
      const pageNum = Array.from(form.children).indexOf(current) + 1;
      return activePages.includes(pageNum);
    };

    // Run RHF's validation so the validate rules (numeric range guards,
    // conditional physician-notify rules) populate formState.errors and
    // render inline <span role="alert"> messages we can find in the DOM.
    await trigger();

    // Single needs-attention pass — walks the form in DOM order so the
    // form jumps to whichever issue appears FIRST across all 7 pages,
    // not whichever RHF rule fires first. Two sources:
    //   1. <span role="alert"> rendered by FieldError (RHF rule failures)
    //   2. <input/select/textarea required> that's visible and empty
    //
    // Using querySelectorAll preserves DOM order, so a missing Client Name
    // on page 1 wins over a missing physician detail on page 6. Selecting
    // both kinds in a single query keeps the ordering correct without
    // having to merge two sorted lists.
    const candidates = Array.from(
      formRef.current.querySelectorAll<HTMLElement>(
        '[role="alert"], input[required], select[required], textarea[required]'
      )
    ).filter((el) => {
      if (!isElementValidatable(el)) return false;
      if (el.getAttribute('role') === 'alert') return true;
      const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if ((input as HTMLInputElement).type === 'hidden') return false;
      if ((input as HTMLInputElement).type === 'checkbox') {
        return !(input as HTMLInputElement).checked;
      }
      return !input.value || input.value.trim() === '';
    });

    if (candidates.length > 0) {
      const target = candidates[0];

      // Human-readable name for a candidate so the alert can say *what* is
      // missing. The form is noValidate (native "please fill this in" bubbles
      // are suppressed) and `required` isn't an RHF rule, so empty required
      // fields render no inline message — without this the nurse just gets
      // silently scrolled to a blank box and thinks Submit is broken.
      const friendlyLabel = (el: HTMLElement): string => {
        if (el.getAttribute('role') === 'alert') {
          return (el.textContent || '').trim();
        }
        const id = el.id;
        if (id) {
          const lab = formRef.current?.querySelector<HTMLElement>(`label[for="${id}"]`);
          if (lab?.textContent) return lab.textContent.replace(/[*⚠]/g, '').trim();
        }
        const aria = el.getAttribute('aria-label');
        if (aria) return aria.trim();
        const ph = (el as HTMLInputElement).placeholder;
        if (ph) return ph.trim();
        return 'a required field';
      };
      const missingLabels = Array.from(
        new Set(candidates.map(friendlyLabel).filter(Boolean))
      );

      // Walk up to the page-level wrapper (direct child of the form) so we
      // can switch tabs before scrolling.
      let pageWrap: HTMLElement | null = target;
      while (pageWrap && pageWrap.parentElement !== formRef.current) {
        pageWrap = pageWrap.parentElement;
      }
      if (pageWrap) {
        const pageIndex = Array.from(formRef.current.children).indexOf(pageWrap);
        if (pageIndex >= 0) setCurrentPage(pageIndex + 1);
      }
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Focus the field itself when it's an input (not the alert message),
        // and flag it red so it's obvious which box needs attention. The
        // highlight clears itself once she starts typing.
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
          const inp = target as HTMLInputElement;
          inp.style.border = '2px solid #c62828';
          inp.style.background = '#fff5f5';
          inp.focus();
          const clearHighlight = () => {
            inp.style.border = '';
            inp.style.background = '';
            inp.removeEventListener('input', clearHighlight);
          };
          inp.addEventListener('input', clearHighlight);
        }
      }, 80);

      const list = missingLabels.slice(0, 6).map((l) => `• ${l}`).join('\n');
      const more =
        missingLabels.length > 6 ? `\n…and ${missingLabels.length - 6} more` : '';
      alert(
        `Please complete the following required field${missingLabels.length === 1 ? '' : 's'} before submitting:\n\n${list}${more}\n\nWe've taken you to the first one and highlighted it in red.`
      );
      return;
    }

    // Blood pressure: require either a full reading (both numbers) OR a
    // documented reason it couldn't be obtained. We check this explicitly
    // rather than with the HTML `required` attribute so (a) a nurse can
    // legitimately skip BP when it's genuinely unobtainable, and (b) the
    // check fires from any tab — the required-field scan above only sees the
    // tab the nurse is currently on.
    const bpSys = String(getValues('q17_systolic') || '').trim();
    const bpDia = String(getValues('q17_diastolic') || '').trim();
    const bpReason = String(getValues('q17_bpNotObtainedReason') || '').trim();
    // The section-level "unable to obtain vitals" reason also covers BP —
    // but never a HALF-entered reading: one number with the other blank is a
    // data error regardless of any documented reason.
    const vitalsReason = String(getValues('q16_vitalsNotObtainedReason') || '').trim();
    // BP is only routinely required from age 3 (AAP). Under 3 it's optional, so
    // a blank reading needs no reason — but a HALF-entered reading is a data
    // error at any age.
    const bpRequired = isBpRoutinelyRequired(
      String(getValues('q5_ageYears') || ''),
      String(getValues('q4_dateofBirth') || ''),
    );
    const bpHasReading = bpSys !== '' && bpDia !== '';
    const bpPartial = (bpSys !== '') !== (bpDia !== '');
    if (bpPartial || (bpRequired && !bpHasReading && bpReason === '' && vitalsReason === '')) {
      const partial = bpPartial;
      setCurrentPage(2);
      setTimeout(() => {
        const sysEl = formRef.current?.querySelector('#q17_systolic') as HTMLInputElement | null;
        if (sysEl) {
          sysEl.style.border = '2px solid #c62828';
          sysEl.style.background = '#fff5f5';
          sysEl.focus();
          sysEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      alert(
        partial
          ? 'Please enter BOTH blood pressure numbers (top and bottom), or choose a reason it could not be obtained.'
          : 'Please enter a blood pressure, or — if it could not be obtained — choose a reason from the dropdown under the BP boxes on the Vitals tab.'
      );
      return;
    }

    // Date-of-service guardrails. The picker has max={today}, but a date can
    // still be typed; and a far-past date is where typos (wrong month/day) land.
    // (a) HARD block a future date. (b) SOFT confirm when more than 7 days back.
    const dosStr = String(getValues('q6_dateofService') || '').trim();
    if (dosStr) {
      // Compare at day granularity in local time (anchor at noon to dodge DST).
      const dos = new Date(dosStr + 'T12:00:00');
      const now = new Date();
      const todayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
      if (!Number.isNaN(dos.getTime())) {
        const daysDiff = Math.round((todayNoon.getTime() - dos.getTime()) / 86_400_000);
        if (daysDiff < 0) {
          // Future date: hard stop, no override.
          setCurrentPage(1);
          setTimeout(() => {
            const el = formRef.current?.querySelector('#q6_dateofService') as HTMLElement | null;
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            (el as HTMLInputElement | null)?.focus();
          }, 100);
          alert('The date of service cannot be in the future. Please correct it before submitting.');
          return;
        }
        if (daysDiff > 7 && !skipDateConfirmRef.current) {
          // Backdated more than a week: confirm once (late entries are allowed).
          setPendingDateConfirm({ date: dosStr, daysAgo: daysDiff });
          return;
        }
      }
    }
    skipDateConfirmRef.current = false;

    // Shift End Date (which prints as "Date Signed") can never be BEFORE the
    // date of service: you can't sign off on a shift before it happened. Equal
    // or later is fine (same-day, overnight into the next day, or a late
    // signature). The picker floors at the service date, but a value can still
    // be typed, so enforce it here. Future-dating is already blocked by the
    // input's max={today}.
    const shiftEndStr = String(getValues('q62_shiftEndDate') || '').trim();
    if (dosStr && shiftEndStr) {
      const dos = new Date(dosStr + 'T12:00:00');
      const end = new Date(shiftEndStr + 'T12:00:00');
      if (!Number.isNaN(dos.getTime()) && !Number.isNaN(end.getTime()) && end.getTime() < dos.getTime()) {
        setCurrentPage(activePages[activePages.length - 1]);
        setTimeout(() => {
          const el = formRef.current?.querySelector('#q62_shiftEndDate') as HTMLElement | null;
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          (el as HTMLInputElement | null)?.focus();
        }, 100);
        alert(
          'The shift end date (date signed) cannot be before the date of service. ' +
          'A note cannot be signed before the shift it documents. Please correct the shift end date.'
        );
        return;
      }
    }

    // Client condition at shift end is a DeselectableRadio (stored in the
    // radio module store, not RHF) with no HTML `required` attribute, so the
    // required-field scan above can't see it. Enforce it explicitly like the
    // signature/BP checks so it actually blocks submission.
    const conditionAtEnd = String(radioState['q60_conditionAtEnd'] || '').trim();
    if (!conditionAtEnd) {
      setCurrentPage(activePages[activePages.length - 1]);
      setTimeout(() => {
        const radio = formRef.current?.querySelector(
          'input[name="q60_conditionAtEnd"]'
        ) as HTMLElement | null;
        radio?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      alert("Please select the client's condition at shift end before submitting.");
      return;
    }

    // Adverse drug reaction: when the nurse reports one via the Medication
    // Tolerance radio (page 5, LPN/RN only), the detail box becomes required.
    // We enforce it here rather than via the DOM `required` scan because the
    // box is collapsible (display:none when collapsed hides the inputs from the
    // scan), and the reaction-type checkbox group + Physician Notified radio
    // aren't native-required elements.
    const ADVERSE_VALUE = 'Adverse reaction / intolerance — document below';
    if (
      activePages.includes(5) &&
      String(radioState['q43_medTolerance'] || '') === ADVERSE_VALUE
    ) {
      const reactionMed = String(getValues('q43_reactionMed') || '').trim();
      const reactionDesc = String(getValues('q43_reactionDescription') || '').trim();
      const reactionPhys = String(radioState['q43_reactionPhysNotified'] || '').trim();
      const reactionTypeChecked =
        (formRef.current?.querySelectorAll(
          'input[type="checkbox"][name="q43_reactionType"]:checked'
        ).length ?? 0) > 0;

      const missing: string[] = [];
      if (!reactionMed) missing.push('Medication Involved');
      if (!reactionTypeChecked) missing.push('Reaction Type (select at least one)');
      if (!reactionDesc) missing.push('Description of Reaction');
      if (reactionPhys !== 'Yes' && reactionPhys !== 'No') missing.push('Physician Notified? (Yes or No)');

      if (missing.length > 0) {
        setCurrentPage(5);
        setTimeout(() => {
          const box = formRef.current?.querySelector('#adverse-reaction-detail') as HTMLElement | null;
          box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
        alert(
          `You reported an adverse reaction, so please complete the Adverse Reaction / Intolerance Detail section before submitting:\n\n${missing
            .map((m) => `• ${m}`)
            .join('\n')}`
        );
        return;
      }
    }

    // MAR dose marks: enforced from the STORE, not the DOM, because a marked
    // card can be collapsed/unmounted (the completed-doses section) or resumed
    // from a draft without ever mounting — the required-input scan can't see
    // those. A held/refused dose must say why; a given PRN ("as needed") dose
    // must record why it was given and what happened (the effectiveness
    // follow-up). Same mark selection the submit write uses, so anything this
    // passes is exactly what gets written.
    if (activePages.includes(5)) {
      const marPid = String(getValues('patientId') || '').trim();
      const incomplete: string[] = [];
      if (marPid) {
        for (const m of selectSubmittableMarks(getAllMarAdmin(), {
          patientId: marPid,
          sessionId: submissionIdRef.current,
        })) {
          const med = m.medName || 'a medication';
          const isPrnMark = m.isPRN || m.scheduledTime === 'PRN';
          if ((m.status === 'held' || m.status === 'refused') && !(m.reason || '').trim()) {
            incomplete.push(`${med}: reason it was ${m.status}`);
          } else if (m.status === 'given' && isPrnMark) {
            if (!(m.reason || '').trim()) incomplete.push(`${med}: reason the PRN dose was given`);
            if (!(m.outcome || '').trim()) incomplete.push(`${med}: outcome / result of the PRN dose`);
          }
        }
      }
      if (incomplete.length > 0) {
        setCurrentPage(5);
        window.scrollTo(0, 0);
        alert(
          `Please complete the medication documentation before submitting:\n\n${incomplete
            .map((m) => `• ${m}`)
            .join('\n')}\n\n(Expand "scheduled doses documented today" on the Medications page if a dose is collapsed.)`
        );
        return;
      }
    }

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

    // The required-field + RHF-rule validation now happens above in the
    // unified DOM-order pass, so the old per-field loop is gone.

    // Roster-only enforcement. When admin sets patient.allowFreeText
    // to false in /admin/settings, the nurse must pick a patient from
    // the roster — typed-only names are blocked. We check this BEFORE
    // the "did you mean?" modal because that modal has a "Submit as
    // typed" escape hatch we don't want available when free-text is
    // disabled. Admin-authored notes can bypass via the "did you mean"
    // flow because admins can submit notes for new patients ahead of
    // a roster entry.
    if (!appSettings.patient.allowFreeText && role !== 'admin') {
      const linkedPatientId = String(getValues('patientId') || '').trim();
      if (!linkedPatientId) {
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
        alert(
          'This form requires you to select a patient from the roster. Use the Client Name search field on page 1 to pick the patient. If the patient is new, ask an admin to add them to the roster first.',
        );
        return;
      }
    }

    // Checkpoint 2 of the "did you mean?" flow — last-mile safety net.
    // If the nurse typed a client name that fuzzy-matches a roster
    // patient but never actually picked one (no patientId captured by
    // FormPageOne), interrupt with a confirmation modal so she explicitly
    // chooses between using the roster patient (cleans the data) and
    // submitting as typed (preserves her intent for legitimate edge
    // cases like a new patient not yet in the roster).
    //
    // skipPatientConfirmRef is flipped to true by either modal button
    // before the form re-submits, so we don't loop forever.
    if (!skipPatientConfirmRef.current) {
      const typedName = String(getValues('q3_clientName') || '').trim();
      const linkedPatientId = String(getValues('patientId') || '').trim();
      if (!linkedPatientId && typedName) {
        // Name-only match here too. Whether her typed DOB happens to
        // match the roster patient's DOB or not is interesting context
        // for the modal, but it shouldn't gate whether we prompt — a
        // close name match is enough reason to confirm with the nurse.
        const rosterLite: RosterPatientLite[] = patients
          .filter((p): p is Patient & { id: string } => !!p.id)
          .map((p) => ({ id: p.id, name: p.name, dob: p.dob }));
        const candidates = findNameCandidates(typedName, rosterLite, 1);
        if (candidates.length > 0) {
          setPendingPatientConfirm({ typedName, candidate: candidates[0] });
          return;
        }
      }
    }
    // Consume the skip so a subsequent edit-then-resubmit re-arms the
    // check. One-shot pass, never sticky.
    skipPatientConfirmRef.current = false;

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
        const name = (el as HTMLInputElement).name;
        if (name) checkboxNames.add(name); // skip nameless UI toggles
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

        // If this edit actually changes a field and we haven't captured a
        // reason yet, interrupt to ask why. The client-side diff uses the same
        // rules the server uses to write the audit entry, so the prompt fires
        // exactly when (and only when) an audit entry will be recorded.
        const editChanges = originalEditDataRef.current
          ? computeSubmissionChanges(
              originalEditDataRef.current,
              submission as unknown as Partial<ProgressNoteFormData>,
            )
          : {};
        if (Object.keys(editChanges).length > 0 && !editReasonRef.current.trim()) {
          setSubmitting(false);
          setShowEditReasonModal(true);
          return;
        }

        await updateSubmission(
          editId,
          submission as unknown as Partial<ProgressNoteFormData>,
          {
            uid: user.uid,
            displayName: profile?.displayName ?? user.displayName ?? user.email,
            role,
          },
          editReasonRef.current.trim() || undefined,
        );
        editReasonRef.current = '';
        alert('Progress note updated successfully!');
        window.location.href = `/admin/submissions/${editId}`;
        return;
      }

      // Critical-vitals escalation gate (new notes only). If a documented vital
      // crosses a provider-notification threshold and the nurse hasn't already
      // documented escalation on the Communication page, prompt her to record
      // the escalation she made — or to acknowledge why none was needed.
      if (appSettings.criticalVitals?.enabled !== false && !skipCriticalRef.current) {
        const findings = getCriticalFindings(submission as Record<string, unknown>);
        const alreadyEscalated =
          String(submission.q52_physicianNotify || '').toLowerCase() === 'yes' ||
          String(submission.q52_supervisorNotified || '').toLowerCase() === 'yes';
        if (findings.length > 0 && !alreadyEscalated) {
          setCriticalFindings(findings);
          setCriticalAck('');
          setCriticalNote('');
          setCriticalNotifiedSupervisor(false);
          setCriticalNotifiedPhysician(false);
          setShowCriticalModal(true);
          setSubmitting(false);
          return;
        }
      }
      skipCriticalRef.current = false;

      const submissionId = ensureSubmissionId();
      const clientNameVal = String(submission.q3_clientName || '');
      const dateOfServiceVal = String(submission.q6_dateofService || '');

      // Idempotent retry: if this exact note id was already written (a prior
      // attempt succeeded server-side but the ack never reached the client,
      // e.g. on spotty internet), don't write again — treat it as done.
      const alreadyWritten = await submissionExists(submissionId);

      let docId = submissionId;
      if (!alreadyWritten) {
        // Duplicate hard stop: block a second note for a shift she already
        // documented. Only an APPROVED matching request lets it through;
        // pending/denied/none surface the blocking modal. Admins + edit-mode
        // bypass inside passesDuplicateGate.
        const dupOk = await passesDuplicateGate(true);
        if (!dupOk) {
          setSubmitting(false);
          return;
        }

        docId = await saveSubmission(
          submission as unknown as ProgressNoteFormData,
          { ...(user ? { nurseId: user.uid } : {}), submissionId }
        );
        // Self-healing care-team membership. Always fired post-save —
        // the endpoint handles BOTH the "patientId set by the form"
        // case AND the "nurse typed manually so patientId is empty but
        // name+DOB exact-match a roster patient" case. The latter
        // recovers notes that would otherwise pile up in the
        // /admin/maintenance/link-notes queue. Fire-and-forget — the
        // note is already saved either way.
        if (user) {
          void authedFetch('/api/care-team/auto-add-author', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ noteId: docId }),
          }).catch((err) => console.error('Auto-add to care team failed:', err));
        }

        // Append-only MAR administration entries for the doses the nurse marked
        // on Page 5. Batched (all-or-nothing); a failure is logged but never
        // blocks the already-saved note. Filtered to this note's patientId so a
        // stale mark from another client can't attach.
        if (user && profile) {
          const marPid = String(getValues('patientId') || '').trim();
          const marDate = String(submission.q6_dateofService || '');
          // Defense in depth (P4): write only marks belonging to THIS client AND
          // this note's session, so a dose mark left resident from another note
          // in the SPA singleton can't ride along (the cross-note leak class).
          const marRecords = selectSubmittableMarks(getAllMarAdmin(), {
            patientId: marPid,
            sessionId: submissionId,
          }).map((r) => ({
            patientId: r.patientId,
            orderId: r.orderId,
            medName: r.medName,
            dose: r.dose,
            units: r.units,
            route: r.route,
            scheduledTime: r.scheduledTime,
            status: r.status as 'given' | 'held' | 'refused',
            administeredByType: r.administeredByType,
            administratorName: r.administratorName,
            actualTime: r.actualTime,
            initials: r.initials,
            reason: r.reason,
            isPRN: r.isPRN,
            indication: r.indication || '',
            outcome: r.outcome || '',
          }));
          if (marPid && marRecords.length > 0) {
            try {
              await writeMarAdministrations(marRecords, {
                patientId: marPid,
                date: marDate,
                sourceNoteId: docId,
                documenter: {
                  uid: user.uid,
                  name: profile.displayName || user.email || '',
                  credential: profile.credential || '',
                },
              });
            } catch (err) {
              console.error('Failed to write MAR administrations:', err);
            }
          }
        }

        // Apply any medication changes (add/change/discontinue) the nurse staged
        // on this note. Best-effort post-save, like the care-team add above —
        // the note is already saved, so a failure here is logged, not fatal.
        // Only RN/LPN notes can carry staged changes (Page 5 is gated), so skip
        // the call otherwise to avoid a needless 403.
        if (user && (credential === 'RN' || credential === 'LPN')) {
          void authedFetch('/api/mar/apply-changes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceNoteId: docId, today: dateOfServiceVal }),
          }).catch((err) => console.error('Failed to apply staged MAR changes:', err));
        }
      }

      // Latch "submitted" and cancel any pending autosave BEFORE reset(). The
      // reset() below fires the form's watch() subscription, which re-arms a
      // debounced autosave; without this guard that timer fires after the
      // deleteDraft() below and re-creates an orphan draft (a duplicate note
      // with a fresh submissionId). The ref makes scheduleAutosave/persistDraft
      // no-ops, and clearing the timer kills anything already queued.
      hasSubmittedRef.current = true;
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }

      // Clear the form + draft so "Start another note" yields a blank form
      // and nothing can be accidentally re-submitted. The success splash
      // (below) then hands off to the confirmation page.
      reset();
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(CHECKBOX_STORAGE_KEY);
      localStorage.removeItem('progress-note-page');
      clearRadioStorage();
      clearMarAdmin();
      if (user) {
        try { await deleteDraft(user.uid); } catch (err) { console.error('Failed to delete draft after submit:', err); }
      }
      // Mint a fresh id for the next note so it doesn't collide with this one.
      submissionIdRef.current = '';
      setSaveStatus('idle');
      setLastSavedAt(null);

      // Show the success splash, then redirect to the dedicated confirmation
      // page. Leaving the form entirely is what makes accidental re-submit
      // impossible — there's no Submit button on the confirmation screen.
      setSubmittedInfo({ id: docId, clientName: clientNameVal, dateOfService: dateOfServiceVal });
      setTimeout(() => {
        const qs = new URLSearchParams({ c: clientNameVal, d: dateOfServiceVal }).toString();
        router.push(`/progress-note/submitted/${docId}?${qs}`);
      }, 1800);
      return;
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
          <button
            type="button"
            onClick={() => setShowDiscardModal(true)}
            disabled={discarding}
            style={{
              background: '#fff',
              color: '#b91c1c',
              border: '1px solid #fecaca',
              padding: '8px 14px',
              borderRadius: '4px',
              cursor: discarding ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              opacity: discarding ? 0.6 : 1,
            }}
            title="Discard this note without saving and return to the submissions dashboard"
          >
            Discard
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
              onClick={async () => {
                // Same Page-1 duplicate guard as the Next button.
                if (currentPage === 1 && page > 1) {
                  const ok = await passesDuplicateGate(false);
                  if (!ok) return;
                }
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

      {/* Ambient duplicate-request banner — visible even when the modal is
          closed so she always knows where the approval stands. */}
      {(() => {
        const req = reqMatchesCurrent(dupRequestState) ? dupRequestState : undefined;
        if (!req || req.status === undefined) return null;
        const base: React.CSSProperties = {
          maxWidth: 900,
          margin: '0 auto 12px',
          padding: '10px 14px',
          borderRadius: 8,
          fontSize: 13,
          lineHeight: 1.5,
          border: '1px solid',
        };
        if (req.status === 'pending') {
          return (
            <div style={{ ...base, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
              <strong>Approval requested.</strong> You can keep working on this note, but you can&apos;t
              submit it until an admin or supervisor approves a second note for {req.clientName} on {req.dateOfService}.
            </div>
          );
        }
        if (req.status === 'approved') {
          return (
            <div style={{ ...base, background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}>
              <strong>Approved.</strong> {req.decidedByName ? `${req.decidedByName} approved` : 'A reviewer approved'} a
              second note for {req.clientName} on {req.dateOfService}. You can submit this note.
            </div>
          );
        }
        return (
          <div style={{ ...base, background: '#fdecea', borderColor: '#f5c6c0', color: '#7a1f17' }}>
            <strong>Second note not approved.</strong>{req.denyNote ? ` ${req.denyNote}` : ''} Edit the existing
            note instead, or request again from the duplicate prompt.
          </div>
        );
      })()}

      <form ref={formRef} onSubmit={handleSubmit} className={styles.form} noValidate>
        <div style={pageStyle(1)}><FormPageOne formRef={ref} register={register} watch={watch} setValue={setValue} control={control} onCredentialChange={handleCredentialChange} patients={patients} initialClientName={initialClientName} lockIdentity={isNurse && !isEditMode} /></div>
        <div style={pageStyle(2)}><FormPageTwo formRef={ref} register={register} watch={watch} setValue={setValue} control={control} credential={credential} ageStr={watch('q5_ageYears')} dob={watch('q4_dateofBirth')} errors={errors} /></div>
        <div style={pageStyle(3)}><FormPageThree formRef={ref} register={register} watch={watch} setValue={setValue} control={control} credential={credential} errors={errors} /></div>
        <div style={pageStyle(4)}><FormPageFour formRef={ref} register={register} watch={watch} setValue={setValue} control={control} errors={errors} /></div>
        <div style={pageStyle(5)}><FormPageFive formRef={ref} register={register} watch={watch} setValue={setValue} control={control} credential={credential} isEditMode={isEditMode} documenter={user && profile ? { uid: user.uid, name: profile.displayName || user.email || '', credential: profile.credential || '' } : undefined} getNoteId={ensureSubmissionId} /></div>
        <div style={pageStyle(6)}><FormPageSix formRef={ref} register={register} watch={watch} setValue={setValue} control={control} credential={credential} errors={errors} /></div>
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

      {/* Pre-submit "did you mean?" confirmation — Checkpoint 2.
          Fires when the nurse's typed client name fuzzy-matches a roster
          patient but no patientId was captured (she never picked from
          the dropdown or accepted the Page-1 banner). She must either
          accept the roster patient (cleans the data) or explicitly
          choose to submit as typed (preserves intent for legit new
          patients not yet in the roster). */}
      {pendingPatientConfirm && (
        <div className={`${styles.confirmModal} ${styles.active}`}>
          <div className={styles.modalContent}>
            <h2 style={{ color: '#7c3a00', marginTop: 0 }}>
              Did you mean a patient already in the roster?
            </h2>
            <p style={{ color: '#555', lineHeight: 1.6, marginBottom: 8 }}>
              You&apos;re about to submit this note for:
            </p>
            <p
              style={{
                background: '#f8fafc',
                border: '1px solid #e5eaf0',
                padding: '8px 12px',
                borderRadius: 6,
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                fontSize: 14,
                color: '#1a3a5c',
                margin: '0 0 12px 0',
              }}
            >
              {pendingPatientConfirm.typedName}
            </p>
            <p style={{ color: '#555', lineHeight: 1.6, marginBottom: 8 }}>
              That name closely matches an existing patient in your roster:
            </p>
            <p
              style={{
                background: '#e8f5e9',
                border: '1px solid #c8e6c9',
                padding: '8px 12px',
                borderRadius: 6,
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                fontSize: 14,
                color: '#1a3a5c',
                margin: '0 0 16px 0',
              }}
            >
              {pendingPatientConfirm.candidate.patientName}{' '}
              <span style={{ color: '#5c6b7a', fontSize: 12 }}>
                (DOB {pendingPatientConfirm.candidate.patientDob})
              </span>
            </p>
            <p style={{ color: '#666', fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>
              Using the roster patient auto-fills the canonical name + DOB so other nurses on
              the care team can see your note. Choose &quot;Submit as typed&quot; only if this
              really is a different patient.
            </p>
            <div className={styles.modalButtons}>
              <button
                type="button"
                onClick={() => {
                  // "Submit as typed" — proceed without linking to roster.
                  // The note keeps the typed values; no patientId is set.
                  skipPatientConfirmRef.current = true;
                  setPendingPatientConfirm(null);
                  // Re-fire the submit. requestSubmit() goes through the
                  // form's submit event so our handleSubmit runs again,
                  // but this time the skip ref short-circuits the check.
                  setTimeout(() => formRef.current?.requestSubmit(), 0);
                }}
                className={styles.cancelBtn}
              >
                Submit as typed
              </button>
              <button
                type="button"
                onClick={() => {
                  // "Use roster patient" — overwrite the typed name/DOB
                  // with canonical roster values, fill in the other roster
                  // fields, capture patientId, then re-submit.
                  const target = patients.find(
                    (p) => p.id === pendingPatientConfirm.candidate.patientId,
                  );
                  if (target) {
                    setValue('q3_clientName', target.name);
                    setValue('q4_dateofBirth', target.dob);
                    setValue('q10_primaryDiagnosis', target.diagnosis || '');
                    setValue('q200_addr_line1', target.street || '');
                    setValue('q200_city', target.city || '');
                    setValue('q200_state', target.state || '');
                    setValue('q200_postal', target.zip || '');
                    setValue('patientId', target.id || '');
                  }
                  skipPatientConfirmRef.current = true;
                  setPendingPatientConfirm(null);
                  setTimeout(() => formRef.current?.requestSubmit(), 0);
                }}
                className={styles.confirmBtn}
              >
                Use {pendingPatientConfirm.candidate.patientName}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reason-for-edit capture. Fires when an already-submitted note is
          edited and the change is about to be saved. The editor's identity,
          role, and timestamp are recorded automatically in the audit trail;
          this captures the *why*. */}
      {showEditReasonModal && (
        <div className={`${styles.confirmModal} ${styles.active}`}>
          <div className={styles.modalContent}>
            <h2 style={{ color: '#1a3a5c', marginTop: 0 }}>
              What changed, and why?
            </h2>
            <p style={{ color: '#555', lineHeight: 1.6, marginBottom: 12 }}>
              You&apos;re amending a submitted note. Please note the reason for this
              amendment — it&apos;s saved to the note&apos;s amendment history. Your name,
              role, and the date and time are recorded automatically.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {[
                'Corrected a data-entry error',
                'Added information omitted at the time of charting',
                'Updated per supervisor',
                'Corrected the shift time',
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setEditReasonText(preset)}
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                    borderRadius: 999,
                    padding: '4px 10px',
                    fontSize: 12,
                    color: '#334155',
                    cursor: 'pointer',
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
            <textarea
              value={editReasonText}
              onChange={(e) => setEditReasonText(e.target.value)}
              placeholder="e.g. Corrected the respiratory rate — transposed digits at entry."
              rows={3}
              autoFocus
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 10px',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                fontSize: 14,
                fontFamily: 'inherit',
                resize: 'vertical',
                marginBottom: 16,
              }}
            />
            <div className={styles.modalButtons}>
              <button
                type="button"
                onClick={() => {
                  setShowEditReasonModal(false);
                  setEditReasonText('');
                }}
                className={styles.cancelBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!editReasonText.trim()}
                onClick={() => {
                  const reason = editReasonText.trim();
                  if (!reason) return;
                  editReasonRef.current = reason;
                  setShowEditReasonModal(false);
                  setEditReasonText('');
                  setTimeout(() => formRef.current?.requestSubmit(), 0);
                }}
                className={styles.confirmBtn}
                style={!editReasonText.trim() ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                Save change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Critical-vitals escalation gate. Fires at submit when a documented
          vital crosses a provider-notification threshold and escalation isn't
          already documented. Soft stop: the nurse documents her escalation or
          acknowledges why none was needed, then submits. */}
      {showCriticalModal && (
        <div className={`${styles.confirmModal} ${styles.active}`}>
          <div className={styles.modalContent}>
            <h2 style={{ color: '#b3261e', marginTop: 0 }}>
              Provider notification may be needed
            </h2>
            <p style={{ color: '#555', lineHeight: 1.6, marginBottom: 10 }}>
              One or more vitals you documented are at a level that typically warrants
              notifying the provider per protocol:
            </p>
            <ul style={{ margin: '0 0 14px 0', paddingLeft: 18 }}>
              {criticalFindings.map((f) => (
                <li key={f.key} style={{ color: '#7a1f17', fontSize: 13.5, lineHeight: 1.5, marginBottom: 4 }}>
                  {f.message}
                </li>
              ))}
            </ul>
            <p style={{ color: '#333', fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>
              Before submitting, please record one of the following:
            </p>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, cursor: 'pointer' }}>
              <input type="radio" name="criticalAck" checked={criticalAck === 'notified'} onChange={() => setCriticalAck('notified')} style={{ marginTop: 3 }} />
              <span style={{ fontSize: 13.5, color: '#333' }}>I notified per the chain of command — select who:</span>
            </label>
            {criticalAck === 'notified' && (
              <div style={{ display: 'flex', gap: 18, margin: '0 0 10px 26px' }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={criticalNotifiedSupervisor} onChange={(e) => setCriticalNotifiedSupervisor(e.target.checked)} />
                  Supervisor
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={criticalNotifiedPhysician} onChange={(e) => setCriticalNotifiedPhysician(e.target.checked)} />
                  Physician
                </label>
              </div>
            )}
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10, cursor: 'pointer' }}>
              <input type="radio" name="criticalAck" checked={criticalAck === 'no_escalation_needed'} onChange={() => setCriticalAck('no_escalation_needed')} style={{ marginTop: 3 }} />
              <span style={{ fontSize: 13.5, color: '#333' }}>No escalation needed.</span>
            </label>
            {criticalAck && (
              <textarea
                value={criticalNote}
                onChange={(e) => setCriticalNote(e.target.value)}
                autoFocus
                rows={3}
                placeholder={criticalAck === 'notified'
                  ? 'Who did you notify, and when? (e.g., Called supervisor J. Smith 14:05; MD paged 14:10)'
                  : 'Why is no escalation needed? (e.g., known baseline for this patient; MD already aware)'}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', marginBottom: 14 }}
              />
            )}
            <div className={styles.modalButtons}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => { setShowCriticalModal(false); }}
              >
                Go back
              </button>
              <button
                type="button"
                disabled={!criticalAck || !criticalNote.trim() || (criticalAck === 'notified' && !criticalNotifiedSupervisor && !criticalNotifiedPhysician)}
                className={styles.confirmBtn}
                style={(!criticalAck || !criticalNote.trim() || (criticalAck === 'notified' && !criticalNotifiedSupervisor && !criticalNotifiedPhysician)) ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                onClick={() => {
                  const noteTrim = criticalNote.trim();
                  if (!criticalAck || !noteTrim) return;
                  if (criticalAck === 'notified' && !criticalNotifiedSupervisor && !criticalNotifiedPhysician) return;
                  setValue('q67_criticalFlags', summarizeFindings(criticalFindings));
                  setValue('q67_escalationAck', criticalAck);
                  setValue('q67_escalationNote', noteTrim);
                  // Keep Tab 6 the single source of truth: reflect the escalation
                  // in the Physician / Supervisor "Notified?" fields. Those are
                  // DeselectableRadio values, so set them in the radio store (the
                  // submit-time merge reads from there, not RHF).
                  if (criticalAck === 'notified') {
                    if (criticalNotifiedSupervisor) {
                      setRadio('q52_supervisorNotified', 'Yes');
                      if (!String(getValues('q52_supervisorResponse') || '').trim()) {
                        setValue('q52_supervisorResponse', noteTrim);
                      }
                    }
                    if (criticalNotifiedPhysician) {
                      setRadio('q52_physicianNotify', 'Yes');
                    }
                  }
                  // Pass through on the re-submit; we've already cleared the
                  // patient-confirm step this attempt, so don't re-prompt it.
                  skipCriticalRef.current = true;
                  skipPatientConfirmRef.current = true;
                  setShowCriticalModal(false);
                  setTimeout(() => formRef.current?.requestSubmit(), 0);
                }}
              >
                Confirm & submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backdated date-of-service confirm. Soft stop when the date of service
          is more than 7 days in the past. Late entries are legitimate, so this
          is a confirm (not a block) to catch a typo'd month/day. */}
      {pendingDateConfirm && (
        <div className={`${styles.confirmModal} ${styles.active}`}>
          <div className={styles.modalContent}>
            <h2 style={{ color: '#7c3a00', marginTop: 0 }}>Double-check the date of service</h2>
            <p style={{ color: '#555', lineHeight: 1.6, marginBottom: 8 }}>
              You&apos;ve set the date of service to:
            </p>
            <p style={{ background: '#fff8ec', border: '1px solid #f0d9a8', padding: '8px 12px', borderRadius: 6, fontSize: 15, color: '#1a3a5c', margin: '0 0 12px 0', fontWeight: 700 }}>
              {(() => { const p = pendingDateConfirm.date.split('-'); return p.length === 3 ? `${p[1]}/${p[2]}/${p[0]}` : pendingDateConfirm.date; })()}
              {' '}
              <span style={{ color: '#7c3a00', fontWeight: 600, fontSize: 13 }}>
                ({pendingDateConfirm.daysAgo} days ago)
              </span>
            </p>
            <p style={{ color: '#666', fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>
              That&apos;s more than a week in the past. Late entries are fine, we just want to make
              sure the date is right and not a typo. Is this the correct date of service?
            </p>
            <div className={styles.modalButtons}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => {
                  setPendingDateConfirm(null);
                  setCurrentPage(1);
                  setTimeout(() => {
                    const el = formRef.current?.querySelector('#q6_dateofService') as HTMLElement | null;
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    (el as HTMLInputElement | null)?.focus();
                  }, 100);
                }}
              >
                Let me fix the date
              </button>
              <button
                type="button"
                className={styles.confirmBtn}
                onClick={() => {
                  skipDateConfirmRef.current = true;
                  setPendingDateConfirm(null);
                  setTimeout(() => formRef.current?.requestSubmit(), 0);
                }}
              >
                Yes, the date is correct
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate-note HARD STOP. Fires when a note for this nurse + date of
          service + client already exists. No "submit anyway" — the only way
          through is an admin/supervisor approval, requested from here and
          granted on the In Progress screen. The modal adapts to the request
          state: fresh block, pending (waiting), or denied (with reason). */}
      {dupBlock && (() => {
        const matchedReq = reqMatchesCurrent(dupRequestState) ? dupRequestState : undefined;
        const isPending = matchedReq?.status === 'pending';
        const isDenied = matchedReq?.status === 'denied';
        return (
          <div className={`${styles.confirmModal} ${styles.active}`}>
            <div className={styles.modalContent}>
              <h2 style={{ color: isPending ? '#1a3a5c' : '#7c3a00', marginTop: 0 }}>
                {isPending
                  ? 'Waiting for approval'
                  : isDenied
                  ? 'Second note not approved'
                  : 'You already have a note for this client on this date'}
              </h2>

              <div
                style={{
                  background: '#fff8ec',
                  border: '1px solid #f0d9a8',
                  padding: '10px 12px',
                  borderRadius: 6,
                  fontSize: 14,
                  color: '#1a3a5c',
                  margin: '0 0 16px 0',
                }}
              >
                <strong>{dupBlock.clientName || 'this client'}</strong> on{' '}
                <strong>{dupBlock.dateOfService}</strong>
                {dupBlock.submittedAt && (
                  <span style={{ color: '#5c6b7a', fontSize: 12, display: 'block', marginTop: 4 }}>
                    Submitted {dupBlock.submittedAt.toLocaleString()}
                  </span>
                )}
                {dupBlock.id && (
                  <a
                    href={`/admin/submissions/${dupBlock.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-block',
                      marginTop: 8,
                      color: '#1a73c4',
                      fontSize: 13,
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    View the existing note →
                  </a>
                )}
              </div>

              {isPending ? (
                <p style={{ color: '#555', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
                  Your request to submit a second note for this shift is awaiting approval from an
                  admin or supervisor. You can keep working on it, but you can&apos;t submit until
                  it&apos;s approved.
                </p>
              ) : isDenied ? (
                <>
                  <p style={{ color: '#555', fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
                    An admin or supervisor did not approve a second note for this shift.
                  </p>
                  {matchedReq?.denyNote && (
                    <p
                      style={{
                        background: '#fdecea',
                        border: '1px solid #f5c6c0',
                        color: '#7a1f17',
                        padding: '8px 12px',
                        borderRadius: 6,
                        fontSize: 13,
                        margin: '0 0 16px 0',
                      }}
                    >
                      <strong>Reason:</strong> {matchedReq.denyNote}
                    </p>
                  )}
                  <p style={{ color: '#666', fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
                    If you meant to update the existing note, open it and edit that one instead. If
                    you still believe a second note is needed, you can request again with more
                    detail below.
                  </p>
                </>
              ) : (
                <p style={{ color: '#666', fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>
                  If you meant to update that note, open it and edit the existing one instead.
                  A second note for the same client and date needs an admin or supervisor to
                  approve it first — tell us why and we&apos;ll send them the request.
                </p>
              )}

              {!isPending && (
                <textarea
                  value={dupReason}
                  onChange={(e) => setDupReason(e.target.value)}
                  placeholder="Why do you need a second note for this shift? (e.g., separate AM and PM visit)"
                  rows={3}
                  disabled={dupFiling}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '1px solid #ccc',
                    borderRadius: 6,
                    fontSize: 14,
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    marginBottom: 16,
                  }}
                />
              )}

              <div className={styles.modalButtons}>
                <button type="button" onClick={() => setDupBlock(null)} className={styles.cancelBtn}>
                  {isPending ? 'Keep working' : 'Go back'}
                </button>
                {!isPending && (
                  <button
                    type="button"
                    onClick={fileDuplicateRequest}
                    disabled={dupFiling}
                    className={styles.confirmBtn}
                  >
                    {dupFiling ? 'Sending…' : isDenied ? 'Request again' : 'Request approval'}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Success splash — shown briefly before the redirect to the
          confirmation page. Covers the form so the now-cleared fields
          aren't mistaken for an unsubmitted note. */}
      {submittedInfo && (
        <div className={`${styles.confirmModal} ${styles.active}`}>
          <div className={styles.modalContent} style={{ textAlign: 'center' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: '#e8f5e9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <Check size={36} color="#2e7d32" strokeWidth={3} />
            </div>
            <h2 style={{ color: '#2e7d32', marginTop: 0, marginBottom: 8 }}>
              Note submitted
            </h2>
            <p style={{ color: '#555', lineHeight: 1.6, margin: 0 }}>
              {submittedInfo.clientName ? `${submittedInfo.clientName}'s ` : ''}progress note was
              saved successfully. Taking you to the confirmation…
            </p>
          </div>
        </div>
      )}

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

      {/* Discard confirmation modal — wipes the Firestore draft + localStorage
          AND navigates away. Distinct from "Clear Form" which only resets the
          current page in place. */}
      {showDiscardModal && (
        <div className={`${styles.confirmModal} ${styles.active}`}>
          <div className={styles.modalContent}>
            <h2 style={{ color: '#c62828', marginTop: 0 }}>Discard this note?</h2>
            <p style={{ color: '#555', lineHeight: 1.6, marginBottom: '20px' }}>
              All entered data will be permanently deleted and you&apos;ll return to your submissions list. This cannot be undone.
            </p>
            <div className={styles.modalButtons}>
              <button
                type="button"
                onClick={() => setShowDiscardModal(false)}
                className={styles.cancelBtn}
                disabled={discarding}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDiscard}
                disabled={discarding}
                style={{
                  background: '#c62828',
                  color: 'white',
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: discarding ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  opacity: discarding ? 0.6 : 1,
                }}
              >
                {discarding ? 'Discarding…' : 'Yes, Discard'}
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
