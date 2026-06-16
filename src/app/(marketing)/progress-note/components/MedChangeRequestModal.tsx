'use client';

import { useState, type CSSProperties } from 'react';
import { X, Plus, Clock } from 'lucide-react';
import { stageChangeRequest, type MarOrder, type MarDocumenter, type MarChangeRequestType } from '@/lib/mar';
import { setMarAdmin } from './marAdminStore';
import { MED_FREQUENCIES } from '@/lib/medFrequencies';

const ROUTES = ['PO (by mouth)', 'SL (sublingual)', 'Topical', 'Inhalation', 'Subcutaneous', 'IM', 'IV', 'Rectal', 'G-tube', 'J-tube', 'NG tube', 'Ophthalmic', 'Otic', 'Nasal'];
const UNITS = ['mg', 'mcg', 'g', 'mL', 'units', 'mEq', 'tablet(s)', 'capsule(s)', 'puff(s)', 'drop(s)', 'patch(es)', 'spray(s)', '%'];
const ADMIN_BY_OPTIONS = [
  { value: 'nurse', label: 'Nurse (me)' },
  { value: 'family', label: 'Family member' },
  { value: 'responsibleParty', label: 'Responsible party' },
  { value: 'self', label: 'Client (self)' },
  { value: 'proxy', label: 'Proxy' },
];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  patientId: string;
  patientName: string;
  date: string; // date of service, used for a recorded dose
  activeOrders: MarOrder[];
  documenter?: MarDocumenter;
  getNoteId: () => string;
  defaultInitials: string;
  onClose: () => void;
  onStaged: (summary: string) => void;
}

export default function MedChangeRequestModal({
  patientId,
  patientName,
  date,
  activeOrders,
  documenter,
  getNoteId,
  defaultInitials,
  onClose,
  onStaged,
}: Props) {
  const [mode, setMode] = useState<MarChangeRequestType>('add');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Med fields (used by Add and Change; for Change these are the NEW values)
  const [medName, setMedName] = useState('');
  const [dose, setDose] = useState('');
  const [units, setUnits] = useState('');
  const [route, setRoute] = useState('');
  const [frequencyLabel, setFrequencyLabel] = useState('');
  const [isPRN, setIsPRN] = useState(false);
  const [times, setTimes] = useState<string[]>(['08:00']);
  const [orderingPhysician, setOrderingPhysician] = useState('');
  const [notes, setNotes] = useState('');

  // Add-only: start date
  const [startDate, setStartDate] = useState(todayISO());
  // Change/Discontinue: which order, and when it takes effect
  const [targetOrderId, setTargetOrderId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(date || todayISO());

  // Add-only: "I gave a dose this shift"
  const [doseGiven, setDoseGiven] = useState(false);
  const [doseTime, setDoseTime] = useState('');
  const [doseInitials, setDoseInitials] = useState(defaultInitials);
  const [doseByType, setDoseByType] = useState('nurse');
  const [doseByName, setDoseByName] = useState('');

  const [reason, setReason] = useState('');

  const setTimeAt = (i: number, v: string) => setTimes((t) => t.map((x, idx) => (idx === i ? v : x)));
  const addTime = () => setTimes((t) => [...t, '']);
  const removeTime = (i: number) => setTimes((t) => t.filter((_, idx) => idx !== i));

  // When the nurse picks an order to Change, prefill the fields with its
  // current values so she only edits what changed.
  const pickChangeTarget = (orderId: string) => {
    setTargetOrderId(orderId);
    const o = activeOrders.find((x) => x.id === orderId);
    if (o) {
      setMedName(o.medName || '');
      setDose(o.dose || '');
      setUnits(o.units || '');
      setRoute(o.route || '');
      setFrequencyLabel(o.frequencyLabel || '');
      setIsPRN(!!o.isPRN);
      setTimes(o.scheduledTimes && o.scheduledTimes.length > 0 ? [...o.scheduledTimes] : ['08:00']);
      setOrderingPhysician(o.orderingPhysician || '');
      setNotes(o.notes || '');
    }
  };

  const handleSubmit = async () => {
    setError('');
    if (!documenter) {
      setError('You must be signed in.');
      return;
    }
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
      if (!orderingPhysician.trim()) {
        setError('Ordering physician is required; this change reflects a physician order.');
        return;
      }
      if (!isPRN && times.filter(Boolean).length === 0) {
        setError('Add at least one scheduled time, or mark the med PRN.');
        return;
      }
      if (mode === 'add' && doseGiven && doseByType !== 'nurse' && !doseByName.trim()) {
        setError('Enter who administered the dose.');
        return;
      }
    } else {
      if (!targetOrderId) {
        setError('Choose the medication to discontinue.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const proposedMed = {
        medName, dose, units, route, frequencyLabel,
        scheduledTimes: times, isPRN,
        startDate: mode === 'add' ? startDate : effectiveDate,
        orderingPhysician, notes,
      };
      const target = activeOrders.find((o) => o.id === targetOrderId);

      if (mode === 'add') {
        await stageChangeRequest(
          { patientId, patientName, type: 'add', reason, doseRecorded: doseGiven, proposedMed },
          documenter,
          getNoteId(),
        );
        // Stage the dose she gave into the note's MAR marks; it's written as an
        // append-only administration at submit (so it carries the note's date).
        if (doseGiven) {
          const key = `${patientId}|unlisted:${medName}:${doseTime || 'x'}|unscheduled`;
          setMarAdmin(key, {
            patientId,
            orderId: '',
            medName, dose, units, route,
            scheduledTime: 'unscheduled',
            isPRN: false,
            status: 'given',
            administeredByType: doseByType,
            administratorName: doseByName,
            actualTime: doseTime,
            initials: doseInitials,
            reason: '',
          });
        }
        onStaged(`Add ${medName} staged. It applies when you submit the note.`);
      } else if (mode === 'change') {
        await stageChangeRequest(
          {
            patientId, patientName, type: 'change', reason,
            targetOrderId, targetMedName: target?.medName || '',
            effectiveDate, proposedMed,
          },
          documenter,
          getNoteId(),
        );
        onStaged(`Change to ${target?.medName || 'medication'} staged. It applies when you submit the note.`);
      } else {
        await stageChangeRequest(
          {
            patientId, patientName, type: 'discontinue', reason,
            targetOrderId, targetMedName: target?.medName || '', effectiveDate,
          },
          documenter,
          getNoteId(),
        );
        onStaged(`Discontinue ${target?.medName || 'medication'} staged. It applies when you submit the note.`);
      }
      onClose();
    } catch {
      setError('Failed to stage the change. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const showMedFields = mode === 'add' || mode === 'change';

  return (
    <div style={backdrop} onClick={() => !submitting && onClose()}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={head}>
          <h2 style={{ margin: 0, fontSize: 17, color: '#2c3e50' }}>Medication change</h2>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="Close">✕</button>
        </div>

        <div style={{ padding: 18 }}>
          <p style={{ marginTop: 0, fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
            Record a medication change for <strong>{patientName}</strong> per a physician order. It applies when you
            submit the note, and your supervisor reviews it afterward.
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
                      {o.medName} {o.dose}{o.units ? ` ${o.units}` : ''}{o.isPRN ? ' (PRN)' : o.scheduledTimes?.length ? ` (${o.scheduledTimes.join(', ')})` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {showMedFields && (
              <>
                {mode === 'change' && (
                  <p style={{ fontSize: 12.5, color: '#6b7280', margin: '0 0 10px' }}>
                    Edit the values that changed. On submit, the old order is discontinued and a new one starts, so the
                    history stays intact.
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
                    <input type="text" list="cr-units" value={units} onChange={(e) => setUnits(e.target.value)} style={input} placeholder="e.g., mg" />
                    <datalist id="cr-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
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

                <label style={checkRow}>
                  <input type="checkbox" checked={isPRN} onChange={(e) => setIsPRN(e.target.checked)} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#2c3e50' }}>PRN (as needed); no fixed schedule</span>
                </label>

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

                <Field label="Notes">
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={textarea} placeholder="Special instructions, hold parameters, etc." />
                </Field>

                {mode === 'add' && (
                  <>
                    <label style={{ ...checkRow, marginTop: 4 }}>
                      <input type="checkbox" checked={doseGiven} onChange={(e) => setDoseGiven(e.target.checked)} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#2c3e50' }}>I administered a dose during this shift</span>
                    </label>
                    {doseGiven && (
                      <div style={doseBox}>
                        <div style={grid2}>
                          <Field label="Time given">
                            <input type="time" value={doseTime} onChange={(e) => setDoseTime(e.target.value)} style={input} />
                          </Field>
                          <Field label="Initials">
                            <input type="text" value={doseInitials} onChange={(e) => setDoseInitials(e.target.value)} style={input} maxLength={5} />
                          </Field>
                        </div>
                        <div style={grid2}>
                          <Field label="Administered by">
                            <select value={doseByType} onChange={(e) => setDoseByType(e.target.value)} style={select}>
                              {ADMIN_BY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </Field>
                          {doseByType !== 'nurse' && (
                            <Field label="Administrator name">
                              <input type="text" value={doseByName} onChange={(e) => setDoseByName(e.target.value)} style={input} placeholder="e.g., Jane Doe (daughter)" />
                            </Field>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
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
                {submitting ? 'Saving…' : 'Add to note'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
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
const checkRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' };
const doseBox: CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#fafbfc', marginBottom: 12 };
const removeTimeBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#c44', border: 'none', padding: 4, borderRadius: 4, cursor: 'pointer' };
const addTimeBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, background: 'white', color: '#0e7c4a', border: '1px dashed #0e7c4a', padding: '7px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 8 };
const errorBox: CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b3261e', borderRadius: 6, padding: '8px 12px', fontSize: 13, marginBottom: 10 };
const secondaryBtn: CSSProperties = { background: '#eef1f4', color: '#2c3e50', padding: '10px 14px', borderRadius: 6, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const primaryBtn: CSSProperties = { background: '#27ae60', color: 'white', padding: '10px 16px', borderRadius: 6, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
