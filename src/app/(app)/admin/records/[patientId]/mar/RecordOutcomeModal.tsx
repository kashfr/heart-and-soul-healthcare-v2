'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import type { MarAdministration } from '@/lib/mar';

interface Props {
  admin: MarAdministration; // the given PRN dose awaiting its result
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Record the result of a given PRN dose after the fact — the effectiveness
 * follow-up a nurse observes 30-60 minutes post-dose. Calls POST
 * /api/mar/outcome, which fills the write-once `outcome` on the original
 * administration (corrections after that go through the amend flow).
 */
export default function RecordOutcomeModal({ admin, onClose, onSaved }: Props) {
  const [outcome, setOutcome] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    if (!outcome.trim()) {
      setError('Describe the result of the dose.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch('/api/mar/outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: admin.id, outcome: outcome.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || 'Could not save the result. Please try again.');
        setBusy(false);
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError('Could not save the result. Please try again.');
      setBusy(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div style={backdrop} role="dialog" aria-modal="true" aria-label="Record PRN dose result">
      <div style={sheet}>
        <div style={head}>
          <div style={{ minWidth: 0 }}>
            <div style={title}>Record result</div>
            <div style={meta}>
              {admin.medNameSnapshot}
              {admin.doseSnapshot ? ` ${admin.doseSnapshot}` : ''}
              {admin.unitsSnapshot ? ` ${admin.unitsSnapshot}` : ''} · PRN
              {admin.actualTime ? ` · given at ${admin.actualTime}` : ''}
              {admin.date ? ` · ${admin.date}` : ''}
            </div>
            {admin.reason && <div style={reasonLine}>Given for: {admin.reason}</div>}
          </div>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <label style={field}>
          <span style={fieldLabel}>Outcome / result *</span>
          <textarea
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            style={textarea}
            placeholder="e.g., pain decreased from 6/10 to 2/10 within 45 min"
            autoFocus
          />
          <span style={hint}>
            What happened after the dose (recheck 30-60 min). This completes the PRN record; later
            changes go through the amend flow.
          </span>
        </label>

        {error && <div style={errBox}>{error}</div>}

        <div style={actions}>
          <button type="button" style={cancelBtn} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" style={saveBtn} onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save result'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 3200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 16px', overflowY: 'auto' };
const sheet: CSSProperties = { width: '100%', maxWidth: 480, background: 'white', borderRadius: 12, padding: 18, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' };
const head: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 };
const title: CSSProperties = { fontWeight: 700, fontSize: 17, color: '#1f2937' };
const meta: CSSProperties = { fontSize: 13, color: '#6b7280', marginTop: 2 };
const reasonLine: CSSProperties = { fontSize: 12.5, color: '#5c6b7a', marginTop: 4 };
const closeBtn: CSSProperties = { width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#f1f3f5', border: 'none', borderRadius: 10, color: '#2c3e50', cursor: 'pointer', flexShrink: 0 };
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 };
const fieldLabel: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#5c6b7a' };
const textarea: CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', minHeight: 70, resize: 'vertical', lineHeight: 1.4 };
const hint: CSSProperties = { fontSize: 11.5, color: '#8a949e', lineHeight: 1.4, marginTop: 2 };
const errBox: CSSProperties = { marginTop: 12, background: '#fdeaea', color: '#b3261e', borderRadius: 6, padding: '8px 11px', fontSize: 13 };
const actions: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 };
const cancelBtn: CSSProperties = { background: 'white', color: '#374151', border: '1px solid #d0d7de', padding: '9px 16px', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const saveBtn: CSSProperties = { background: '#1a3a5c', color: 'white', border: '1px solid #1a3a5c', padding: '9px 16px', borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
