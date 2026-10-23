'use client';
import { useState, type CSSProperties } from 'react';
import { formatUSDateInput, parseUSDate } from '@/lib/usDateInput';
import { DOC_CATEGORIES, type DocCategory } from '@/lib/docCategories';
import { EMPTY_PERIOD_DRAFT, resolvePeriodDraft, type DocumentPeriodDraft } from '@/lib/documentPeriod';
import { withSelectChevron } from '@/lib/selectChevron';
import { btn, btnPrimary, btnSm } from './buttons';
import DocumentPeriodFields from './DocumentPeriodFields';
/** periodStart/periodEnd are ISO, or '' when the file is not tied to a period. */
export type DocumentUploadItem = { id: string; file: File; title: string; category: DocCategory; docDate: string; periodStart: string; periodEnd: string };
type Row = Omit<DocumentUploadItem, 'periodStart' | 'periodEnd'> & { period: DocumentPeriodDraft; status: 'ready' | 'uploading' | 'uploaded' | 'failed'; error?: string };
/**
 * One compact card per file: title, category, date, and the period covered.
 * There is no separate "defaults" block: a newly chosen file inherits the
 * previous file's category, date and period (a batch is usually alike), and
 * with several files each card offers "Apply to all files" for its labeling.
 */
export default function BulkDocumentUpload({ upload, onClose, onComplete }: { upload: (item: DocumentUploadItem, progress: (pct: number) => void) => Promise<void>; onClose: () => void; onComplete?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const patch = (id: string, update: Partial<Row>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...update } : row));
  const add = (files: File[]) => {
    if (busy) return;
    if (rows.length + files.length > 20) { setError('Choose up to 20 files per batch.'); return; }
    const bad = files.find((file) => !file.size || file.size >= 20 * 1024 * 1024 || !/\.(pdf|jpe?g|png|heic|docx?)$/i.test(file.name));
    if (bad) { setError(`${bad.name}: choose a nonempty PDF, JPEG, PNG, HEIC, or Word file under 20 MB.`); return; }
    setError('');
    setRows((current) => {
      const last = current[current.length - 1];
      const seed = last ? { category: last.category, docDate: last.docDate, period: last.period } : { category: 'Other' as DocCategory, docDate: new Date().toLocaleDateString('en-US'), period: EMPTY_PERIOD_DRAFT };
      return [...current, ...files.map((file): Row => ({ id: crypto.randomUUID(), file, title: file.name.replace(/\.[^.]+$/, ''), ...seed, status: 'ready' }))];
    });
  };
  const applyToAll = (from: Row) => setRows((current) => current.map((r) => r.status === 'uploaded' || r.id === from.id ? r : { ...r, category: from.category, docDate: from.docDate, period: from.period }));
  const save = async () => {
    if (busy) return;
    const pending = rows.filter((r) => r.status !== 'uploaded');
    if (!pending.length) return;
    if (pending.some((r) => !r.title.trim() || !parseUSDate(r.docDate))) { setError('Enter a title and valid document date for each file.'); return; }
    const resolved = pending.map((r) => ({ row: r, period: resolvePeriodDraft(r.period) }));
    const badPeriod = resolved.find((r) => !r.period.ok);
    if (badPeriod && !badPeriod.period.ok) { setError(`${badPeriod.row.file.name}: ${badPeriod.period.error}`); return; }
    setBusy(true); setError('');
    let failed = 0;
    for (const { row, period: resolvedPeriod } of resolved) {
      const covers = resolvedPeriod.ok ? resolvedPeriod.period : null;
      patch(row.id, { status: 'uploading', error: '' }); setProgress(0);
      try {
        await upload({ id: row.id, file: row.file, title: row.title, category: row.category, docDate: parseUSDate(row.docDate)!, periodStart: covers?.periodStart ?? '', periodEnd: covers?.periodEnd ?? '' }, setProgress);
        patch(row.id, { status: 'uploaded' });
      }
      catch (err) { failed++; patch(row.id, { status: 'failed', error: err instanceof Error ? err.message : 'Upload failed. Check the client’s Documents before retrying.' }); }
    }
    setBusy(false);
    onComplete?.();
    // Every file saved: close. Before this the modal stayed open on a small
    // "Uploaded" label with the button greyed out, which reads as a hang.
    // The caller's own confirmation (a toast or notice) reports the upload.
    if (!failed) { onClose(); return; }
    const saved = resolved.length - failed;
    setError(`${saved ? `${saved} uploaded, ` : ''}${failed} failed. Check the ${failed === 1 ? 'file' : 'files'} marked Failed below, then choose Upload pending files to retry.`);
  };
  const pending = rows.filter((r) => r.status !== 'uploaded').length;
  const several = pending > 1;
  return <div>
    <p style={intro}>Each file is saved separately with its own title, category, and date. Up to 20 files, under 20 MB each.</p>
    <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
      <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(Array.from(e.dataTransfer.files)); }} style={dropZone}>
        {/* The native input is hidden: it is cleared after each pick (so the
            same file can be chosen again), and the browser then printed "No
            files selected" beside a file that was in fact queued. The count
            below comes from our own list instead. */}
        <label className={`${btn} focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-600`} style={{ cursor: 'pointer' }}>
          {rows.length ? 'Add More Files' : 'Choose Files'}
          <input className="sr-only" aria-label="Choose documents or photos" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx" onChange={(e) => { add(Array.from(e.target.files || [])); e.target.value = ''; }} />
        </label>
        <span aria-live="polite" style={{ ...chosen, ...(pending ? { color: '#0e7c4a' } : null) }}>
          {pending ? `${pending} ${pending === 1 ? 'file' : 'files'} ready to upload` : rows.length ? 'Every file is uploaded' : 'No files chosen yet'}
        </span>
        <span style={dropHint}>or drag files here</span>
      </div>
      {rows.map((r) => <fieldset disabled={r.status === 'uploaded' || busy} key={r.id} style={card}>
        <div style={cardHead}>
          <span style={fileName}>{r.file.name}</span>
          <span role="status" style={{ ...status, ...(r.status === 'failed' ? { color: '#b3261e' } : r.status === 'uploaded' ? { color: '#0e7c4a' } : null) }}>
            {r.status === 'uploaded' ? 'Uploaded' : r.status === 'uploading' ? `Uploading ${progress}%` : r.status === 'failed' ? `Failed: ${r.error}` : ''}
          </span>
          {r.status !== 'uploaded' && <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            {several && <button type="button" className={`${btn} ${btnSm}`} title="Give every other file this category, date, and period" onClick={() => applyToAll(r)}>Apply to all files</button>}
            <button type="button" className={`${btn} ${btnSm}`} onClick={() => setRows((current) => current.filter((x) => x.id !== r.id))}>Remove</button>
          </span>}
        </div>
        <div style={grid}>
          <label style={{ ...label, ...titleCell }}>Title <input aria-label={`Title for ${r.file.name}`} style={input} value={r.title} maxLength={200} onChange={(e) => patch(r.id, { title: e.target.value })} /></label>
          <label style={{ ...label, ...categoryCell }}>Category <select aria-label={`Category for ${r.file.name}`} style={select} value={r.category} onChange={(e) => patch(r.id, { category: e.target.value as DocCategory })}>{DOC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label style={{ ...label, ...dateCell }}>Date on document <input aria-label={`Date for ${r.file.name}`} type="text" placeholder="MM/DD/YYYY" inputMode="numeric" maxLength={10} style={input} value={r.docDate} onChange={(e) => patch(r.id, { docDate: formatUSDateInput(e.target.value) })} /></label>
        </div>
        <div style={periodRow}>
          <DocumentPeriodFields draft={r.period} onChange={(next) => patch(r.id, { period: next })} name={r.file.name} labelStyle={label} inputStyle={{ ...input, width: 130 }} selectStyle={select} />
        </div>
      </fieldset>)}
    </fieldset>
    {error && <p role="alert" style={{ color: '#b3261e', margin: '10px 0 0' }}>{error}</p>}
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
      <button className={btn} disabled={busy} type="button" onClick={onClose}>Close</button>
      <button className={btnPrimary} disabled={busy || !rows.some((r) => r.status !== 'uploaded')} type="button" onClick={() => void save()}>{busy ? 'Uploading…' : 'Upload pending files'}</button>
    </div>
  </div>;
}
const intro: CSSProperties = { margin: '0 0 12px', color: '#475569', fontSize: 13.5, lineHeight: 1.5 };
const dropZone: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '14px 16px', border: '1.5px dashed #94a3b8', borderRadius: 10, background: '#f8fafc', margin: '0 0 12px' };
const dropHint: CSSProperties = { fontSize: 12.5, color: '#8a949e' };
const chosen: CSSProperties = { fontSize: 13.5, fontWeight: 600, color: '#475569' };
const card: CSSProperties = { border: '1px solid #dbe2ea', borderRadius: 10, margin: '10px 0 0', padding: '10px 12px 12px', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' };
const cardHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 };
const fileName: CSSProperties = { fontWeight: 700, fontSize: 13.5, color: '#1f2937', overflowWrap: 'anywhere' };
const status: CSSProperties = { fontSize: 12.5, color: '#64748b' };
// Title, category and date side by side when there is room; they wrap to
// full-width rows on a phone instead of pushing the card off screen.
const grid: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end' };
const titleCell: CSSProperties = { flex: '2 1 220px', minWidth: 0 };
const categoryCell: CSSProperties = { flex: '1.4 1 200px', minWidth: 0 };
const dateCell: CSSProperties = { flex: '0 1 140px', minWidth: 120 };
const periodRow: CSSProperties = { display: 'flex', alignItems: 'end', gap: 10, flexWrap: 'wrap', marginTop: 8 };
const label: CSSProperties = { display: 'grid', gap: 4, fontSize: 12, fontWeight: 600, color: '#5c6b7a', minWidth: 0 };
const input: CSSProperties = { padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 6, width: '100%', minWidth: 0, font: 'inherit', fontSize: 13.5, fontWeight: 400, color: '#1f2937', boxSizing: 'border-box' };
const select: CSSProperties = withSelectChevron(input);
