'use client';

/**
 * RN Oversight Visit Note — the in-app "one consistent oversight template"
 * from the QEPR 18119 exit report. A single scrolling form (an oversight
 * visit is visit-shaped, not shift-shaped: no vitals pages, no handoff).
 *
 * Storage: same `progressNotes` collection as shift notes, discriminated by
 * noteType (see src/lib/oversightNote.ts for the key scheme and rules).
 * Deliberately no Firestore draft layer in v1: the note is a short
 * single-sitting document, and the drafts doc is one-per-user, owned by the
 * shift-note form.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ViewAsWriteBlock } from '@/components/ImpersonationProvider';
import { useForm } from 'react-hook-form';
import { getPatients, type Patient } from '@/lib/patients';
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
  saveOversightDraft,
  loadOversightDraft,
  clearOversightDraft,
  type OversightDraft,
} from '@/lib/drafts';
import {
  OVERSIGHT_NOTE_TYPE,
  OVERSIGHT_APPT_ROWS,
  OVERSIGHT_RADIO_KEYS,
  getOversightIncomplete,
} from '@/lib/oversightNote';
import { useAuth } from '@/components/AuthProvider';
import { authedFetch } from '@/lib/authedFetch';
import SignatureCanvas, { type SignatureCanvasHandle } from '@/components/SignatureCanvas';
import DeselectableRadio, {
  radioState,
  setRadio,
  clearRadioStorage,
} from '../progress-note/components/DeselectableRadio';
import type { FormValues } from '../progress-note/types';
import styles from '../progress-note/page.module.css';

/**
 * Whether `optionValue` is present in a comma-joined "a, b, c" string, without
 * splitting — several education-topic values contain ", " themselves (e.g.
 * "Maintaining personal health (diet, exercise, self-management)"), and a naive
 * split shatters them so they silently fail to re-check on an amend.
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

/** Radio row rendered from an option list; the wrapper id is the rule key so
 *  the required-field scroll can find radio groups as well as inputs. */
function RadioRow({ name, options }: { name: string; options: string[] }) {
  return (
    <div className={styles.radioRow} id={name}>
      {options.map((o) => (
        <label key={o}>
          <DeselectableRadio name={name} value={o} /> {o}
        </label>
      ))}
    </div>
  );
}

function Area({
  id,
  label,
  register,
  rows = 2,
  required = false,
  placeholder,
  topGap = false,
}: {
  id: string;
  label: string;
  register: ReturnType<typeof useForm<FormValues>>['register'];
  rows?: number;
  required?: boolean;
  placeholder?: string;
  /** Extra space above — use when a checkbox row sits directly above this
   *  field, since .checkRow has no bottom margin and .row has no top one. */
  topGap?: boolean;
}) {
  return (
    <div className={styles.row} style={topGap ? { marginTop: 16 } : undefined}>
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
          {...register(id)}
        />
      </div>
    </div>
  );
}

function OversightNotePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const isEditMode = !!editId;
  const { user, profile, role } = useAuth();
  const formRef = useRef<HTMLFormElement>(null!);
  const sigRef = useRef<SignatureCanvasHandle>(null);
  // Stable id for this form session: a retry after a network failure
  // overwrites the same document instead of duplicating the note.
  const submissionIdRef = useRef('');
  if (!submissionIdRef.current && typeof crypto !== 'undefined') {
    submissionIdRef.current = crypto.randomUUID();
  }
  const { register, watch, setValue, getValues } = useForm<FormValues>();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [showAllClients, setShowAllClients] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editLoaded, setEditLoaded] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<OversightDraft | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [showEditReason, setShowEditReason] = useState(false);
  const [initialSignature, setInitialSignature] = useState('');
  const editReasonRef = useRef('');
  const hydratedRef = useRef(false);
  const isNurse = role === 'nurse';

  // Fresh form: the radio store is a module-level singleton shared with the
  // shift-note form; scrub it so answers from a previously viewed note can't
  // show up pre-checked here (and vice versa on unmount).
  useEffect(() => {
    clearRadioStorage();
    return () => clearRadioStorage();
  }, []);

  useEffect(() => {
    getPatients().then(setPatients);
  }, []);

  // Prefill the RN identity like the shift note does. The credential is fixed:
  // this document type IS an RN oversight note.
  useEffect(() => {
    // Never in edit mode: the note keeps the RN who documented the visit.
    if (isEditMode || !profile) return;
    if (profile.displayName) setValue('q11_nurseName', profile.displayName);
    setValue('q12_credential', 'RN');
  }, [isEditMode, profile, setValue]);

  // Default roster: every NOW/COMP client. All of them receive monthly RN
  // oversight; serviceLevel only says whether daily LPN service sits on top,
  // so it must NOT narrow this list. The toggle reveals other programs
  // (GAPP and, later, EDWP/ICWP) for edge cases.
  const selectablePatients = useMemo(() => {
    const base = showAllClients
      ? patients
      : patients.filter((p) => p.program === 'now-comp');
    return [...base].sort((a, b) => a.name.localeCompare(b.name));
  }, [patients, showAllClients]);

  const selectedPatientId = watch('patientId');
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
    },
    [patients, setValue],
  );

  /** Apply a stored flat record (draft or submitted note) into all three stores. */
  const hydrate = useCallback(
    (flat: Record<string, unknown>, radios?: Record<string, string>, boxes?: Record<string, string[]>) => {
      const radioKeys = new Set<string>(OVERSIGHT_RADIO_KEYS);
      for (const [k, v] of Object.entries(flat)) {
        if (v == null) continue;
        // Radio answers live in the radio store only. An RHF mirror would be
        // re-merged at submit and would resurrect an answer the nurse just
        // deselected during the amend.
        if (radioKeys.has(k)) continue;
        if (typeof v === 'string') setValue(k, v);
      }
      if (typeof flat.q61_signature === 'string' && flat.q61_signature) {
        setInitialSignature(flat.q61_signature);
      }
      clearRadioStorage();
      const radioSource =
        radios ??
        Object.fromEntries(
          OVERSIGHT_RADIO_KEYS.filter((k) => typeof flat[k] === 'string' && flat[k]).map((k) => [
            k,
            String(flat[k]),
          ]),
        );
      for (const [k, v] of Object.entries(radioSource)) if (v) setRadio(k, v);
      // Checkboxes are DOM-owned; apply after paint.
      setTimeout(() => {
        const form = formRef.current;
        if (!form) return;
        const boxNames = ['ov_educationTopics', 'ov_educationRecipients', 'ov_communication'];
        for (const name of boxNames) {
          // A resumed draft carries arrays; a stored note carries the joined
          // string. Match without splitting either way.
          const arr = boxes?.[name];
          const joined = typeof flat[name] === 'string' ? String(flat[name]) : '';
          if (!arr && !joined) continue;
          form
            .querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${name}"]`)
            .forEach((cb) => {
              cb.checked = arr ? arr.includes(cb.value) : joinedValueIncludes(joined, cb.value);
            });
        }
      }, 0);
    },
    [setValue],
  );

  // Edit mode: load the submitted note. Guard the document type so a shift
  // note opened here can never be saved through the oversight rules.
  useEffect(() => {
    if (!isEditMode || !editId || hydratedRef.current) return;
    hydratedRef.current = true;
    draftLookupDoneRef.current = true; // no draft layer in edit mode
    (async () => {
      try {
        const data = await getSubmission(editId);
        if (!data) {
          alert('Note not found.');
          router.push('/admin/submissions');
          return;
        }
        const flat = data as unknown as Record<string, unknown>;
        if (flat.noteType !== OVERSIGHT_NOTE_TYPE) {
          alert('That note is a shift progress note; open it from the progress note form.');
          router.push(`/admin/submissions/${editId}`);
          return;
        }
        hydrate(flat);
        setEditLoaded(true);
      } catch (err) {
        console.error('Failed to load oversight note for editing:', err);
        alert('The note could not be loaded.');
      }
    })();
  }, [isEditMode, editId, hydrate, router]);

  // New note: offer to resume an autosaved draft (never in edit mode).
  useEffect(() => {
    if (isEditMode || !user?.uid || hydratedRef.current) return;
    loadOversightDraft(user.uid)
      .then((d) => {
        if (d && Object.keys(d.formValues || {}).length > 0) setPendingDraft(d);
      })
      .catch((err) => console.warn('Oversight draft lookup failed:', err))
      // Autosave stays parked until this resolves either way — otherwise it
      // could overwrite the stored draft with a blank form.
      .finally(() => {
        draftLookupDoneRef.current = true;
      });
  }, [isEditMode, user?.uid]);

  const resumeDraft = useCallback(() => {
    if (!pendingDraft) return;
    hydratedRef.current = true;
    hydrate(pendingDraft.formValues, pendingDraft.radioState, pendingDraft.checkboxState);
    if (pendingDraft.submissionId) submissionIdRef.current = pendingDraft.submissionId;
    setPendingDraft(null);
  }, [pendingDraft, hydrate]);

  const discardDraft = useCallback(() => {
    setPendingDraft(null);
    if (user?.uid) void clearOversightDraft(user.uid);
  }, [user?.uid]);

  // Autosave. Driven by RHF's change SUBSCRIPTION, never by render identity:
  // no-arg watch() returns a fresh object every render, so using it as an
  // effect dependency (with setDraftSavedAt re-rendering on success) produced
  // a self-sustaining save loop that wrote to Firestore every 2.5s forever.
  // Mutable gates live in refs so this effect's deps stay stable.
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSubmittedRef = useRef(false);
  const draftLookupDoneRef = useRef(false);
  const pendingDraftRef = useRef(false);
  useEffect(() => {
    pendingDraftRef.current = !!pendingDraft;
  }, [pendingDraft]);

  const scheduleAutosave = useCallback(() => {
    if (isEditMode || !user?.uid) return;
    // Never before the stored-draft lookup resolves (we'd overwrite it with a
    // blank form), never after submit (we'd resurrect the note we just
    // filed), and never while the resume banner is still a live question.
    if (!draftLookupDoneRef.current || pendingDraftRef.current || hasSubmittedRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      if (hasSubmittedRef.current) return;
      const values = getValues();
      const filled = Object.entries(values).filter(
        ([, v]) => typeof v === 'string' && v.trim() !== '',
      );
      // Identity-only prefill (name + credential) isn't worth a draft.
      if (filled.length <= 2) return;
      const form = formRef.current;
      const checkboxState: Record<string, string[]> = {};
      form?.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name]').forEach((cb) => {
        if (!checkboxState[cb.name]) checkboxState[cb.name] = [];
        if (cb.checked) checkboxState[cb.name].push(cb.value);
      });
      void saveOversightDraft(user.uid, {
        clientName: String(values.q3_clientName || ''),
        dateOfService: String(values.q6_dateofService || ''),
        submissionId: submissionIdRef.current || undefined,
        formValues: values,
        // Only this form's radios: the store is shared with the shift note.
        radioState: Object.fromEntries(
          OVERSIGHT_RADIO_KEYS.filter((k) => radioState[k]).map((k) => [k, radioState[k]]),
        ),
        checkboxState,
      })
        .then(() => setDraftSavedAt(new Date()))
        .catch((err) => console.warn('Oversight draft autosave failed:', err));
    }, 2500);
  }, [isEditMode, user?.uid, getValues]);

  useEffect(() => {
    if (isEditMode) return;
    const sub = watch(() => scheduleAutosave());
    return () => sub.unsubscribe();
  }, [watch, isEditMode, scheduleAutosave]);

  // A pending debounced save must not outlive the page.
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  // A nurse whose profile credential isn't RN cannot author an oversight
  // note; admins/supervisors can (they attest with their own signature).
  const rnGateBlocked = isNurse && profile?.credential !== 'RN';

  const [missing, setMissing] = useState<string[]>([]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formRef.current || submitting) return;

    // Merge the three stores into the flat record, shift-note style.
    const values = getValues();
    for (const [name, value] of Object.entries(radioState)) {
      if (value) values[name] = value;
    }
    const checkboxNames = new Set<string>();
    formRef.current.querySelectorAll('input[type="checkbox"]').forEach((el) => {
      const name = (el as HTMLInputElement).name;
      if (name) checkboxNames.add(name);
    });
    for (const name of checkboxNames) {
      const checked = formRef.current.querySelectorAll(
        `input[type="checkbox"][name="${name}"]:checked`,
      );
      const vals: string[] = [];
      checked?.forEach((cb) => vals.push((cb as HTMLInputElement).value));
      values[name] = vals.join(', ');
    }

    values.noteType = OVERSIGHT_NOTE_TYPE;
    values.q1_formRev = '2';
    // The signature is applied at the end of the visit; stamp the signed date
    // from the visit date so the signature block never renders "Date Signed: --".
    values.q62_shiftEndDate = String(values.q6_dateofService || '');

    const issues = getOversightIncomplete(values as Record<string, string>);
    if (issues.length > 0) {
      setMissing(issues.map((i) => i.label));
      const target = document.getElementById(issues[0].key);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      alert(
        'Please complete the required fields:\n\n' +
          issues
            .slice(0, 8)
            .map((i) => '• ' + i.label)
            .join('\n') +
          (issues.length > 8 ? `\n…and ${issues.length - 8} more` : ''),
      );
      return;
    }
    setMissing([]);

    // A 12h/24h time-picker slip is the usual cause of an out-before-in
    // window; oversight visits never span midnight, so hard-stop it.
    if (String(values.ov_timeOut) <= String(values.ov_timeIn)) {
      const target = document.getElementById('ov_timeOut');
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      alert('Time out must be after time in. Please check the visit times.');
      return;
    }

    if (isEditMode && editId) {
      // An edit needs a reason for the audit trail, same as the shift note.
      if (!editReasonRef.current.trim()) {
        setShowEditReason(true);
        return;
      }
      try {
        setSubmitting(true);
        if (!user || !role) throw new Error('You must be signed in to update a note.');
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
        // Tell the corrections workflow an amendment landed, exactly as the
        // shift form does: if the note has an open flag, whoever raised it (plus
        // the corrections reviewer) is notified. A block is lifted only by a
        // reviewer. Non-fatal: a note with no open flag answers 409.
        try {
          await authedFetch(`/api/admin/submissions/${editId}/amended`, { method: 'POST' });
        } catch (err) {
          console.warn('Correction-amended event failed (non-fatal):', err);
        }
        clearRadioStorage();
        alert('Oversight note updated.');
        window.location.href = `/admin/submissions/${editId}`;
      } catch (err) {
        console.error('Oversight note update failed:', err);
        alert('The note could not be updated. Please check your connection and try again.');
        setSubmitting(false);
      }
      return;
    }

    try {
      setSubmitting(true);
      // Stop autosave for good: a timer armed moments ago would otherwise
      // fire after the draft is cleared and resurrect the filed note.
      hasSubmittedRef.current = true;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

      // One note per oversight visit: warn when this nurse already filed an
      // oversight note for this client and date (retries of THIS submission
      // are excluded via the stable id, which also makes them overwrite
      // instead of duplicate).
      const dup = await findDuplicateSubmission({
        nurseId: user?.uid || '',
        dateOfService: String(values.q6_dateofService || ''),
        patientId: String(values.patientId || '') || undefined,
        clientName: String(values.q3_clientName || ''),
        excludeId: submissionIdRef.current,
        noteType: OVERSIGHT_NOTE_TYPE,
      });
      if (dup) {
        setSubmitting(false);
        hasSubmittedRef.current = false; // she stays on the form; keep saving
        alert(
          `An oversight note for ${values.q3_clientName} on this date already exists. ` +
            'Open it from Submissions instead of filing a second note. If this is intentional ' +
            '(a second visit the same day), contact the administrator.',
        );
        return;
      }

      const docId = await saveSubmission(values as unknown as ProgressNoteFormData, {
        nurseId: user?.uid || '',
        submissionId: submissionIdRef.current || undefined,
      });
      clearRadioStorage();
      if (user?.uid) await clearOversightDraft(user.uid).catch(() => {});
      const c = encodeURIComponent(String(values.q3_clientName || ''));
      const d = encodeURIComponent(String(values.q6_dateofService || ''));
      router.push(`/progress-note/submitted/${docId}?c=${c}&d=${d}&t=oversight`);
    } catch (err) {
      console.error('Oversight note submit failed:', err);
      alert('The note could not be submitted. Please check your connection and try again.');
      hasSubmittedRef.current = false; // failed: resume protecting her work
      setSubmitting(false);
    }
  };

  if (rnGateBlocked) {
    return (
      <div className={`${styles.container} ${styles.wrap}`} style={{ maxWidth: 640, margin: '40px auto' }}>
        <h1 style={{ fontSize: 20 }}>RN Oversight Visit Note</h1>
        <p style={{ lineHeight: 1.6, color: '#444' }}>
          This form documents Registered Nurse oversight visits and is limited to staff with an
          RN credential. Your profile credential is {profile?.credential || 'not set'}. If this
          is wrong, contact the administrator.
        </p>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${styles.wrap}`}>
      <h1 style={{ textAlign: 'center', fontSize: 22, marginBottom: 2 }}>
        RN Oversight Visit Note{isEditMode ? ' — Amend' : ''}
      </h1>
      <p style={{ textAlign: 'center', color: '#5c6b7a', fontSize: 13, marginTop: 0 }}>
        NOW/COMP nursing services, RN oversight model. One note per oversight visit.
      </p>

      {isEditMode && !editLoaded && (
        <p style={{ textAlign: 'center', color: '#5c6b7a', fontSize: 13 }}>Loading the note…</p>
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
            You have an unfinished oversight note
            {pendingDraft.clientName ? ` for ${pendingDraft.clientName}` : ''}
            {pendingDraft.updatedAt ? `, last saved ${pendingDraft.updatedAt.toLocaleString()}` : ''}.
          </span>
          <button type="button" className={styles.navBtn} onClick={resumeDraft}>
            Resume draft
          </button>
          <button type="button" className={styles.navBtn} onClick={discardDraft}>
            Start fresh
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
        // Typing before the note lands would be overwritten by hydrate().
        style={isEditMode && !editLoaded ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
      >
        <div>
          {/* CLIENT & VISIT */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>CLIENT &amp; VISIT</span>

            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 60%' }}>
                <label className={styles.label} htmlFor="q3_clientName">
                  Individual *
                </label>
                <select
                  className={styles.select}
                  id="q3_clientName"
                  value={selectedPatientId || ''}
                  onChange={(e) => handleSelectPatient(e.target.value)}
                >
                  <option value="">Select a client…</option>
                  {selectablePatients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.program === 'now-comp' ? '' : `  (${p.program ? p.program.toUpperCase() : 'no program set'})`}
                    </option>
                  ))}
                </select>
                <label
                  style={{
                    fontSize: 12,
                    color: '#5c6b7a',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 12,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showAllClients}
                    onChange={(e) => setShowAllClients(e.target.checked)}
                    style={{ margin: 0 }}
                  />
                  Show all clients (including other programs)
                </label>
              </div>
              <div className={styles.f} style={{ flex: '1 1 35%' }}>
                <label className={styles.label}>Date of birth</label>
                <input
                  className={styles.input}
                  value={formatDateUS(watch('q4_dateofBirth') || '')}
                  readOnly
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q6_dateofService">
                  Date of visit *
                </label>
                <input
                  className={styles.input}
                  type="date"
                  id="q6_dateofService"
                  {...register('q6_dateofService')}
                />
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="ov_timeIn">
                  Time in *
                </label>
                <input className={styles.input} type="time" id="ov_timeIn" {...register('ov_timeIn')} />
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="ov_timeOut">
                  Time out *
                </label>
                <input className={styles.input} type="time" id="ov_timeOut" {...register('ov_timeOut')} />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 55%' }}>
                <label className={styles.label} htmlFor="ov_location">
                  Location *
                </label>
                <input
                  className={styles.input}
                  id="ov_location"
                  placeholder="e.g. individual's home"
                  {...register('ov_location')}
                />
              </div>
              <div className={styles.f} style={{ flex: '1 1 40%' }}>
                <label className={styles.label}>Visit type *</label>
                <RadioRow name="ov_visitType" options={['Routine oversight', 'Quarterly review']} />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 60%' }}>
                <label className={styles.label} htmlFor="q11_nurseName">
                  RN name *
                </label>
                <input
                  className={styles.input}
                  id="q11_nurseName"
                  readOnly={isNurse}
                  {...register('q11_nurseName')}
                />
              </div>
              <div className={styles.f} style={{ flex: '1 1 35%' }}>
                <label className={styles.label}>Credential</label>
                <input className={styles.input} value="RN" readOnly />
              </div>
            </div>
          </div>

          {/* 1. STATUS & OBSERVATIONS */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>1. INDIVIDUAL STATUS AND OBSERVATIONS</span>
            <Area
              id="ov_generalCondition"
              label="General condition and any changes since last visit:"
              register={register}
              required
              rows={3}
            />
            <Area
              id="ov_interactions"
              label="Conversations, interactions, and the individual's responses during this visit:"
              register={register}
              required
              rows={3}
              placeholder='What did you and the individual talk about, and how did they respond? e.g. "Ann pointed to her new photos and smiled when asked about her sister’s visit..."'
            />
            <Area
              id="ov_concerns"
              label="Concerns voiced by the individual, family, or staff:"
              register={register}
            />
          </div>

          {/* 2. HEALTHCARE PLAN */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>2. HEALTHCARE PLAN (HCP)</span>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label}>HCP reviewed *</label>
                <RadioRow
                  name="ov_hcpStatus"
                  options={['Current; reflects present condition', 'Updates needed (describe in notes)']}
                />
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label}>Staff trained on the HCP before implementation *</label>
                <RadioRow
                  name="ov_hcpStaffTrained"
                  options={['Yes; training dates verified in record', 'Training needed', 'N/A']}
                />
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label}>
                  Detailed teaching plan and skills checklist for proxy caregivers
                </label>
                <RadioRow name="ov_proxyPlan" options={['In place', 'Needed', 'N/A']} />
              </div>
            </div>
            <Area id="ov_hcpNotes" label="HCP notes:" register={register} />
          </div>

          {/* 3. ORDERS & MEDICATIONS */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>3. PHYSICIAN ORDERS AND MEDICATIONS</span>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label}>
                  Current physician order or prescription verified for EVERY medication (each dated
                  within the last 12 months) *
                </label>
                <RadioRow name="ov_ordersVerified" options={['Yes', 'No', 'N/A (no medications)']} />
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label}>Orders needing renewal</label>
                <RadioRow
                  name="ov_ordersRenewals"
                  options={['None needed', 'Identified and requested (list in notes)']}
                />
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label}>
                  MAR reviewed for accuracy and completion against each physician order *
                </label>
                <RadioRow name="ov_marReviewed" options={['Yes', 'No', 'N/A (no MAR)']} />
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label}>Medications filled and refilled timely; no gaps</label>
                <RadioRow name="ov_refillsTimely" options={['Yes', 'Concern (describe in notes)', 'N/A']} />
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label}>Side effects and effectiveness monitored</label>
                <RadioRow
                  name="ov_sideEffects"
                  options={['Monitored; none observed', 'Concern communicated to physician', 'N/A']}
                />
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label}>
                  Adaptive equipment / protective device orders current, with rationale and
                  instructions; use still justified *
                </label>
                <RadioRow name="ov_equipOrders" options={['Yes', 'No', 'N/A (no adaptive equipment)']} />
              </div>
            </div>
            <Area
              id="ov_medsNotes"
              label="Medication and order notes (renewals requested, gaps found, physician contacts):"
              register={register}
            />
          </div>

          {/* 4. APPOINTMENTS */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>
              4. MEDICAL APPOINTMENTS AND FOLLOW-UP SINCE LAST VISIT
            </span>
            {OVERSIGHT_APPT_ROWS.map((n) => (
              <div className={styles.row} key={n}>
                <div className={styles.f} style={{ flex: '2 1 30%' }}>
                  <label className={styles.label} htmlFor={`ov_appt${n}_provider`}>
                    Appointment / provider
                  </label>
                  <input className={styles.input} id={`ov_appt${n}_provider`} {...register(`ov_appt${n}_provider`)} />
                </div>
                <div className={styles.f} style={{ flex: '1 1 15%' }}>
                  <label className={styles.label} htmlFor={`ov_appt${n}_date`}>
                    Date
                  </label>
                  <input className={styles.input} type="date" id={`ov_appt${n}_date`} {...register(`ov_appt${n}_date`)} />
                </div>
                <div className={styles.f} style={{ flex: '2 1 28%' }}>
                  <label className={styles.label} htmlFor={`ov_appt${n}_outcome`}>
                    Outcome / report obtained?
                  </label>
                  <input className={styles.input} id={`ov_appt${n}_outcome`} {...register(`ov_appt${n}_outcome`)} />
                </div>
                <div className={styles.f} style={{ flex: '2 1 22%' }}>
                  <label className={styles.label} htmlFor={`ov_appt${n}_followup`}>
                    Follow-up needed
                  </label>
                  <input className={styles.input} id={`ov_appt${n}_followup`} {...register(`ov_appt${n}_followup`)} />
                </div>
              </div>
            ))}
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label}>
                  Preventive care reviewed (annual physical, dental, hearing, vision, mammogram / Pap
                  as applicable; record, documented refusal with education, or request attempt logged) *
                </label>
                <RadioRow
                  name="ov_preventiveReviewed"
                  options={['Reviewed; current or requested', 'Gaps identified (describe in notes)']}
                />
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label}>
                  AIMS assessment within the last 6 months (antipsychotic medication) *
                </label>
                <RadioRow name="ov_aims" options={['Completed', 'Due (requested)', 'N/A']} />
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label}>Hospitalization or ER visit since last visit *</label>
                <RadioRow
                  name="ov_hospitalization"
                  options={['None', 'Yes; discharge follow-up completed', 'Yes; follow-up in progress']}
                />
              </div>
            </div>
            <Area id="ov_apptsNotes" label="Appointment notes:" register={register} />
          </div>

          {/* 5. HEALTH DATA */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>5. HEALTH DATA AND TRACKING LOGS</span>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label}>
                  Tracking logs reviewed this month (seizure, bowel, intake/output, other per HCP) *
                </label>
                <RadioRow name="ov_logsReviewed" options={['Yes', 'N/A (no logs in place)']} />
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label}>HRST *</label>
                <RadioRow name="ov_hrst" options={['Current', 'Updated this visit', 'N/A']} />
              </div>
            </div>
            <Area id="ov_dataFindings" label="Findings / trends:" register={register} />
          </div>

          {/* 6. EDUCATION */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>6. EDUCATION PROVIDED THIS VISIT</span>
            <div className={styles.checkRow}>
              <label>
                <input type="checkbox" name="ov_educationTopics" value="Maintaining personal health (diet, exercise, self-management)" />{' '}
                Maintaining personal health
              </label>
              <label>
                <input type="checkbox" name="ov_educationTopics" value="Medication risks and benefits (all medications)" />{' '}
                Medication risks and benefits
              </label>
              <label>
                <input type="checkbox" name="ov_educationTopics" value="Psychotropic medication: risks and benefits" />{' '}
                Psychotropic risks and benefits
              </label>
            </div>
            <div className={styles.checkRow}>
              <label>
                <input type="checkbox" name="ov_educationTopics" value="Abuse, neglect, and exploitation: prevention and reporting" />{' '}
                ANE prevention and reporting
              </label>
              <label>
                <input type="checkbox" name="ov_educationTopics" value="Rights and responsibilities" />{' '}
                Rights and responsibilities
              </label>
              <label>
                <input type="checkbox" name="ov_educationTopics" value="Other" /> Other
              </label>
            </div>
            <div className={styles.checkRow}>
              <label>
                <input type="checkbox" name="ov_educationRecipients" value="Individual" /> Individual
              </label>
              <label>
                <input type="checkbox" name="ov_educationRecipients" value="Family (approved by individual)" />{' '}
                Family (approved)
              </label>
              <label>
                <input type="checkbox" name="ov_educationRecipients" value="Staff" /> Staff
              </label>
            </div>
            <Area id="ov_educationOther" label="Other topics / details:" register={register} topGap />
            <Area
              id="ov_educationResponse"
              label="Individual's response / understanding:"
              register={register}
              required
              placeholder='e.g. "restated in her own words that she can call the office if anyone makes her feel unsafe"'
            />
          </div>

          {/* 7. CHOICE & PERSON-CENTERED */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>7. CHOICE AND PERSON-CENTERED CARE</span>
            <Area
              id="ov_choicesMade"
              label="Choices offered, and choices the individual made or declined this visit:"
              register={register}
              required
              placeholder='Declining is a choice. e.g. "offered visit before or after lunch; chose after lunch"'
            />
            <Area
              id="ov_preferencesHonored"
              label="How known preferences were honored; strengths observed:"
              register={register}
            />
            <Area
              id="ov_goalsSupport"
              label="Support toward the individual's health-related goals, hopes, and dreams:"
              register={register}
            />
          </div>

          {/* 8. GOALS */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>8. GOAL PROGRESS</span>
            <Area
              id="ov_goalProgress"
              label="Progress on HCP / plan of care goals observed this visit:"
              register={register}
              required
            />
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label}>Quarterly review *</label>
                <RadioRow
                  name="ov_quarterly"
                  options={['Completed this visit', 'Not due this visit']}
                />
              </div>
            </div>
            <Area
              id="ov_quarterlySummary"
              label="Quarterly data summary (data reviewed, trends, progress toward goals; required when completed this visit):"
              register={register}
              rows={3}
            />
          </div>

          {/* 9. RECOMMENDATIONS */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>9. RECOMMENDATIONS, FOLLOW-UP, AND COMMUNICATION</span>
            <Area
              id="ov_actions"
              label="Actions taken, orders or records requested, referrals made:"
              register={register}
              required
            />
            <div className={styles.checkRow}>
              <label>
                <input type="checkbox" name="ov_communication" value="Family / responsible party updated" />{' '}
                Family / responsible party updated
              </label>
              <label>
                <input type="checkbox" name="ov_communication" value="Physician contacted" /> Physician
                contacted
              </label>
              <label>
                <input type="checkbox" name="ov_communication" value="N/A this visit" /> N/A this visit
              </label>
            </div>
            <Area
              id="ov_nextVisit"
              label="Plan for next visit and target date:"
              register={register}
              required
              rows={1}
              topGap
            />
          </div>

          {/* SIGNATURE */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>RN SIGNATURE</span>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }} id="q61_signature">
                <label className={styles.label}>Sign below *</label>
                <SignatureCanvas
                  ref={sigRef}
                  className={styles.signaturePad}
                  initialSignature={initialSignature}
                  onChange={(dataUrl) => setValue('q61_signature', dataUrl)}
                />
                <div className={styles.signaturePadControls}>
                  <button
                    type="button"
                    onClick={() => {
                      sigRef.current?.clear();
                      setValue('q61_signature', '');
                    }}
                  >
                    Clear signature
                  </button>
                </div>
              </div>
            </div>
          </div>

          {missing.length > 0 && (
            <p style={{ color: '#c62828', fontSize: 13 }}>
              Missing required fields: {missing.join('; ')}
            </p>
          )}

          <div className={styles.navigationControls}>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={submitting || (isEditMode && !editLoaded)}
            >
              {submitting
                ? isEditMode
                  ? 'Updating…'
                  : 'Submitting…'
                : isEditMode
                  ? 'Update Oversight Note'
                  : 'Submit Oversight Note'}
            </button>
          </div>
        </div>
      </form>

      {showEditReason && (
        <div className={`${styles.confirmModal} ${styles.active}`}>
          <div className={styles.modalContent}>
            <h2 style={{ color: '#7c3a00', marginTop: 0 }}>Why is this note being amended?</h2>
            <p style={{ color: '#555', lineHeight: 1.6 }}>
              The reason is recorded in the note&apos;s audit history alongside what changed.
            </p>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="e.g. corrected the visit time; added the physician's response"
              onChange={(e) => {
                editReasonRef.current = e.target.value;
              }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                type="button"
                className={styles.submitBtn}
                onClick={() => {
                  if (!editReasonRef.current.trim()) {
                    alert('Please enter a reason for the amendment.');
                    return;
                  }
                  setShowEditReason(false);
                  formRef.current?.requestSubmit();
                }}
              >
                Save amendment
              </button>
              <button
                type="button"
                className={styles.navBtn}
                onClick={() => {
                  editReasonRef.current = '';
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

export default function OversightNotePage() {
  return (
    <ViewAsWriteBlock>
      <OversightNotePageInner />
    </ViewAsWriteBlock>
  );
}
