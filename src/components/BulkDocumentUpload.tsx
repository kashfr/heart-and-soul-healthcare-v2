'use client';
import { useState, type CSSProperties } from 'react';
import { parseUSDate } from '@/lib/usDateInput';
import { DOC_CATEGORIES, type DocCategory } from '@/lib/docCategories';
import { EMPTY_PERIOD_DRAFT, resolvePeriodDraft, type DocumentPeriodDraft } from '@/lib/documentPeriod';
import { withSelectChevron } from '@/lib/selectChevron';
import { btn, btnPrimary } from './buttons';
import DocumentPeriodFields from './DocumentPeriodFields';
/** periodStart/periodEnd are ISO, or '' when the file is not tied to a period. */
export type DocumentUploadItem = { id: string; file: File; title: string; category: DocCategory; docDate: string; periodStart: string; periodEnd: string };
type Row = Omit<DocumentUploadItem, 'periodStart' | 'periodEnd'> & { period: DocumentPeriodDraft; status: 'ready' | 'uploading' | 'uploaded' | 'failed'; error?: string };
export default function BulkDocumentUpload({ upload, onClose, onComplete }: { upload: (item: DocumentUploadItem, progress: (pct: number) => void) => Promise<void>; onClose: () => void; onComplete?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [category, setCategory] = useState<DocCategory>('Other');
  const [date, setDate] = useState(new Date().toLocaleDateString('en-US'));
  const [period, setPeriod] = useState<DocumentPeriodDraft>(EMPTY_PERIOD_DRAFT);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const patch = (id: string, update: Partial<Row>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...update } : row));
  const add = (files: File[]) => {
    if (busy) return;
    if (rows.length + files.length > 20) { setError('Choose up to 20 files per batch.'); return; }
    const bad = files.find((file) => !file.size || file.size >= 20 * 1024 * 1024 || !/\.(pdf|jpe?g|png|heic|docx?)$/i.test(file.name));
    if (bad) { setError(`${bad.name}: choose a nonempty PDF, JPEG, PNG, HEIC, or Word file under 20 MB.`); return; }
    setError(''); setRows((current) => [...current, ...files.map((file): Row => ({ id: crypto.randomUUID(), file, title: file.name.replace(/\.[^.]+$/, ''), category, docDate: date, period, status: 'ready' }))]);
  };
  const save = async () => {
    if (busy) return;
    const pending = rows.filter((r) => r.status !== 'uploaded');
    if (!pending.length) return;
    if (pending.some((r) => !r.title.trim() || !parseUSDate(r.docDate))) { setError('Enter a title and valid document date for each file.'); return; }
    const resolved = pending.map((r) => ({ row: r, period: resolvePeriodDraft(r.period) }));
    const badPeriod = resolved.find((r) => !r.period.ok);
    if (badPeriod && !badPeriod.period.ok) { setError(`${badPeriod.row.file.name}: ${badPeriod.period.error}`); return; }
    setBusy(true); setError('');
    for (const { row, period: resolvedPeriod } of resolved) {
      const covers = resolvedPeriod.ok ? resolvedPeriod.period : null;
      patch(row.id, { status: 'uploading', error: '' }); setProgress(0);
      try {
        await upload({ id: row.id, file: row.file, title: row.title, category: row.category, docDate: parseUSDate(row.docDate)!, periodStart: covers?.periodStart ?? '', periodEnd: covers?.periodEnd ?? '' }, setProgress);
        patch(row.id, { status: 'uploaded' });
      }
      catch (err) { patch(row.id, { status: 'failed', error: err instanceof Error ? err.message : 'Upload failed. Check the client’s Documents before retrying.' }); }
    }
    setBusy(false); onComplete?.();
  };
  return <div>
    <p>Select documents or photos together. Each file is saved separately. Review its title, category, and date before uploading. Up to 20 files, under 20 MB each.</p>
    <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
      <label style={label}>Default category <select style={select} value={category} onChange={(e) => setCategory(e.target.value as DocCategory)}>{DOC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>{' '}
      <label style={label}>Default document date (MM/DD/YYYY) <input type="text" placeholder="MM/DD/YYYY" inputMode="numeric" style={input} value={date} onChange={(e) => setDate(e.target.value)} /></label>{' '}
      <DocumentPeriodFields draft={period} onChange={setPeriod} name="pending files" labelStyle={label} inputStyle={input} selectStyle={select} />
      <button type="button" className={btn} onClick={() => setRows((current) => current.map((r) => r.status === 'uploaded' ? r : { ...r, category, docDate: date, period }))}>Apply defaults to pending files</button>
      <p style={hint}>The document date is the date printed on the document. The period covered is what it applies to, such as the month of an eligibility letter or the dates of an authorization.</p>
      <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(Array.from(e.dataTransfer.files)); }} style={{ padding: 16, border: '1px dashed #94a3b8', margin: '12px 0' }}>
        <label style={label}>Choose documents or photos <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx" onChange={(e) => { add(Array.from(e.target.files || [])); e.target.value = ''; }} /></label>
      </div>
      {rows.map((r) => <fieldset disabled={r.status === 'uploaded' || busy} key={r.id} style={{ border: '1px solid #dbe2ea', borderRadius: 8, margin: '10px 0', padding: 12 }}>
        <legend>{r.file.name}</legend>
        <label style={label}>Title <input aria-label={`Title for ${r.file.name}`} style={input} value={r.title} maxLength={200} onChange={(e) => patch(r.id, { title: e.target.value })} /></label>{' '}
        <label style={label}>Category <select aria-label={`Category for ${r.file.name}`} style={select} value={r.category} onChange={(e) => patch(r.id, { category: e.target.value as DocCategory })}>{DOC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>{' '}
        <label style={label}>Date (MM/DD/YYYY) <input aria-label={`Date for ${r.file.name}`} type="text" placeholder="MM/DD/YYYY" inputMode="numeric" style={input} value={r.docDate} onChange={(e) => patch(r.id, { docDate: e.target.value })} /></label>{' '}
        <DocumentPeriodFields draft={r.period} onChange={(next) => patch(r.id, { period: next })} name={r.file.name} labelStyle={label} inputStyle={input} selectStyle={select} />
        <p role="status">{r.status === 'uploaded' ? 'Uploaded' : r.status === 'uploading' ? `Uploading ${progress}%` : r.status === 'failed' ? `Failed: ${r.error}` : 'Ready'}</p>
        {r.status !== 'uploaded' && <button type="button" className={btn} onClick={() => setRows((current) => current.filter((x) => x.id !== r.id))}>Remove</button>}
      </fieldset>)}
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
      <button className={btn} disabled={busy} type="button" onClick={onClose}>Close</button>
      <button className={btnPrimary} disabled={busy || !rows.some((r) => r.status !== 'uploaded')} type="button" onClick={() => void save()}>{busy ? 'Uploading…' : 'Upload pending files'}</button>
    </div>
  </div>;
}
const label: CSSProperties = { display: 'inline-grid', gap: 5, margin: '8px 12px 8px 0', maxWidth: '100%', verticalAlign: 'top' };
const input: CSSProperties = { padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, maxWidth: '100%', font: 'inherit', boxSizing: 'border-box' };
const select: CSSProperties = withSelectChevron(input);
const hint: CSSProperties = { fontSize: 12.5, color: '#64748b', margin: '6px 0 0', lineHeight: 1.5 };
