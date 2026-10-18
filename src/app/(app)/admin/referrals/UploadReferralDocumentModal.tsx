'use client';

import { useState } from 'react';
import { btn, btnPrimary } from '@/components/buttons';
import { FileUp, X } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import { withSelectChevron } from '@/lib/selectChevron';
import { DOC_CATEGORY_GROUPS } from '@/lib/docCategories';
import { applyFieldErrors, FieldError, FIELD_ERROR_STYLE } from '@/lib/formEscort';

type Field = 'file' | 'title' | 'category' | 'docDate';
const ORDER: readonly Field[] = ['file', 'title', 'category', 'docDate'];
const fieldId = (k: Field) => `referral-upload-${k}`;
const MAX_BYTES = 10 * 1024 * 1024;

function agencyToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload Document on a referral's card: any PDF, however it arrived
 * (PandaDoc, email, the family, a scan). With an open PPOT request it can
 * instead be filed as the signed Appendix T, the same as File as Signed PPOT.
 */
export default function UploadReferralDocumentModal({
  referralId,
  openPpot,
  onClose,
  onSaved,
}: {
  referralId: string;
  /** The open PPOT request, when there is one (its physician, for the label). */
  openPpot: { recipientName: string } | null;
  onClose: () => void;
  onSaved: (asSignedPpot: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [asSignedPpot, setAsSignedPpot] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [docDate, setDocDate] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const clear = (k: Field) => errors[k] && setErrors((p) => ({ ...p, [k]: undefined }));

  const pickFile = (f: File | null) => {
    setFile(f);
    clear('file');
    setErr(null);
    // Start the title from the file name; staff can change it.
    if (f && !title) setTitle(f.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 200));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    const today = agencyToday();
    const v: Partial<Record<Field, string>> = {};
    if (!file) v.file = 'Choose the PDF.';
    else if (file.type && file.type !== 'application/pdf') v.file = 'The file must be a PDF.';
    else if (file.size > MAX_BYTES) v.file = 'That file is too large. Keep it under 10 MB.';
    if (!asSignedPpot) {
      if (!title.trim()) v.title = 'Give the document a title.';
      if (!category) v.category = 'Choose a category.';
    }
    if (!docDate) v.docDate = asSignedPpot ? 'Enter the date the physician signed it.' : 'Enter the document date.';
    else if (docDate > today) v.docDate = 'The date cannot be in the future.';
    if (!applyFieldErrors(v, ORDER, setErrors, fieldId)) return;
    setBusy(true);
    try {
      const pdfBase64 = await readAsBase64(file!);
      const body = asSignedPpot ? { pdfBase64, asSignedPpot: true, docDate } : { pdfBase64, title: title.trim(), category, docDate };
      const res = await authedFetch(`/api/admin/referrals/${referralId}/documents`, { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fields && Object.keys(data.fields).length) applyFieldErrors(data.fields, ORDER, setErrors, fieldId);
        throw new Error(data.error || `Request failed (${res.status}).`);
      }
      onSaved(asSignedPpot);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not upload the document.');
    } finally {
      setBusy(false);
    }
  };

  // Enter in a text box must not upload a half-finished form.
  const blockEnter = (e: React.KeyboardEvent<HTMLFormElement>) => {
    const t = e.target as HTMLElement;
    if (e.key === 'Enter' && t.tagName !== 'TEXTAREA' && t.tagName !== 'BUTTON') e.preventDefault();
  };

  return (
    <div style={backdrop} onClick={busy ? undefined : onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="referral-upload-title">
        <div style={header}>
          <strong id="referral-upload-title" style={{ fontSize: 16, color: '#1a3a5c', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <FileUp size={16} /> Upload Document
          </strong>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="Close" disabled={busy}><X size={18} /></button>
        </div>
        <form onSubmit={submit} onKeyDown={blockEnter} noValidate style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 20, display: 'grid', gap: 14, overflowY: 'auto' }}>
            <p style={lead}>
              Any PDF for this referral, however it came in: PandaDoc, email, the family, or a scan. It stays with the
              referral and moves to the client&apos;s Documents when the client record is created.
            </p>
            <label style={field} id={fieldId('file')}>
              <span style={label}>PDF</span>
              <input type="file" accept="application/pdf,.pdf" onChange={(e) => pickFile(e.target.files?.[0] || null)} style={errors.file ? { ...FIELD_ERROR_STYLE, borderRadius: 6, padding: 4 } : undefined} />
              <FieldError message={errors.file} />
            </label>
            {openPpot && (
              <label style={checkRow}>
                <input type="checkbox" checked={asSignedPpot} onChange={(e) => { setAsSignedPpot(e.target.checked); setErrors({}); }} style={{ marginTop: 2 }} />
                <span>
                  <strong>This is the signed Appendix T</strong> for the open PPOT request{openPpot.recipientName ? ` (${openPpot.recipientName})` : ''}.
                  <span style={{ display: 'block', color: '#5c6b7a', marginTop: 2 }}>Marks the request received, the same as File as Signed PPOT in the Fax Center, so follow-up faxes stop.</span>
                </span>
              </label>
            )}
            {!asSignedPpot && (
              <>
                <label style={field} id={fieldId('title')}>
                  <span style={label}>Title</span>
                  <input value={title} maxLength={200} onChange={(e) => { setTitle(e.target.value); clear('title'); }} style={{ ...inp, ...(errors.title ? FIELD_ERROR_STYLE : null) }} placeholder="e.g. Georgia HIPAA Release, Peachtree Pediatrics" />
                  <FieldError message={errors.title} />
                </label>
                <label style={field} id={fieldId('category')}>
                  <span style={label}>Category</span>
                  <select value={category} onChange={(e) => { setCategory(e.target.value); clear('category'); }} style={withSelectChevron({ ...inp, ...(errors.category ? FIELD_ERROR_STYLE : null) })}>
                    <option value="">Choose One</option>
                    {DOC_CATEGORY_GROUPS.map((g) => (
                      <optgroup key={g.label} label={g.label}>
                        {g.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <FieldError message={errors.category} />
                </label>
              </>
            )}
            <label style={field} id={fieldId('docDate')}>
              <span style={label}>{asSignedPpot ? 'Date the physician signed' : 'Document date'}</span>
              <input type="date" value={docDate} max={agencyToday()} onChange={(e) => { setDocDate(e.target.value); clear('docDate'); }} style={{ ...inp, maxWidth: 200, ...(errors.docDate ? FIELD_ERROR_STYLE : null) }} />
              <FieldError message={errors.docDate} />
            </label>
            {err && <div role="alert" style={{ color: '#b3261e', fontSize: 13, fontWeight: 600 }}>{err}</div>}
          </div>
          <div style={footer}>
            <button type="button" onClick={onClose} className={btn} disabled={busy}>Cancel</button>
            <button type="submit" className={btnPrimary} disabled={busy}>
              <FileUp size={14} /> {busy ? 'Uploading…' : asSignedPpot ? 'File Signed Appendix T' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const modal: React.CSSProperties = { background: 'white', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' };
const header: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' };
const footer: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #e5e7eb' };
const closeBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex' };
const lead: React.CSSProperties = { margin: 0, fontSize: 13, color: '#5c6b7a', lineHeight: 1.5 };
const field: React.CSSProperties = { display: 'grid', gap: 5, alignContent: 'start' };
const label: React.CSSProperties = { fontSize: 12, color: '#5c6b7a', fontWeight: 600 };
const checkRow: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.45, background: '#f0f6fc', border: '1px solid #c8def5', borderRadius: 8, padding: '10px 12px' };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', color: '#111827' };
