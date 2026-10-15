'use client';

import { useCallback, useEffect, useState } from 'react';
import { authedFetch } from '@/lib/authedFetch';
import { ACTIVITY_FIELD_LABELS, activityChangedFields, type ClientActivity } from '@/lib/clientActivity';
import { formatDateTimeUS, formatDateUS } from '@/lib/dateFormat';
import { btn, btnDanger, btnPrimary } from './buttons';

interface Page { entries: ClientActivity[]; nextCursor: string | null }
function display(value: unknown, field: string): string {
  if (field === 'guardianContacts' && Array.isArray(value)) return value.map(c =>
    [c.name, c.role, c.relationship, c.phone, c.email, c.address].filter(Boolean).join(' · ')).join('\n') || 'None';
  if (field === 'dob') return formatDateUS(String(value || '')) || 'Not on file';
  return typeof value === 'string' ? value || 'Not on file' : String(value ?? 'Not on file');
}
export function ClientActivityLog({ patientId, onUndone }: { patientId: string; onUndone?: () => void }) {
  const [entries, setEntries] = useState<ClientActivity[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<ClientActivity | null>(null);
  const [saving, setSaving] = useState(false);
  const base = `/api/admin/clients/${encodeURIComponent(patientId)}/activity`;
  const load = useCallback(async (after?: string) => {
    setLoading(true); setError('');
    try {
      const response = await authedFetch(`${base}${after ? `?cursor=${encodeURIComponent(after)}` : ''}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not load activity.');
      const page = body as Page;
      setEntries(old => after ? [...old, ...page.entries] : page.entries); setCursor(page.nextCursor);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load activity.'); }
    finally { setLoading(false); }
  }, [base]);
  useEffect(() => { void load(); }, [load]);
  async function undo() {
    if (!selected) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await authedFetch(`${base}/${encodeURIComponent(selected.id)}/undo`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not undo this change.');
      setNotice(selected.action === 'assistant-document-upload' ? 'Upload archived. The original file is preserved in Documents → Archived.' : 'Change undone. The previous information has been restored.');
      setSelected(null); onUndone?.(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not undo this change.'); }
    finally { setSaving(false); }
  }
  return <section style={{ padding: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, marginTop: 20 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700 }}>Activity Log</h2>
      <button className={btn} disabled={loading || saving} onClick={() => void load()}>Refresh activity</button>
    </div>
    <p style={{ color: '#64748b', margin: '10px 0 20px' }}>Review assistant information changes and document uploads, including who made them and their previous values. Only admins can undo changes. Older activity from before assistant access was enabled is not available.</p>
    {error && <p role="alert" style={{ color: '#b91c1c', marginBottom: 14 }}>{error}</p>}
    {notice && <p role="status" style={{ color: '#166534', marginBottom: 14 }}>{notice}</p>}
    {selected && <div role="region" aria-label="Confirm undo" style={{ border: '1px solid #f59e0b', background: '#fffbeb', padding: 16, borderRadius: 8, marginBottom: 18 }}>
      <strong>{selected.action === 'assistant-document-upload' ? 'Archive this uploaded document?' : 'Undo this information change?'}</strong>
      <p style={{ margin: '8px 0' }}>{selected.actorName} · {formatDateTimeUS(selected.at || '')}</p>
      <p style={{ marginBottom: 12 }}>{selected.action === 'assistant-document-upload'
        ? `“${String(selected.after.title || 'Document')}” will move to Archived. Its file will be kept and can be restored from Documents.`
        : 'The changed fields shown below will return to their previous values. If a related record has been edited since, undo will be blocked. The reversal will be recorded in this log.'}</p>
      {selected.action === 'assistant-information-update' && <ul style={{ margin: '12px 0', paddingLeft: 20 }}>
        {activityChangedFields(selected).map(key => <li key={key} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><strong>{ACTIVITY_FIELD_LABELS[key]}:</strong> restore to {display(selected.before[key], key)}</li>)}
      </ul>}
      <button className={`${btn} ${btnDanger}`} disabled={saving} onClick={() => void undo()}>{saving ? 'Undoing…' : 'Confirm undo'}</button>{' '}
      <button className={btn} disabled={saving} onClick={() => setSelected(null)}>Cancel</button>
    </div>}
    {entries.map(entry => {
      const keys = activityChangedFields(entry);
      const upload = entry.action === 'assistant-document-upload';
      const canUndo = !entry.revertedAt && (upload || (entry.action === 'assistant-information-update' && keys.length > 0));
      return <article key={entry.id} style={{ borderTop: '1px solid #e2e8f0', padding: '18px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div><strong>{entry.actorName}</strong> <span style={{ color: '#64748b' }}>· {formatDateTimeUS(entry.at || '')}</span>
            <p>{upload ? 'Uploaded a document' : entry.action === 'admin-undo' ? 'Undid a previous change' : 'Updated client information'}</p></div>
          {canUndo && <button className={btn} disabled={saving} onClick={() => { setSelected(entry); setError(''); }}>Undo change</button>}
        </div>
        {upload && <p style={{ marginTop: 8 }}>{String(entry.after.title || entry.after.fileName || 'Document')} · {String(entry.after.category || '')} · {formatDateUS(String(entry.after.docDate || ''))}</p>}
        {entry.action === 'admin-undo' && entry.documentId && <p>Archived: {String(entry.after.title || 'Document')}</p>}
        {keys.map(key => <div key={key} style={{ marginTop: 12 }}>
          <strong>{ACTIVITY_FIELD_LABELS[key]}</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 10, marginTop: 6 }}>
            <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><span style={{ color: '#64748b' }}>Before</span><div>{display(entry.before[key], key)}</div></div>
            <div style={{ background: '#eff6ff', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><span style={{ color: '#64748b' }}>After</span><div>{display(entry.after[key], key)}</div></div>
          </div>
        </div>)}
        {!upload && !keys.length && entry.action !== 'admin-undo' && <p style={{ color: '#64748b' }}>Saved without changing any information.</p>}
        {entry.revertedAt && <p style={{ color: '#166534', marginTop: 12 }}>Undone by {entry.revertedByName || 'Administrator'} · {formatDateTimeUS(entry.revertedAt)}</p>}
      </article>;
    })}
    {loading && <p role="status">Loading activity…</p>}
    {!loading && !error && entries.length === 0 && <p>No assistant activity recorded for this client yet.</p>}
    {cursor && <button className={`${btn} ${btnPrimary}`} disabled={loading || saving} onClick={() => void load(cursor)}>Load older activity</button>}
  </section>;
}
