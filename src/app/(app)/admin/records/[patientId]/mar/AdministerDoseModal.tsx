'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { writeMarAdministrations, type MarOrder } from '@/lib/mar';

const ADMIN_BY_OPTIONS = [
  { value: 'nurse', label: 'Nurse (me)' },
  { value: 'family', label: 'Family member' },
  { value: 'responsibleParty', label: 'Responsible party' },
  { value: 'self', label: 'Client (self)' },
  { value: 'proxy', label: 'Proxy' },
];

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function prettyDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  patientId: string;
  order: MarOrder;
  slot: string; // 'HH:MM' or 'PRN'
  dateISO: string; // the day being charted
  todayISO: string; // for the late-entry notice
  documenter: { uid: string; name: string; credential: string };
  defaultInitials: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Standalone "document this dose" form, opened by clicking an open cell on the
 * nurse MAR grid. Writes a single append-only administration via the SAME path
 * the progress note uses (writeMarAdministrations), with sourceNoteId='' since
 * it isn't tied to a note. The grid only opens this for EMPTY, chartable cells,
 * so it never re-documents an already-given scheduled slot (that routes to the
 * amend flow instead) — no double-dose here.
 */
export default function AdministerDoseModal({
  patientId,
  order,
  slot,
  dateISO,
  todayISO,
  documenter,
  defaultInitials,
  onClose,
  onSaved,
}: Props) {
  const isPRN = order.isPRN || slot === 'PRN';
  const scheduledTimeDefault = !isPRN && /^\d{1,2}:\d{2}$/.test(slot) ? slot : nowHHMM();

  const [status, setStatus] = useState<'' | 'given' | 'held' | 'refused'>('');
  const [actualTime, setActualTime] = useState(scheduledTimeDefault);
  const [administeredByType, setAdministeredByType] = useState('nurse');
  const [administratorName, setAdministratorName] = useState('');
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState('');
  const [initials, setInitials] = useState(defaultInitials);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const isNurseAdmin = administeredByType === 'nurse';
  const needsReason = status === 'held' || status === 'refused' || (status === 'given' && isPRN);
  const indication = (order.indication || '').trim();
  const isLate = !!dateISO && dateISO !== todayISO;

  const save = async () => {
    if (!status) {
      setError('Choose Given, Held, or Refused.');
      return;
    }
    if (status === 'given' && !actualTime) {
      setError('Enter the time the dose was given.');
      return;
    }
    if (needsReason && !reason.trim()) {
      setError(status === 'given' ? 'A PRN dose needs a reason (why it was given).' : 'A reason is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await writeMarAdministrations(
        [
          {
            patientId,
            orderId: order.id || '',
            medName: order.medName,
            dose: order.dose,
            units: order.units || '',
            route: order.route,
            scheduledTime: slot,
            status,
            administeredByType,
            administratorName,
            actualTime: status === 'given' ? actualTime : '',
            initials,
            reason,
            isPRN,
            indication,
            outcome,
          },
        ],
        { patientId, date: dateISO, sourceNoteId: '', documenter },
      );
      onSaved();
      onClose();
    } catch {
      setError('Could not save the dose. Please try again.');
      setBusy(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div style={backdrop} role="dialog" aria-modal="true" aria-label="Document a dose">
      <div style={sheet}>
        <div style={head}>
          <div style={{ minWidth: 0 }}>
            <div style={medName}>{order.medName}</div>
            <div style={medMeta}>
              {order.dose}
              {order.units ? ` ${order.units}` : ''} · {order.route} · {isPRN ? 'PRN' : slot}
            </div>
            <div style={dateLine}>{prettyDate(dateISO)}</div>
          </div>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {isLate && (
          <div style={lateNotice}>
            Late entry: you&apos;re documenting this for <strong>{prettyDate(dateISO)}</strong>, not today. The record
            keeps the time you actually documented it.
          </div>
        )}

        {isPRN && indication && <div style={indicationLine}>Ordered for: {indication}</div>}

        <div style={statusRow}>
          {(['given', 'held', 'refused'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus((cur) => (cur === s ? '' : s))}
              style={status === s ? statusActive[s] : statusBtn}
            >
              {s === 'given' ? 'Given' : s === 'held' ? 'Held' : 'Refused'}
            </button>
          ))}
        </div>

        {status === 'given' && (
          <div style={grid2}>
            <label style={field}>
              <span style={fieldLabel}>Time given</span>
              <input type="time" value={actualTime} onChange={(e) => setActualTime(e.target.value)} style={input} />
            </label>
            <label style={field}>
              <span style={fieldLabel}>Initials</span>
              <input type="text" value={initials} onChange={(e) => setInitials(e.target.value)} style={input} maxLength={5} />
            </label>
            <label style={field}>
              <span style={fieldLabel}>Administered by</span>
              <select value={administeredByType} onChange={(e) => setAdministeredByType(e.target.value)} style={input}>
                {ADMIN_BY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {!isNurseAdmin && (
              <label style={field}>
                <span style={fieldLabel}>Administrator name</span>
                <input
                  type="text"
                  value={administratorName}
                  onChange={(e) => setAdministratorName(e.target.value)}
                  style={input}
                  placeholder="e.g., Jane Doe (daughter)"
                />
              </label>
            )}
          </div>
        )}

        {needsReason && (
          <label style={{ ...field, marginTop: 12 }}>
            <span style={fieldLabel}>
              {status === 'given' ? 'Reason this PRN dose was given *' : 'Reason *'}
            </span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={input}
              placeholder={
                status === 'refused'
                  ? 'Reason for refusal'
                  : status === 'held'
                    ? 'Reason held / omitted'
                    : indication
                      ? `e.g., ${indication}; rated 6/10`
                      : 'e.g., complained of pain, rated 6/10'
              }
            />
          </label>
        )}

        {/* PRN effectiveness follow-up. The result is usually observed 30-60
            minutes after the dose, so it's OPTIONAL here — an unrecorded result
            shows as "Result pending" on the grid until it's filled in. */}
        {status === 'given' && isPRN && (
          <label style={{ ...field, marginTop: 12 }}>
            <span style={fieldLabel}>Outcome / result (if already known)</span>
            <input
              type="text"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              style={input}
              placeholder="e.g., pain decreased from 6/10 to 2/10 within 45 min"
            />
            <span style={outcomeHint}>
              Recheck 30-60 min after the dose. If you leave this blank, the dose shows as &quot;Result
              pending&quot; on the MAR until the result is recorded.
            </span>
          </label>
        )}

        {error && <div style={errBox}>{error}</div>}

        <div style={actions}>
          <button type="button" style={cancelBtn} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" style={saveBtn} onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save dose'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 3200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto' };
const sheet: CSSProperties = { width: '100%', maxWidth: 520, background: 'white', borderRadius: 12, padding: 18, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' };
const head: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 };
const medName: CSSProperties = { fontWeight: 700, fontSize: 17, color: '#1f2937' };
const medMeta: CSSProperties = { fontSize: 13, color: '#6b7280', marginTop: 2 };
const dateLine: CSSProperties = { fontSize: 13, color: '#1a3a5c', fontWeight: 600, marginTop: 4 };
const closeBtn: CSSProperties = { width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#f1f3f5', border: 'none', borderRadius: 10, color: '#2c3e50', cursor: 'pointer', flexShrink: 0 };
const lateNotice: CSSProperties = { background: '#fff7e6', border: '1px solid #f5d9a8', color: '#8a5a0d', borderRadius: 8, padding: '9px 11px', fontSize: 12.5, lineHeight: 1.45, marginBottom: 12 };
const indicationLine: CSSProperties = { fontSize: 12.5, color: '#5c6b7a', marginBottom: 12 };
const statusRow: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' };
const statusBtn: CSSProperties = { padding: '8px 16px', borderRadius: 6, border: '1px solid #d0d7de', background: 'white', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const statusActive: Record<'given' | 'held' | 'refused', CSSProperties> = {
  given: { ...statusBtn, background: '#0e7c4a', color: 'white', border: '1px solid #0e7c4a' },
  held: { ...statusBtn, background: '#b56a17', color: 'white', border: '1px solid #b56a17' },
  refused: { ...statusBtn, background: '#c0392b', color: 'white', border: '1px solid #c0392b' },
};
const grid2: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 14 };
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 };
const fieldLabel: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#5c6b7a' };
const input: CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', height: 38 };
const outcomeHint: CSSProperties = { fontSize: 11.5, color: '#8a949e', lineHeight: 1.4, marginTop: 2 };
const errBox: CSSProperties = { marginTop: 12, background: '#fdeaea', color: '#b3261e', borderRadius: 6, padding: '8px 11px', fontSize: 13 };
const actions: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 };
const cancelBtn: CSSProperties = { background: 'white', color: '#374151', border: '1px solid #d0d7de', padding: '9px 16px', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const saveBtn: CSSProperties = { background: '#1a3a5c', color: 'white', border: '1px solid #1a3a5c', padding: '9px 16px', borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
