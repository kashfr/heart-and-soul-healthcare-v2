'use client';

import { useEffect, useState } from 'react';
import { btn } from '@/components/buttons';
import { authedFetch } from '@/lib/authedFetch';
import type { ReferralDocument } from '@/lib/referralDocumentsServer';

export default function ReplaceReferralDocumentModal({ document, onClose, onSaved }: { document: ReferralDocument; onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!file) { setUrl(''); return; }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  async function save() {
    if (!file || busy) return;
    setBusy(true); setError('');
    try {
      const res = await authedFetch(`/api/admin/referrals/${document.referralId}/documents/${document.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'If-Match': document.revision }, body: file,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not replace PDF.');
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not replace PDF.'); }
    finally { setBusy(false); }
  }
  return <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
    <div role="dialog" aria-modal="true" aria-label="Replace referral PDF" style={{ background: 'white', borderRadius: 12, padding: 20, width: '100%', maxWidth: 800, maxHeight: '92vh', overflowY: 'auto' }}>
      <h3 style={{ marginTop: 0 }}>Replace PDF</h3>
      <p>{document.title}</p>
      <p style={{ fontSize: 13 }}>Choose the corrected PDF and review it before saving. The previous copy will be retained in document history. The corrected copy will transfer when a client record is created.</p>
      {document.kind === 'ppot' && <p style={{ fontSize: 13 }}>This keeps the PPOT marked received and preserves its signed date. Upload the complete signed form, including all signature pages.</p>}
      <label>Corrected PDF (up to 20 MB)
        <input aria-label="Corrected PDF" type="file" accept="application/pdf,.pdf" disabled={busy} style={{ display: 'block', margin: '10px 0' }} onChange={(e) => {
          const next = e.target.files?.[0]; setError(''); setFile(null);
          if (!next) return;
          if (!/\.pdf$/i.test(next.name) || !next.size || next.size > 20 * 1024 * 1024) { setError('Choose a PDF between 1 byte and 20 MB.'); return; }
          setFile(next);
        }} />
      </label>
      {url && <><a href={url} target="_blank" rel="noopener noreferrer">Open selected PDF in a new tab</a><iframe title="Corrected PDF preview" src={url} style={{ width: '100%', height: '42vh', border: '1px solid #ddd', marginTop: 10 }} /></>}
      {error && <p role="alert" style={{ color: '#b3261e' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className={btn} type="button" disabled={busy} onClick={onClose}>Cancel</button>
        <button className={btn} type="button" disabled={!file || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save replacement'}</button>
      </div>
    </div>
  </div>;
}
