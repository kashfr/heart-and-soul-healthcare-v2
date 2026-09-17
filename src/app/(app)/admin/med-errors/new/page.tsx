'use client';

import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ShieldAlert, X } from 'lucide-react';
import { useAuth, useEffectiveUser } from '@/components/AuthProvider';
import SignatureCanvas, { type SignatureCanvasHandle } from '@/components/SignatureCanvas';
import { getPatients, getPatientsForNurse, type Patient } from '@/lib/patients';
import { getAdministrationsForDay, getMarOrders, type MarAdministration, type MarOrder } from '@/lib/mar';
import { withSelectChevron } from '@/lib/selectChevron';
import { MED_ROUTES } from '@/lib/marShared';
import { getNotesForPatient } from '@/lib/submissions';
import { careTeamFromNotes } from '@/lib/clientDashboardShared';
import { Lock } from 'lucide-react';
import { escortToField, firstErrorKey, FIELD_ERROR_STYLE } from '@/lib/formEscort';
import { postMedError } from '@/lib/medErrors';
import {
  EMPTY_MED_ERROR_INPUT,
  EMPTY_NOTIFICATION,
  incidentReportRequired,
  MED_ERROR_DOSE_OUTCOMES,
  MED_ERROR_HARM_LEVELS,
  MED_ERROR_RESPONSIBLE_TYPES,
  MED_ERROR_TEXT_MAX,
  MED_ERROR_TYPES,
  validateMedErrorInput,
  type MedErrorFieldErrors,
  type MedErrorInput,
  type MedErrorNotification,
} from '@/lib/medErrorShared';

/** Agency-local (America/New_York) now as "YYYY-MM-DDTHH:MM": every time on
 *  the report is agency time, whatever zone the device is in. */
/** Display order of the fields, for the escort and the banner. */
const FIELD_ORDER: (keyof MedErrorFieldErrors)[] = ['patientId', 'discoveredAt', 'occurredAt', 'medName', 'doseGiven', 'errorType', 'doseOutcome', 'responsibleType', 'description', 'harm', 'clientCondition', 'physician', 'physicianAt', 'guardianAt', 'supervisorAt', 'actionsTaken', 'reporterSignature'];
const FIELD_LABEL: Record<keyof MedErrorFieldErrors, string> = {
  patientId: 'Client', discoveredAt: 'When you discovered the error', occurredAt: 'When the error occurred', medName: 'Medication name', doseOrdered: 'Dose ordered', doseGiven: 'Dose actually given', route: 'Route', marOrderId: 'Medication order', marAdministrationId: 'Charted dose', errorType: 'Type of error', doseOutcome: 'Was the dose given?', description: 'What happened', responsibleType: 'Who administered', responsibleName: 'Their name', harm: 'Effect on the client', clientCondition: 'Condition and symptoms', physician: 'Physician notified', guardian: 'Family notified', supervisor: 'Supervisor notified', physicianAt: 'Physician notification time', guardianAt: 'Family notification time', supervisorAt: 'Supervisor notification time', actionsTaken: 'Actions taken', reporterSignature: 'Your signature', occurredApprox: 'Approximate',
};
const fieldId = (k: string) => `me-field-${k}`;

function nowLocal(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`;
}

/**
 * File a medication error report. Anyone with a clinical credential (RN,
 * LPN, CNA, HHA) or staff: the person who discovers an error is often an
 * aide. "Who administered" is asked separately from "who is reporting" so a
 * reporter is never implied to be the one who gave the dose.
 */
export default function NewMedErrorPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const { user, profile } = useAuth();
  const { role, credential, isViewingAs } = useEffectiveUser();
  const presetPatient = useSearchParams().get('patient') || '';
  const isStaff = role === 'admin' || role === 'supervisor';
  const canFile = !isViewingAs && (isStaff || !!credential);

  const [patients, setPatients] = useState<Patient[]>([]);
  // The error usually happened the same shift it was found, so occurrence
  // defaults to the discovery time (marked approximate); the nurse adjusts it
  // if she knows better. A blank here would also hide the charted-dose picker.
  const [form, setForm] = useState<MedErrorInput>(() => {
    const now = nowLocal();
    return { ...EMPTY_MED_ERROR_INPUT, patientId: presetPatient, discoveredAt: now, occurredAt: now, occurredApprox: true };
  });
  const [orders, setOrders] = useState<MarOrder[]>([]);
  const [dayAdmins, setDayAdmins] = useState<MarAdministration[]>([]);
  const [medMode, setMedMode] = useState<'order' | 'other'>('order');
  const [careTeam, setCareTeam] = useState<Array<{ uid: string; name: string; credential: string }>>([]);
  const [errors, setErrors] = useState<MedErrorFieldErrors>({});
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState<{ id: string; incident: boolean } | null>(null);
  const sigRef = useRef<SignatureCanvasHandle>(null);

  const set = <K extends keyof MedErrorInput>(k: K, v: MedErrorInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setNotif = (k: 'physician' | 'guardian' | 'supervisor', patch: Partial<MedErrorNotification>) =>
    setForm((f) => ({ ...f, [k]: { ...f[k], ...patch } }));

  useEffect(() => {
    if (!user?.uid || !role) return;
    let cancelled = false;
    (isStaff ? getPatients() : getPatientsForNurse(user.uid)).then((list) => {
      if (!cancelled) setPatients(list);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.uid, role, isStaff]);

  const patient = useMemo(() => patients.find((p) => p.id === form.patientId) || null, [patients, form.patientId]);

  // Orders for the med picker; charted doses for the occurrence date so the
  // report can point at the exact MAR entry.
  useEffect(() => {
    if (!form.patientId) return;
    let cancelled = false;
    getMarOrders(form.patientId).then((list) => {
      // Replace, never merge: a client switch must not show the previous chart's orders.
      if (!cancelled) setOrders(list.filter((o) => o.status === 'active'));
    });
    getNotesForPatient(form.patientId)
      .then((notes) => {
        if (!cancelled) setCareTeam(careTeamFromNotes(notes));
      })
      .catch(() => {
        if (!cancelled) setCareTeam([]);
      });
    return () => {
      cancelled = true;
    };
  }, [form.patientId]);
  const occurredDate = form.occurredAt.slice(0, 10);
  useEffect(() => {
    if (!form.patientId || !/^\d{4}-\d{2}-\d{2}$/.test(occurredDate)) return;
    let cancelled = false;
    getAdministrationsForDay(form.patientId, occurredDate).then((list) => {
      if (!cancelled) setDayAdmins(list);
    });
    return () => {
      cancelled = true;
    };
  }, [form.patientId, occurredDate]);

  const pickOrder = (orderId: string) => {
    const o = orders.find((x) => x.id === orderId);
    setForm((f) => ({
      ...f,
      marOrderId: orderId,
      marAdministrationId: '',
      medName: o ? o.medName : f.medName,
      doseOrdered: o ? `${o.dose}${o.units ? ` ${o.units}` : ''}`.trim() : f.doseOrdered,
      route: o ? o.route : f.route,
    }));
  };
  const linkedDoses = dayAdmins.filter((a) => !form.marOrderId || a.orderId === form.marOrderId);
  const orderUnits = useMemo(() => orders.find((o) => o.id === form.marOrderId)?.units || '', [orders, form.marOrderId]);
  const medLocked = medMode === 'order' && !!form.marOrderId;
  // The error type settles what "was the dose given" must be for the
  // unambiguous cases, so the nurse isn't asked to restate it.
  const pickErrorType = (t: MedErrorInput['errorType']) => {
    setForm((f) => {
      const next = { ...f, errorType: t };
      if (t === 'omitted') {
        next.doseOutcome = 'omitted';
        next.doseGiven = '0';
      } else if (t === 'documentation') {
        next.doseOutcome = 'given';
        if (next.doseGiven === '0') next.doseGiven = next.doseOrdered;
      } else if (t === 'wrong-dose' || t === 'wrong-time' || t === 'wrong-med' || t === 'wrong-client' || t === 'wrong-route' || t === 'unauthorized' || t === 'expired-discontinued') {
        if (!next.doseOutcome || next.doseOutcome === 'omitted') next.doseOutcome = 'given';
        if (next.doseGiven === '0') next.doseGiven = '';
      }
      return next;
    });
  };
  const outcomeLocked = form.errorType === 'omitted' || form.errorType === 'documentation';
  const responsibleFromTeam = form.responsibleType === 'nurse' || form.responsibleType === 'aide';
  const teamChoices = careTeam.filter((m) => (form.responsibleType === 'nurse' ? ['RN', 'LPN'].includes(m.credential) : ['CNA', 'HHA'].includes(m.credential)));
  const incident = incidentReportRequired({ harm: form.harm, errorType: form.errorType });

  const submit = async () => {
    const e = validateMedErrorInput(form, nowLocal());
    setErrors(e);
    setShowErrors(true);
    if (Object.keys(e).length) {
      const first = firstErrorKey(FIELD_ORDER, e);
      if (first) escortToField(fieldId(first));
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      setDone(await postMedError(form));
    } catch (err) {
      const withFields = err as Error & { fields?: Record<string, string> };
      if (withFields.fields) {
        setErrors(withFields.fields as MedErrorFieldErrors);
        const first = firstErrorKey(FIELD_ORDER, withFields.fields as MedErrorFieldErrors);
        if (first) escortToField(fieldId(first));
      }
      setSubmitError(withFields.message || 'The report could not be saved.');
      setSubmitting(false);
    }
  };

  if (!user || !role) return null;
  if (!canFile) {
    return (
      <div style={containerStyle}><div style={wrapStyle}><div style={noticeStyle}><AlertTriangle size={16} /> A clinical credential is required to file a medication error report. {isViewingAs ? 'View-as sessions are read-only.' : ''}</div></div></div>
    );
  }
  if (done) {
    return (
      <div style={containerStyle}>
        <div style={wrapStyle}>
          <div style={{ ...cardStyle, textAlign: 'center', padding: '32px 24px' }}>
            <CheckCircle2 size={40} color="#27ae60" />
            <h1 style={{ ...titleStyle, fontSize: 24, marginTop: 10 }}>Report filed</h1>
            <p style={{ color: '#5c6b7a', lineHeight: 1.55, maxWidth: 560, margin: '8px auto 0' }}>
              The nursing supervisor and the office have been notified and will review it. Thank you for reporting it; the report is part of the client&apos;s record and cannot be changed.
            </p>
            {done.incident && (
              <div style={{ ...incidentBoxStyle, maxWidth: 560, margin: '14px auto 0', textAlign: 'left' }}>
                <ShieldAlert size={16} style={{ flexShrink: 0 }} /> This error meets the criteria for a DBHDD reportable incident. The office has been flagged to file the incident report within the required window.
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
              <Link href={`/admin/med-errors?r=${done.id}`} style={primaryLinkStyle}>View report</Link>
              {form.patientId && <Link href={`/admin/clients/${form.patientId}`} style={secondaryLinkStyle}>Back to {patient?.name || 'client'}</Link>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const err = (k: keyof MedErrorFieldErrors) => (showErrors && errors[k] ? <div style={fieldErrStyle}>{errors[k]}</div> : null);
  const hi = (k: keyof MedErrorFieldErrors): CSSProperties => (showErrors && errors[k] ? FIELD_ERROR_STYLE : {});
  const errorList = showErrors ? FIELD_ORDER.filter((k) => errors[k]) : [];

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <header style={{ marginBottom: 18 }}>
          <p style={kickerStyle}>Quality and safety</p>
          <h1 style={titleStyle}><ShieldAlert size={22} style={{ verticalAlign: -3, marginRight: 8 }} />Report a medication error</h1>
          <p style={subtitleStyle}>
            Report any error you discover, whether or not you were involved. Say what happened in your own words; the reviewing nurse adds the findings. Reports go to the nursing supervisor and the office right away.
          </p>
        </header>

        {errorList.length > 0 && (
          <div style={{ ...noticeStyle, flexDirection: 'column', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={16} /> {errorList.length === 1 ? 'One field needs attention:' : `${errorList.length} fields need attention:`}</div>
            <ul style={{ margin: '4px 0 0 24px', padding: 0, fontWeight: 500 }}>
              {errorList.map((k) => (
                <li key={k}><button type="button" style={errorLinkStyle} onClick={() => escortToField(fieldId(k))}>{FIELD_LABEL[k] || k}</button>: {errors[k]}</li>
              ))}
            </ul>
          </div>
        )}
        {submitError && <div style={noticeStyle}><AlertTriangle size={16} /> {submitError}</div>}

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Client and timing</h2>
          <div style={rowStyle}>
            <label id={fieldId('patientId')} style={fieldStyle}>
              <span style={labelStyle}>Client *</span>
              <select value={form.patientId} onChange={(e) => { setOrders([]); setDayAdmins([]); setCareTeam([]); setForm((f) => ({ ...f, patientId: e.target.value, marOrderId: '', marAdministrationId: '', medName: '', doseOrdered: '', route: '' })); }} style={{ ...selectStyle, ...hi('patientId') }} disabled={submitting}>
                <option value="">Choose a client</option>
                {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {err('patientId')}
            </label>
            <label id={fieldId('discoveredAt')} style={fieldStyle}>
              <span style={labelStyle}>When you discovered the error (Eastern time) *</span>
              <input type="datetime-local" value={form.discoveredAt} max={nowLocal()} onChange={(e) => set('discoveredAt', e.target.value)} style={{ ...inputStyle, ...hi('discoveredAt') }} disabled={submitting} />
              {err('discoveredAt')}
            </label>
          </div>
          <div style={rowStyle}>
            <label id={fieldId('occurredAt')} style={fieldStyle}>
              <span style={labelStyle}>When the error occurred (if known)</span>
              <input type="datetime-local" value={form.occurredAt} max={form.discoveredAt || nowLocal()} onChange={(e) => set('occurredAt', e.target.value)} style={{ ...inputStyle, ...hi('occurredAt') }} disabled={submitting} />
              {err('occurredAt')}
            </label>
            <label style={{ ...checkRowStyle, alignSelf: 'end', marginBottom: 14 }}>
              <input type="checkbox" checked={form.occurredApprox} onChange={(e) => set('occurredApprox', e.target.checked)} disabled={submitting} />
              <span>This time is approximate</span>
            </label>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Medication involved</h2>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button type="button" style={medMode === 'order' ? chipActiveStyle : chipStyle} onClick={() => setMedMode('order')} disabled={submitting}>On the client&apos;s MAR</button>
            <button type="button" style={medMode === 'other' ? chipActiveStyle : chipStyle} onClick={() => { setMedMode('other'); setForm((f) => ({ ...f, marOrderId: '', marAdministrationId: '' })); }} disabled={submitting}>Not on the MAR</button>
          </div>
          {medMode === 'order' && (
            <label style={fieldStyle}>
              <span style={labelStyle}>Medication order</span>
              <select value={form.marOrderId} onChange={(e) => pickOrder(e.target.value)} style={selectStyle} disabled={submitting || !form.patientId}>
                <option value="">{form.patientId ? (orders.length ? 'Choose the medication' : 'No active orders on this MAR') : 'Choose the client first'}</option>
                {orders.map((o) => <option key={o.id} value={o.id}>{o.medName} {o.dose}{o.units ? ` ${o.units}` : ''} {o.route}</option>)}
              </select>
            </label>
          )}
          {medLocked ? (
            <div style={lockedBoxStyle}>
              <Lock size={13} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 700, color: '#1f2937' }}>{form.medName} <span style={{ fontWeight: 500, color: '#5c6b7a' }}>{form.doseOrdered} {form.route}</span></div>
                <div style={hintStyle}>Taken from the MAR order. If the order itself is wrong, say so in the description; the reviewing nurse corrects the MAR.</div>
              </div>
            </div>
          ) : (
            <>
              <div style={rowStyle}>
                <label id={fieldId('medName')} style={fieldStyle}>
                  <span style={labelStyle}>Medication name *</span>
                  <input type="text" value={form.medName} onChange={(e) => set('medName', e.target.value)} style={{ ...inputStyle, ...hi('medName') }} placeholder="As written on the label" disabled={submitting} />
                  {err('medName')}
                </label>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Route</span>
                  <select value={form.route} onChange={(e) => set('route', e.target.value)} style={selectStyle} disabled={submitting}>
                    <option value="">Choose</option>
                    {MED_ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
              </div>
              <label style={fieldStyle}>
                <span style={labelStyle}>Dose ordered</span>
                <input type="text" value={form.doseOrdered} onChange={(e) => set('doseOrdered', e.target.value)} style={{ ...inputStyle, maxWidth: 260 }} placeholder="e.g. 500 mg" disabled={submitting} />
              </label>
            </>
          )}
          {form.errorType !== 'omitted' && (
            <label id={fieldId('doseGiven')} style={fieldStyle}>
              <span style={labelStyle}>Dose actually given{form.errorType === 'documentation' ? '' : ' *'}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="text" value={form.doseGiven} onChange={(e) => set('doseGiven', e.target.value)} style={{ ...inputStyle, maxWidth: 200, ...hi('doseGiven') }} placeholder={orderUnits ? `amount in ${orderUnits}` : 'amount and units'} disabled={submitting} />
                {orderUnits && !form.doseGiven.toLowerCase().includes(orderUnits.toLowerCase()) && <span style={hintStyle}>{orderUnits}</span>}
              </div>
              <span style={hintStyle}>{form.errorType ? 'The amount that actually went in, so the reviewer can see the difference from the order.' : 'Choose the type of error below first if the dose was not given.'}</span>
              {err('doseGiven')}
            </label>
          )}
          {medMode === 'order' && form.marOrderId && occurredDate && (
            <label style={fieldStyle}>
              <span style={labelStyle}>Charted dose this report is about (optional)</span>
              <select value={form.marAdministrationId} onChange={(e) => set('marAdministrationId', e.target.value)} style={selectStyle} disabled={submitting}>
                <option value="">{linkedDoses.length ? 'Choose the MAR entry, if one was charted' : 'No doses charted for this medication on that date'}</option>
                {linkedDoses.map((a) => <option key={a.id} value={a.id}>{a.scheduledTime} slot, {a.status}{a.actualTime ? ` at ${a.actualTime}` : ''} by {a.initials || a.administratorName || 'unknown'}</option>)}
              </select>
              <span style={hintStyle}>Ties the report to the exact MAR entry so the reviewer can see what was charted.</span>
            </label>
          )}
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>What happened</h2>
          <div id={fieldId('errorType')} style={{ ...fieldStyle, ...(showErrors && errors.errorType ? { padding: 8, borderRadius: 8, ...FIELD_ERROR_STYLE, borderWidth: 1, borderStyle: 'solid' } : {}) }}>
            <span style={labelStyle}>Type of error *</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
              {MED_ERROR_TYPES.map((t) => (
                <button key={t.value} type="button" title={t.hint} style={form.errorType === t.value ? chipActiveStyle : chipStyle} onClick={() => pickErrorType(t.value)} disabled={submitting}>{t.label}</button>
              ))}
            </div>
            {err('errorType')}
          </div>
          <div style={rowStyle}>
            <label id={fieldId('doseOutcome')} style={fieldStyle}>
              <span style={labelStyle}>Was the dose given? *</span>
              <select value={form.doseOutcome} onChange={(e) => set('doseOutcome', e.target.value as MedErrorInput['doseOutcome'])} style={{ ...selectStyle, ...(outcomeLocked ? { background: '#f1f5f9', color: '#5c6b7a' } : null), ...hi('doseOutcome') }} disabled={submitting || outcomeLocked}>
                <option value="">Choose</option>
                {MED_ERROR_DOSE_OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {outcomeLocked && <span style={hintStyle}>Set by the type of error.</span>}
              {err('doseOutcome')}
            </label>
            <label id={fieldId('responsibleType')} style={fieldStyle}>
              <span style={labelStyle}>Who administered or was responsible *</span>
              <select value={form.responsibleType} onChange={(e) => set('responsibleType', e.target.value as MedErrorInput['responsibleType'])} style={{ ...selectStyle, ...hi('responsibleType') }} disabled={submitting}>
                <option value="">Choose</option>
                {MED_ERROR_RESPONSIBLE_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {err('responsibleType')}
            </label>
          </div>
          <label style={fieldStyle}>
            <span style={labelStyle}>Their name (if known)</span>
            {responsibleFromTeam && teamChoices.length > 0 ? (
              <>
                <select
                  value={teamChoices.some((m) => `${m.name}, ${m.credential}` === form.responsibleName) ? form.responsibleName : form.responsibleName ? '__other' : ''}
                  onChange={(e) => set('responsibleName', e.target.value === '__other' ? ' ' : e.target.value)}
                  style={selectStyle}
                  disabled={submitting}
                >
                  <option value="">Choose from the care team</option>
                  {teamChoices.map((m) => <option key={m.uid} value={`${m.name}, ${m.credential}`}>{m.name}, {m.credential}</option>)}
                  <option value="__other">Someone else (type the name)</option>
                </select>
                {form.responsibleName && !teamChoices.some((m) => `${m.name}, ${m.credential}` === form.responsibleName) && (
                  <input type="text" value={form.responsibleName.trim()} onChange={(e) => set('responsibleName', e.target.value || ' ')} style={{ ...inputStyle, marginTop: 6 }} placeholder="Name" disabled={submitting} />
                )}
              </>
            ) : (
              <input type="text" value={form.responsibleName} onChange={(e) => set('responsibleName', e.target.value)} style={inputStyle} placeholder={form.responsibleType === 'family' ? 'e.g. Mother' : ''} disabled={submitting} />
            )}
            <span style={hintStyle}>This is separate from who is filing. You can report an error you discovered without having been involved.</span>
          </label>
          <label id={fieldId('description')} style={fieldStyle}>
            <span style={labelStyle}>Describe what happened, in your own words *</span>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={5} maxLength={MED_ERROR_TEXT_MAX} style={{ ...textareaStyle, ...hi('description') }} placeholder="Be specific: what was ordered, what actually happened, how you found out, and anything the physician or reviewer will ask about. Example: 'Tylenol 500 mg ordered at 8 AM. Mother gave 1000 mg at 8:15 AM from the bottle instead of the pre-filled organizer. I found the organizer slot still full at 2 PM.'" disabled={submitting} />
            {err('description')}
          </label>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Client condition</h2>
          <label id={fieldId('harm')} style={fieldStyle}>
            <span style={labelStyle}>Effect on the client *</span>
            <select value={form.harm} onChange={(e) => set('harm', e.target.value as MedErrorInput['harm'])} style={{ ...selectStyle, ...hi('harm') }} disabled={submitting}>
              <option value="">Choose</option>
              {MED_ERROR_HARM_LEVELS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {err('harm')}
          </label>
          {incident && (
            <div style={incidentBoxStyle}>
              <ShieldAlert size={16} style={{ flexShrink: 0 }} /> This meets the criteria for a DBHDD reportable incident. Notify the physician and the supervisor now if you have not; the office will be flagged to file the incident report.
            </div>
          )}
          <label id={fieldId('clientCondition')} style={fieldStyle}>
            <span style={labelStyle}>Condition and symptoms observed *</span>
            <textarea value={form.clientCondition} onChange={(e) => set('clientCondition', e.target.value)} rows={3} maxLength={MED_ERROR_TEXT_MAX} style={{ ...textareaStyle, ...hi('clientCondition') }} placeholder="Vital signs, behavior, symptoms, or 'no change from baseline'." disabled={submitting} />
            {err('clientCondition')}
          </label>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Who was notified</h2>
          <div id={fieldId('physician')} style={showErrors && errors.physician ? { padding: 8, borderRadius: 8, marginBottom: 6, borderWidth: 1, borderStyle: 'solid', ...FIELD_ERROR_STYLE } : undefined}>
          {err('physician')}
          {(['physician', 'guardian', 'supervisor'] as const).map((k) => {
            const n = form[k];
            const label = k === 'physician' ? 'Physician' : k === 'guardian' ? 'Family or guardian' : 'Nursing supervisor';
            return (
              <div key={k} id={fieldId(`${k}At`)} style={notifRowStyle}>
                <label style={{ ...checkRowStyle, minWidth: 190 }}>
                  <input type="checkbox" checked={n.notified} onChange={(e) => setNotif(k, e.target.checked ? { notified: true, at: n.at || nowLocal() } : { ...EMPTY_NOTIFICATION })} disabled={submitting} />
                  <span><strong>{label}</strong> notified</span>
                </label>
                {n.notified && (
                  <>
                    <input type="text" value={n.name} onChange={(e) => setNotif(k, { name: e.target.value })} style={{ ...inputStyle, flex: 1, minWidth: 160 }} placeholder="Who you spoke with" disabled={submitting} />
                    <input type="datetime-local" value={n.at} max={nowLocal()} onChange={(e) => setNotif(k, { at: e.target.value })} style={{ ...inputStyle, width: 220, ...hi(`${k}At` as keyof MedErrorFieldErrors) }} disabled={submitting} />
                  </>
                )}
                {err(`${k}At` as keyof MedErrorFieldErrors)}
              </div>
            );
          })}
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Actions taken</h2>
          <label id={fieldId('actionsTaken')} style={fieldStyle}>
            <span style={labelStyle}>What was done in response *</span>
            <textarea value={form.actionsTaken} onChange={(e) => set('actionsTaken', e.target.value)} rows={3} maxLength={MED_ERROR_TEXT_MAX} style={{ ...textareaStyle, ...hi('actionsTaken') }} placeholder="Dose given late per physician, client monitored, MAR corrected, family instructed, and so on." disabled={submitting} />
            {err('actionsTaken')}
          </label>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Your signature</h2>
          <div style={{ fontSize: 13, color: '#5c6b7a', marginBottom: 8 }}>
            Signing as <strong>{profile?.displayName || user.email}</strong>{credential ? `, ${credential}` : ''}. Date and time are recorded automatically.
          </div>
          <div id={fieldId('reporterSignature')} style={{ ...sigWrapStyle, ...hi('reporterSignature') }}><SignatureCanvas ref={sigRef} onChange={(v) => set('reporterSignature', v)} width={700} height={200} className="med-error-sig" disabled={submitting} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <span style={hintStyle}>Sign with your finger or mouse.</span>
            <button type="button" style={linkBtnStyle} onClick={() => sigRef.current?.clear()} disabled={submitting}><X size={12} /> Clear</button>
          </div>
          {err('reporterSignature')}
        </section>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Link href={form.patientId ? `/admin/clients/${form.patientId}` : '/admin'} style={secondaryLinkStyle}>Cancel</Link>
          <button type="button" style={{ ...primaryBtnStyle, opacity: submitting ? 0.6 : 1 }} disabled={submitting} onClick={() => void submit()}>{submitting ? 'Filing…' : 'File report'}</button>
        </div>
      </div>
      <style jsx global>{`.med-error-sig { width: 100%; height: auto; display: block; touch-action: none; }`}</style>
    </div>
  );
}

const NAVY = '#1a3a5c';
const containerStyle: CSSProperties = { minHeight: '70vh', background: '#f5f7fa', padding: '32px 20px' };
const wrapStyle: CSSProperties = { maxWidth: 820, margin: '0 auto' };
const kickerStyle: CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#27ae60', margin: 0 };
const titleStyle: CSSProperties = { fontSize: 28, color: '#2c3e50', margin: '4px 0 0' };
const subtitleStyle: CSSProperties = { color: '#7f8c8d', fontSize: 14.5, marginTop: 6, lineHeight: 1.5 };
const cardStyle: CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px', marginBottom: 14 };
const sectionTitleStyle: CSSProperties = { fontSize: 15, fontWeight: 700, color: NAVY, margin: '0 0 12px' };
const rowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 };
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10, minWidth: 0 };
const labelStyle: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: '#5c6b7a' };
const hintStyle: CSSProperties = { fontSize: 12, color: '#8a949e', lineHeight: 1.4 };
const inputStyle: CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', height: 40 };
const selectStyle: CSSProperties = withSelectChevron(inputStyle);
const textareaStyle: CSSProperties = { ...inputStyle, height: 'auto', minHeight: 90, resize: 'vertical', lineHeight: 1.5 };
const fieldErrStyle: CSSProperties = { fontSize: 12.5, color: '#b3261e', fontWeight: 600 };
const noticeStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: '#fdeaea', color: '#b3261e', border: '1px solid #f0c8c4', borderRadius: 8, padding: '10px 14px', fontSize: 13.5, fontWeight: 600, marginBottom: 14 };
const incidentBoxStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, background: '#fff4e0', color: '#9a5b00', border: '1px solid #f3d9a4', borderRadius: 8, padding: '10px 14px', fontSize: 13, lineHeight: 1.45, marginBottom: 12 };
const errorLinkStyle: CSSProperties = { background: 'transparent', border: 'none', padding: 0, color: '#b3261e', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' };
const lockedBoxStyle: CSSProperties = { display: 'flex', gap: 8, alignItems: 'flex-start', background: '#f6f9fc', border: '1px solid #dbe3ec', borderRadius: 8, padding: '10px 12px', fontSize: 13.5, marginBottom: 10 };
const chipStyle: CSSProperties = { background: '#f1f5f9', color: '#475569', borderWidth: 1, borderStyle: 'solid', borderColor: '#e2e8f0', padding: '8px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' };
const chipActiveStyle: CSSProperties = { ...chipStyle, background: '#e8eef4', color: NAVY, borderColor: NAVY };
const checkRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: '#2c3e50', lineHeight: 1.45, cursor: 'pointer' };
const notifRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 };
const sigWrapStyle: CSSProperties = { border: '1px solid #d0d7de', borderRadius: 8, overflow: 'hidden', background: 'white' };
const linkBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: '#5c6b7a', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const primaryBtnStyle: CSSProperties = { background: NAVY, color: 'white', border: 'none', padding: '11px 18px', borderRadius: 8, fontSize: 14.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const primaryLinkStyle: CSSProperties = { ...primaryBtnStyle, textDecoration: 'none', display: 'inline-block' };
const secondaryLinkStyle: CSSProperties = { display: 'inline-block', background: 'white', color: '#374151', border: '1px solid #d0d7de', padding: '11px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none' };
