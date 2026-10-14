'use client';
import { useState } from 'react';
import { btn } from '@/components/buttons';
import { authedFetch } from '@/lib/authedFetch';
import { DOC_CATEGORIES } from '@/lib/docCategories';
import type { ReferralDocument } from '@/lib/referralDocumentsServer';

export default function EditReferralDocumentModal({ document, onClose, onSaved }: { document: ReferralDocument; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(document.title);
  const [category, setCategory] = useState(document.category);
  const [docDate, setDocDate] = useState(document.docDate);
  const isPpot = document.kind === 'ppot';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const res = await authedFetch(`/api/admin/referrals/${document.referralId}/documents/${document.id}`, {
        method: 'PATCH', headers: { 'If-Match': document.revision }, body: JSON.stringify({ title, category, docDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save details.');
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save details.'); }
    finally { setBusy(false); }
  }
  const inputStyle = { display: 'block', width: '100%', padding: 8, marginTop: 5, marginBottom: 14, border: '1px solid #cbd5e1', borderRadius: 6 };
  return <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
    <form role="dialog" aria-modal="true" aria-label="Edit document details" onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ background: 'white', borderRadius: 12, padding: 24, width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto' }}>
      <h3 style={{ marginTop: 0 }}>Edit document details</h3>
      <p>{isPpot ? 'Correct the date shown beside the physician’s signature on the filed form. The PPOT stays marked received.' : 'Correct the saved title, category, or document date.'} The PDF itself will stay unchanged, and previous details will be retained in history.</p>
      {!isPpot && <><label>Document title<input style={inputStyle} required maxLength={200} value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} /></label>
      <label>Category<select style={inputStyle} value={category} disabled={busy} onChange={(e) => setCategory(e.target.value)}>{DOC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label></>}
      <label>{isPpot ? 'Date the physician signed' : 'Document date'}<input style={inputStyle} required type="date" value={docDate} disabled={busy} onChange={(e) => setDocDate(e.target.value)} /></label>
      {error && <p role="alert" style={{ color: '#b3261e' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
        <button type="button" className={btn} disabled={busy} onClick={onClose}>Cancel</button>
        <button type="submit" className={btn} disabled={busy || !title.trim() || !docDate}>{busy ? 'Saving…' : 'Save details'}</button>
      </div>
    </form>
  </div>;
}
