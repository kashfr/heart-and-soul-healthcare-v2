'use client';

import { useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import { recordTarEntry } from '@/lib/tar';
import {
  TAR_NOT_DONE_REASONS,
  TAR_PERFORMER_TYPES,
  type TarPerformerType,
  type TarStatus,
} from '@/lib/tarShared';
import type { CareTask } from '@/lib/careTasks';

interface Props {
  patientId: string;
  task: CareTask;
  date: string; // 'YYYY-MM-DD'
  slotIndex: number;
  /** Total boxes this task has per day; shown only when more than one. */
  timesPerDay: number;
  documenter: { uid: string; name: string; credential: string };
  defaultInitials: string;
  onClose: () => void;
  onSaved: () => void;
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function prettyDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function RecordTreatmentModal({
  patientId,
  task,
  date,
  slotIndex,
  timesPerDay,
  documenter,
  defaultInitials,
  onClose,
  onSaved,
}: Props) {
  const [status, setStatus] = useState<TarStatus>('done');
  const [performedByType, setPerformedByType] = useState<TarPerformerType>('nurse');
  const [performerName, setPerformerName] = useState('');
  const [time, setTime] = useState(nowHHMM());
  const [initials, setInitials] = useState(defaultInitials);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsPerformerName = status === 'done' && performedByType !== 'nurse';

  const save = async () => {
    setError(null);
    if (!initials.trim()) {
      setError('Initials are required: they identify who documented this entry.');
      return;
    }
    if (status === 'not-done' && !reason.trim()) {
      setError('Choose why the treatment was not carried out.');
      return;
    }
    if (needsPerformerName && !performerName.trim()) {
      setError('Enter the name of the person who performed the treatment.');
      return;
    }
    setSaving(true);
    try {
      await recordTarEntry(
        {
          taskId: task.id || '',
          slotIndex,
          status,
          performedByType,
          performerName,
          initials,
          time,
          reason,
          note,
          taskNameSnapshot: task.name,
          categoryLabelSnapshot: task.categoryLabel,
          frequencySnapshot: task.frequency,
          levelSnapshot: task.level,
        },
        { patientId, date, documenter },
      );
      onSaved();
    } catch (err) {
      console.error('Failed to record treatment:', err);
      setError('Could not save. Check your connection and try again.');
      setSaving(false);
    }
  };

  return (
    <div style={overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={headRow}>
          <div>
            <h2 style={h2}>Record treatment</h2>
            <div style={sub}>
              {prettyDate(date)}
              {timesPerDay > 1 ? ` · box ${slotIndex + 1} of ${timesPerDay}` : ''}
            </div>
          </div>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div style={taskCard}>
          <div style={{ fontWeight: 700, color: '#1a3a5c' }}>{task.name}</div>
          <div style={{ fontSize: 12.5, color: '#5c6b7a', marginTop: 2 }}>
            {task.categoryLabel} · {task.frequency}
            {task.level === 'skilled' ? ' · Skilled (RN/LPN)' : ''}
          </div>
          {task.instructions && (
            <div style={{ fontSize: 12.5, color: '#2c3e50', marginTop: 6, lineHeight: 1.45 }}>
              {task.instructions}
            </div>
          )}
        </div>

        <div style={field}>
          <label style={label}>Outcome</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(
              [
                ['done', 'Completed'],
                ['not-done', 'Not completed'],
                ['na', 'Not applicable'],
              ] as Array<[TarStatus, string]>
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatus(value)}
                style={status === value ? segActive : seg}
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        {status === 'done' && (
          <>
            <div style={row}>
              <div style={field}>
                <label style={label} htmlFor="tar-performer">Performed by</label>
                <select
                  id="tar-performer"
                  value={performedByType}
                  onChange={(e) => setPerformedByType(e.target.value as TarPerformerType)}
                  style={input}
                >
                  {TAR_PERFORMER_TYPES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div style={field}>
                <label style={label} htmlFor="tar-time">Time performed</label>
                <input id="tar-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={input} />
              </div>
            </div>
            {needsPerformerName && (
              <div style={field}>
                <label style={label} htmlFor="tar-performer-name">Name of person who performed it *</label>
                <input
                  id="tar-performer-name"
                  type="text"
                  value={performerName}
                  onChange={(e) => setPerformerName(e.target.value)}
                  style={input}
                  placeholder="e.g., Paula Krone (mother)"
                />
              </div>
            )}
          </>
        )}

        {status === 'not-done' && (
          <div style={field}>
            <label style={label} htmlFor="tar-reason">Reason not carried out *</label>
            <select id="tar-reason" value={reason} onChange={(e) => setReason(e.target.value)} style={input}>
              <option value="">Select a reason…</option>
              {TAR_NOT_DONE_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        )}

        <div style={field}>
          <label style={label} htmlFor="tar-note">
            Notes {status === 'done' ? '(findings, site appearance, anything notable)' : '(optional)'}
          </label>
          <textarea
            id="tar-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            style={{ ...input, resize: 'vertical' }}
          />
        </div>

        <div style={field}>
          <label style={label} htmlFor="tar-initials">Your initials *</label>
          <input
            id="tar-initials"
            type="text"
            value={initials}
            onChange={(e) => setInitials(e.target.value)}
            style={{ ...input, maxWidth: 120, textTransform: 'uppercase' }}
            maxLength={4}
          />
          <div style={hint}>
            Documented by {documenter.name}
            {documenter.credential ? `, ${documenter.credential}` : ''}. Entries cannot be edited once
            saved; a correction is recorded as a new entry.
          </div>
        </div>

        {error && <div style={errorBox}>{error}</div>}

        <div style={actions}>
          <button type="button" onClick={onClose} style={cancelBtn} disabled={saving}>Cancel</button>
          <button type="button" onClick={save} style={saveBtn} disabled={saving}>
            {saving ? 'Saving…' : 'Save entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1000 };
const panel: CSSProperties = { background: 'white', borderRadius: 12, padding: 22, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 18px 40px rgba(15,23,42,0.2)' };
const headRow: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 };
const h2: CSSProperties = { fontSize: 18, color: '#1a3a5c', margin: 0 };
const sub: CSSProperties = { fontSize: 13, color: '#5c6b7a', marginTop: 3 };
const closeBtn: CSSProperties = { background: 'transparent', border: 'none', color: '#5c6b7a', cursor: 'pointer', padding: 4 };
const taskCard: CSSProperties = { background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', marginBottom: 16 };
const field: CSSProperties = { marginBottom: 14, flex: 1 };
const row: CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap' };
const label: CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, color: '#2c3e50', marginBottom: 5 };
const input: CSSProperties = { width: '100%', padding: '9px 10px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', color: '#2c3e50', background: 'white' };
const seg: CSSProperties = { padding: '8px 14px', borderRadius: 6, border: '1px solid #d0d7de', background: 'white', color: '#2c3e50', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const segActive: CSSProperties = { ...seg, background: '#1a3a5c', color: 'white', borderColor: '#1a3a5c' };
const hint: CSSProperties = { fontSize: 11.5, color: '#7f8c8d', marginTop: 6, lineHeight: 1.45 };
const errorBox: CSSProperties = { background: '#fdecea', border: '1px solid #f5c2bd', color: '#a3261c', borderRadius: 6, padding: '10px 12px', fontSize: 13, marginBottom: 12 };
const actions: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 };
const cancelBtn: CSSProperties = { padding: '10px 16px', borderRadius: 6, border: '1px solid #d0d7de', background: 'white', color: '#2c3e50', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const saveBtn: CSSProperties = { padding: '10px 18px', borderRadius: 6, border: 'none', background: '#0e7c4a', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
