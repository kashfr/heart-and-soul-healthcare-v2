'use client';

import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, PhoneCall, Pill, Plus, X } from 'lucide-react';
import { useAuth, useEffectiveUser } from '@/components/AuthProvider';
import SignatureCanvas, { type SignatureCanvasHandle } from '@/components/SignatureCanvas';
import { getPatients, getPatientsForNurse, getPatientClinical, type Patient } from '@/lib/patients';
import { getMarOrders, type MarOrder, type MarChangeRequestType } from '@/lib/mar';
import { withSelectChevron } from '@/lib/selectChevron';
import { formatUSPhone } from '@/lib/phone';
import { postVerbalOrder } from '@/lib/verbalOrders';
import {
  validateVerbalOrderInput,
  VERBAL_ORDER_SPECIALTIES,
  VERBAL_ORDER_TEXT_MAX,
  type VerbalOrderFieldErrors,
  type VerbalOrderType,
} from '@/lib/verbalOrderShared';
import ManageMedsModal from '../../records/[patientId]/mar/ManageMedsModal';

/**
 * Take a verbal order. Mirrors the paper form: client, physician (name, phone,
 * fax, specialty), the order as given, a read-back attestation, and the
 * nurse's signature. A medication order also requires the MAR change it
 * authorizes, applied through the same modal the MAR uses, so the new order
 * is live the moment the nurse hangs up. Submitting faxes the physician the
 * authentication form automatically.
 */
export default function NewVerbalOrderPage() {
  return (
    <Suspense fallback={null}>
      <NewVerbalOrderInner />
    </Suspense>
  );
}

function NewVerbalOrderInner() {
  const { user, profile } = useAuth();
  const { role, credential, isViewingAs } = useEffectiveUser();
  const searchParams = useSearchParams();
  const presetPatient = searchParams.get('patient') || '';
  const isStaff = role === 'admin' || role === 'supervisor';
  const canTake = !isViewingAs && (isStaff || credential === 'RN' || credential === 'LPN');

  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState(presetPatient);
  const [orderType, setOrderType] = useState<VerbalOrderType>('medication');
  const [physicianName, setPhysicianName] = useState('');
  const [physicianPhone, setPhysicianPhone] = useState('');
  const [physicianFax, setPhysicianFax] = useState('');
  const [physicianSpecialty, setPhysicianSpecialty] = useState('');
  const [orderText, setOrderText] = useState('');
  const [readBack, setReadBack] = useState(false);
  const [signature, setSignature] = useState('');
  const sigRef = useRef<SignatureCanvasHandle>(null);

  const [activeOrders, setActiveOrders] = useState<MarOrder[]>([]);
  const [marModalOpen, setMarModalOpen] = useState(false);
  const [marApplied, setMarApplied] = useState<{ changeRequestId: string; type: MarChangeRequestType; medName: string } | null>(null);
  const [marSummary, setMarSummary] = useState('');

  const [errors, setErrors] = useState<VerbalOrderFieldErrors>({});
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState<{ id: string; faxQueued: boolean; faxConfigured: boolean; faxError: string } | null>(null);

  // Roster: staff see everyone, a nurse sees her care team.
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

  const patient = useMemo(() => patients.find((p) => p.id === patientId) || null, [patients, patientId]);

  // Prefill the physician from the client's clinical profile and load active
  // orders for the MAR modal whenever the client changes. A different client
  // also drops any MAR change already applied: it belongs to the other chart.
  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    getPatientClinical(patientId).then((c) => {
      if (cancelled || !c) return;
      setPhysicianName((v) => v || c.physicianName || '');
      setPhysicianPhone((v) => v || c.physicianPhone || '');
    });
    getMarOrders(patientId).then((orders) => {
      if (!cancelled) setActiveOrders(orders.filter((o) => o.status === 'active'));
    });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const currentInput = {
    patientId,
    orderType,
    physicianName,
    physicianPhone,
    physicianFax,
    physicianSpecialty,
    orderText,
    readBackVerified: readBack,
    nurseSignature: signature,
  };

  const submit = async () => {
    const e = validateVerbalOrderInput(currentInput);
    if (orderType === 'medication' && !marApplied) e.orderType = 'A medication order must be entered on the MAR before the verbal order is saved. Use "Enter on MAR" below.';
    setErrors(e);
    setShowErrors(true);
    if (Object.keys(e).length) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const r = await postVerbalOrder({ ...currentInput, mar: marApplied || undefined });
      setDone(r);
    } catch (err) {
      const withFields = err as Error & { fields?: Record<string, string> };
      if (withFields.fields) setErrors(withFields.fields as VerbalOrderFieldErrors);
      setSubmitError(withFields.message || 'The verbal order could not be saved.');
      setSubmitting(false);
    }
  };

  if (!user || !role) return null;
  if (!canTake) {
    return (
      <div style={containerStyle}>
        <div style={wrapStyle}>
          <div style={noticeStyle}>
            <AlertTriangle size={16} /> Only an RN or LPN can take a verbal order. {isViewingAs ? 'View-as sessions are read-only.' : ''}
          </div>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div style={containerStyle}>
        <div style={wrapStyle}>
          <div style={{ ...cardStyle, textAlign: 'center', padding: '32px 24px' }}>
            <CheckCircle2 size={40} color="#27ae60" />
            <h1 style={{ ...titleStyle, fontSize: 24, marginTop: 10 }}>Verbal order saved</h1>
            <p style={{ color: '#5c6b7a', lineHeight: 1.55, maxWidth: 520, margin: '8px auto 0' }}>
              {done.faxQueued
                ? `The authentication form is on its way to ${physicianName} by fax. The office will be told when the signed copy comes back.`
                : done.faxConfigured
                  ? `The order is on file, but the fax to ${physicianName} did not go through${done.faxError ? ` (${done.faxError})` : ''}. The office can resend it from the Verbal orders queue.`
                  : 'The order is on file. Faxing is not set up yet, so the office will download the form from the Verbal orders queue and fax it by hand.'}
            </p>
            {marApplied && (
              <p style={{ color: '#5c6b7a', fontSize: 13.5, marginTop: 8 }}>
                <Pill size={13} style={{ verticalAlign: -2 }} /> {marSummary || `MAR updated: ${marApplied.medName}.`}
              </p>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
              <Link href={`/admin/verbal-orders?vo=${done.id}`} style={primaryLinkStyle}>View in Verbal orders</Link>
              {patientId && <Link href={`/admin/clients/${patientId}`} style={secondaryLinkStyle}>Back to {patient?.name || 'client'}</Link>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const err = (k: keyof VerbalOrderFieldErrors) => (showErrors && errors[k] ? <div style={fieldErrStyle}>{errors[k]}</div> : null);

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <header style={{ marginBottom: 18 }}>
          <p style={kickerStyle}>Physician orders</p>
          <h1 style={titleStyle}><PhoneCall size={22} style={{ verticalAlign: -3, marginRight: 8 }} />Take a verbal order</h1>
          <p style={subtitleStyle}>
            Write the order exactly as the physician gave it, read it back to confirm, and sign. When you save, the
            physician is faxed a copy to sign and return; the office tracks it until the signed copy is on file.
          </p>
        </header>

        {showErrors && Object.keys(errors).length > 0 && (
          <div style={noticeStyle}><AlertTriangle size={16} /> Please complete the highlighted fields.</div>
        )}
        {submitError && <div style={noticeStyle}><AlertTriangle size={16} /> {submitError}</div>}

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Client and order type</h2>
          <div style={rowStyle}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Client *</span>
              <select
                value={patientId}
                onChange={(e) => {
                  // A MAR change already applied belongs to the previous client's chart.
                  setPatientId(e.target.value);
                  setMarApplied(null);
                  setMarSummary('');
                }}
                style={selectStyle}
                disabled={submitting}
              >
                <option value="">Choose a client</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {err('patientId')}
            </label>
            <div style={fieldStyle}>
              <span style={labelStyle}>Type of order *</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['medication', 'other'] as const).map((t) => (
                  <button key={t} type="button" disabled={submitting} onClick={() => setOrderType(t)} style={orderType === t ? chipActiveStyle : chipStyle}>
                    {t === 'medication' ? 'Medication order' : 'Treatment or other order'}
                  </button>
                ))}
              </div>
              {err('orderType')}
            </div>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Physician giving the order</h2>
          <div style={rowStyle}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Physician&apos;s name *</span>
              <input type="text" value={physicianName} onChange={(e) => setPhysicianName(e.target.value)} style={inputStyle} placeholder="Dr. ..." disabled={submitting} />
              {err('physicianName')}
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Area of specialty</span>
              <select value={physicianSpecialty} onChange={(e) => setPhysicianSpecialty(e.target.value)} style={selectStyle} disabled={submitting}>
                <option value="">Choose</option>
                {VERBAL_ORDER_SPECIALTIES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <div style={rowStyle}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Physician&apos;s telephone *</span>
              <input type="tel" value={physicianPhone} onChange={(e) => setPhysicianPhone(formatUSPhone(e.target.value))} style={inputStyle} placeholder="(404) 555-0100" disabled={submitting} />
              {err('physicianPhone')}
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Physician&apos;s fax *</span>
              <input type="tel" value={physicianFax} onChange={(e) => setPhysicianFax(formatUSPhone(e.target.value))} style={inputStyle} placeholder="(404) 555-0101" disabled={submitting} />
              <span style={hintStyle}>The authentication form is faxed here for signature.</span>
              {err('physicianFax')}
            </label>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>The order</h2>
          <label style={fieldStyle}>
            <span style={labelStyle}>Describe the order exactly as given *</span>
            <textarea value={orderText} onChange={(e) => setOrderText(e.target.value)} rows={5} maxLength={VERBAL_ORDER_TEXT_MAX} style={textareaStyle} placeholder="Medication, dose, route, frequency, start, and any instructions, in the physician's words." disabled={submitting} />
            {err('orderText')}
          </label>

          {orderType === 'medication' && (
            <div style={marBoxStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#1a3a5c', fontSize: 14 }}><Pill size={14} style={{ verticalAlign: -2 }} /> Enter on the MAR</div>
                  <div style={{ fontSize: 12.5, color: '#5c6b7a', lineHeight: 1.45, marginTop: 2 }}>
                    Add, change, or discontinue the medication on the MAR now, the same way you would from the grid. The MAR
                    order is marked &ldquo;verbal, awaiting signature&rdquo; until the physician&apos;s signed copy comes back.
                  </div>
                </div>
                <button type="button" style={secondaryBtnStyle} disabled={!patientId || submitting || !!marApplied} onClick={() => setMarModalOpen(true)}>
                  <Plus size={14} /> {marApplied ? 'Entered' : 'Enter on MAR'}
                </button>
              </div>
              {marApplied && (
                <div style={marDoneStyle}>
                  <CheckCircle2 size={14} /> {marSummary || `${marApplied.type} applied: ${marApplied.medName}`}
                </div>
              )}
              {!patientId && <div style={hintStyle}>Choose the client first.</div>}
            </div>
          )}

          <label style={{ ...checkRowStyle, marginTop: 14 }}>
            <input type="checkbox" checked={readBack} onChange={(e) => setReadBack(e.target.checked)} disabled={submitting} />
            <span><strong>I read this order back to the physician and verified it.</strong> Required before signing.</span>
          </label>
          {err('readBackVerified')}
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Nurse&apos;s signature</h2>
          <div style={{ fontSize: 13, color: '#5c6b7a', marginBottom: 8 }}>
            Signing as <strong>{profile?.displayName || user.email}</strong>{credential ? `, ${credential}` : ''}. Name, credential, date, and time are recorded automatically.
          </div>
          <div style={sigWrapStyle}>
            <SignatureCanvas ref={sigRef} onChange={setSignature} width={700} height={200} className="verbal-order-sig" disabled={submitting} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <span style={hintStyle}>Sign with your finger or mouse.</span>
            <button type="button" style={linkBtnStyle} onClick={() => sigRef.current?.clear()} disabled={submitting}><X size={12} /> Clear</button>
          </div>
          {err('nurseSignature')}
        </section>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <Link href={patientId ? `/admin/clients/${patientId}` : '/admin'} style={secondaryLinkStyle}>Cancel</Link>
          <button type="button" style={{ ...primaryBtnStyle, opacity: submitting ? 0.6 : 1 }} disabled={submitting} onClick={() => void submit()}>
            {submitting ? 'Saving and faxing…' : 'Save and fax to physician'}
          </button>
        </div>
      </div>

      {marModalOpen && patientId && (
        <ManageMedsModal
          patientId={patientId}
          patientName={patient?.name || ''}
          activeOrders={activeOrders}
          orderIdsWithDoses={new Set()}
          onClose={() => setMarModalOpen(false)}
          onSaved={(summary) => setMarSummary(summary)}
          verbalOrder={{
            physicianName,
            onApplied: (r) => {
              setMarApplied(r);
              // Refresh the active list so a second look at the modal is current.
              getMarOrders(patientId).then((orders) => setActiveOrders(orders.filter((o) => o.status === 'active')));
            },
          }}
        />
      )}
      <style jsx global>{`
        .verbal-order-sig { width: 100%; height: auto; display: block; touch-action: none; }
      `}</style>
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
const textareaStyle: CSSProperties = { ...inputStyle, height: 'auto', minHeight: 120, resize: 'vertical', lineHeight: 1.5 };
const fieldErrStyle: CSSProperties = { fontSize: 12.5, color: '#b3261e', fontWeight: 600 };
const noticeStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: '#fdeaea', color: '#b3261e', border: '1px solid #f0c8c4', borderRadius: 8, padding: '10px 14px', fontSize: 13.5, fontWeight: 600, marginBottom: 14 };
const chipStyle: CSSProperties = { background: '#f1f5f9', color: '#475569', borderWidth: 1, borderStyle: 'solid', borderColor: '#e2e8f0', padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const chipActiveStyle: CSSProperties = { ...chipStyle, background: '#e8eef4', color: NAVY, borderColor: NAVY };
const marBoxStyle: CSSProperties = { background: '#f6f9fc', border: '1px solid #dbe3ec', borderRadius: 10, padding: '12px 14px', marginTop: 4 };
const marDoneStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, color: '#1e7a44', fontSize: 13, fontWeight: 600 };
const checkRowStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13.5, color: '#2c3e50', lineHeight: 1.45, cursor: 'pointer' };
const sigWrapStyle: CSSProperties = { border: '1px solid #d0d7de', borderRadius: 8, overflow: 'hidden', background: 'white' };
const linkBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: '#5c6b7a', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const primaryBtnStyle: CSSProperties = { background: NAVY, color: 'white', border: 'none', padding: '11px 18px', borderRadius: 8, fontSize: 14.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const secondaryBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', color: NAVY, border: `1px solid ${NAVY}`, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const primaryLinkStyle: CSSProperties = { ...primaryBtnStyle, textDecoration: 'none', display: 'inline-block' };
const secondaryLinkStyle: CSSProperties = { display: 'inline-block', background: 'white', color: '#374151', border: '1px solid #d0d7de', padding: '11px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none' };
