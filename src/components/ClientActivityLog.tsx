'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { authedFetch } from '@/lib/authedFetch';
import { isActivityUpload, undoInformationFields, activityDisplayFields, activityFieldLabel, type ClientActivity } from '@/lib/clientActivity';
import { formatDateTimeUS, formatDateUS } from '@/lib/dateFormat';
import { btn, btnDanger, btnPrimary } from './buttons';

export interface ActivityClient { id: string; name: string }
export interface ActivityStaff { uid: string; name: string; active: boolean }
interface Page { clients?: ActivityClient[]; staff?: ActivityStaff[]; entries: ClientActivity[]; nextCursor: string | null }
function display(value: unknown, field: string): string {
  if (field === 'guardianContacts' && Array.isArray(value)) return value.map(c =>
    [c.name, c.role, c.relationship, c.phone, c.email, c.address].filter(Boolean).join(' · ')).join('\n') || 'None';
  if (field === 'dob') return formatDateUS(String(value || '')) || 'Not on file';
  if (value && typeof value === 'object') return JSON.stringify(value, (_key, v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDateUS(v) : v, 2);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDateUS(value);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:/.test(value)) return formatDateTimeUS(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return typeof value === 'string' ? value || 'Not on file' : String(value ?? 'Not on file');
}
export function ClientActivityLog({ patientId, actorUid, filterClient, from, through, onClientsLoaded, onStaffLoaded, onUndone }: { patientId?: string; actorUid?: string; filterClient?: string; from?: string; through?: string; onClientsLoaded?: (clients: ActivityClient[]) => void; onStaffLoaded?: (staff: ActivityStaff[]) => void; onUndone?: () => void }) {
  const [entries, setEntries] = useState<ClientActivity[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<ClientActivity | null>(null);
  const [saving, setSaving] = useState(false);
  const base = patientId ? `/api/admin/clients/${encodeURIComponent(patientId)}/activity` : `/api/admin/client-activity?staff=${encodeURIComponent(actorUid || '')}&client=${encodeURIComponent(filterClient || '')}&from=${encodeURIComponent(from || '')}&through=${encodeURIComponent(through || '')}`;
  const load = useCallback(async (after?: string) => {
    setLoading(true); setError('');
    try {
      const response = await authedFetch(`${base}${after ? `${patientId ? '?' : '&'}cursor=${encodeURIComponent(after)}` : ''}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not load activity.');
      const page = body as Page;
      if (page.clients) onClientsLoaded?.(page.clients);
      if (page.staff) onStaffLoaded?.(page.staff);
      setEntries(old => after ? [...old, ...page.entries] : page.entries); setCursor(page.nextCursor);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load activity.'); }
    finally { setLoading(false); }
  }, [base, patientId, onStaffLoaded, onClientsLoaded]);
  useEffect(() => { void load(); }, [load]);
  async function undo() {
    if (!selected) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await authedFetch(`/api/admin/clients/${encodeURIComponent(selected.patientId || patientId!)}/activity/${encodeURIComponent(selected.id)}/undo`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not undo this change.');
      setNotice(isActivityUpload(selected) ? 'Upload archived. The original file is preserved in Documents → Archived.' : 'Change undone. The previous information has been restored.');
      setSelected(null); onUndone?.(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not undo this change.'); }
    finally { setSaving(false); }
  }
  return <section style={{ padding: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, marginTop: 20 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700 }}>Activity Log</h2>
      <button className={btn} disabled={loading || saving} onClick={() => void load()}>Refresh activity</button>
    </div>
    <p style={{ color: '#64748b', margin: '10px 0 20px' }}>Review recorded changes by staff across client information, documents, and linked chart records. New activity may take a moment to appear. Historical edits from before tracking was enabled are not available. Only eligible administrative changes offer Undo; clinical changes remain review-only, even when saved alongside basic information.</p>
    {error && <p role="alert" style={{ color: '#b91c1c', marginBottom: 14 }}>{error}</p>}
    {notice && <p role="status" style={{ color: '#166534', marginBottom: 14 }}>{notice}</p>}
    {selected && <div role="region" aria-label="Confirm undo" style={{ border: '1px solid #f59e0b', background: '#fffbeb', padding: 16, borderRadius: 8, marginBottom: 18 }}>
      {selected.patientName && <p style={{ fontWeight: 700, marginBottom: 8 }}>Client: {selected.patientName}</p>}
      <strong>{isActivityUpload(selected) ? 'Archive this uploaded document?' : 'Undo this information change?'}</strong>
      <p style={{ margin: '8px 0' }}>{selected.actorName} · {formatDateTimeUS(selected.at || '')}</p>
      <p style={{ marginBottom: 12 }}>{isActivityUpload(selected)
        ? `“${String(selected.after.title || 'Document')}” will move to Archived. Its file will be kept and can be restored from Documents.`
        : 'Only the basic information fields listed below will return to their previous values. If a related record has been edited since, undo will be blocked. The reversal will be recorded in this log.'}</p>
      {undoInformationFields(selected).length > 0 && <ul style={{ margin: '12px 0', paddingLeft: 20 }}>
        {undoInformationFields(selected).map(key => <li key={key} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><strong>{activityFieldLabel(key)}:</strong> restore to {display(selected.before[key], key)}</li>)}
      </ul>}
      <button className={`${btn} ${btnDanger}`} disabled={saving} onClick={() => void undo()}>{saving ? 'Undoing…' : 'Confirm undo'}</button>{' '}
      <button className={btn} disabled={saving} onClick={() => setSelected(null)}>Cancel</button>
    </div>}
    {entries.map(entry => {
      const keys = activityDisplayFields(entry);
      const upload = isActivityUpload(entry);
      const canUndo = entry.patientExists !== false && !entry.revertedAt && (upload || undoInformationFields(entry).length > 0);
      return <article key={`${entry.patientId || patientId}:${entry.id}`} style={{ borderTop: '1px solid #e2e8f0', padding: '18px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>{entry.patientName && <p style={{ marginBottom: 6, fontWeight: 700 }}>{entry.patientExists ? <Link href={`/admin/clients/${encodeURIComponent(entry.patientId!)}?tab=activity`}>{entry.patientName}</Link> : entry.patientName}</p>}<strong>{entry.actorName}</strong>{entry.actorRole && <span style={{ color: '#64748b' }}> ({entry.actorRole === 'va' ? 'Assistant' : entry.actorRole})</span>} <span style={{ color: '#64748b' }}>· {formatDateTimeUS(entry.at || '')}</span>
            <p>{entry.action.startsWith('record-') ? `${entry.action === 'record-created' ? 'Created' : entry.action === 'record-deleted' ? 'Deleted' : 'Updated'} ${entry.recordLabel || 'client record'}` : upload ? 'Uploaded a document' : entry.action === 'admin-undo' ? 'Undid a previous change' : 'Updated client information'}</p></div>
          {canUndo && <button className={btn} disabled={saving} onClick={() => { setSelected(entry); setError(''); }}>Undo change</button>}
        </div>
        {upload && <p style={{ marginTop: 8 }}>{String(entry.after.title || entry.after.fileName || 'Document')} · {String(entry.after.category || '')} · {formatDateUS(String(entry.after.docDate || ''))}</p>}
        {entry.action === 'admin-undo' && entry.documentId && <p>Archived: {String(entry.after.title || 'Document')}</p>}
        {keys.map(key => <div key={key} style={{ marginTop: 12 }}>
          <strong>{activityFieldLabel(key)}</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 10, marginTop: 6 }}>
            <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><span style={{ color: '#64748b' }}>Before</span><div>{display(entry.before[key], key)}</div></div>
            <div style={{ background: '#eff6ff', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><span style={{ color: '#64748b' }}>After</span><div>{display(entry.after[key], key)}</div></div>
          </div>
        </div>)}
        {entry.truncated && <p style={{ color: '#92400e' }}>Some large or protected values were shortened or omitted in this log. Review the source record for full details.</p>}
        {!upload && !keys.length && entry.action !== 'admin-undo' && <p style={{ color: '#64748b' }}>Saved without changing any information.</p>}
        {entry.revertedAt && <p style={{ color: '#166534', marginTop: 12 }}>Undone by {entry.revertedByName || 'Administrator'} · {formatDateTimeUS(entry.revertedAt)}</p>}
      </article>;
    })}
    {loading && <p role="status">Loading activity…</p>}
    {!loading && !error && entries.length === 0 && <p>No activity {actorUid || filterClient || from || through ? 'matches these filters.' : patientId ? 'recorded for this client yet.' : 'recorded yet.'}</p>}
    {cursor && <button className={`${btn} ${btnPrimary}`} disabled={loading || saving} onClick={() => void load(cursor)}>Load older activity</button>}
  </section>;
}
