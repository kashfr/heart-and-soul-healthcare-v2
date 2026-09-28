'use client';

import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ClipboardList, Lock, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { AuthGuard } from '@/components/AuthGuard';
import { useAuth, useEffectiveUser } from '@/components/AuthProvider';
import SignatureCanvas, { type SignatureCanvasHandle } from '@/components/SignatureCanvas';
import { getPatient, getPatientClinical, type Patient } from '@/lib/patients';
import { getMarOrders } from '@/lib/mar';
import { describeFrequency } from '@/lib/marShared';
import { getCareTasks, compareCareTasks } from '@/lib/careTasks';
import { getServicePlans, postServicePlan } from '@/lib/servicePlans';
import { formatDateUS } from '@/lib/dateFormat';
import { escortToField, firstErrorKey, FieldError, FIELD_ERROR_STYLE, FIELD_ERROR_WRAP_STYLE } from '@/lib/formEscort';
import {
  DEVELOPED_WITH,
  draftFromPlan,
  EMPTY_SERVICE_PLAN_INPUT,
  medicationsText,
  SERVICE_PLAN_ERROR_ORDER,
  SERVICE_PLAN_FIELD_LABEL,
  SERVICE_PLAN_MAX_GOALS,
  SERVICE_TYPES,
  servicesTextFromTasks,
  SPECIAL_DIETS,
  validateServicePlan,
  type ServicePlanErrorKey,
  type ServicePlanFieldErrors,
  type ServicePlanInput,
  type YesNo,
} from '@/lib/servicePlanShared';

const fieldId = (k: string) => `sp-field-${k}`;

function todayAgencyISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/**
 * Write and sign a Service Plan for one client. Supervisors and admins. A new
 * plan starts from the client's newest plan when there is one (a revision),
 * otherwise from the client record, the MAR and the approved care-plan tasks.
 * Signing files the PDF under the client's Documents.
 */
export default function NewServicePlanPage() {
  return (
    <AuthGuard allow={['admin', 'supervisor']}>
      <Suspense fallback={null}>
        <Inner />
      </Suspense>
    </AuthGuard>
  );
}

function Inner() {
  const params = useParams<{ patientId: string }>();
  const patientId = String(params.patientId || '');
  const fromPlanId = useSearchParams().get('from') || '';
  const { user, profile } = useAuth();
  const { isViewingAs } = useEffectiveUser();

  const [patient, setPatient] = useState<Patient | null | undefined>(undefined);
  const [marText, setMarText] = useState('');
  const [tasksText, setTasksText] = useState('');
  const [startedFrom, setStartedFrom] = useState<{ id: string; signedDate: string; by: string } | null>(null);
  const [form, setForm] = useState<ServicePlanInput | null>(null);
  const [errors, setErrors] = useState<ServicePlanFieldErrors>({});
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState<{ id: string; filed: boolean } | null>(null);
  const sigRef = useRef<SignatureCanvasHandle>(null);
  const cgSigRef = useRef<SignatureCanvasHandle>(null);

  const signer = useMemo(
    () => ({ name: profile?.displayName || user?.email || '', credentials: profile?.credential || '' }),
    [profile?.displayName, profile?.credential, user?.email],
  );

  useEffect(() => {
    if (!patientId || !user?.uid) return;
    let cancelled = false;
    (async () => {
      const [p, c, orders, tasks, plans] = await Promise.all([
        getPatient(patientId),
        getPatientClinical(patientId),
        getMarOrders(patientId),
        getCareTasks(patientId).catch(() => []),
        getServicePlans(patientId).catch(() => []),
      ]);
      if (cancelled) return;
      setPatient(p);
      const meds = medicationsText(
        orders
          .filter((o) => o.status === 'active')
          .map((o) => ({ medName: o.medName, dose: o.dose, units: o.units, route: o.route, frequency: describeFrequency(o) })),
      );
      const services = servicesTextFromTasks(
        tasks
          .filter((t) => t.status === 'active' && !!t.approvedAt)
          .sort(compareCareTasks)
          .map((t) => ({ name: t.name, frequency: t.frequency, instructions: t.instructions })),
      );
      setMarText(meds);
      setTasksText(services);
      const base = fromPlanId ? plans.find((x) => x.id === fromPlanId) || null : plans[0] || null;
      if (base) {
        setStartedFrom({ id: base.id, signedDate: base.signedDate, by: base.createdByName });
        setForm(draftFromPlan(base, signer));
      } else {
        setForm({
          ...EMPTY_SERVICE_PLAN_INPUT,
          patientId,
          address: [p?.street, p?.city, p?.state, p?.zip].filter(Boolean).join(', '),
          diagnosis: p?.diagnosis || '',
          allergies: c?.allergies || '',
          nutritionalNeeds: c?.diet || '',
          medications: meds,
          descriptionOfServices: services,
          supervisorName: signer.name,
          supervisorCredentials: signer.credentials,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // The signer is stable once the profile loads; re-running on it would wipe typed text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, user?.uid, fromPlanId]);

  const set = <K extends keyof ServicePlanInput>(k: K, v: ServicePlanInput[K]) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    if (errors[k as ServicePlanErrorKey]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const toggle = (k: 'serviceTypes' | 'specialDiets' | 'developedWith', v: string) => {
    if (!form) return;
    const cur = form[k] as string[];
    set(k, (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]) as never);
  };
  const setGoal = (i: number, k: 'goal' | 'objective', v: string) => {
    if (!form) return;
    const goals = form.goals.map((g, j) => (j === i ? { ...g, [k]: v } : g));
    set('goals', goals);
  };

  const submit = async () => {
    if (!form) return;
    const e = validateServicePlan(form);
    setErrors(e);
    setShowErrors(true);
    if (Object.keys(e).length) {
      const first = firstErrorKey(SERVICE_PLAN_ERROR_ORDER, e);
      if (first) escortToField(fieldId(first));
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      setDone(await postServicePlan(form));
    } catch (err) {
      const withFields = err as Error & { fields?: ServicePlanFieldErrors };
      if (withFields.fields) {
        setErrors(withFields.fields);
        const first = firstErrorKey(SERVICE_PLAN_ERROR_ORDER, withFields.fields);
        if (first) escortToField(fieldId(first));
      }
      setSubmitError(withFields.message || 'The service plan could not be saved.');
      setSubmitting(false);
    }
  };

  if (!user || !profile) return null;
  if (isViewingAs) {
    return (
      <div style={containerStyle}><div style={wrapStyle}><div style={noticeStyle}><AlertTriangle size={16} /> View-as sessions are read-only. Exit view-as to write a service plan.</div></div></div>
    );
  }
  if (patient === null) {
    return (
      <div style={containerStyle}><div style={wrapStyle}><div style={noticeStyle}><AlertTriangle size={16} /> That client was not found.</div></div></div>
    );
  }
  if (done) {
    return (
      <div style={containerStyle}>
        <div style={wrapStyle}>
          <div style={{ ...cardStyle, textAlign: 'center', padding: '32px 24px' }}>
            <CheckCircle2 size={40} color="#27ae60" />
            <h1 style={{ ...titleStyle, fontSize: 24, marginTop: 10 }}>Service plan signed</h1>
            <p style={{ color: '#5c6b7a', lineHeight: 1.55, maxWidth: 560, margin: '8px auto 0' }}>
              {done.filed
                ? `The signed plan is now the current service plan for ${patient?.name || 'this client'} and the PDF is filed under Documents as "Service Plan".`
                : `The signed plan is saved as the current service plan for ${patient?.name || 'this client'}, but the PDF could not be filed under Documents. Open the plan and download the PDF to file it by hand.`}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
              <Link href={`/admin/clients/${patientId}?tab=serviceplan`} style={primaryLinkStyle}>View service plan</Link>
              <Link href={`/admin/clients/${patientId}`} style={secondaryLinkStyle}>Back to {patient?.name || 'client'}</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (!form || patient === undefined) {
    return <div style={containerStyle}><div style={wrapStyle}><div style={{ color: '#7f8c8d', fontSize: 13.5 }}>Loading...</div></div></div>;
  }

  const fe = (k: ServicePlanErrorKey) => (showErrors ? errors[k] : undefined);
  const hi = (k: ServicePlanErrorKey): CSSProperties => (fe(k) ? FIELD_ERROR_STYLE : {});
  const errorList = showErrors ? SERVICE_PLAN_ERROR_ORDER.filter((k) => errors[k]) : [];
  const usedGoalRows = form.goals.length;

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <header style={{ marginBottom: 18 }}>
          <p style={kickerStyle}>Care planning</p>
          <h1 style={titleStyle}><ClipboardList size={22} style={{ verticalAlign: -3, marginRight: 8 }} />{startedFrom ? 'Revise the service plan' : 'Write the service plan'}</h1>
          <p style={subtitleStyle}>
            {startedFrom
              ? `Started from the plan signed ${formatDateUS(startedFrom.signedDate)}${startedFrom.by ? ` by ${startedFrom.by}` : ''}. Change what has changed; signing files a new plan and keeps the earlier one on record.`
              : 'The plan is prefilled from the client record, the MAR and the approved care-plan tasks. Complete every line; signing files the PDF under Documents.'}
          </p>
        </header>

        {errorList.length > 0 && (
          <div style={{ ...noticeStyle, flexDirection: 'column', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={16} /> {errorList.length === 1 ? 'One field needs attention:' : `${errorList.length} fields need attention:`}</div>
            <ul style={{ margin: '4px 0 0 24px', padding: 0, fontWeight: 500 }}>
              {errorList.map((k) => (
                <li key={k}><button type="button" style={errorLinkStyle} onClick={() => escortToField(fieldId(k))}>{SERVICE_PLAN_FIELD_LABEL[k]}</button>: {errors[k]}</li>
              ))}
            </ul>
          </div>
        )}
        {submitError && <div style={noticeStyle}><AlertTriangle size={16} /> {submitError}</div>}

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Client</h2>
          <div style={lockedBoxStyle}>
            <Lock size={14} style={{ flexShrink: 0, marginTop: 2, color: '#5c6b7a' }} />
            <div>
              <strong>{patient?.name}</strong>{patient?.dob ? `, DOB ${formatDateUS(patient.dob)}` : ''}
              <div style={hintStyle}>Name and date of birth come from the client record.</div>
            </div>
          </div>
          <Field id={fieldId('address')} label="Address *" error={fe('address')}>
            <input style={{ ...inputStyle, ...hi('address') }} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Street, city, state ZIP" />
          </Field>
          <Field id={fieldId('diagnosis')} label="Diagnosis *" error={fe('diagnosis')}>
            <input style={{ ...inputStyle, ...hi('diagnosis') }} value={form.diagnosis} onChange={(e) => set('diagnosis', e.target.value)} />
          </Field>
          <Field id={fieldId('functionalLimitations')} label="Client functional limitations *" error={fe('functionalLimitations')} hint="What the client cannot do alone: mobility, transfers, feeding, toileting, communication, and so on.">
            <textarea style={{ ...textareaStyle, ...hi('functionalLimitations') }} value={form.functionalLimitations} onChange={(e) => set('functionalLimitations', e.target.value)} />
          </Field>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Services</h2>
          <div id={fieldId('serviceTypes')} style={fieldStyle}>
            <span style={labelStyle}>Types of services required *</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', ...(fe('serviceTypes') ? FIELD_ERROR_WRAP_STYLE : null) }}>
              {SERVICE_TYPES.map((t) => (
                <button key={t.key} type="button" aria-pressed={form.serviceTypes.includes(t.key)} style={form.serviceTypes.includes(t.key) ? chipActiveStyle : chipStyle} onClick={() => toggle('serviceTypes', t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
            <FieldError message={fe('serviceTypes')} />
          </div>
          <div style={rowStyle}>
            <Field id={fieldId('nutritionalNeeds')} label="Nutritional needs *" error={fe('nutritionalNeeds')}>
              <input style={{ ...inputStyle, ...hi('nutritionalNeeds') }} value={form.nutritionalNeeds} onChange={(e) => set('nutritionalNeeds', e.target.value)} placeholder='e.g. Regular diet, encourage fluids, or "None"' />
            </Field>
            <Field id={fieldId('allergies')} label="Allergies *" error={fe('allergies')}>
              <input style={{ ...inputStyle, ...hi('allergies') }} value={form.allergies} onChange={(e) => set('allergies', e.target.value)} placeholder='e.g. Penicillin, or "No known allergies"' />
            </Field>
          </div>
          <div style={rowStyle}>
            <Field id={fieldId('expectedTimesFrequency')} label="Expected times and frequency of service delivery *" error={fe('expectedTimesFrequency')}>
              <input style={{ ...inputStyle, ...hi('expectedTimesFrequency') }} value={form.expectedTimesFrequency} onChange={(e) => set('expectedTimesFrequency', e.target.value)} placeholder="e.g. Monday through Friday, 8 AM to 4 PM" />
            </Field>
            <Field id={fieldId('expectedDuration')} label="Expected duration of services *" error={fe('expectedDuration')}>
              <input style={{ ...inputStyle, ...hi('expectedDuration') }} value={form.expectedDuration} onChange={(e) => set('expectedDuration', e.target.value)} placeholder="e.g. Ongoing, reviewed every 12 months" />
            </Field>
          </div>
          <Field
            id={fieldId('descriptionOfServices')}
            label="Description of services to be provided *"
            error={fe('descriptionOfServices')}
            action={tasksText ? <button type="button" style={linkBtnStyle} onClick={() => set('descriptionOfServices', tasksText)}><RefreshCw size={12} /> Use the approved care-plan tasks</button> : null}
          >
            <textarea style={{ ...textareaStyle, minHeight: 150, ...hi('descriptionOfServices') }} value={form.descriptionOfServices} onChange={(e) => set('descriptionOfServices', e.target.value)} />
          </Field>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Diet and personal care</h2>
          <YesNoField id={fieldId('regularDiet')} label="Regular diet *" value={form.regularDiet} error={fe('regularDiet')} onChange={(v) => set('regularDiet', v)} />
          <div style={fieldStyle}>
            <span style={labelStyle}>Special diet</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {SPECIAL_DIETS.map((t) => (
                <button key={t.key} type="button" aria-pressed={form.specialDiets.includes(t.key)} style={form.specialDiets.includes(t.key) ? chipActiveStyle : chipStyle} onClick={() => toggle('specialDiets', t.key)}>
                  {t.label}
                </button>
              ))}
              <input style={{ ...inputStyle, width: 'auto', flex: '1 1 200px' }} value={form.specialDietOther} onChange={(e) => set('specialDietOther', e.target.value)} placeholder="Other special diet" aria-label="Other special diet" />
            </div>
          </div>
          <div style={rowStyle}>
            <Field label="Special treatments">
              <input style={inputStyle} value={form.specialTreatments} onChange={(e) => set('specialTreatments', e.target.value)} placeholder="e.g. Wound care, tube feeding" />
            </Field>
            <Field label="Special equipment">
              <input style={inputStyle} value={form.specialEquipment} onChange={(e) => set('specialEquipment', e.target.value)} placeholder="e.g. Hoyer lift, wheelchair, oxygen" />
            </Field>
          </div>
          <Field label="Behaviors that may interfere with delivering services">
            <textarea style={{ ...textareaStyle, minHeight: 70 }} value={form.behaviors} onChange={(e) => set('behaviors', e.target.value)} />
          </Field>
          <div style={rowStyle}>
            <YesNoField id={fieldId('tubBath')} label="Tub bath *" value={form.tubBath} error={fe('tubBath')} onChange={(v) => set('tubBath', v)} />
            <YesNoField id={fieldId('bedBath')} label="Bed bath *" value={form.bedBath} error={fe('bedBath')} onChange={(v) => set('bedBath', v)} />
            <YesNoField id={fieldId('lotionToBack')} label="Applying lotion to back *" value={form.lotionToBack} error={fe('lotionToBack')} onChange={(v) => set('lotionToBack', v)} />
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Goals and objectives *</h2>
          <div id={fieldId('goals')} style={fe('goals') ? FIELD_ERROR_WRAP_STYLE : undefined}>
            <div style={goalHeadStyle}>
              <span>Goal</span>
              <span>Objective</span>
              <span />
            </div>
            {form.goals.map((g, i) => (
              <div key={i} style={goalRowStyle}>
                <textarea style={{ ...textareaStyle, minHeight: 56 }} value={g.goal} onChange={(e) => setGoal(i, 'goal', e.target.value)} aria-label={`Goal ${i + 1}`} placeholder="e.g. Client will remain free of skin breakdown" />
                <textarea style={{ ...textareaStyle, minHeight: 56 }} value={g.objective} onChange={(e) => setGoal(i, 'objective', e.target.value)} aria-label={`Objective ${i + 1}`} placeholder="e.g. Reposition every 2 hours; inspect skin each visit" />
                <button
                  type="button"
                  style={{ ...linkBtnStyle, alignSelf: 'center', visibility: usedGoalRows > 1 ? 'visible' : 'hidden' }}
                  aria-label={`Remove goal ${i + 1}`}
                  onClick={() => set('goals', form.goals.filter((_, j) => j !== i))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {form.goals.length < SERVICE_PLAN_MAX_GOALS && (
              <button type="button" style={linkBtnStyle} onClick={() => set('goals', [...form.goals, { goal: '', objective: '' }])}><Plus size={14} /> Add a goal</button>
            )}
          </div>
          <FieldError message={fe('goals')} />
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Medications and discharge</h2>
          <Field
            id={fieldId('medications')}
            label="Medications *"
            error={fe('medications')}
            hint='One per line, as on the MAR. Write "None" if the client takes none.'
            action={marText ? <button type="button" style={linkBtnStyle} onClick={() => set('medications', marText)}><RefreshCw size={12} /> Refresh from the MAR</button> : null}
          >
            <textarea style={{ ...textareaStyle, minHeight: 110, ...hi('medications') }} value={form.medications} onChange={(e) => set('medications', e.target.value)} />
          </Field>
          <Field id={fieldId('dischargePlans')} label="Discharge plans *" error={fe('dischargePlans')} hint="What ends services and what happens then: goals met, move to a facility, family assumes care, and so on.">
            <textarea style={{ ...textareaStyle, minHeight: 80, ...hi('dischargePlans') }} value={form.dischargePlans} onChange={(e) => set('dischargePlans', e.target.value)} />
          </Field>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Plan developed with</h2>
          <p style={{ ...hintStyle, margin: '-6px 0 10px' }}>
            State rules call for the plan to be written with the client, the responsible party, and for nursing services the client&apos;s personal physician. Check who took part.
          </p>
          <div style={fieldStyle}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {DEVELOPED_WITH.map((t) => (
                <button key={t.key} type="button" aria-pressed={form.developedWith.includes(t.key)} style={form.developedWith.includes(t.key) ? chipActiveStyle : chipStyle} onClick={() => toggle('developedWith', t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <Field label="Names and how (optional)">
            <input style={inputStyle} value={form.developedWithNotes} onChange={(e) => set('developedWithNotes', e.target.value)} placeholder="e.g. Mother, Jane Doe, in person; Dr. Patel by phone on 09/25/2026" />
          </Field>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Supervisor signature</h2>
          <div style={rowStyle}>
            <Field id={fieldId('supervisorName')} label="Supervisor printed name *" error={fe('supervisorName')}>
              <input style={{ ...inputStyle, ...hi('supervisorName') }} value={form.supervisorName} onChange={(e) => set('supervisorName', e.target.value)} />
            </Field>
            <Field id={fieldId('supervisorCredentials')} label="Credentials *" error={fe('supervisorCredentials')}>
              <input style={{ ...inputStyle, ...hi('supervisorCredentials') }} value={form.supervisorCredentials} onChange={(e) => set('supervisorCredentials', e.target.value)} placeholder="e.g. RN" />
            </Field>
          </div>
          <div id={fieldId('signature')} style={fieldStyle}>
            <span style={labelStyle}>Signature *</span>
            <div style={{ ...sigWrapStyle, ...(fe('signature') ? FIELD_ERROR_STYLE : null) }}>
              <SignatureCanvas
                ref={sigRef}
                className="service-plan-sig"
                onChange={(dataUrl) => set('signature', dataUrl)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span style={hintStyle}>Signed and dated {formatDateUS(todayAgencyISO())}. Sign with your finger or mouse.</span>
              <button type="button" style={linkBtnStyle} onClick={() => { sigRef.current?.clear(); set('signature', ''); }}>Clear signature</button>
            </div>
            <FieldError message={fe('signature')} />
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Caregiver signature (optional)</h2>
          <p style={{ ...hintStyle, margin: '-6px 0 10px' }}>
            GAPP requires the caregiver to sign the nursing care plan (GAPP manual section 916). For other programs, leave this blank.
          </p>
          <div style={rowStyle}>
            <Field id={fieldId('caregiverName')} label="Caregiver printed name" error={fe('caregiverName')}>
              <input style={{ ...inputStyle, ...hi('caregiverName') }} value={form.caregiverName} onChange={(e) => set('caregiverName', e.target.value)} />
            </Field>
            <Field label="Relationship to client">
              <input style={inputStyle} value={form.caregiverRelationship} onChange={(e) => set('caregiverRelationship', e.target.value)} placeholder="e.g. Mother" />
            </Field>
          </div>
          <div id={fieldId('caregiverSignature')} style={fieldStyle}>
            <span style={labelStyle}>Caregiver signature</span>
            <div style={{ ...sigWrapStyle, ...(fe('caregiverSignature') ? FIELD_ERROR_STYLE : null) }}>
              <SignatureCanvas ref={cgSigRef} className="service-plan-sig" onChange={(dataUrl) => set('caregiverSignature', dataUrl)} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" style={linkBtnStyle} onClick={() => { cgSigRef.current?.clear(); set('caregiverSignature', ''); }}>Clear caregiver signature</button>
            </div>
            <FieldError message={fe('caregiverSignature')} />
          </div>
        </section>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Link href={`/admin/clients/${patientId}?tab=serviceplan`} style={secondaryLinkStyle}>Cancel</Link>
          <button type="button" style={{ ...primaryBtnStyle, opacity: submitting ? 0.6 : 1 }} disabled={submitting} onClick={() => void submit()}>{submitting ? 'Signing...' : 'Sign and file the plan'}</button>
        </div>
      </div>
      <style jsx global>{`.service-plan-sig { width: 100%; height: auto; display: block; touch-action: none; }`}</style>
    </div>
  );
}

function Field({ id, label, error, hint, action, children }: { id?: string; label: string; error?: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div id={id} style={fieldStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={labelStyle}>{label}</span>
        {action}
      </div>
      {children}
      {hint && !error ? <span style={hintStyle}>{hint}</span> : null}
      <FieldError message={error} />
    </div>
  );
}

function YesNoField({ id, label, value, error, onChange }: { id: string; label: string; value: YesNo | ''; error?: string; onChange: (v: YesNo) => void }) {
  return (
    <div id={id} style={fieldStyle}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: 'flex', gap: 8, ...(error ? FIELD_ERROR_WRAP_STYLE : null) }}>
        {(['yes', 'no'] as const).map((v) => (
          <button key={v} type="button" aria-pressed={value === v} style={value === v ? chipActiveStyle : chipStyle} onClick={() => onChange(v)}>
            {v === 'yes' ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
      <FieldError message={error} />
    </div>
  );
}

const NAVY = '#1a3a5c';
const containerStyle: CSSProperties = { minHeight: '70vh', background: '#f5f7fa', padding: '32px 20px' };
const wrapStyle: CSSProperties = { maxWidth: 860, margin: '0 auto' };
const kickerStyle: CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#27ae60', margin: 0 };
const titleStyle: CSSProperties = { fontSize: 28, color: '#2c3e50', margin: '4px 0 0' };
const subtitleStyle: CSSProperties = { color: '#7f8c8d', fontSize: 14.5, marginTop: 6, lineHeight: 1.5 };
const cardStyle: CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px', marginBottom: 14 };
const sectionTitleStyle: CSSProperties = { fontSize: 15, fontWeight: 700, color: NAVY, margin: '0 0 12px' };
const rowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 };
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12, minWidth: 0 };
const labelStyle: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: '#5c6b7a' };
const hintStyle: CSSProperties = { fontSize: 12, color: '#8a949e', lineHeight: 1.4 };
const inputStyle: CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', height: 40 };
const textareaStyle: CSSProperties = { ...inputStyle, height: 'auto', minHeight: 90, resize: 'vertical', lineHeight: 1.5 };
const noticeStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: '#fdeaea', color: '#b3261e', border: '1px solid #f0c8c4', borderRadius: 8, padding: '10px 14px', fontSize: 13.5, fontWeight: 600, marginBottom: 14 };
const errorLinkStyle: CSSProperties = { background: 'transparent', border: 'none', padding: 0, color: '#b3261e', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' };
const lockedBoxStyle: CSSProperties = { display: 'flex', gap: 8, alignItems: 'flex-start', background: '#f6f9fc', border: '1px solid #dbe3ec', borderRadius: 8, padding: '10px 12px', fontSize: 13.5, marginBottom: 12 };
const chipStyle: CSSProperties = { background: '#f1f5f9', color: '#475569', borderWidth: 1, borderStyle: 'solid', borderColor: '#e2e8f0', padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' };
const chipActiveStyle: CSSProperties = { ...chipStyle, background: '#e8eef4', color: NAVY, borderColor: NAVY };
const goalHeadStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 28px', gap: 8, fontSize: 12.5, fontWeight: 600, color: '#5c6b7a', marginBottom: 4 };
const goalRowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 28px', gap: 8, marginBottom: 8 };
const sigWrapStyle: CSSProperties = { border: '1px solid #d0d7de', borderRadius: 8, overflow: 'hidden', background: 'white' };
const linkBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: NAVY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 };
const primaryBtnStyle: CSSProperties = { background: NAVY, color: 'white', border: 'none', padding: '11px 18px', borderRadius: 8, fontSize: 14.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const primaryLinkStyle: CSSProperties = { ...primaryBtnStyle, textDecoration: 'none', display: 'inline-block' };
const secondaryLinkStyle: CSSProperties = { display: 'inline-block', background: 'white', color: '#374151', border: '1px solid #d0d7de', padding: '11px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none' };
