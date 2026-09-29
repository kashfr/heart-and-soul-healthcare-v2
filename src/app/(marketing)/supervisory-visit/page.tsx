'use client';

/**
 * Home Supervisory Visit — the in-app version of the agency's paper form,
 * completed by a nurse supervisor at the client's home. A single scrolling
 * form, built on the RN oversight note's pattern (radio store + RHF text
 * fields, autosaved sub-draft, signature pad, amend with an edit reason).
 *
 * Storage: same `progressNotes` collection as shift notes, discriminated by
 * noteType (see src/lib/supervisoryVisit.ts for the key scheme and rules).
 * On submit the PDF is filed to the client's Documents under
 * "Supervisory Visit", and the scheduled supervisory visit on that date (if
 * any) is marked completed.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ViewAsWriteBlock } from '@/components/ImpersonationProvider';
import { useForm } from 'react-hook-form';
import { getPatients, getPatientClinical, type Patient } from '@/lib/patients';
import { baselinesToNoteFields } from '@/lib/vitalsBaselines';
import { computeAgeString } from '@/lib/age';
import { formatDateUS } from '@/lib/dateFormat';
import {
  saveSubmission,
  updateSubmission,
  getSubmission,
  findDuplicateSubmission,
  type ProgressNoteFormData,
} from '@/lib/submissions';
import {
  saveSupervisoryDraft,
  loadSupervisoryDraft,
  clearSupervisoryDraft,
  type SupervisoryDraft,
} from '@/lib/drafts';
import {
  SUPERVISORY_NOTE_TYPE,
  SUPERVISORY_RADIO_KEYS,
  canAuthorSupervisoryVisit,
  getSupervisoryIncomplete,
} from '@/lib/supervisoryVisit';
import {
  getActiveFieldStaff,
  completeScheduledSupervisoryVisit,
  type AssigneeOption,
} from '@/lib/patientVisits';
import { useAuth } from '@/components/AuthProvider';
import { authedFetch } from '@/lib/authedFetch';
import { fileNoteDocument } from '@/lib/patientDocuments';
import { escortToField, FieldError, FIELD_ERROR_STYLE, FIELD_ERROR_WRAP_STYLE } from '@/lib/formEscort';
import SignatureCanvas, { type SignatureCanvasHandle } from '@/components/SignatureCanvas';
import DeselectableRadio, {
  radioState,
  setRadio,
  clearRadioStorage,
  radioSubscribe,
  radioGetSnapshot,
} from '../progress-note/components/DeselectableRadio';
import VitalSignsFields from '../progress-note/components/VitalSignsFields';
import VitalsRecheckSection from '../progress-note/components/VitalsRecheckSection';
import { isBpRoutinelyRequired } from '@/lib/vitalRanges';
import type { FormValues } from '../progress-note/types';
import styles from '../progress-note/page.module.css';

/** Radio row rendered from an option list; the wrapper id is the rule key so
 *  the required-field scroll can find radio groups as well as inputs. */
function RadioRow({
  name,
  options,
  error,
  onPick,
}: {
  name: string;
  options: string[];
  error?: string;
  onPick?: () => void;
}) {
  return (
    <div id={name} onClickCapture={onPick}>
      <div className={styles.radioRow} style={error ? FIELD_ERROR_WRAP_STYLE : undefined}>
        {options.map((o) => (
          <label key={o}>
            <DeselectableRadio name={name} value={o} /> {o}
          </label>
        ))}
      </div>
      <FieldError message={error} />
    </div>
  );
}

function Area({
  id,
  label,
  register,
  rows = 3,
  required = false,
  placeholder,
  error,
}: {
  id: string;
  label: string;
  register: ReturnType<typeof useForm<FormValues>>['register'];
  rows?: number;
  required?: boolean;
  placeholder?: string;
  error?: string;
}) {
  return (
    <div className={styles.row}>
      <div className={styles.f} style={{ flex: '1 1 100%' }}>
        <label className={styles.label} htmlFor={id}>
          {label}
          {required ? ' *' : ''}
        </label>
        <textarea
          className={styles.textarea}
          id={id}
          rows={rows}
          placeholder={placeholder}
          style={error ? FIELD_ERROR_STYLE : undefined}
          aria-invalid={!!error}
          {...register(id)}
        />
        <FieldError message={error} />
      </div>
    </div>
  );
}

/** Per-field wording for a blocked submit. Anything not listed falls back to
 *  "<rule label> is required." so a new rule still gets a message. */
const SUPERVISORY_FIELD_MESSAGES: Record<string, string> = {
  q3_clientName: 'Select the client from the roster.',
  q6_dateofService: 'Enter the date of the visit.',
  sv_timeIn: 'Enter the time you arrived.',
  sv_timeOut: 'Enter the time you left.',
  sv_address: 'Enter the address where the visit took place.',
  sv_staffName: 'Choose the staff member performing duties.',
  q11_nurseName: 'Enter the supervisor name.',
  sv_complaint: "Record the client's answer to the complaint question.",
  sv_anythingElse: "Record the client's answer, or note that they had nothing to add.",
  q16_temperature: 'Enter the temperature, or choose why vitals could not be obtained.',
  q16_temperatureRoute: 'Choose how the temperature was taken.',
  q17_bloodPressure: 'Enter both blood pressure numbers, or choose why it could not be obtained.',
  q18_pulse: 'Enter the pulse, or choose why vitals could not be obtained.',
  q19_respiration: 'Enter the respirations, or choose why vitals could not be obtained.',
  q20_oxygenSaturation: 'Enter the O2 saturation, or choose why vitals could not be obtained.',
  q21_oxygenSource: 'Choose the oxygen source for the recorded saturation.',
  sv_generalConditions: "Describe the client's general conditions.",
  sv_clientProgress: "Document the client's progress.",
  sv_problems: 'Choose whether the client encountered any problems.',
  sv_problemsDetail: 'Describe the problems the client encountered.',
  sv_rightsInformed: 'Choose whether the client was informed of their rights.',
  sv_clientSatisfied: 'Choose whether the client is satisfied with the services.',
  sv_dissatisfaction: "Explain the client's dissatisfaction.",
  sv_interviewMethod: 'Choose whether the interview was by phone or in person.',
  sv_levelOfCare: "Choose whether the level of care is appropriate for the client's needs.",
  sv_levelOfCareRecs: 'Document your recommendations for the level of care.',
  sv_satisfiedWithStaff: 'Choose whether the client is satisfied with the staff.',
  sv_staffFeedback: "Document the client's feedback on the staff's performance.",
  q61_signature: 'Sign the form before submitting.',
};

const addressOf = (p: Patient | undefined): string => {
  if (!p) return '';
  const cityLine = [p.city, [p.state, p.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [p.street, cityLine].filter(Boolean).join(', ');
};

const staffLabel = (s: AssigneeOption): string => (s.credential ? `${s.name}, ${s.credential}` : s.name);

function SupervisoryVisitPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const isEditMode = !!editId;
  const { user, profile, role } = useAuth();
  const formRef = useRef<HTMLFormElement>(null!);
  const sigRef = useRef<SignatureCanvasHandle>(null);
  // Stable id for this form session: a retry after a network failure
  // overwrites the same document instead of duplicating the form.
  const submissionIdRef = useRef('');
  if (!submissionIdRef.current && typeof crypto !== 'undefined') {
    submissionIdRef.current = crypto.randomUUID();
  }
  const { register, watch, setValue, getValues, trigger, formState: { errors: rhfErrors } } = useForm<FormValues>();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [fieldStaff, setFieldStaff] = useState<AssigneeOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [editLoaded, setEditLoaded] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<SupervisoryDraft | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [showEditReason, setShowEditReason] = useState(false);
  const [initialSignature, setInitialSignature] = useState('');
  // Re-render on any radio change: some answers decide whether a comment
  // box shows or is required.
  useSyncExternalStore(radioSubscribe, radioGetSnapshot, radioGetSnapshot);
  const answers = radioState;
  const editReasonRef = useRef('');
  const hydratedRef = useRef(false);
  const allowed = canAuthorSupervisoryVisit(role);

  // Fresh form: the radio store is a module-level singleton shared with the
  // other note forms; scrub it on mount and unmount.
  useEffect(() => {
    clearRadioStorage();
    return () => clearRadioStorage();
  }, []);

  useEffect(() => {
    if (!allowed) return;
    getPatients().then(setPatients);
    getActiveFieldStaff().then(setFieldStaff);
  }, [allowed]);

  // Prefill the supervisor's identity. Never in edit mode: the form keeps the
  // supervisor who documented the visit.
  useEffect(() => {
    if (isEditMode || !profile) return;
    if (profile.displayName) setValue('q11_nurseName', profile.displayName);
    setValue('q12_credential', profile.credential || 'RN');
  }, [isEditMode, profile, setValue]);

  const selectablePatients = useMemo(
    () => [...patients].sort((a, b) => a.name.localeCompare(b.name)),
    [patients],
  );

  const selectedPatientId = watch('patientId');
  const selectedPatient = patients.find((p) => p.id === selectedPatientId);
  const handleSelectPatient = useCallback(
    (id: string) => {
      const p = patients.find((x) => x.id === id);
      setValue('patientId', id);
      setValue('q3_clientName', p?.name || '');
      setValue('q4_dateofBirth', p?.dob || '');
      setValue('q5_ageYears', p?.dob ? computeAgeString(p.dob) : '');
      setValue('q10_primaryDiagnosis', p?.diagnosis || '');
      setValue('q2_program', p?.program || '');
      setValue('q2_serviceLevel', p?.serviceLevel || '');
      setValue('sv_address', addressOf(p), { shouldDirty: true });
      // Baseline snapshot (q16b_*): the client's own vitals ranges, if any,
      // so the vitals here are judged the same way as on a shift note.
      const applyBaselines = (fields: Record<string, string>) => {
        for (const [k, v] of Object.entries(fields)) setValue(k, v);
      };
      applyBaselines(baselinesToNoteFields());
      if (id) {
        getPatientClinical(id)
          .then((c) => applyBaselines(baselinesToNoteFields(c?.vitalsBaselines, c?.vitalsBaselinesNote)))
          .catch(() => {});
      }
    },
    [patients, setValue],
  );

  // Staff performing duties: the client's assigned staff first, then everyone
  // else, so the usual choice is at the top of the list.
  const staffGroups = useMemo(() => {
    const assigned = new Set(selectedPatient?.assignedNurseIds || []);
    return {
      assigned: fieldStaff.filter((s) => assigned.has(s.uid)),
      others: fieldStaff.filter((s) => !assigned.has(s.uid)),
    };
  }, [fieldStaff, selectedPatient]);
  const staffName = String(watch('sv_staffName') || '');
  const staffId = String(watch('sv_staffId') || '');
  // A stored name that no longer matches an active user (staff left, or the
  // list has not loaded yet) still shows, so an amend never drops it.
  const staffNameUnlisted = !!staffName && !fieldStaff.some((s) => s.uid === staffId);

  /** Apply a stored flat record (draft or submitted form) into both stores. */
  const hydrate = useCallback(
    (flat: Record<string, unknown>, radios?: Record<string, string>) => {
      const radioKeys = new Set<string>(SUPERVISORY_RADIO_KEYS);
      for (const [k, v] of Object.entries(flat)) {
        if (v == null) continue;
        // Radio answers live in the radio store only (see oversight-note).
        if (radioKeys.has(k)) continue;
        if (typeof v === 'string') setValue(k, v);
      }
      if (typeof flat.q61_signature === 'string' && flat.q61_signature) {
        setInitialSignature(flat.q61_signature);
      }
      // A stored "S/D" string without its two parts (older records) still
      // fills both BP inputs.
      const bp = typeof flat.q17_bloodPressure === 'string' ? flat.q17_bloodPressure : '';
      if (bp && !flat.q17_systolic && !flat.q17_diastolic) {
        const [s, d] = bp.split('/');
        setValue('q17_systolic', (s || '').trim());
        setValue('q17_diastolic', (d || '').trim());
      }
      clearRadioStorage();
      const radioSource =
        radios ??
        Object.fromEntries(
          SUPERVISORY_RADIO_KEYS.filter((k) => typeof flat[k] === 'string' && flat[k]).map((k) => [
            k,
            String(flat[k]),
          ]),
        );
      for (const [k, v] of Object.entries(radioSource)) if (v) setRadio(k, v);
    },
    [setValue],
  );

  // Edit mode: load the submitted form. Guard the document type so another
  // note type opened here can never be saved through these rules.
  useEffect(() => {
    if (!isEditMode || !editId || hydratedRef.current || !allowed) return;
    hydratedRef.current = true;
    draftLookupDoneRef.current = true; // no draft layer in edit mode
    (async () => {
      try {
        const data = await getSubmission(editId);
        if (!data) {
          alert('Form not found.');
          router.push('/admin/submissions');
          return;
        }
        const flat = data as unknown as Record<string, unknown>;
        if (flat.noteType !== SUPERVISORY_NOTE_TYPE) {
          alert('That record is not a Home Supervisory Visit; open it from its own form.');
          router.push(`/admin/submissions/${editId}`);
          return;
        }
        hydrate(flat);
        setEditLoaded(true);
      } catch (err) {
        console.error('Failed to load supervisory visit for editing:', err);
        alert('The form could not be loaded.');
      }
    })();
  }, [isEditMode, editId, hydrate, router, allowed]);

  // New form: offer to resume an autosaved draft (never in edit mode).
  useEffect(() => {
    if (isEditMode || !user?.uid || hydratedRef.current || !allowed) return;
    loadSupervisoryDraft(user.uid)
      .then((d) => {
        if (d && Object.keys(d.formValues || {}).length > 0) setPendingDraft(d);
      })
      .catch((err) => console.warn('Supervisory draft lookup failed:', err))
      // Autosave stays parked until this resolves either way, otherwise it
      // could overwrite the stored draft with a blank form.
      .finally(() => {
        draftLookupDoneRef.current = true;
      });
  }, [isEditMode, user?.uid, allowed]);

  const resumeDraft = useCallback(() => {
    if (!pendingDraft) return;
    hydratedRef.current = true;
    hydrate(pendingDraft.formValues, pendingDraft.radioState);
    if (pendingDraft.submissionId) submissionIdRef.current = pendingDraft.submissionId;
    setPendingDraft(null);
  }, [pendingDraft, hydrate]);

  const discardDraft = useCallback(() => {
    setPendingDraft(null);
    if (user?.uid) void clearSupervisoryDraft(user.uid);
  }, [user?.uid]);

  // --- Leaving the form ---------------------------------------------------
  const [showDiscard, setShowDiscard] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const stopAutosave = () => {
    hasSubmittedRef.current = true; // blocks any further autosave writes
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
  };
  /** Keep the draft and go back to Submissions. */
  const saveAndExit = async () => {
    if (leaving) return;
    setLeaving(true);
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    try {
      await persistDraftRef.current();
    } finally {
      stopAutosave();
      clearRadioStorage();
      router.push('/admin/submissions?draftSaved=supervisory');
    }
  };
  /** Throw the draft away and go back to Submissions. */
  const discardAndExit = async () => {
    if (leaving) return;
    setLeaving(true);
    stopAutosave();
    try {
      if (user?.uid) await clearSupervisoryDraft(user.uid);
    } catch (err) {
      console.warn('Clearing the supervisory draft failed:', err);
    }
    clearRadioStorage();
    router.push('/admin/submissions?discarded=supervisory');
  };
  /** Amend mode: leave without saving any changes. */
  const cancelAmend = () => {
    clearRadioStorage();
    router.push(editId ? `/admin/submissions/${editId}` : '/admin/submissions');
  };

  // Autosave, driven by RHF's change subscription (see oversight-note for why
  // it must never depend on render identity). Radio picks also schedule it.
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSubmittedRef = useRef(false);
  const draftLookupDoneRef = useRef(false);
  const pendingDraftRef = useRef(false);
  useEffect(() => {
    pendingDraftRef.current = !!pendingDraft;
  }, [pendingDraft]);

  const persistDraftRef = useRef<() => Promise<void>>(async () => {});
  const persistDraft = useCallback(async () => {
    if (isEditMode || !user?.uid) return;
    const values = getValues();
    const filled = Object.entries(values).filter(
      ([, v]) => typeof v === 'string' && v.trim() !== '',
    );
    // Identity-only prefill (name + credential) isn't worth a draft.
    if (filled.length <= 2) return;
    await saveSupervisoryDraft(user.uid, {
      clientName: String(values.q3_clientName || ''),
      dateOfService: String(values.q6_dateofService || ''),
      submissionId: submissionIdRef.current || undefined,
      formValues: values,
      // Only this form's radios: the store is shared with the other forms.
      radioState: Object.fromEntries(
        SUPERVISORY_RADIO_KEYS.filter((k) => radioState[k]).map((k) => [k, radioState[k]]),
      ),
      checkboxState: {},
    })
      .then(() => setDraftSavedAt(new Date()))
      .catch((err) => console.warn('Supervisory draft autosave failed:', err));
  }, [isEditMode, user?.uid, getValues]);
  useEffect(() => {
    persistDraftRef.current = persistDraft;
  }, [persistDraft]);

  const scheduleAutosave = useCallback(() => {
    if (isEditMode || !user?.uid) return;
    if (!draftLookupDoneRef.current || pendingDraftRef.current || hasSubmittedRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      if (hasSubmittedRef.current) return;
      void persistDraftRef.current();
    }, 2500);
  }, [isEditMode, user?.uid]);

  useEffect(() => {
    if (isEditMode) return;
    const sub = watch(() => scheduleAutosave());
    const unsubRadio = radioSubscribe(scheduleAutosave);
    return () => {
      sub.unsubscribe();
      unsubRadio();
    };
  }, [watch, isEditMode, scheduleAutosave]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  const [missing, setMissing] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [editReasonError, setEditReasonError] = useState('');

  const clearFieldError = useCallback((key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  useEffect(() => {
    const sub = watch((_values, info) => {
      if (info.name) clearFieldError(String(info.name));
    });
    return () => sub.unsubscribe();
  }, [watch, clearFieldError]);

  const onRadioPick = clearFieldError;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formRef.current || submitting) return;
    setSubmitError('');

    const values = getValues();
    for (const k of SUPERVISORY_RADIO_KEYS) {
      values[k] = radioState[k] || '';
    }
    // Explanations whose question no longer calls for one are hidden; drop
    // anything typed there before the answer changed.
    if (values.sv_problems !== 'Yes') values.sv_problemsDetail = '';
    if (values.sv_clientSatisfied !== 'No') values.sv_dissatisfaction = '';

    values.noteType = SUPERVISORY_NOTE_TYPE;
    // Rev 2 (09/2026): the full vitals block (respiration, SpO2 + source,
    // "unable to obtain" reasons, rechecks), matching the shift note.
    values.q1_formRev = '2';
    // Signed at the end of the visit; stamp the signed date from the visit
    // date so the signature block never renders "Date Signed: --".
    values.q62_shiftEndDate = String(values.q6_dateofService || '');

    const issues = getSupervisoryIncomplete(values as Record<string, string>);
    if (issues.length > 0) {
      setMissing(issues.map((i) => i.label));
      const errs: Record<string, string> = {};
      for (const i of issues) errs[i.key] = SUPERVISORY_FIELD_MESSAGES[i.key] || `${i.label} is required.`;
      setFieldErrors(errs);
      escortToField(issues[0].key);
      return;
    }
    setMissing([]);

    // Typo guard on the vitals (the same bounds as the shift note).
    const VITAL_INPUTS = ['q16_temperature', 'q17_systolic', 'q17_diastolic', 'q18_pulse', 'q19_respiration', 'q20_oxygenSaturation'] as const;
    const vitalsOk = await trigger([...VITAL_INPUTS]);
    if (!vitalsOk) {
      const firstBad = VITAL_INPUTS.find((k) => rhfErrors[k]);
      escortToField(firstBad === 'q17_systolic' || firstBad === 'q17_diastolic' ? 'q17_bloodPressure' : firstBad || 'q16_temperature');
      return;
    }

    if (String(values.sv_timeOut) <= String(values.sv_timeIn)) {
      setFieldErrors({ sv_timeOut: 'Time out must be after time in. Check the visit times.' });
      escortToField('sv_timeOut');
      return;
    }
    setFieldErrors({});

    if (isEditMode && editId) {
      if (!editReasonRef.current.trim()) {
        setEditReasonError('');
        setShowEditReason(true);
        return;
      }
      try {
        setSubmitting(true);
        if (!user || !role) throw new Error('You must be signed in to update a form.');
        await updateSubmission(
          editId,
          values as unknown as Partial<ProgressNoteFormData>,
          {
            uid: user.uid,
            displayName: profile?.displayName ?? user.displayName ?? user.email,
            role,
          },
          editReasonRef.current.trim(),
        );
        editReasonRef.current = '';
        try {
          await authedFetch(`/api/admin/submissions/${editId}/amended`, { method: 'POST' });
        } catch (err) {
          console.warn('Correction-amended event failed (non-fatal):', err);
        }
        // Re-file so the PDF in the client's Documents matches the record.
        try {
          await fileNoteDocument(editId);
        } catch (err) {
          console.warn('Re-filing the amended supervisory visit failed (non-fatal):', err);
        }
        clearRadioStorage();
        alert('Supervisory visit updated.');
        window.location.href = `/admin/submissions/${editId}`;
      } catch (err) {
        console.error('Supervisory visit update failed:', err);
        setSubmitError('The form could not be updated. Please check your connection and try again.');
        setSubmitting(false);
      }
      return;
    }

    try {
      setSubmitting(true);
      hasSubmittedRef.current = true;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

      const dup = await findDuplicateSubmission({
        nurseId: user?.uid || '',
        dateOfService: String(values.q6_dateofService || ''),
        patientId: String(values.patientId || '') || undefined,
        clientName: String(values.q3_clientName || ''),
        excludeId: submissionIdRef.current,
        noteType: SUPERVISORY_NOTE_TYPE,
      });
      if (dup) {
        setSubmitting(false);
        hasSubmittedRef.current = false;
        setSubmitError(
          `A supervisory visit for ${values.q3_clientName} on this date already exists. ` +
            'Open it from Submissions instead of filing a second one. If this is intentional ' +
            '(a second visit the same day), contact the administrator.',
        );
        return;
      }

      const docId = await saveSubmission(values as unknown as ProgressNoteFormData, {
        nurseId: user?.uid || '',
        submissionId: submissionIdRef.current || undefined,
      });
      clearRadioStorage();
      if (user?.uid) await clearSupervisoryDraft(user.uid).catch(() => {});
      // File into the client's Documents (Supervisory Visit). Non-fatal: the
      // form is the record; staff can Sync from the Documents tab.
      try {
        await fileNoteDocument(docId);
      } catch (err) {
        console.warn('Auto-filing the supervisory visit failed (non-fatal):', err);
      }
      // Close out the scheduled supervisory visit for that day. Non-fatal:
      // staff can still mark it on the Schedule tab.
      try {
        await completeScheduledSupervisoryVisit(
          String(values.patientId || ''),
          String(values.q6_dateofService || ''),
          { uid: user?.uid || '', name: profile?.displayName || user?.email || '' },
        );
      } catch (err) {
        console.warn('Marking the scheduled supervisory visit completed failed (non-fatal):', err);
      }
      const c = encodeURIComponent(String(values.q3_clientName || ''));
      const d = encodeURIComponent(String(values.q6_dateofService || ''));
      router.push(`/progress-note/submitted/${docId}?c=${c}&d=${d}&t=supervisory`);
    } catch (err) {
      console.error('Supervisory visit submit failed:', err);
      setSubmitError('The form could not be submitted. Please check your connection and try again.');
      hasSubmittedRef.current = false;
      setSubmitting(false);
    }
  };

  // BP is routinely required from age 3 (AAP); under 3 it is optional, as on the shift note.
  const bpRequired = isBpRoutinelyRequired(String(watch('q5_ageYears') || ''), String(watch('q4_dateofBirth') || ''));
  const fe = (k: string) => fieldErrors[k] || (rhfErrors[k]?.message ? String(rhfErrors[k]?.message) : undefined);
  const hi = (k: string) => (fieldErrors[k] ? FIELD_ERROR_STYLE : undefined);

  if (!allowed) {
    return (
      <div className={`${styles.container} ${styles.wrap}`} style={{ maxWidth: 640, margin: '40px auto' }}>
        <h1 style={{ fontSize: 20 }}>Home Supervisory Visit</h1>
        <p style={{ lineHeight: 1.6, color: '#444' }}>
          This form is completed by nurse supervisors and administrators. If you should have access,
          contact the administrator.
        </p>
      </div>
    );
  }

  const input = (id: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, flex = '1 1 30%') => (
    <div className={styles.f} style={{ flex }}>
      <label className={styles.label} htmlFor={id}>
        {label} *
      </label>
      <input className={styles.input} id={id} style={hi(id)} aria-invalid={!!fe(id)} {...props} {...register(id)} />
      <FieldError message={fe(id)} />
    </div>
  );

  const yesNo = (name: string, label: string) => (
    <div className={styles.row}>
      <div className={styles.f} style={{ flex: '1 1 100%' }}>
        <label className={styles.label}>{label} *</label>
        <RadioRow name={name} error={fe(name)} onPick={() => onRadioPick(name)} options={['Yes', 'No']} />
      </div>
    </div>
  );

  return (
    <div className={`${styles.container} ${styles.wrap}`}>
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => (isEditMode ? cancelAmend() : setShowDiscard(true))}
          aria-label={isEditMode ? 'Cancel changes and close' : 'Close this form'}
          title={isEditMode ? 'Cancel changes' : 'Close (save or discard)'}
          style={{
            position: 'absolute',
            top: -4,
            right: 0,
            width: 34,
            height: 34,
            borderRadius: 8,
            border: '1px solid #d0d7de',
            background: 'white',
            color: '#475569',
            fontSize: 18,
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
        <h1 style={{ textAlign: 'center', fontSize: 22, marginBottom: 2, padding: '0 40px' }}>
          Home Supervisory Visit{isEditMode ? ' (Amend)' : ''}
        </h1>
      </div>
      <p style={{ textAlign: 'center', color: '#5c6b7a', fontSize: 13, marginTop: 0 }}>
        Completed by the nurse supervisor at the client&apos;s home. One form per visit.
      </p>

      {isEditMode && !editLoaded && (
        <p style={{ textAlign: 'center', color: '#5c6b7a', fontSize: 13 }}>Loading the form…</p>
      )}

      {pendingDraft && (
        <div
          style={{
            background: '#fff8e1',
            border: '1px solid #ffe0a3',
            borderRadius: 8,
            padding: '12px 16px',
            margin: '0 0 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 14, color: '#7c3a00', flex: '1 1 260px' }}>
            You have an unfinished supervisory visit
            {pendingDraft.clientName ? ` for ${pendingDraft.clientName}` : ''}
            {pendingDraft.updatedAt ? `, last saved ${pendingDraft.updatedAt.toLocaleString()}` : ''}.
          </span>
          <button type="button" className={styles.navBtn} onClick={resumeDraft}>
            Resume Draft
          </button>
          <button type="button" className={styles.navBtn} onClick={discardDraft}>
            Start Fresh
          </button>
        </div>
      )}

      {!isEditMode && draftSavedAt && !pendingDraft && (
        <p style={{ textAlign: 'center', color: '#7f8c8d', fontSize: 12, marginTop: 0 }}>
          Draft saved {draftSavedAt.toLocaleTimeString()}
        </p>
      )}

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className={styles.form}
        noValidate
        style={isEditMode && !editLoaded ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
      >
        <div>
          {/* VISIT */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>CLIENT &amp; VISIT</span>

            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 60%' }}>
                <label className={styles.label} htmlFor="q3_clientName">
                  Client name *
                </label>
                <select
                  className={styles.select}
                  id="q3_clientName"
                  value={selectedPatientId || ''}
                  onChange={(e) => handleSelectPatient(e.target.value)}
                  style={hi('q3_clientName')}
                  aria-invalid={!!fe('q3_clientName')}
                >
                  <option value="">Select a Client…</option>
                  {/* Amend: the stored client always shows, even if the
                      roster has not loaded or the client is no longer active. */}
                  {isEditMode && selectedPatientId && !selectedPatient && (
                    <option value={selectedPatientId}>{String(watch('q3_clientName') || '')}</option>
                  )}
                  {selectablePatients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <FieldError message={fe('q3_clientName')} />
              </div>
              <div className={styles.f} style={{ flex: '1 1 35%' }}>
                <label className={styles.label}>Date of birth</label>
                <input className={styles.input} value={formatDateUS(watch('q4_dateofBirth') || '')} readOnly />
              </div>
            </div>

            <div className={styles.row}>
              {input('q6_dateofService', 'Date', { type: 'date' })}
              {input('sv_timeIn', 'Time in', { type: 'time' })}
              {input('sv_timeOut', 'Time out', { type: 'time' })}
            </div>

            <div className={styles.row}>{input('sv_address', 'Address', {}, '1 1 100%')}</div>

            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 48%' }}>
                <label className={styles.label} htmlFor="sv_staffName">
                  Staff performing duties *
                </label>
                <select
                  className={styles.select}
                  id="sv_staffName"
                  value={staffNameUnlisted ? '__stored' : staffId}
                  onChange={(e) => {
                    const s = fieldStaff.find((x) => x.uid === e.target.value);
                    setValue('sv_staffId', s?.uid || '', { shouldDirty: true });
                    setValue('sv_staffName', s ? staffLabel(s) : '', { shouldDirty: true });
                  }}
                  style={hi('sv_staffName')}
                  aria-invalid={!!fe('sv_staffName')}
                >
                  <option value="">Select Staff…</option>
                  {staffNameUnlisted && <option value="__stored">{staffName}</option>}
                  {staffGroups.assigned.length > 0 && (
                    <optgroup label="Assigned to this client">
                      {staffGroups.assigned.map((s) => (
                        <option key={s.uid} value={s.uid}>
                          {staffLabel(s)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label={staffGroups.assigned.length > 0 ? 'Other staff' : 'Staff'}>
                    {staffGroups.others.map((s) => (
                      <option key={s.uid} value={s.uid}>
                        {staffLabel(s)}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <FieldError message={fe('sv_staffName')} />
              </div>
              <div className={styles.f} style={{ flex: '1 1 48%' }}>
                <label className={styles.label} htmlFor="q11_nurseName">
                  Supervisor *
                </label>
                <input
                  className={styles.input}
                  id="q11_nurseName"
                  style={hi('q11_nurseName')}
                  aria-invalid={!!fe('q11_nurseName')}
                  {...register('q11_nurseName')}
                />
                <FieldError message={fe('q11_nurseName')} />
              </div>
            </div>
          </div>

          {/* CLIENT QUESTIONS */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>CLIENT QUESTIONS</span>
            <Area
              id="sv_complaint"
              error={fe('sv_complaint')}
              label="What would you do if you had a complaint?"
              register={register}
              required
              rows={2}
            />
            <Area
              id="sv_anythingElse"
              error={fe('sv_anythingElse')}
              label="Is there anything else you would like to tell me?"
              register={register}
              required
              rows={2}
            />
          </div>

          {/* ASSESSMENT */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>OVERALL ASSESSMENT OF CLIENT</span>
            {/* The shift note's vitals block, unchanged: all five vitals, the
                "unable to obtain" reasons, the clinical detail selects, and
                later rechecks, so every note captures vitals the same way. */}
            <VitalSignsFields
              register={register}
              watch={watch}
              setValue={setValue}
              ageStr={String(watch('q5_ageYears') || '')}
              dob={String(watch('q4_dateofBirth') || '')}
              required
              notObtainedReason
              bpNotObtainedReason={bpRequired}
              bpOptional={!bpRequired}
              details
              errorFor={fe}
            />
            <VitalsRecheckSection register={register} watch={watch} setValue={setValue} />
            <Area id="sv_generalConditions" error={fe('sv_generalConditions')} label="General conditions:" register={register} required />
            <Area id="sv_clientProgress" error={fe('sv_clientProgress')} label="Document client progress:" register={register} required />
            {yesNo('sv_problems', 'Were there any problems encountered by the client?')}
            {answers.sv_problems === 'Yes' && (
              <Area
                id="sv_problemsDetail"
                error={fe('sv_problemsDetail')}
                label="Document the problems encountered:"
                register={register}
                required
              />
            )}
            {yesNo('sv_rightsInformed', 'Client informed of rights')}
            {yesNo('sv_clientSatisfied', 'Is the client satisfied with the services?')}
            {answers.sv_clientSatisfied === 'No' && (
              <Area
                id="sv_dissatisfaction"
                error={fe('sv_dissatisfaction')}
                label="Please explain the client's dissatisfaction:"
                register={register}
                required
              />
            )}
          </div>

          {/* INTERVIEW */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>INTERVIEW WITH THE CLIENT</span>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label}>Interview with the client *</label>
                <RadioRow
                  name="sv_interviewMethod"
                  error={fe('sv_interviewMethod')}
                  onPick={() => onRadioPick('sv_interviewMethod')}
                  options={['Phone', 'In person']}
                />
              </div>
            </div>
            <Area id="sv_interviewNotes" error={fe('sv_interviewNotes')} label="Interview notes:" register={register} />
            {yesNo('sv_levelOfCare', "Is the level of care appropriate for the client's needs?")}
            <Area
              id="sv_levelOfCareRecs"
              error={fe('sv_levelOfCareRecs')}
              label={
                answers.sv_levelOfCare === 'No'
                  ? 'Document your recommendations for the level of care:'
                  : 'Level of care comments:'
              }
              register={register}
              required={answers.sv_levelOfCare === 'No'}
            />
            {yesNo('sv_satisfiedWithStaff', 'Is the client satisfied with the staff?')}
            <Area
              id="sv_staffFeedback"
              error={fe('sv_staffFeedback')}
              label="Client's feedback on the performance of the staff:"
              register={register}
              required={answers.sv_satisfiedWithStaff === 'No'}
            />
          </div>

          {/* RECOMMENDATIONS */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>RECOMMENDATIONS</span>
            <Area id="sv_recommendations" error={fe('sv_recommendations')} label="Recommendations:" register={register} />
          </div>

          {/* SIGNATURE */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>SUPERVISOR SIGNATURE</span>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 60%' }}>
                <label className={styles.label}>Supervisor printed name</label>
                <input className={styles.input} value={String(watch('q11_nurseName') || '')} readOnly />
              </div>
              <div className={styles.f} style={{ flex: '1 1 35%' }}>
                <label className={styles.label} htmlFor="q12_credential">
                  Credentials
                </label>
                <input className={styles.input} id="q12_credential" {...register('q12_credential')} />
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }} id="q61_signature">
                <label className={styles.label}>Sign below *</label>
                <div style={fe('q61_signature') ? FIELD_ERROR_WRAP_STYLE : undefined}>
                  <SignatureCanvas
                    ref={sigRef}
                    className={styles.signaturePad}
                    initialSignature={initialSignature}
                    onChange={(dataUrl) => {
                      setValue('q61_signature', dataUrl);
                      if (dataUrl) clearFieldError('q61_signature');
                    }}
                  />
                </div>
                <FieldError message={fe('q61_signature')} />
                <div className={styles.signaturePadControls}>
                  <button
                    type="button"
                    onClick={() => {
                      sigRef.current?.clear();
                      setValue('q61_signature', '');
                    }}
                  >
                    Clear Signature
                  </button>
                </div>
              </div>
            </div>
          </div>

          {missing.length > 0 && (
            <p style={{ color: '#c62828', fontSize: 13 }}>Missing required fields: {missing.join('; ')}</p>
          )}
          {submitError && (
            <p role="alert" style={{ color: '#b3261e', fontSize: 13, background: '#fdeaea', borderRadius: 6, padding: '8px 11px' }}>
              {submitError}
            </p>
          )}

          <div className={styles.navigationControls} style={{ gap: 10, flexWrap: 'wrap' }}>
            {isEditMode ? (
              <button type="button" className={styles.navBtn} onClick={cancelAmend} disabled={submitting}>
                Cancel changes
              </button>
            ) : (
              <>
                <button type="button" className={`${styles.navBtn} ${styles.navBtnDanger}`} onClick={() => setShowDiscard(true)} disabled={submitting || leaving}>
                  Discard
                </button>
                <button type="button" className={styles.navBtn} onClick={saveAndExit} disabled={submitting || leaving}>
                  {leaving ? 'Saving…' : 'Save & Exit'}
                </button>
              </>
            )}
            <button type="submit" className={styles.submitBtn} disabled={submitting || (isEditMode && !editLoaded)}>
              {submitting
                ? isEditMode
                  ? 'Updating…'
                  : 'Submitting…'
                : isEditMode
                  ? 'Update Supervisory Visit'
                  : 'Submit Supervisory Visit'}
            </button>
          </div>
        </div>
      </form>

      {showDiscard && (
        <div className={`${styles.confirmModal} ${styles.active}`} role="dialog" aria-modal="true" aria-label="Leave this supervisory visit">
          <div className={styles.modalContent}>
            <h2 style={{ color: '#1f2937', marginTop: 0 }}>Leave This Supervisory Visit?</h2>
            <p style={{ color: '#555', lineHeight: 1.6 }}>
              <strong>Save &amp; Exit</strong> keeps a draft you can resume from New Supervisory Visit.{' '}
              <strong>Discard Form</strong> deletes everything entered so far, including the draft. Nothing is
              submitted either way.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className={styles.navBtn} onClick={() => setShowDiscard(false)} disabled={leaving}>
                Keep Editing
              </button>
              <button type="button" className={styles.navBtn} onClick={saveAndExit} disabled={leaving}>
                Save &amp; Exit
              </button>
              <button
                type="button"
                className={styles.submitBtn}
                style={{ background: '#b3261e', borderColor: '#b3261e' }}
                onClick={discardAndExit}
                disabled={leaving}
              >
                {leaving ? 'Discarding…' : 'Discard Form'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditReason && (
        <div className={`${styles.confirmModal} ${styles.active}`}>
          <div className={styles.modalContent}>
            <h2 style={{ color: '#7c3a00', marginTop: 0 }}>Why Is This Form Being Amended?</h2>
            <p style={{ color: '#555', lineHeight: 1.6 }}>
              The reason is recorded in the audit history alongside what changed.
            </p>
            <div id="sv_editReason">
              <textarea
                className={styles.textarea}
                rows={3}
                placeholder="e.g. corrected the visit time; added the client's feedback"
                autoFocus
                style={editReasonError ? FIELD_ERROR_STYLE : undefined}
                aria-invalid={!!editReasonError}
                onChange={(e) => {
                  editReasonRef.current = e.target.value;
                  if (editReasonError) setEditReasonError('');
                }}
              />
              <FieldError message={editReasonError} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                type="button"
                className={styles.submitBtn}
                onClick={() => {
                  if (!editReasonRef.current.trim()) {
                    setEditReasonError('Enter the reason for the amendment.');
                    escortToField('sv_editReason');
                    return;
                  }
                  setEditReasonError('');
                  setShowEditReason(false);
                  formRef.current?.requestSubmit();
                }}
              >
                Save Amendment
              </button>
              <button
                type="button"
                className={styles.navBtn}
                onClick={() => {
                  editReasonRef.current = '';
                  setEditReasonError('');
                  setShowEditReason(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SupervisoryVisitPage() {
  return (
    <ViewAsWriteBlock>
      <SupervisoryVisitPageInner />
    </ViewAsWriteBlock>
  );
}
