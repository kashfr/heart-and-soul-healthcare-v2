'use client';

import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle, FileSignature, ShieldCheck } from 'lucide-react';
import SignatureCanvas, { type SignatureCanvasHandle } from '@/components/SignatureCanvas';
import { escortToField, FieldError, FIELD_ERROR_STYLE, FIELD_ERROR_WRAP_STYLE, firstErrorKey } from '@/lib/formEscort';

/**
 * Public physician e-sign page. Reached only by the one-time link and QR code
 * printed on the faxed authentication form. Shows the order as taken, and
 * captures the physician's printed name and signature. Signing here closes
 * the order the same way a returned fax does, so nothing needs faxing back.
 */
type SignField = 'printedName' | 'signature' | 'attest';
type SignFieldErrors = Partial<Record<SignField, string>>;
// Display order on the page, so the escort lands on the topmost problem.
const FIELD_ORDER: SignField[] = ['printedName', 'signature', 'attest'];
const fieldId = (k: SignField) => `vo-field-${k}`;

interface OrderView {
  patientName: string;
  patientDob: string;
  takenDate: string;
  nurseName: string;
  nurseCredential: string;
  physicianName: string;
  physicianSpecialty: string;
  orderType: string;
  orderText: string;
  signedDate: string;
}

export default function PhysicianVerbalOrderPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const token = useSearchParams().get('t') || '';
  const [state, setState] = useState<'loading' | 'invalid' | 'used' | 'cancelled' | 'ready' | 'done'>('loading');
  const [order, setOrder] = useState<OrderView | null>(null);
  const [printedName, setPrintedName] = useState('');
  const [attest, setAttest] = useState(false);
  const [signature, setSignature] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<SignFieldErrors>({});
  const sigRef = useRef<SignatureCanvasHandle>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/forms/verbal-order-sign?t=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = (await r.json().catch(() => null)) as { used?: boolean; cancelled?: boolean; order?: OrderView } | null;
        if (cancelled) return;
        if (!r.ok || !data?.order) {
          setState('invalid');
          return;
        }
        setOrder(data.order);
        setPrintedName(data.order.physicianName);
        setState(data.used ? 'used' : data.cancelled ? 'cancelled' : 'ready');
      })
      .catch(() => {
        if (!cancelled) setState('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const clearFieldError = (k: SignField) =>
    setFieldErrors((prev) => (prev[k] ? { ...prev, [k]: undefined } : prev));

  const submit = async () => {
    setError('');
    const errs: SignFieldErrors = {};
    if (!printedName.trim()) errs.printedName = 'Please type your name as it should appear on the order.';
    if (!signature) errs.signature = 'Please sign in the box.';
    if (!attest) errs.attest = 'Please confirm that you reviewed the order.';
    setFieldErrors(errs);
    const first = firstErrorKey(FIELD_ORDER, errs);
    if (first) {
      escortToField(fieldId(first));
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch('/api/forms/verbal-order-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: token, physicianPrintedName: printedName, signature, attest, website: honeypot }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setError(data.error || 'We could not record your signature. Please fax the signed form instead.');
        setSubmitting(false);
        return;
      }
      setState('done');
    } catch {
      setError('We could not reach the server. Please try again or fax the signed form.');
      setSubmitting(false);
    }
  };

  return (
    <main style={pageStyle}>
      <div style={wrapStyle}>
        <div style={brandStyle}>Heart and Soul Healthcare, LLC</div>
        <h1 style={titleStyle}><FileSignature size={22} style={{ verticalAlign: -4, marginRight: 8 }} />Verbal order authentication</h1>

        {state === 'loading' && <p style={mutedStyle}>Loading the order…</p>}
        {state === 'invalid' && (
          <div style={noticeStyle}><AlertCircle size={18} /> This signing link is not valid. Please sign the faxed form and return it to Heart and Soul Healthcare, or call (678) 644-0337.</div>
        )}
        {state === 'cancelled' && (
          <div style={noticeStyle}><AlertCircle size={18} /> Heart and Soul Healthcare cancelled this order. No signature is needed, and the faxed form can be discarded. Questions: call (678) 644-0337.</div>
        )}
        {(state === 'used' || state === 'done') && order && (
          <div style={{ ...noticeStyle, background: '#e6f6ec', color: '#1e7a44', borderColor: '#bfe3cc' }}>
            <CheckCircle size={18} /> {state === 'done' ? 'Thank you. Your signature has been recorded and the order is on file. Nothing needs to be faxed back.' : `This order was already signed${order.signedDate ? ` on ${order.signedDate}` : ''}. Nothing further is needed.`}
          </div>
        )}

        {order && state === 'ready' && (
          <section style={cardStyle}>
            <div style={gridStyle}>
              <Cell label="Client" value={order.patientName} />
              <Cell label="Date of birth" value={order.patientDob} />
              <Cell label="Order taken" value={order.takenDate} />
              <Cell label="Taken by" value={`${order.nurseName}${order.nurseCredential ? `, ${order.nurseCredential}` : ''}`} />
              <Cell label="Physician" value={order.physicianName} />
              <Cell label="Type" value={order.orderType === 'medication' ? 'Medication order' : 'Treatment or care order'} />
            </div>
            <div style={labelStyle}>The order as read back to you</div>
            <div style={orderBoxStyle}>{order.orderText}</div>
          </section>
        )}

        {state === 'ready' && (
          <section style={cardStyle}>
            <h2 style={h2Style}>Sign</h2>
            {error && <div style={{ ...noticeStyle, marginBottom: 12 }}><AlertCircle size={16} /> {error}</div>}
            <label style={fieldStyle} id={fieldId('printedName')}>
              <span style={labelStyle}>Your printed name</span>
              <input
                type="text"
                value={printedName}
                onChange={(e) => {
                  setPrintedName(e.target.value);
                  clearFieldError('printedName');
                }}
                style={{ ...inputStyle, ...(fieldErrors.printedName ? FIELD_ERROR_STYLE : {}) }}
                disabled={submitting}
                autoComplete="name"
                aria-invalid={!!fieldErrors.printedName}
              />
              <FieldError message={fieldErrors.printedName} />
            </label>
            <input type="text" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
            <div style={labelStyle}>Signature</div>
            <div id={fieldId('signature')} style={{ ...sigWrapStyle, ...(fieldErrors.signature ? FIELD_ERROR_STYLE : {}) }}>
              <SignatureCanvas
                ref={sigRef}
                onChange={(dataUrl) => {
                  setSignature(dataUrl);
                  if (dataUrl) clearFieldError('signature');
                }}
                width={700}
                height={200}
                className="physician-sig"
                disabled={submitting}
              />
            </div>
            <FieldError message={fieldErrors.signature} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" style={linkBtnStyle} onClick={() => sigRef.current?.clear()} disabled={submitting}>Clear</button>
            </div>
            <div id={fieldId('attest')} style={{ margin: '8px 0 16px', ...(fieldErrors.attest ? FIELD_ERROR_WRAP_STYLE : {}) }}>
              <label style={{ ...checkRowStyle, margin: 0 }}>
                <input
                  type="checkbox"
                  checked={attest}
                  onChange={(e) => {
                    setAttest(e.target.checked);
                    if (e.target.checked) clearFieldError('attest');
                  }}
                  disabled={submitting}
                  aria-invalid={!!fieldErrors.attest}
                />
                <span>I have reviewed the order above and confirm it is the order I gave by telephone. My electronic signature has the same effect as a handwritten signature.</span>
              </label>
              <FieldError message={fieldErrors.attest} />
            </div>
            <button type="button" style={{ ...primaryBtnStyle, opacity: submitting ? 0.6 : 1 }} disabled={submitting} onClick={() => void submit()}>
              {submitting ? 'Recording…' : 'Sign and return'}
            </button>
            <p style={{ ...mutedStyle, marginTop: 12 }}><ShieldCheck size={13} style={{ verticalAlign: -2 }} /> This page is private to this order. Questions: (678) 644-0337.</p>
          </section>
        )}
      </div>
      <style jsx global>{`
        .physician-sig { width: 100%; height: auto; display: block; touch-action: none; }
      `}</style>
    </main>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={cellLabelStyle}>{label}</div>
      <div style={cellValueStyle}>{value || '-'}</div>
    </div>
  );
}

const pageStyle: CSSProperties = { background: '#f5f7fa', minHeight: '70vh', padding: '28px 16px 48px' };
const wrapStyle: CSSProperties = { maxWidth: 680, margin: '0 auto' };
const brandStyle: CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#DE5B4A' };
const titleStyle: CSSProperties = { fontSize: 26, color: '#1f2937', margin: '4px 0 16px' };
const h2Style: CSSProperties = { fontSize: 16, color: '#1a3a5c', margin: '0 0 10px' };
const cardStyle: CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px', marginBottom: 14 };
const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 };
const cellLabelStyle: CSSProperties = { fontSize: 10.5, fontWeight: 700, color: '#8a949e', textTransform: 'uppercase', letterSpacing: 0.4 };
const cellValueStyle: CSSProperties = { fontSize: 14, color: '#1f2937', fontWeight: 600 };
const labelStyle: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: '#5c6b7a', marginBottom: 4 };
const orderBoxStyle: CSSProperties = { background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px', fontSize: 15, lineHeight: 1.55, whiteSpace: 'pre-wrap', color: '#1f2937' };
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 };
const inputStyle: CSSProperties = { width: '100%', padding: '11px 12px', border: '1px solid #d0d7de', borderRadius: 8, fontSize: 16, fontFamily: 'inherit', boxSizing: 'border-box' };
const sigWrapStyle: CSSProperties = { border: '1px solid #d0d7de', borderRadius: 8, overflow: 'hidden', background: 'white' };
const linkBtnStyle: CSSProperties = { background: 'transparent', border: 'none', color: '#5c6b7a', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '6px 0' };
const checkRowStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: '#2c3e50', lineHeight: 1.5, margin: '8px 0 16px', cursor: 'pointer' };
const primaryBtnStyle: CSSProperties = { width: '100%', background: '#1a3a5c', color: 'white', border: 'none', padding: '14px 18px', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const noticeStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fdeaea', color: '#b3261e', border: '1px solid #f0c8c4', borderRadius: 10, padding: '12px 14px', fontSize: 14.5, lineHeight: 1.5, marginBottom: 14 };
const mutedStyle: CSSProperties = { fontSize: 13, color: '#7f8c8d', lineHeight: 1.5 };
