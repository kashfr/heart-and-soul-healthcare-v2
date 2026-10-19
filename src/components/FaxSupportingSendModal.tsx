'use client';
import { useState } from 'react';
import FaxAttachmentsPicker, { encodeFaxAttachments, type FaxAttachment } from './FaxAttachmentsPicker';
import { btn, btnPrimary } from './buttons';
export default function FaxSupportingSendModal({ title, description, send, onClose }: { title: string; description: string; send: (attachments: FaxAttachment[]) => Promise<void>; onClose: () => void }) {
  const [files, setFiles] = useState<File[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1200, display: 'grid', placeItems: 'center', padding: 20 }}>
    <div role="dialog" aria-modal="true" aria-label={title} style={{ background: 'white', borderRadius: 12, padding: 24, width: '100%', maxWidth: 650, maxHeight: '90vh', overflowY: 'auto' }}>
      <h3>{title}</h3><p>{description}</p>
      <p>Existing supporting documents remain included. Any new PDFs are appended and retained for later follow-ups.</p>
      <FaxAttachmentsPicker files={files} onChange={setFiles} disabled={busy} />
      {error && <p role="alert">{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button className={btn} disabled={busy} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await send(await encodeFaxAttachments(files)); onClose(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not send fax.'); } finally { setBusy(false); } }}>{busy ? 'Sending…' : 'Send fax'}</button></div>
    </div>
  </div>;
}
