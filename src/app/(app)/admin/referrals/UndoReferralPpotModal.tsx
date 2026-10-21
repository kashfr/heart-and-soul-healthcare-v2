'use client';
import { useState } from 'react';
import { withSelectChevron } from '@/lib/selectChevron';
import { btn } from '@/components/buttons';
import { authedFetch } from '@/lib/authedFetch';
import { DOC_CATEGORIES } from '@/lib/docCategories';
import type { ReferralDocument } from '@/lib/referralDocumentsServer';

export default function UndoReferralPpotModal({ document, onClose, onSaved }: { document: ReferralDocument; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('Received medical records');
  const [category, setCategory] = useState('Provider Correspondence');
  const [docDate, setDocDate] = useState(document.docDate);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    if (busy || !confirmed) return;
    setBusy(true); setError('');
    try {
      const res = await authedFetch(`/api/admin/referrals/${document.referralId}/documents/signed-ppot/undo`, {
        method: 'POST', body: JSON.stringify({ revision: document.revision, title, category, docDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not undo filing.');
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not undo filing.'); }
    finally { setBusy(false); }
  }
  const inputStyle = { display: 'block', width: '100%', padding: 8, marginTop: 5, marginBottom: 14, border: '1px solid #cbd5e1', borderRadius: 6 };
  return <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
    <form role="dialog" aria-modal="true" aria-label="Undo PPOT filing" onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ background: 'white', borderRadius: 12, padding: 24, width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto' }}>
      <h3 style={{ marginTop: 0 }}>Undo PPOT filing</h3>
      <p>Keep this PDF as a regular document on this referral. The current copy, including any page cleanup, will stay available.</p>
      <p>The PPOT request will return to <strong>Waiting on Physicians</strong>. Scheduled follow-up faxes may resume using the original request date. This action does not send a fax.</p>
      <label>Document title<input style={inputStyle} required maxLength={200} value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} /></label>
      <label>Category<select style={withSelectChevron(inputStyle)} value={category} disabled={busy} onChange={(e) => setCategory(e.target.value)}>{DOC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label>Document date<input style={inputStyle} required type="date" value={docDate} disabled={busy} onChange={(e) => setDocDate(e.target.value)} /></label>
      <label style={{ display: 'flex', gap: 8, fontSize: 14 }}><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} />I filed this as a signed PPOT by mistake and want to reopen the request.</label>
      {error && <p role="alert" style={{ color: '#b3261e' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
        <button type="button" className={btn} disabled={busy} onClick={onClose}>Cancel</button>
        <button type="submit" className={btn} disabled={busy || !confirmed || !title.trim() || !docDate}>{busy ? 'Saving…' : 'Undo and file as document'}</button>
      </div>
    </form>
  </div>;
}
