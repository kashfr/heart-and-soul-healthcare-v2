'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Clock } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import { MED_FREQUENCIES, PRN_FREQUENCY } from '@/lib/medFrequencies';
import { looksLikeUnknownPhysician, physicianAttributionPending } from '@/lib/marShared';
import type { MarOrder, MarChangeRequestType } from '@/lib/mar';

const ROUTES = ['PO (by mouth)', 'SL (sublingual)', 'Topical', 'Inhalation', 'Subcutaneous', 'IM', 'IV', 'Rectal', 'G-tube', 'J-tube', 'NG tube', 'Ophthalmic', 'Otic', 'Nasal'];
const UNITS = ['mg', 'mcg', 'g', 'mL', 'units', 'mEq', 'tablet(s)', 'capsule(s)', 'puff(s)', 'drop(s)', 'patch(es)', 'spray(s)', '%'];
// PRN is chosen from the Frequency dropdown (the shared PRN_FREQUENCY label
// from medFrequencies) — the single PRN control all three med-entry forms use;
// there is no separate PRN checkbox.

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  patientId: string;
  patientName: string;
  activeOrders: MarOrder[];
  onClose: () => void;
  onSaved: (summary: string) => void;
}

/**
 * Add / change / discontinue a medication straight from the standalone MAR.
 * Unlike the note's MedChangeRequestModal (which stages onto a note and applies
 * at submit), this applies IMMEDIATELY via POST /api/mar/change: the order is
 * live at once and lands in the supervisor's acknowledgment queue. No note, no
 * dose-given shortcut (nurses chart doses by clicking the grid cell).
 */
export default function ManageMedsModal({ patientId, patientName, activeOrders, onClose, onSaved }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [mode, setMode] = useState<MarChangeRequestType>('add');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Stable per-submission id (set on first submit, reused on retry) so a
  // double-click or network retry is de-duped server-side into one order.
  const reqIdRef = useRef('');

  // Med fields (Add and Change; for Change these are the NEW values).
  const [medName, setMedName] = useState('');
  const [dose, setDose] = useState('');
  const [units, setUnits] = useState('');
  const [route, setRoute] = useState('');
  const [frequencyLabel, setFrequencyLabel] = useState('');
  const [times, setTimes] = useState<string[]>(['08:00']);
  const [indication, setIndication] = useState('');
  const [orderingPhysician, setOrderingPhysician] = useState('');
  // Honest escape hatch: the nurse can flag the physician as unknown at entry
  // time instead of typing junk like "N/A"; the RN fills the name in later.
  const [physicianUnknown, setPhysicianUnknown] = useState(false);
  const [notes, setNotes] = useState('');

  const [startDate, setStartDate] = useState(todayISO());
  const [targetOrderId, setTargetOrderId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(todayISO());
  const [reason, setReason] = useState('');

  // PRN is driven by the Frequency selection (single source of truth): selecting
  // "As needed (PRN)" hides the scheduled times and requires an indication.
  const isPRN = frequencyLabel === PRN_FREQUENCY;

  const setTimeAt = (i: number, v: string) => setTimes((t) => t.map((x, idx) => (idx === i ? v : x)));
  const addTime = () => setTimes((t) => [...t, '']);
  const removeTime = (i: number) => setTimes((t) => t.filter((_, idx) => idx !== i));

  // Picking an order to Change prefills the current values so the nurse edits
  // only what changed.
  const pickChangeTarget = (orderId: string) => {
    setTargetOrderId(orderId);
    const o = activeOrders.find((x) => x.id === orderId);
    if (o) {
      setMedName(o.medName || '');
      setDose(o.dose || '');
      setUnits(o.units || '');
      setRoute(o.route || '');
      setFrequencyLabel(o.isPRN ? PRN_FREQUENCY : o.frequencyLabel || '');
      setTimes(o.scheduledTimes && o.scheduledTimes.length > 0 ? [...o.scheduledTimes] : ['08:00']);
      setIndication(o.indication || '');
      setOrderingPhysician(o.orderingPhysician || '');
      setPhysicianUnknown(o.physicianPending === true);
      setNotes(o.notes || '');
    }
  };

  const handleSubmit = async () => {
    setError('');
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }
    if (mode === 'add' || mode === 'change') {
      if (mode === 'change' && !targetOrderId) {
        setError('Choose the medication to change.');
        return;
      }
      if (!medName.trim() || !dose.trim() || !units.trim() || !route.trim()) {
        setError('Medication, dose, units, and route are required.');
        return;
      }
      if (!physicianUnknown && looksLikeUnknownPhysician(orderingPhysician)) {
        setError(
          orderingPhysician.trim()
            ? 'Enter the ordering physician\'s actual name (placeholders like "N/A" don\'t document the order). If you don\'t know it right now, check the box below to flag it for follow-up.'
            : 'Ordering physician is required; this change reflects a physician order. If you don\'t know it right now, check the box below to flag it for follow-up.',
        );
        return;
      }
      if (!isPRN && times.filter(Boolean).length === 0) {
        setError('Add at least one scheduled time, or choose the "As needed (PRN)" frequency.');
        return;
      }
      if (isPRN && !indication.trim()) {
        setError('Add an indication: PRN doses are documented against what the med is for.');
        return;
      }
    } else if (!targetOrderId) {
      setError('Choose the medication to discontinue.');
      return;
    }

    const target = activeOrders.find((o) => o.id === targetOrderId);
    if (!reqIdRef.current) reqIdRef.current = crypto.randomUUID();
    const body: Record<string, unknown> = {
      patientId,
      type: mode,
      reason: reason.trim(),
      today: todayISO(),
      clientRequestId: reqIdRef.current,
    };
    if (mode === 'add' || mode === 'change') {
      body.proposedMed = {
        medName, dose, units, route, frequencyLabel,
        scheduledTimes: times.filter(Boolean),
        isPRN, indication, orderingPhysician,
        physicianPending: physicianUnknown && looksLikeUnknownPhysician(orderingPhysician),
        notes,
        startDate: mode === 'add' ? startDate : effectiveDate,
      };
    }
    if (mode === 'change' || mode === 'discontinue') {
      body.targetOrderId = targetOrderId;
      body.targetMedName = target?.medName || '';
      body.effectiveDate = effectiveDate;
    }

    setSubmitting(true);
    try {
      const res = await authedFetch('/api/mar/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || 'Failed to apply the change. Please try again.');
        setSubmitting(false);
        return;
      }
      const summary =
        mode === 'add'
          ? `Added ${medName.trim()}. It's live on the MAR now; your supervisor will acknowledge it.`
          : mode === 'change'
            ? `Updated ${target?.medName || 'medication'}. The change is live on the MAR.`
            : `Discontinued ${target?.medName || 'medication'}.`;
      onSaved(summary);
      onClose();
    } catch {
      setError('Failed to apply the change. Please try again.');
      setSubmitting(false);
    }
  };

  if (!mounted) return null;

  const showMedFields = mode === 'add' || mode === 'change';

  return createPortal(
    <div style={backdrop} onClick={() => !submitting && onClose()}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={head}>
          <h2 style={{ margin: 0, fontSize: 17, color: '#2c3e50' }}>Manage medications</h2>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="Close">✕</button>
        </div>

        <div style={{ padding: 18 }}>
          <p style={{ marginTop: 0, fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
            Add, change, or discontinue a medication for <strong>{patientName}</strong> per a physician order. It takes
            effect immediately and your supervisor reviews it afterward.
          </p>

          <div style={tabRow}>
            <button type="button" onClick={() => setMode('add')} style={mode === 'add' ? tabActive : tab}>Add</button>
            <button type="button" onClick={() => setMode('change')} style={mode === 'change' ? tabActive : tab}>Change</button>
            <button type="button" onClick={() => setMode('discontinue')} style={mode === 'discontinue' ? tabActive : tab}>Discontinue</button>
          </div>

          <div>
            {(mode === 'change' || mode === 'discontinue') && (
              <Field label={mode === 'change' ? 'Medication to change *' : 'Medication to discontinue *'}>
                <select
                  value={targetOrderId}
                  onChange={(e) => (mode === 'change' ? pickChangeTarget(e.target.value) : setTargetOrderId(e.target.value))}
                  style={select}
                >
                  <option value="">Select a medication…</option>
                  {activeOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.medName} {o.dose}{o.units ? ` ${o.units}` : ''}{o.isPRN ? ' (PRN)' : o.scheduledTimes?.length ? ` (${o.scheduledTimes.join(', ')})` : ''}{physicianAttributionPending(o) ? ' · physician needed' : ''}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {showMedFields && (
              <>
                {mode === 'change' && (
                  <p style={{ fontSize: 12.5, color: '#6b7280', margin: '0 0 10px' }}>
                    Edit the values that changed. The old order is discontinued and a new one starts, so the history
                    stays intact.
                  </p>
                )}
                <Field label="Medication name *">
                  <input type="text" value={medName} onChange={(e) => setMedName(e.target.value)} style={input} placeholder="e.g., Acetaminophen" />
                </Field>
                <div style={grid2}>
                  <Field label="Dose *">
                    <input type="text" value={dose} onChange={(e) => setDose(e.target.value)} style={input} placeholder="e.g., 500" />
                  </Field>
                  <Field label="Units *">
                    <input type="text" list="mm-units" value={units} onChange={(e) => setUnits(e.target.value)} style={input} placeholder="e.g., mg" />
                    <datalist id="mm-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
                  </Field>
                </div>
                <div style={grid2}>
                  <Field label="Route *">
                    <select value={route} onChange={(e) => setRoute(e.target.value)} style={select}>
                      <option value="">Select route…</option>
                      {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </Field>
                  <Field label="Frequency">
                    <select value={frequencyLabel} onChange={(e) => setFrequencyLabel(e.target.value)} style={select}>
                      <option value="">Select frequency…</option>
                      {frequencyLabel && !MED_FREQUENCIES.includes(frequencyLabel as (typeof MED_FREQUENCIES)[number]) && (
                        <option value={frequencyLabel}>{frequencyLabel} (current)</option>
                      )}
                      {MED_FREQUENCIES.map((freq) => <option key={freq} value={freq}>{freq}</option>)}
                    </select>
                  </Field>
                </div>

                {!isPRN && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={fieldLabel}>Scheduled times</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {times.map((t, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Clock size={15} color="#7f8c8d" />
                          <input type="time" value={t} onChange={(e) => setTimeAt(i, e.target.value)} style={{ ...input, maxWidth: 150 }} />
                          {times.length > 1 && (
                            <button type="button" onClick={() => removeTime(i)} style={removeTimeBtn} aria-label="Remove time"><X size={14} /></button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={addTime} style={addTimeBtn}><Plus size={13} /> Add time</button>
                  </div>
                )}

                <Field label={isPRN ? 'Indication (what it’s given for) *' : 'Indication (what it’s for)'}>
                  <input
                    type="text"
                    value={indication}
                    onChange={(e) => setIndication(e.target.value)}
                    style={input}
                    placeholder={isPRN ? 'e.g., Moderate pain (4-6/10)' : 'e.g., Hypertension'}
                  />
                </Field>

                <div style={grid2}>
                  <Field label={mode === 'add' ? 'Start date' : 'Effective date'}>
                    <input
                      type="date"
                      value={mode === 'add' ? startDate : effectiveDate}
                      onChange={(e) => (mode === 'add' ? setStartDate(e.target.value) : setEffectiveDate(e.target.value))}
                      style={input}
                    />
                    <span style={dateHint}>Use the date on the physician&apos;s order; a past date is OK if you&apos;re documenting late.</span>
                  </Field>
                  <Field label="Ordering physician *">
                    <input type="text" value={orderingPhysician} onChange={(e) => setOrderingPhysician(e.target.value)} style={input} placeholder="Dr. ..." />
                  </Field>
                </div>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: -4, marginBottom: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={physicianUnknown}
                    onChange={(e) => setPhysicianUnknown(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <span style={{ fontSize: 12.5, color: '#5c6b7a', lineHeight: 1.4 }}>
                    I don&apos;t know the ordering physician right now. Flag this order for follow-up
                    so it can be updated with the physician&apos;s name.
                  </span>
                </label>

                <Field label="Notes">
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={textarea} placeholder="Special instructions, hold parameters, etc." />
                </Field>
              </>
            )}

            {mode === 'discontinue' && (
              <Field label="Effective date">
                <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} style={input} />
                <span style={dateHint}>Use the date on the physician&apos;s order; a past date is OK if you&apos;re documenting late.</span>
              </Field>
            )}

            <Field label="Reason *">
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} style={textarea}
                placeholder={mode === 'discontinue' ? 'Why is it being discontinued?' : 'Why is this being added/changed? (e.g., new physician order)'} />
            </Field>

            {error && <div style={errorBox}>{error}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} disabled={submitting} style={secondaryBtn}>Cancel</button>
              <button type="button" onClick={handleSubmit} disabled={submitting} style={primaryBtn}>
                {submitting ? 'Saving…' : mode === 'discontinue' ? 'Discontinue' : mode === 'change' ? 'Save change' : 'Add medication'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12, minWidth: 0 }}>
      <span style={fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 };
const modal: CSSProperties = { background: 'white', borderRadius: 10, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' };
const head: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #f1f3f5', position: 'sticky', top: 0, background: 'white' };
const closeBtn: CSSProperties = { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#7f8c8d' };
const tabRow: CSSProperties = { display: 'flex', gap: 8, marginBottom: 16 };
const tab: CSSProperties = { flex: 1, padding: '9px 12px', borderRadius: 6, border: '1px solid #d0d7de', background: 'white', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const tabActive: CSSProperties = { ...tab, background: '#1a3a5c', color: 'white', border: '1px solid #1a3a5c' };
const fieldLabel: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#5c6b7a' };
const dateHint: CSSProperties = { fontSize: 11.5, color: '#8a949e', lineHeight: 1.4, marginTop: 2 };
const input: CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', height: 38 };
const select: CSSProperties = {
  ...input,
  appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', paddingRight: 34, cursor: 'pointer',
  background: "white url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\") no-repeat right 11px center",
  backgroundSize: '13px',
};
const textarea: CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', minHeight: 60, resize: 'vertical', lineHeight: 1.4 };
const grid2: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 };
const removeTimeBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#c44', border: 'none', padding: 4, borderRadius: 4, cursor: 'pointer' };
const addTimeBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, background: 'white', color: '#0e7c4a', border: '1px dashed #0e7c4a', padding: '7px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 8 };
const errorBox: CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b3261e', borderRadius: 6, padding: '8px 12px', fontSize: 13, marginBottom: 10 };
const secondaryBtn: CSSProperties = { background: '#eef1f4', color: '#2c3e50', padding: '10px 14px', borderRadius: 6, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const primaryBtn: CSSProperties = { background: '#27ae60', color: 'white', padding: '10px 16px', borderRadius: 6, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
