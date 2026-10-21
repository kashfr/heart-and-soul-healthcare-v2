'use client';
import { useState } from 'react';
import { btn, btnSm } from './buttons';
export type FaxAttachment = { fileName: string; pdfBase64: string };
export async function encodeFaxAttachments(files: File[]): Promise<FaxAttachment[]> {
  return Promise.all(files.map((file) => new Promise<FaxAttachment>((resolve, reject) => {
    const reader = new FileReader(); reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => resolve({ fileName: file.name, pdfBase64: String(reader.result).split(',')[1] }); reader.readAsDataURL(file);
  })));
}
export default function FaxAttachmentsPicker({ files, onChange, disabled = false }: { files: File[]; onChange: (files: File[]) => void; disabled?: boolean }) {
  const [error, setError] = useState('');
  return <fieldset disabled={disabled} style={{ border: '1px solid #dbe2ea', borderRadius: 8, padding: 12, margin: '12px 0' }}>
    <legend>Supporting PDFs (optional)</legend>
    <p style={{ fontSize: 12 }}>Added after the main form. Up to 10 PDFs, 10 MB combined; the full fax must fit within 50 pages.</p>
    <input aria-label="Supporting PDFs" type="file" accept="application/pdf,.pdf" multiple onChange={(e) => {
      const added = Array.from(e.target.files || []); e.target.value = ''; const next = [...files, ...added];
      if (next.length > 10 || next.reduce((n, f) => n + f.size, 0) > 10 * 1024 * 1024 || added.some((f) => !f.size || !/\.pdf$/i.test(f.name))) { setError('Choose up to 10 nonempty PDFs totaling at most 10 MB.'); return; }
      setError(''); onChange(next);
    }} />
    <ol>{files.map((file, i) => <li key={`${i}-${file.name}`} style={{ margin: '8px 0', overflowWrap: 'anywhere' }}>{file.name}
      <div style={{ display: 'flex', gap: 6 }}>
        {[-1, 1].map((step) => <button className={`${btn} ${btnSm}`} key={step} type="button" aria-label={`Move ${file.name} ${step < 0 ? 'up' : 'down'}`} disabled={disabled || i + step < 0 || i + step >= files.length} onClick={() => { const next = [...files]; [next[i], next[i + step]] = [next[i + step], next[i]]; onChange(next); }}>{step < 0 ? 'Up' : 'Down'}</button>)}
        <button className={`${btn} ${btnSm}`} type="button" aria-label={`Remove ${file.name}`} onClick={() => onChange(files.filter((_, n) => n !== i))}>Remove</button>
      </div>
    </li>)}</ol>
    {error && <p role="alert">{error}</p>}
  </fieldset>;
}
