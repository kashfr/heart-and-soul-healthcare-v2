'use client';

import { useEffect, useState } from 'react';
import { btn, btnPrimary } from '@/components/buttons';
import { UserPlus, X } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import { formatDateUS } from '@/lib/dateFormat';
import { formatUSPhone } from '@/lib/phone';
import { withSelectChevron } from '@/lib/selectChevron';
import { PROGRAMS } from '@/lib/programs';
import type { ConvertPlan } from '@/lib/referralConvertShared';

/**
 * "Create Client Record": shows what the intake answers will become (name,
 * DOB, address, diagnosis, program, physician, Medicaid ID), lets staff fill
 * in a missing DOB or program, and creates the record. Everything filed
 * against the referral moves to the client's Documents.
 */
export default function ConvertReferralModal({
  referralId,
  clientName,
  onClose,
  onCreated,
}: {
  referralId: string;
  clientName: string;
  onClose: () => void;
  onCreated: (r: { patientId: string; mrn: string; documentsMoved: number }) => void;
}) {
  const [plan, setPlan] = useState<ConvertPlan | null>(null);
  const [dob, setDob] = useState('');
  const [program, setProgram] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [existing, setExisting] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    authedFetch(`/api/admin/referrals/${referralId}/convert`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!live) return;
        if (!ok) {
          if (d.patientId) setExisting(String(d.patientId));
          throw new Error(d.error || 'Could not check this referral.');
        }
        const p = d.plan as ConvertPlan;
        setPlan(p);
        setDob(p.dob);
        setProgram(p.program);
        setDiagnosis(p.diagnosis);
      })
      .catch((e) => live && setErr(e instanceof Error ? e.message : 'Could not check this referral.'));
    return () => {
      live = false;
    };
  }, [referralId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !plan) return;
    if (!dob) return setErr('Enter the date of birth. The Clients page requires it.');
    setBusy(true);
    setErr(null);
    try {
      const res = await authedFetch(`/api/admin/referrals/${referralId}/convert`, { method: 'POST', body: JSON.stringify({ dob, program, diagnosis }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      onCreated({ patientId: String(data.patientId), mrn: String(data.mrn || ''), documentsMoved: Number(data.documentsMoved || 0) });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not create the client record.');
    } finally {
      setBusy(false);
    }
  };

  const address = plan ? [plan.street, plan.city, [plan.state, plan.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';

  return (
    <div style={backdrop} onClick={busy ? undefined : onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="convert-title">
        <div style={header}>
          <strong id="convert-title" style={{ fontSize: 16, color: '#1a3a5c' }}>Create Client Record</strong>
          <button onClick={onClose} style={closeBtn} aria-label="Close" disabled={busy}><X size={18} /></button>
        </div>
        <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 20, display: 'grid', gap: 14, overflowY: 'auto' }}>
            {existing ? (
              <p style={lead}>This referral already has a client record. <a href={`/admin/clients/${existing}`} style={{ color: '#1a3a5c', fontWeight: 600 }}>Open it</a>.</p>
            ) : !plan && !err ? (
              <p style={lead}>Reading the referral…</p>
            ) : plan ? (
              <>
                <p style={lead}>
                  Creates {clientName}&apos;s client record from the referral, the same as adding them on the Clients page.
                  The next record number is assigned, the physician and Medicaid ID go on the clinical profile, and any
                  papers filed against the referral move into the client&apos;s Documents. The referral stays on the board
                  as Active, linked to the record.
                </p>
                <div style={grid}>
                  <Row label="Name" value={plan.name} />
                  <Row label="Address" value={address} />
                  <Row label="Physician" value={[plan.clinical.physicianName, plan.clinical.physicianPhone ? formatUSPhone(plan.clinical.physicianPhone) : '', plan.clinical.physicianFax ? `fax ${formatUSPhone(plan.clinical.physicianFax)}` : ''].filter(Boolean).join(' · ')} />
                  <Row label="Medicaid ID" value={plan.clinical.medicaidId} />
                </div>
                <label style={field}>
                  <span style={label}>Date of birth{plan.dob ? ` (from the referral: ${formatDateUS(plan.dob)})` : ''}</span>
                  <input type="date" value={dob} onChange={(e) => { setDob(e.target.value); setErr(null); }} style={{ ...inp, maxWidth: 200 }} />
                  {!plan.dob && <span style={hint}>The referral didn&apos;t include a date of birth. Enter it to create the record.</span>}
                </label>
                <label style={field}>
                  <span style={label}>Program</span>
                  <select value={program} onChange={(e) => setProgram(e.target.value)} style={withSelectChevron({ ...inp, maxWidth: 320 })}>
                    <option value="">Not set yet</option>
                    {PROGRAMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </label>
                <label style={field}>
                  <span style={label}>Diagnosis</span>
                  <input value={diagnosis} maxLength={500} onChange={(e) => setDiagnosis(e.target.value)} style={inp} placeholder="From the referral, or enter it" />
                </label>
                {plan.missing.length > 0 && (
                  <p style={hint}>
                    Not on the referral: {plan.missing.join(', ')}. Anything still blank can be filled in on the client&apos;s record afterward.
                    Staffing level, MAR, and care team are set there too.
                  </p>
                )}
              </>
            ) : null}
            {err && <div role="alert" style={{ color: '#b3261e', fontSize: 13, fontWeight: 600 }}>{err}</div>}
          </div>
          <div style={footer}>
            <button type="button" onClick={onClose} className={btn} disabled={busy}>Cancel</button>
            {plan && !existing && (
              <button type="submit" className={btnPrimary} disabled={busy}>
                <UserPlus size={14} /> {busy ? 'Creating…' : 'Create Client Record'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function Row({ label: l, value }: { label: string; value: string }) {
  return (
    <>
      <div style={rowLabel}>{l}</div>
      <div style={rowValue}>{value || <span style={{ color: '#9ca3af' }}>not on the referral</span>}</div>
    </>
  );
}

const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const modal: React.CSSProperties = { background: 'white', borderRadius: 12, width: '100%', maxWidth: 600, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' };
const header: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' };
const footer: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #e5e7eb' };
const closeBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex' };
const lead: React.CSSProperties = { margin: 0, fontSize: 13, color: '#5c6b7a', lineHeight: 1.5 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 14px', fontSize: 13.5, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px' };
const rowLabel: React.CSSProperties = { color: '#5c6b7a', fontWeight: 600 };
const rowValue: React.CSSProperties = { color: '#1f2937' };
const field: React.CSSProperties = { display: 'grid', gap: 5 };
const label: React.CSSProperties = { fontSize: 12, color: '#5c6b7a', fontWeight: 600 };
const hint: React.CSSProperties = { fontSize: 12, color: '#7f8c8d', lineHeight: 1.45, margin: 0 };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', color: '#111827' };
