'use client';

import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ClipboardCheck, PenLine } from 'lucide-react';
import { AuthGuard } from '@/components/AuthGuard';
import { useAuth, useEffectiveUser } from '@/components/AuthProvider';
import SignatureCanvas, { type SignatureCanvasHandle } from '@/components/SignatureCanvas';
import { getPatient, getPatientClinical } from '@/lib/patients';
import { getMarOrders } from '@/lib/mar';
import { getCareTasks } from '@/lib/careTasks';
import { getServicePlans, postServicePlanReview } from '@/lib/servicePlans';
import { formatDateUS } from '@/lib/dateFormat';
import { escortToField, firstErrorKey, FieldError, FIELD_ERROR_STYLE, FIELD_ERROR_WRAP_STYLE } from '@/lib/formEscort';
import {
  addDaysISO,
  EMPTY_REVIEW_INPUT,
  lastReviewedISO,
  planDifferences,
  REVIEW_ERROR_ORDER,
  REVIEW_FIELD_LABEL,
  SERVICE_PLAN_MAX_DAYS,
  validateReview,
  type ReviewErrorKey,
  type ServicePlanRecord,
  type ServicePlanReviewInput,
} from '@/lib/servicePlanShared';
import ServicePlanDetails from '../../ServicePlanDetails';

const fieldId = (k: string) => `spr-field-${k}`;

function todayAgencyISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/**
 * "Reviewed, no changes": a supervisor reads the current Service Plan, the
 * portal lists anything in today's record the plan no longer matches, and the
 * supervisor either revises the plan or signs that it still stands (with an
 * explanation when differences were listed). Files a one-page review PDF and
 * restarts the 62-day clock; the plan itself is unchanged.
 */
export default function ReviewServicePlanPage() {
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
  const { user, profile } = useAuth();
  const { isViewingAs } = useEffectiveUser();

  const [plan, setPlan] = useState<ServicePlanRecord | null | undefined>(undefined);
  const [differences, setDifferences] = useState<string[]>([]);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState<ServicePlanReviewInput>(EMPTY_REVIEW_INPUT);
  const [errors, setErrors] = useState<Partial<Record<ReviewErrorKey, string>>>({});
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState<{ filed: boolean } | null>(null);
  const sigRef = useRef<SignatureCanvasHandle>(null);

  useEffect(() => {
    if (!patientId || !user?.uid) return;
    let cancelled = false;
    (async () => {
      try {
        const [plans, p, c, orders, tasks] = await Promise.all([
          getServicePlans(patientId),
          getPatient(patientId),
          getPatientClinical(patientId),
          getMarOrders(patientId),
          getCareTasks(patientId).catch(() => []),
        ]);
        if (cancelled) return;
        const current = plans[0] || null;
        setPlan(current);
        if (!current) return;
        const today = todayAgencyISO();
        const isActive = (o: (typeof orders)[number]) => o.status === 'active' && (!o.endDate || o.endDate >= today);
        const diffs = planDifferences(current, {
          diagnosis: p?.diagnosis || '',
          allergies: c?.allergies || '',
          diet: c?.diet || '',
          activeMeds: orders.filter(isActive).map((o) => o.medName),
          inactiveMeds: orders.filter((o) => !isActive(o)).map((o) => o.medName),
          tasks: tasks.filter((t) => t.status === 'active' && !!t.approvedAt).map((t) => t.name),
        });
        setDifferences(diffs);
        setForm({
          ...EMPTY_REVIEW_INPUT,
          reviewerName: profile?.displayName || user.email || '',
          reviewerCredentials: profile?.credential || current.supervisorCredentials || '',
          differencesAcknowledged: diffs,
        });
      } catch (err) {
        console.error('Service plan review load failed:', err);
        if (!cancelled) setLoadError('Could not load the service plan.');
      }
    })();
    return () => {
      cancelled = true;
    };
    // The profile is stable once loaded; re-running would wipe typed text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, user?.uid]);

  const lastISO = useMemo(() => (plan ? lastReviewedISO(plan) : ''), [plan]);

  const set = <K extends keyof ServicePlanReviewInput>(k: K, v: ServicePlanReviewInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k as ReviewErrorKey]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async () => {
    if (!plan) return;
    const e = validateReview(form);
    setErrors(e);
    setShowErrors(true);
    if (Object.keys(e).length) {
      const first = firstErrorKey(REVIEW_ERROR_ORDER, e);
      if (first) escortToField(fieldId(first));
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      setDone(await postServicePlanReview(plan.id, form));
    } catch (err) {
      const withFields = err as Error & { fields?: Partial<Record<ReviewErrorKey, string>> };
      if (withFields.fields) {
        setErrors(withFields.fields);
        const first = firstErrorKey(REVIEW_ERROR_ORDER, withFields.fields);
        if (first) escortToField(fieldId(first));
      }
      setSubmitError(withFields.message || 'The review could not be saved.');
      setSubmitting(false);
    }
  };

  const tabHref = `/admin/clients/${patientId}?tab=serviceplan`;
  const reviseHref = `/admin/clients/${patientId}/service-plan/new`;

  if (!user || !profile) return null;
  if (isViewingAs) {
    return <Shell><div style={noticeStyle}><AlertTriangle size={16} /> View-as sessions are read-only. Exit view-as to review a service plan.</div></Shell>;
  }
  if (loadError) return <Shell><div style={noticeStyle}><AlertTriangle size={16} /> {loadError}</div></Shell>;
  if (plan === undefined) return <Shell><div style={{ color: '#7f8c8d', fontSize: 13.5 }}>Loading...</div></Shell>;
  if (plan === null) {
    return (
      <Shell>
        <div style={noticeStyle}><AlertTriangle size={16} /> This client has no service plan to review yet.</div>
        <Link href={reviseHref} style={primaryLinkStyle}>Write the service plan</Link>
      </Shell>
    );
  }
  if (done) {
    const nextDue = addDaysISO(todayAgencyISO(), SERVICE_PLAN_MAX_DAYS);
    return (
      <Shell>
        <div style={{ ...cardStyle, textAlign: 'center', padding: '32px 24px' }}>
          <CheckCircle2 size={40} color="#27ae60" />
          <h1 style={{ ...titleStyle, fontSize: 24, marginTop: 10 }}>Review recorded</h1>
          <p style={{ color: '#5c6b7a', lineHeight: 1.55, maxWidth: 560, margin: '8px auto 0' }}>
            The service plan for {plan.clientName} was reviewed with no changes. The next review is due by {formatDateUS(nextDue)}.{' '}
            {done.filed
              ? 'A one-page review is filed under Documents.'
              : 'The review is saved, but its PDF could not be filed under Documents. Open it from the Service plan tab and file it by hand.'}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
            <Link href={tabHref} style={primaryLinkStyle}>View service plan</Link>
          </div>
        </div>
      </Shell>
    );
  }

  const fe = (k: ReviewErrorKey) => (showErrors ? errors[k] : undefined);
  const errorList = showErrors ? REVIEW_ERROR_ORDER.filter((k) => errors[k]) : [];

  return (
    <Shell>
      <header style={{ marginBottom: 18 }}>
        <p style={kickerStyle}>Care planning</p>
        <h1 style={titleStyle}><ClipboardCheck size={22} style={{ verticalAlign: -3, marginRight: 8 }} />Review the service plan</h1>
        <p style={subtitleStyle}>
          Plan signed {formatDateUS(plan.signedDate)} by {plan.supervisorName}
          {plan.reviews.length ? `, last reviewed ${formatDateUS(lastISO)}` : ''}. Read it through. If nothing has changed, sign below; the plan stays as it is and the next review is due in {SERVICE_PLAN_MAX_DAYS} days. If anything has changed, revise the plan instead.
        </p>
      </header>

      {errorList.length > 0 && (
        <div style={{ ...noticeStyle, flexDirection: 'column', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={16} /> {errorList.length === 1 ? 'One field needs attention:' : `${errorList.length} fields need attention:`}</div>
          <ul style={{ margin: '4px 0 0 24px', padding: 0, fontWeight: 500 }}>
            {errorList.map((k) => (
              <li key={k}><button type="button" style={errorLinkStyle} onClick={() => escortToField(fieldId(k))}>{REVIEW_FIELD_LABEL[k]}</button>: {errors[k]}</li>
            ))}
          </ul>
        </div>
      )}
      {submitError && <div style={noticeStyle}><AlertTriangle size={16} /> {submitError}</div>}

      {differences.length > 0 ? (
        <section style={diffBoxStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}><AlertTriangle size={16} /> The client record no longer matches this plan</div>
          <ul style={{ margin: '8px 0 10px 22px', padding: 0, lineHeight: 1.5 }}>
            {differences.map((d) => <li key={d}>{d}</li>)}
          </ul>
          <p style={{ margin: '0 0 10px', lineHeight: 1.5 }}>
            The rules require the plan to be revised when any of these items change. Revise the plan, or, if these differences do not change the plan, explain why in the note below.
          </p>
          <Link href={reviseHref} style={primaryLinkStyle}><PenLine size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Revise the plan instead</Link>
        </section>
      ) : (
        <div style={okBoxStyle}><CheckCircle2 size={16} style={{ flexShrink: 0 }} /> The diagnosis, allergies, diet, active medications and approved care-plan tasks in the client record all match this plan.</div>
      )}

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>Current plan</h2>
        <ServicePlanDetails plan={plan} />
      </section>

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>Review</h2>
        <div id={fieldId('attested')} style={{ ...fieldStyle, ...(fe('attested') ? FIELD_ERROR_WRAP_STYLE : null) }}>
          <label style={checkRowStyle}>
            <input type="checkbox" checked={form.attested} onChange={(e) => set('attested', e.target.checked)} />
            I reviewed this service plan and it still reflects the client&apos;s needs. No changes are needed.
          </label>
          <FieldError message={fe('attested')} />
        </div>
        <Field id={fieldId('note')} label={differences.length ? 'Note (required: why the differences above do not change the plan) *' : 'Note (optional)'} error={fe('note')}>
          <textarea style={{ ...textareaStyle, ...(fe('note') ? FIELD_ERROR_STYLE : null) }} value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="e.g. Reviewed with the mother in the home; no change in condition or services." />
        </Field>
        <div style={rowStyle}>
          <Field id={fieldId('reviewerName')} label="Reviewer printed name *" error={fe('reviewerName')}>
            <input style={{ ...inputStyle, ...(fe('reviewerName') ? FIELD_ERROR_STYLE : null) }} value={form.reviewerName} onChange={(e) => set('reviewerName', e.target.value)} />
          </Field>
          <Field id={fieldId('reviewerCredentials')} label="Credentials *" error={fe('reviewerCredentials')}>
            <input style={{ ...inputStyle, ...(fe('reviewerCredentials') ? FIELD_ERROR_STYLE : null) }} value={form.reviewerCredentials} onChange={(e) => set('reviewerCredentials', e.target.value)} placeholder="e.g. RN" />
          </Field>
        </div>
        <div id={fieldId('signature')} style={fieldStyle}>
          <span style={labelStyle}>Signature *</span>
          <div style={{ ...sigWrapStyle, ...(fe('signature') ? FIELD_ERROR_STYLE : null) }}>
            <SignatureCanvas ref={sigRef} className="service-plan-sig" onChange={(dataUrl) => set('signature', dataUrl)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={hintStyle}>Signed and dated {formatDateUS(todayAgencyISO())}.</span>
            <button type="button" style={linkBtnStyle} onClick={() => { sigRef.current?.clear(); set('signature', ''); }}>Clear signature</button>
          </div>
          <FieldError message={fe('signature')} />
        </div>
      </section>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <Link href={tabHref} style={secondaryLinkStyle}>Cancel</Link>
        <button type="button" style={{ ...primaryBtnStyle, opacity: submitting ? 0.6 : 1 }} disabled={submitting} onClick={() => void submit()}>{submitting ? 'Saving...' : 'Sign the review'}</button>
      </div>
      <style jsx global>{`.service-plan-sig { width: 100%; height: auto; display: block; touch-action: none; }`}</style>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div style={containerStyle}><div style={wrapStyle}>{children}</div></div>;
}

function Field({ id, label, error, children }: { id?: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div id={id} style={fieldStyle}>
      <span style={labelStyle}>{label}</span>
      {children}
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
const textareaStyle: CSSProperties = { ...inputStyle, height: 'auto', minHeight: 80, resize: 'vertical', lineHeight: 1.5 };
const noticeStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: '#fdeaea', color: '#b3261e', border: '1px solid #f0c8c4', borderRadius: 8, padding: '10px 14px', fontSize: 13.5, fontWeight: 600, marginBottom: 14 };
const diffBoxStyle: CSSProperties = { background: '#fff4e0', color: '#7a4a00', border: '1px solid #f3d9a4', borderRadius: 10, padding: '12px 16px', fontSize: 13.5, marginBottom: 14 };
const okBoxStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: '#e8f4e8', color: '#1e5c1e', border: '1px solid #cfe6cf', borderRadius: 8, padding: '10px 14px', fontSize: 13.5, fontWeight: 600, marginBottom: 14 };
const errorLinkStyle: CSSProperties = { background: 'transparent', border: 'none', padding: 0, color: '#b3261e', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' };
const checkRowStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, color: '#2c3e50', lineHeight: 1.45, cursor: 'pointer' };
const sigWrapStyle: CSSProperties = { border: '1px solid #d0d7de', borderRadius: 8, overflow: 'hidden', background: 'white' };
const linkBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: NAVY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 };
const primaryBtnStyle: CSSProperties = { background: NAVY, color: 'white', border: 'none', padding: '11px 18px', borderRadius: 8, fontSize: 14.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const primaryLinkStyle: CSSProperties = { ...primaryBtnStyle, textDecoration: 'none', display: 'inline-block', fontSize: 13.5, padding: '9px 14px' };
const secondaryLinkStyle: CSSProperties = { display: 'inline-block', background: 'white', color: '#374151', border: '1px solid #d0d7de', padding: '11px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none' };
