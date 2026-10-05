'use client';

import { useState } from 'react';
import { FileUp, X } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import { formatUSPhone } from '@/lib/phone';
import { FieldError, FIELD_ERROR_STYLE } from '@/lib/formEscort';

// "Add a Received Fax": a fax that came to another fax number (the old
// MetroFax line, a physician's office faxing the number they had on file),
// or on paper. The PDF joins Incoming Faxes and is filed like the rest.

const MAX_BYTES = 20 * 1024 * 1024;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || '').replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.readAsDataURL(file);
  });
}

export default function UploadFaxModal({ today, onClose, onAdded }: { today: string; onClose: () => void; onAdded: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [fromNumber, setFromNumber] = useState('');
  const [receivedDate, setReceivedDate] = useState(today);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ file?: string; fromNumber?: string; receivedDate?: string }>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    const fe: typeof fieldErrors = {};
    if (!file) fe.file = 'Choose the fax PDF.';
    else if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) fe.file = 'The fax must be a PDF.';
    else if (file.size > MAX_BYTES) fe.file = 'That file is too large. Keep it under 20 MB.';
    if (fromNumber.trim() && fromNumber.replace(/\D/g, '').replace(/^1/, '').length !== 10) fe.fromNumber = 'Enter a 10-digit fax number, or leave it blank.';
    if (!receivedDate || receivedDate > today) fe.receivedDate = 'Enter the date it was received (today or earlier).';
    setFieldErrors(fe);
    if (Object.keys(fe).length > 0) return;
    setBusy(true);
    try {
      const pdfBase64 = await readAsBase64(file!);
      const res = await authedFetch('/api/fax/inbound/upload', { method: 'POST', body: JSON.stringify({ pdfBase64, fromNumber, receivedDate, note }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fields) setFieldErrors(data.fields);
        throw new Error(data.error || `Request failed (${res.status}).`);
      }
      const n = Number(data.pages || 0);
      const suggested = Array.isArray(data.suggested) && data.suggested.length > 0 ? ` It looks like the signed Appendix T for ${data.suggested.join(' or ')}.` : '';
      onAdded(`Added the ${n}-page fax to Incoming Faxes.${suggested} Open it, then file it to the client or referral it belongs to.`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not add the fax.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={backdrop} onClick={busy ? undefined : onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="upload-fax-title">
        <div style={header}>
          <strong id="upload-fax-title" style={{ fontSize: 16, color: '#1a3a5c' }}>Add a Received Fax</strong>
          <button onClick={onClose} style={closeBtn} aria-label="Close" disabled={busy}><X size={18} /></button>
        </div>
        <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 20, display: 'grid', gap: 14, overflowY: 'auto' }}>
            <p style={{ margin: 0, fontSize: 13, color: '#5c6b7a', lineHeight: 1.5 }}>
              For a fax that did not come in on the portal line: one that reached another fax number (save the PDF from
              that email), or a paper fax you scanned. It joins Incoming Faxes and is filed the same way.
            </p>
            <label style={field}>
              <span style={label}>Fax PDF</span>
              <input type="file" accept="application/pdf,.pdf" onChange={(e) => { setFile(e.target.files?.[0] || null); setFieldErrors((f) => ({ ...f, file: undefined })); }} />
              <FieldError message={fieldErrors.file} />
            </label>
            <div style={twoCol}>
              <label style={field}>
                <span style={label}>Sender&apos;s fax number <span style={{ fontWeight: 400 }}>(optional)</span></span>
                <input type="tel" inputMode="tel" value={fromNumber} onChange={(e) => { setFromNumber(formatUSPhone(e.target.value)); setFieldErrors((f) => ({ ...f, fromNumber: undefined })); }} placeholder="(404) 555-0101" style={{ ...inp, ...(fieldErrors.fromNumber ? FIELD_ERROR_STYLE : null) }} />
                <span style={hint}>From the fax header. It is matched against open PPOT requests and verbal orders.</span>
                <FieldError message={fieldErrors.fromNumber} />
              </label>
              <label style={field}>
                <span style={label}>Date received</span>
                <input type="date" value={receivedDate} max={today} onChange={(e) => { setReceivedDate(e.target.value); setFieldErrors((f) => ({ ...f, receivedDate: undefined })); }} style={{ ...inp, ...(fieldErrors.receivedDate ? FIELD_ERROR_STYLE : null) }} />
                <FieldError message={fieldErrors.receivedDate} />
              </label>
            </div>
            <label style={field}>
              <span style={label}>Note <span style={{ fontWeight: 400 }}>(optional)</span></span>
              <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Came to the MetroFax number from CHOA Developmental" style={inp} />
            </label>
            {err && <div role="alert" style={{ color: '#b3261e', fontSize: 13, fontWeight: 600 }}>{err}</div>}
          </div>
          <div style={footer}>
            <button type="button" onClick={onClose} style={ghostBtn} disabled={busy}>Cancel</button>
            <button type="submit" style={primaryBtn} disabled={busy}>
              <FileUp size={14} /> {busy ? 'Adding…' : 'Add to Incoming Faxes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const modal: React.CSSProperties = { background: 'white', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' };
const header: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' };
const footer: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #e5e7eb' };
const closeBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex' };
const field: React.CSSProperties = { display: 'grid', gap: 5 };
const label: React.CSSProperties = { fontSize: 12, color: '#5c6b7a', fontWeight: 600 };
const hint: React.CSSProperties = { fontSize: 12, color: '#7f8c8d', lineHeight: 1.45 };
const twoCol: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', color: '#111827' };
const ghostBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' };
const primaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
