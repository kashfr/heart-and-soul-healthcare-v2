'use client';

import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { Archive, ArchiveRestore, ExternalLink, FileText, FileUp, Image as ImageIcon } from 'lucide-react';
import {
  ALLOWED_DOC_TYPES,
  DOC_CATEGORIES,
  getDocumentUrl,
  setDocumentArchived,
  uploadPatientDocument,
  type DocCategory,
  type DocUploader,
  type PatientDocument,
} from '@/lib/patientDocuments';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  patientId: string;
  documents: PatientDocument[];
  canUpload: boolean;
  isStaff: boolean; // archive/restore rights + archived visibility
  uploader: DocUploader;
  onChanged: () => void; // re-fetch after upload/archive
  onToast: (msg: string) => void;
}

/**
 * The dashboard's Documents section (phase 3): categorized uploads (plan of
 * care, initial assessment, supervisory visits, physician orders, scans) with
 * view + staff-only archive. Files are immutable and never hard-deleted; an
 * archived document just leaves the default list (staff can show it again).
 */
export default function DocumentsSection({
  patientId,
  documents,
  canUpload,
  isStaff,
  uploader,
  onChanged,
  onToast,
}: Props) {
  const [filter, setFilter] = useState<string>('All');
  const [showArchived, setShowArchived] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(() => {
    return documents
      .filter((d) => (showArchived ? true : !d.archived))
      .filter((d) => filter === 'All' || d.category === filter);
  }, [documents, filter, showArchived]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of documents) {
      if (d.archived) continue;
      map.set(d.category, (map.get(d.category) || 0) + 1);
    }
    return map;
  }, [documents]);

  const view = async (d: PatientDocument) => {
    try {
      const url = await getDocumentUrl(d);
      window.open(url, '_blank', 'noopener');
    } catch {
      onToast('Could not open the document. Please try again.');
    }
  };

  const toggleArchived = async (d: PatientDocument) => {
    if (!d.id) return;
    setBusyId(d.id);
    try {
      await setDocumentArchived(d.id, !d.archived, { uid: uploader.uid, name: uploader.name });
      onToast(d.archived ? 'Document restored.' : 'Document archived (the file is kept).');
      onChanged();
    } catch {
      onToast('Could not update the document. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div style={toolbarStyle}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {['All', ...DOC_CATEGORIES].map((c) => (
            <button key={c} type="button" onClick={() => setFilter(c)} style={filter === c ? chipActiveStyle : chipStyle}>
              {c}
              {c !== 'All' && counts.get(c) ? ` (${counts.get(c)})` : ''}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {isStaff && documents.some((d) => d.archived) && (
            <label style={archToggleStyle}>
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived
            </label>
          )}
          {canUpload && (
            <button type="button" onClick={() => setUploadOpen(true)} style={uploadBtnStyle}>
              <FileUp size={15} /> Upload
            </button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div style={emptyStyle}>
          {documents.filter((d) => !d.archived).length === 0
            ? 'No documents on file yet. Upload the plan of care, initial assessment, and supervisory visit forms so they travel with the record.'
            : 'No documents match this filter.'}
        </div>
      ) : (
        <ul style={listStyle}>
          {visible.map((d) => (
            <li key={d.id} style={{ ...rowStyle, opacity: d.archived ? 0.55 : 1 }}>
              <span style={docIconStyle}>
                {d.contentType.startsWith('image/') ? <ImageIcon size={15} /> : <FileText size={15} />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={docTitleStyle}>
                  {d.title}
                  {d.archived && <span style={archivedChipStyle}>Archived</span>}
                </div>
                <div style={docMetaStyle}>
                  <span style={categoryChipStyle}>{d.category}</span>
                  {d.docDate ? ` ${fmtDate(d.docDate)}` : ''}
                  {` · ${ALLOWED_DOC_TYPES[d.contentType] || 'File'}`}
                  {d.size ? ` · ${fmtSize(d.size)}` : ''}
                  {d.uploadedByName ? ` · uploaded by ${d.uploadedByName}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button type="button" onClick={() => view(d)} style={actionBtnStyle} title="Open in a new tab">
                  <ExternalLink size={14} /> View
                </button>
                {isStaff && (
                  <button
                    type="button"
                    onClick={() => toggleArchived(d)}
                    disabled={busyId === d.id}
                    style={actionBtnStyle}
                    title={d.archived ? 'Restore to the active list' : 'Archive (the file is kept)'}
                  >
                    {d.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                    {d.archived ? ' Restore' : ' Archive'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {uploadOpen && (
        <UploadDocumentModal
          patientId={patientId}
          uploader={uploader}
          onClose={() => setUploadOpen(false)}
          onUploaded={(title) => {
            onToast(`Uploaded "${title}".`);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function UploadDocumentModal({
  patientId,
  uploader,
  onClose,
  onUploaded,
}: {
  patientId: string;
  uploader: DocUploader;
  onClose: () => void;
  onUploaded: (title: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<DocCategory | ''>('');
  const [title, setTitle] = useState('');
  const [docDate, setDocDate] = useState(todayISO());
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const pickFile = (f: File | null) => {
    setFile(f);
    if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''));
    setError(null);
  };

  const save = async () => {
    if (!file) {
      setError('Choose a file to upload.');
      return;
    }
    if (!category) {
      setError('Choose a document category.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(docDate)) {
      setError('Enter the date on the document.');
      return;
    }
    setError(null);
    setPct(0);
    try {
      await uploadPatientDocument(
        { patientId, file, category, title, docDate, uploader },
        (p) => setPct(p),
      );
      onUploaded(title.trim() || file.name);
      onClose();
    } catch (err) {
      setPct(null);
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    }
  };

  const uploading = pct !== null;

  return (
    <div style={backdropStyle} role="dialog" aria-modal="true" aria-label="Upload a document">
      <div style={sheetStyle}>
        <div style={sheetTitleStyle}>Upload a document</div>

        <button
          type="button"
          style={dropZoneStyle}
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pickFile(e.dataTransfer.files?.[0] || null);
          }}
        >
          <FileUp size={20} color="#5c6b7a" />
          {file ? (
            <span style={{ fontWeight: 600, color: '#1f2937' }}>{file.name}</span>
          ) : (
            <span style={{ color: '#5c6b7a' }}>Click to choose a file (or drop one here)</span>
          )}
          <span style={dropHintStyle}>PDF, image, or Word document · 20 MB max</span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={Object.keys(ALLOWED_DOC_TYPES).join(',')}
          style={{ display: 'none' }}
          onChange={(e) => pickFile(e.target.files?.[0] || null)}
        />

        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>Category *</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as DocCategory)} style={selectStyle}>
            <option value="">Select a category…</option>
            {DOC_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <div style={grid2Style}>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Date on the document *</span>
            <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} style={inputStyle} />
            <span style={hintStyle}>Drives the currency tracking (e.g. the supervisory visit date, the plan-of-care start date).</span>
          </label>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Title</span>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="Defaults to the file name" />
          </label>
        </div>

        {uploading && (
          <div style={progressWrapStyle}>
            <div style={{ ...progressBarStyle, width: `${pct}%` }} />
            <span style={progressTextStyle}>{pct}%</span>
          </div>
        )}
        {error && <div style={errBoxStyle}>{error}</div>}

        <div style={actionsStyle}>
          <button type="button" style={cancelBtnStyle} onClick={onClose} disabled={uploading}>
            Cancel
          </button>
          <button type="button" style={saveBtnStyle} onClick={save} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}

const NAVY = '#1a3a5c';
const toolbarStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 12 };
const chipStyle: CSSProperties = { padding: '4px 10px', borderRadius: 999, border: '1px solid #d0d7de', background: 'white', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const chipActiveStyle: CSSProperties = { ...chipStyle, background: NAVY, color: 'white', border: `1px solid ${NAVY}` };
const archToggleStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#5c6b7a', cursor: 'pointer' };
const uploadBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0e7c4a', color: 'white', border: 'none', padding: '7px 13px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const emptyStyle: CSSProperties = { padding: '20px 14px', color: '#7f8c8d', fontSize: 13, textAlign: 'center', background: '#f8fafc', borderRadius: 8, lineHeight: 1.5 };
const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 };
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 10 };
const docIconStyle: CSSProperties = { width: 30, height: 30, borderRadius: 8, background: '#e8eef4', color: NAVY, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const docTitleStyle: CSSProperties = { fontWeight: 600, fontSize: 13.5, color: '#1f2937', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const docMetaStyle: CSSProperties = { fontSize: 12, color: '#7f8c8d', marginTop: 2 };
const categoryChipStyle: CSSProperties = { display: 'inline-block', padding: '1px 8px', borderRadius: 999, background: '#e8eef4', color: NAVY, fontSize: 10.5, fontWeight: 700 };
const archivedChipStyle: CSSProperties = { display: 'inline-block', padding: '1px 8px', borderRadius: 999, background: '#f1f5f9', color: '#64748b', fontSize: 10.5, fontWeight: 700 };
const actionBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'white', color: '#2c3e50', border: '1px solid #d0d7de', padding: '6px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' };
const backdropStyle: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 3200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8vh 16px', overflowY: 'auto' };
const sheetStyle: CSSProperties = { width: '100%', maxWidth: 520, background: 'white', borderRadius: 12, padding: 18, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' };
const sheetTitleStyle: CSSProperties = { fontWeight: 700, fontSize: 17, color: '#1f2937', marginBottom: 12 };
const dropZoneStyle: CSSProperties = { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '22px 14px', border: '1.5px dashed #b8c4cf', borderRadius: 10, background: '#f8fafc', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, marginBottom: 14 };
const dropHintStyle: CSSProperties = { fontSize: 11.5, color: '#8a949e' };
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12, minWidth: 0 };
const fieldLabelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#5c6b7a' };
const inputStyle: CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', height: 38 };
const selectStyle: CSSProperties = { ...inputStyle, cursor: 'pointer' };
const hintStyle: CSSProperties = { fontSize: 11.5, color: '#8a949e', lineHeight: 1.4 };
const grid2Style: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 };
const progressWrapStyle: CSSProperties = { position: 'relative', height: 22, background: '#eef1f4', borderRadius: 999, overflow: 'hidden', marginBottom: 10 };
const progressBarStyle: CSSProperties = { position: 'absolute', inset: 0, width: 0, background: '#0e7c4a', transition: 'width 200ms ease' };
const progressTextStyle: CSSProperties = { position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 11.5, fontWeight: 700, color: '#1f2937' };
const errBoxStyle: CSSProperties = { background: '#fdeaea', color: '#b3261e', borderRadius: 6, padding: '8px 11px', fontSize: 13, marginBottom: 10 };
const actionsStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 };
const cancelBtnStyle: CSSProperties = { background: 'white', color: '#374151', border: '1px solid #d0d7de', padding: '9px 16px', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const saveBtnStyle: CSSProperties = { background: NAVY, color: 'white', border: `1px solid ${NAVY}`, padding: '9px 16px', borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
