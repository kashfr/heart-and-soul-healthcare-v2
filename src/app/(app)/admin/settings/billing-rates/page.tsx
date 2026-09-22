'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowLeft, DollarSign, Pencil, Plus, Trash2 } from 'lucide-react';
import { AuthGuard } from '@/components/AuthGuard';
import { useAuth } from '@/components/AuthProvider';
import { withSelectChevron } from '@/lib/selectChevron';
import { PROGRAMS, getProgram } from '@/lib/programs';
import { formatDateUS } from '@/lib/dateFormat';
import { bucketLabel, fmtDollars, type HoursBucket } from '@/lib/shiftHours';
import { RATE_CREDENTIALS } from '@/lib/billingRatesShared';
import {
  addBillingRate,
  deleteBillingRate,
  getBillingRates,
  updateBillingRate,
  type BillingRate,
  type BillingRateInput,
} from '@/lib/billingRates';

const NAVY = '#1a3a5c';

/**
 * Owner-only billing rate table: what each payer program pays per 15-minute
 * unit for shift nursing and RN oversight, with the claim code + modifier and
 * an effective window. A rate change is a NEW row with a new effective date
 * (end the old one), so past months keep pricing at the rate that applied.
 * Read by the $ views on the Shift Notes list and every client's Hours tab.
 */
export default function BillingRatesPage() {
  return (
    <AuthGuard allow={['admin']}>
      <BillingRatesInner />
    </AuthGuard>
  );
}

function BillingRatesInner() {
  const { user } = useAuth();
  const [rates, setRates] = useState<BillingRate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BillingRate | 'new' | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const reload = async () => {
    try {
      const list = await getBillingRates();
      setRates(list);
    } catch (err) {
      console.error('Billing rates load failed:', err);
      setError('Could not load the billing rates.');
    }
  };
  useEffect(() => {
    let cancelled = false;
    getBillingRates()
      .then((list) => { if (!cancelled) setRates(list); })
      .catch((err) => { console.error('Billing rates load failed:', err); if (!cancelled) setError('Could not load the billing rates.'); });
    return () => { cancelled = true; };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const remove = async (r: BillingRate) => {
    if (!r.id) return;
    if (!window.confirm(`Delete the ${getProgram(r.program)?.label || r.program} ${bucketLabel(r.bucket).toLowerCase()} rate of ${fmtDollars(r.ratePerUnit)} per unit (from ${formatDateUS(r.effectiveFrom)})?\n\nDollar views for those dates will show "—" until another row covers them. To change a rate going forward, end this row and add a new one instead.`)) return;
    try {
      await deleteBillingRate(r.id);
      showToast('Rate deleted.');
      await reload();
    } catch (err) {
      console.error('Delete rate failed:', err);
      setError('Could not delete the rate.');
    }
  };

  const grouped = useMemo(() => {
    const m = new Map<string, BillingRate[]>();
    for (const r of rates || []) {
      const list = m.get(r.program) ?? [];
      list.push(r);
      m.set(r.program, list);
    }
    return m;
  }, [rates]);

  const todayISO = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  return (
    <div style={pageStyle}>
      <Link href="/admin/settings" style={backLinkStyle}>
        <ArrowLeft size={14} /> Back to Settings
      </Link>
      <div style={headerStyle}>
        <div>
          <h1 style={titleStyle}><DollarSign size={20} /> Billing rates</h1>
          <p style={subStyle}>
            Dollars per 15-minute unit by program, for shift nursing (LPN / HHA / CNA shift notes) and RN oversight visits,
            with the claim code and modifier. Limit a row to a nurse type when the payer pays LPN and RN shifts differently
            (GAPP): the note author&apos;s credential picks the matching row, and a row for &quot;any nurse&quot; is the fallback.
            When a rate changes, end the current row and add a new one with the new effective date so earlier months keep
            pricing at the rate that applied. These feed the $ views on the Shift
            Notes list and each client&apos;s Hours tab. Only you can see this.
          </p>
        </div>
        {editing === null && (
          <button type="button" onClick={() => setEditing('new')} style={primaryBtn}><Plus size={14} /> Add rate</button>
        )}
      </div>

      {error && <div style={errBox}>{error}</div>}
      {toast && <div style={toastStyle} role="status">{toast}</div>}

      {editing !== null && user && (
        <RateForm
          existing={editing === 'new' ? null : editing}
          uid={user.uid}
          onCancel={() => setEditing(null)}
          onSaved={async (msg) => { setEditing(null); showToast(msg); await reload(); }}
        />
      )}

      {rates === null && !error && <div style={muted}>Loading…</div>}
      {rates && rates.length === 0 && (
        <div style={emptyStyle}>No rates yet. Add the NOW/COMP LPN and RN rates from the Therap lines, then each GAPP rate from the fee schedule.</div>
      )}

      {PROGRAMS.filter((p) => grouped.has(p.id)).map((p) => (
        <section key={p.id} style={card}>
          <div style={{ ...cardTitle, color: p.fg }}>
            <span style={{ ...programChip, background: p.bg, color: p.fg, border: `1px solid ${p.border}` }}>{p.label}</span>
            <span style={{ fontWeight: 500, color: '#5c6b7a', fontSize: 13 }}>{p.full}</span>
          </div>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Covers</th>
                <th style={th}>Nurse type</th>
                <th style={th}>Code</th>
                <th style={th}>Modifier</th>
                <th style={th}>Description</th>
                <th style={{ ...th, textAlign: 'right' }}>Rate / unit</th>
                <th style={{ ...th, textAlign: 'right' }}>Per hour</th>
                <th style={th}>Effective</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(grouped.get(p.id) || []).map((r) => {
                const active = r.effectiveFrom <= todayISO && (!r.effectiveTo || r.effectiveTo >= todayISO);
                const future = r.effectiveFrom > todayISO;
                return (
                  <tr key={r.id} style={active ? undefined : { opacity: 0.6 }}>
                    <td style={td}><span style={r.bucket === 'oversight' ? rnChip : shiftChip}>{bucketLabel(r.bucket)}</span></td>
                    <td style={td}>{r.credential ? <span style={credChip}>{r.credential}</span> : <span style={{ color: '#7f8c8d' }}>Any</span>}</td>
                    <td style={{ ...td, fontFamily: 'ui-monospace, monospace' }}>{r.serviceCode || '—'}</td>
                    <td style={{ ...td, fontFamily: 'ui-monospace, monospace' }}>{r.modifier || '—'}</td>
                    <td style={td}>{r.description || '—'}{r.note ? <div style={{ fontSize: 11.5, color: '#7f8c8d' }}>{r.note}</div> : null}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#166534', fontVariantNumeric: 'tabular-nums' }}>{fmtDollars(r.ratePerUnit)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#5c6b7a', fontVariantNumeric: 'tabular-nums' }}>{fmtDollars(r.ratePerUnit * 4)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{formatDateUS(r.effectiveFrom)} to {r.effectiveTo ? formatDateUS(r.effectiveTo) : 'open'}</td>
                    <td style={td}><span style={active ? okBadge : future ? futureBadge : endedBadge}>{active ? 'Active' : future ? 'Upcoming' : 'Ended'}</span></td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={() => setEditing(r)} style={iconBtn} aria-label="Edit rate"><Pencil size={14} /></button>
                      <button type="button" onClick={() => remove(r)} style={{ ...iconBtn, color: '#b3261e', marginLeft: 6 }} aria-label="Delete rate"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function RateForm({ existing, uid, onCancel, onSaved }: {
  existing: BillingRate | null;
  uid: string;
  onCancel: () => void;
  onSaved: (msg: string) => Promise<void>;
}) {
  const [program, setProgram] = useState(existing?.program ?? '');
  const [bucket, setBucket] = useState<HoursBucket>(existing?.bucket ?? 'shift');
  const [credential, setCredential] = useState(existing?.credential ?? '');
  const [serviceCode, setServiceCode] = useState(existing?.serviceCode ?? '');
  const [modifier, setModifier] = useState(existing?.modifier ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [rate, setRate] = useState(existing ? String(existing.ratePerUnit) : '');
  const [from, setFrom] = useState(existing?.effectiveFrom ?? '');
  const [to, setTo] = useState(existing?.effectiveTo ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<'program' | 'rate' | 'from' | 'to' | null>(null);

  const rateNum = Number(rate);
  const submit = async () => {
    setErr(null);
    if (!program) { setFieldErr('program'); setErr('Choose the program.'); return; }
    if (rate.trim() === '' || !Number.isFinite(rateNum) || rateNum < 0 || rateNum > 1000) { setFieldErr('rate'); setErr('Enter the rate per 15-minute unit in dollars.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) { setFieldErr('from'); setErr('Enter the effective date.'); return; }
    if (to && (!/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from)) { setFieldErr('to'); setErr('The end date must be on or after the effective date (or blank for open-ended).'); return; }
    setFieldErr(null);
    const input: BillingRateInput = {
      program,
      bucket,
      credential,
      serviceCode: serviceCode.trim(),
      modifier: modifier.trim(),
      description: description.trim(),
      ratePerUnit: Math.round(rateNum * 100) / 100,
      effectiveFrom: from,
      effectiveTo: to,
      note: note.trim(),
    };
    setSaving(true);
    try {
      if (existing?.id) await updateBillingRate(existing.id, input, uid);
      else await addBillingRate(input, uid);
      await onSaved(existing ? 'Rate updated.' : 'Rate added.');
    } catch (e) {
      console.error('Save rate failed:', e);
      setErr('Could not save the rate. Please try again.');
      setSaving(false);
    }
  };
  const es = (k: typeof fieldErr): CSSProperties | undefined => (fieldErr === k ? { borderColor: '#b3261e', boxShadow: '0 0 0 2px rgba(179,38,30,0.15)' } : undefined);

  return (
    <div style={formCard}>
      <div style={{ fontWeight: 700, color: NAVY, marginBottom: 10 }}>{existing ? 'Edit rate' : 'New rate'}</div>
      <div style={grid}>
        <label style={field}>
          <span style={label}>Program *</span>
          <select value={program} onChange={(e) => setProgram(e.target.value)} style={{ ...select, ...es('program') }}>
            <option value="">Select…</option>
            {PROGRAMS.map((p) => (
              <option key={p.id} value={p.id}>{p.label} — {p.full}</option>
            ))}
          </select>
        </label>
        <label style={field}>
          <span style={label}>Covers *</span>
          <select value={bucket} onChange={(e) => setBucket(e.target.value as HoursBucket)} style={select}>
            <option value="shift">Shift hours (LPN / HHA / CNA shift notes)</option>
            <option value="oversight">RN oversight visits</option>
          </select>
        </label>
        <label style={field}>
          <span style={label} title="Limit this rate to notes written by this nurse type. Leave on Any when the payer pays the same regardless.">Nurse type</span>
          <select value={credential} onChange={(e) => setCredential(e.target.value)} style={select}>
            {RATE_CREDENTIALS.map((c) => (
              <option key={c || 'any'} value={c}>{c || 'Any nurse'}</option>
            ))}
          </select>
        </label>
        <label style={field}>
          <span style={label}>Procedure code</span>
          <input value={serviceCode} onChange={(e) => setServiceCode(e.target.value)} style={input} placeholder="T1003" />
        </label>
        <label style={field}>
          <span style={label}>Modifier</span>
          <input value={modifier} onChange={(e) => setModifier(e.target.value)} style={input} placeholder="U1" />
        </label>
        <label style={field}>
          <span style={label}>Rate per 15-minute unit ($) *</span>
          <input type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} style={{ ...input, ...es('rate') }} placeholder="24.36" />
        </label>
        <label style={field}>
          <span style={label}>Effective from *</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...input, ...es('from') }} />
        </label>
        <label style={field}>
          <span style={label}>Effective to (blank = open)</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} style={{ ...input, ...es('to') }} />
        </label>
        <label style={{ ...field, gridColumn: '1 / -1' }}>
          <span style={label}>Description</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} style={input} placeholder="Nursing Services - LPN" />
        </label>
        <label style={{ ...field, gridColumn: '1 / -1' }}>
          <span style={label}>Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} style={input} placeholder="Source: Therap service authorization, 07/16/2026" />
        </label>
      </div>
      {rate && Number.isFinite(rateNum) && <div style={{ ...muted, marginTop: 6 }}>{fmtDollars(rateNum)} per unit = {fmtDollars(rateNum * 4)} per hour.</div>}
      {err && <div style={{ ...errBox, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" onClick={submit} disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : existing ? 'Save changes' : 'Add rate'}</button>
        <button type="button" onClick={onCancel} disabled={saving} style={smallBtn}>Cancel</button>
      </div>
    </div>
  );
}

const pageStyle: CSSProperties = { maxWidth: 1100, margin: '0 auto', padding: '24px 20px 60px' };
const backLinkStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, color: NAVY, fontSize: 13, fontWeight: 600, textDecoration: 'none', marginBottom: 12 };
const headerStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 };
const titleStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 22, color: '#2c3e50', margin: 0 };
const subStyle: CSSProperties = { fontSize: 13, color: '#7f8c8d', margin: '6px 0 0', lineHeight: 1.5, maxWidth: 760 };
const muted: CSSProperties = { fontSize: 13, color: '#5c6b7a', lineHeight: 1.45 };
const errBox: CSSProperties = { background: '#fdeaea', color: '#b3261e', borderRadius: 6, padding: '8px 11px', fontSize: 13, marginBottom: 12 };
const toastStyle: CSSProperties = { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1f2937', color: 'white', padding: '10px 18px', borderRadius: 8, fontSize: 13.5, zIndex: 4000 };
const emptyStyle: CSSProperties = { padding: '20px 14px', color: '#7f8c8d', fontSize: 13, textAlign: 'center', background: '#f8fafc', borderRadius: 8, lineHeight: 1.5 };
const card: CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 18, marginBottom: 14 };
const cardTitle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 700, marginBottom: 12 };
const programChip: CSSProperties = { display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 700 };
const table: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const th: CSSProperties = { textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #e5e7eb', color: '#5c6b7a', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' };
const td: CSSProperties = { padding: '8px 8px', borderBottom: '1px solid #eef1f4', verticalAlign: 'top' };
const badgeBase: CSSProperties = { display: 'inline-block', padding: '1px 7px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 };
const okBadge: CSSProperties = { ...badgeBase, background: '#e9f6f2', color: '#14544a', border: '1px solid #b9e3d8' };
const futureBadge: CSSProperties = { ...badgeBase, background: '#eef4fb', color: NAVY, border: '1px solid #c8def5' };
const endedBadge: CSSProperties = { ...badgeBase, background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' };
const rnChip: CSSProperties = { ...badgeBase, background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe' };
const shiftChip: CSSProperties = { ...badgeBase, background: '#e9f6f2', color: '#14544a', border: '1px solid #b9e3d8' };
const credChip: CSSProperties = { ...badgeBase, background: '#eef4fb', color: NAVY, border: '1px solid #c8def5' };
const iconBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'white', border: '1px solid #d0d7de', borderRadius: 6, padding: 6, cursor: 'pointer', color: NAVY };
const smallBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #d0d7de', borderRadius: 6, padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: NAVY, fontFamily: 'inherit' };
const primaryBtn: CSSProperties = { ...smallBtn, background: NAVY, color: 'white', border: `1px solid ${NAVY}` };
const formCard: CSSProperties = { border: '1px solid #c8def5', background: '#f8fbff', borderRadius: 10, padding: 14, marginBottom: 14 };
const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 };
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 };
const label: CSSProperties = { fontSize: 11.5, fontWeight: 700, color: '#5c6b7a', textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' };
const input: CSSProperties = { padding: '7px 10px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', color: '#2c3e50', background: 'white', width: '100%', boxSizing: 'border-box' };
const select: CSSProperties = withSelectChevron(input);
