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
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { getPatients, type Patient } from '@/lib/patients';
import { computeAgeString } from '@/lib/age';
import { saveSubmission, findDuplicateSubmission, type ProgressNoteFormData } from '@/lib/submissions';
import {
  OVERSIGHT_NOTE_TYPE,
  OVERSIGHT_APPT_ROWS,
  OVERSIGHT_RADIO_KEYS,
  getOversightIncomplete,
} from '@/lib/oversightNote';
import { useAuth } from '@/components/AuthProvider';
import SignatureCanvas, { type SignatureCanvasHandle } from '@/components/SignatureCanvas';
import DeselectableRadio, {
  radioState,
  clearRadioStorage,
} from '../progress-note/components/DeselectableRadio';
import type { FormValues } from '../progress-note/types';
import styles from '../progress-note/page.module.css';

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
}: {
  id: string;
  label: string;
  register: ReturnType<typeof useForm<FormValues>>['register'];
  rows?: number;
  required?: boolean;
  placeholder?: string;
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
          {...register(id)}
        />
      </div>
    </div>
  );
}

export default function OversightNotePage() {
  const router = useRouter();
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
    if (!profile) return;
    if (profile.displayName) setValue('q11_nurseName', profile.displayName);
    setValue('q12_credential', 'RN');
  }, [profile, setValue]);

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

    try {
      setSubmitting(true);

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
      const c = encodeURIComponent(String(values.q3_clientName || ''));
      const d = encodeURIComponent(String(values.q6_dateofService || ''));
      router.push(`/progress-note/submitted/${docId}?c=${c}&d=${d}&t=oversight`);
    } catch (err) {
      console.error('Oversight note submit failed:', err);
      alert('The note could not be submitted. Please check your connection and try again.');
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
        RN Oversight Visit Note
      </h1>
      <p style={{ textAlign: 'center', color: '#5c6b7a', fontSize: 13, marginTop: 0 }}>
        NOW/COMP nursing services, RN oversight model. One note per oversight visit.
      </p>

      <form ref={formRef} onSubmit={handleSubmit} className={styles.form} noValidate>
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
                <input className={styles.input} value={watch('q4_dateofBirth') || ''} readOnly />
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
            <Area id="ov_educationOther" label="Other topics / details:" register={register} />
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
            <Area id="ov_nextVisit" label="Plan for next visit and target date:" register={register} required rows={1} />
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
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Oversight Note'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
