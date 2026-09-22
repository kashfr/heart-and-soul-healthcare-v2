'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { Archive, ArchiveRestore, ArrowRightLeft, ExternalLink, FileText, FileUp, Image as ImageIcon, Pencil, RefreshCw, Replace, Trash2 } from 'lucide-react';
import { applyFieldErrors, FieldError, FIELD_ERROR_STYLE, FIELD_ERROR_WRAP_STYLE } from '@/lib/formEscort';
import { withSelectChevron } from '@/lib/selectChevron';
import {
  ALLOWED_DOC_TYPES,
  CORE_DOC_CATEGORIES,
  DOC_CATEGORIES,
  DOC_CATEGORY_GROUPS,
  deletePatientDocument,
  getDocumentBlob,
  movePatientDocument,
  renderDocumentInWindow,
  replaceDocumentFile,
  setDocumentArchived,
  syncNoteDocuments,
  updateDocumentDetails,
  uploadPatientDocument,
  type DocCategory,
  type DocUploader,
  type PatientDocument,
} from '@/lib/patientDocuments';
import { getPatients, type Patient } from '@/lib/patients';

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
  isStaff: boolean; // archive/restore/edit/replace rights + archived visibility
  /** Hard delete (privileged route). Never while previewing another user's view. */
  isAdmin: boolean;
  uploader: DocUploader;
  onChanged: () => void; // re-fetch after upload/archive
  onToast: (msg: string) => void;
}

/**
 * The dashboard's Documents section (phase 3): categorized uploads (plan of
 * care, initial assessment, supervisory visits, physician orders, scans) with
 * view, staff edit / replace / archive, and admin delete. RN oversight visit
 * notes file themselves here (autoFiled + sourceNoteId); Sync backfills any
 * that were submitted before that existed or whose filing failed.
 */
export default function DocumentsSection({
  patientId,
  documents,
  canUpload,
  isStaff,
  isAdmin,
  uploader,
  onChanged,
  onToast,
}: Props) {
  const [filter, setFilter] = useState<string>('All');
  const [showArchived, setShowArchived] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<PatientDocument | null>(null);
  const [replacing, setReplacing] = useState<PatientDocument | null>(null);
  const [moving, setMoving] = useState<PatientDocument | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

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

  // Filter chips: the compliance checklist categories always, plus any other
  // category this client has documents in (catalog order, unknown legacy
  // names last), so the row stays readable now that the catalog is long.
  const chipCategories = useMemo(() => {
    const present = new Set(documents.map((d) => d.category));
    const ordered = DOC_CATEGORIES.filter((c) => CORE_DOC_CATEGORIES.includes(c) || present.has(c));
    const legacy = Array.from(present).filter((c) => !(DOC_CATEGORIES as readonly string[]).includes(c)).sort();
    return [...ordered, ...legacy];
  }, [documents]);

  const view = async (d: PatientDocument) => {
    // Open the tab SYNCHRONOUSLY inside the click gesture — after the awaited
    // fetch, browsers treat window.open as an unsolicited popup and silently
    // block it. (No 'noopener' feature flag: that makes window.open return
    // null; we sever the link manually instead.)
    const w = window.open('', '_blank');
    if (!w) {
      onToast('Your browser blocked the document tab. Allow popups for this site to view documents.');
      return;
    }
    w.opener = null;
    try {
      const content = await getDocumentBlob(d);
      // Build the viewer INSIDE the popup rather than navigating it — Safari
      // silently refuses to navigate an about:blank popup to a blob: URL
      // (blank tab, no error), while writing into the same-origin popup
      // document renders in every engine.
      renderDocumentInWindow(w, content, d);
    } catch {
      w.close();
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

  const remove = async (d: PatientDocument) => {
    if (!d.id || !isAdmin) return;
    const what = d.autoFiled
      ? `Delete "${d.title}"?\n\nThis is the PDF filed from an oversight note. The note itself stays; Sync would file it again. The file and its entry are removed (a snapshot is kept in the deletion audit).`
      : `Delete "${d.title}"?\n\nThe file and its entry are permanently removed from this client's documents (a snapshot is kept in the deletion audit). This cannot be undone.`;
    if (!window.confirm(what)) return;
    setBusyId(d.id);
    try {
      await deletePatientDocument(d.id);
      onToast(`Deleted "${d.title}".`);
      onChanged();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not delete the document.');
    } finally {
      setBusyId(null);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await syncNoteDocuments(patientId);
      onToast(
        r.filed > 0
          ? `Filed ${r.filed} oversight ${r.filed === 1 ? 'note' : 'notes'}${r.skipped ? ` (${r.skipped} already on file)` : ''}.`
          : r.errors.length
            ? `Nothing filed: ${r.errors[0]}`
            : r.skipped
              ? `All ${r.skipped} oversight ${r.skipped === 1 ? 'note is' : 'notes are'} already on file.`
              : 'No oversight notes to file for this client.',
      );
      if (r.filed > 0) onChanged();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not sync the notes.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <div style={toolbarStyle}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {['All', ...chipCategories].map((c) => (
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
          {isStaff && (
            <button
              type="button"
              onClick={sync}
              disabled={syncing}
              style={actionBtnStyle}
              title="File any RN oversight visit notes for this client that are not in Documents yet"
            >
              <RefreshCw size={14} /> {syncing ? 'Syncing…' : 'Sync RN oversight notes'}
            </button>
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
                  {d.autoFiled && (
                    <span style={autoChipStyle} title="Filed automatically from the submitted note; re-filed when the note is amended">
                      From note
                    </span>
                  )}
                  {d.archived && <span style={archivedChipStyle}>Archived</span>}
                </div>
                <div style={docMetaStyle}>
                  <span style={categoryChipStyle}>{d.category}</span>
                  {d.docDate ? ` ${fmtDate(d.docDate)}` : ''}
                  {` · ${ALLOWED_DOC_TYPES[d.contentType] || 'File'}`}
                  {d.size ? ` · ${fmtSize(d.size)}` : ''}
                  {d.uploadedByName ? ` · ${d.autoFiled ? 'documented' : 'uploaded'} by ${d.uploadedByName}` : ''}
                  {d.replacedByName ? ` · file replaced by ${d.replacedByName}` : ''}
                  {d.movedByName ? ` · moved here by ${d.movedByName}` : ''}
                  {d.sourceNoteId && (
                    <>
                      {' · '}
                      <Link href={`/admin/submissions/${d.sourceNoteId}`} style={{ color: NAVY, fontWeight: 600 }}>
                        Open note
                      </Link>
                    </>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => view(d)} style={actionBtnStyle} title="Open in a new tab">
                  <ExternalLink size={14} /> View
                </button>
                {isStaff && (
                  <button type="button" onClick={() => setEditing(d)} disabled={busyId === d.id} style={actionBtnStyle} title="Edit the title, category, or date">
                    <Pencil size={14} /> Edit
                  </button>
                )}
                {isStaff && !d.autoFiled && (
                  <button type="button" onClick={() => setReplacing(d)} disabled={busyId === d.id} style={actionBtnStyle} title="Upload a different file in place of this one (the old file is removed)">
                    <Replace size={14} /> Replace
                  </button>
                )}
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
                {isAdmin && !d.autoFiled && (
                  <button type="button" onClick={() => setMoving(d)} disabled={busyId === d.id} style={actionBtnStyle} title="Move this document to another client's chart (uploaded to the wrong client)">
                    <ArrowRightLeft size={14} /> Move
                  </button>
                )}
                {isAdmin && (
                  <button type="button" onClick={() => remove(d)} disabled={busyId === d.id} style={{ ...actionBtnStyle, color: '#b3261e', borderColor: '#f3b8b8' }} title="Permanently delete this document (admin only)">
                    <Trash2 size={14} /> Delete
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
      {editing && (
        <EditDocumentModal
          document={editing}
          onClose={() => setEditing(null)}
          onSaved={(title) => {
            onToast(`Updated "${title}".`);
            onChanged();
          }}
        />
      )}
      {moving && (
        <MoveDocumentModal
          document={moving}
          currentPatientId={patientId}
          onClose={() => setMoving(null)}
          onMoved={(title, toName) => {
            onToast(`Moved "${title}" to ${toName}.`);
            onChanged();
          }}
        />
      )}
      {replacing && (
        <ReplaceDocumentModal
          document={replacing}
          actor={{ uid: uploader.uid, name: uploader.name }}
          onClose={() => setReplacing(null)}
          onReplaced={(title) => {
            onToast(`Replaced the file behind "${title}".`);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

/** The grouped category list for every category <select> on this tab. */
function CategoryOptions() {
  return (
    <>
      {DOC_CATEGORY_GROUPS.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

type EditField = 'title' | 'category' | 'docDate';
const EDIT_FIELD_ORDER: readonly EditField[] = ['title', 'category', 'docDate'];
const editFieldId = (k: EditField) => `doc-edit-${k}`;

/** Staff relabel: title, category, date. The file is untouched. */
function EditDocumentModal({
  document: d,
  onClose,
  onSaved,
}: {
  document: PatientDocument;
  onClose: () => void;
  onSaved: (title: string) => void;
}) {
  const [title, setTitle] = useState(d.title);
  const [category, setCategory] = useState<DocCategory | ''>((DOC_CATEGORIES as readonly string[]).includes(d.category) ? (d.category as DocCategory) : '');
  const [docDate, setDocDate] = useState(d.docDate || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<EditField, string>>>({});

  const save = async () => {
    if (saving || !d.id) return;
    const errs: Partial<Record<EditField, string>> = {};
    if (!title.trim()) errs.title = 'Enter a title.';
    if (!category) errs.category = 'Choose a document category.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(docDate)) errs.docDate = 'Enter the date on the document.';
    if (!applyFieldErrors(errs, EDIT_FIELD_ORDER, setFieldErrors, editFieldId)) return;
    if (!category) return;
    setSaving(true);
    setError(null);
    try {
      await updateDocumentDetails(d.id, { title, category, docDate });
      onSaved(title.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the changes.');
      setSaving(false);
    }
  };

  return (
    <div style={backdropStyle} role="dialog" aria-modal="true" aria-label="Edit document details">
      <div style={sheetStyle}>
        <div style={sheetTitleStyle}>Edit document details</div>
        <div style={{ ...hintStyle, marginBottom: 12 }}>File: {d.fileName}</div>
        <label style={fieldStyle} id={editFieldId('title')}>
          <span style={fieldLabelStyle}>Title *</span>
          <input
            type="text"
            value={title}
            onChange={(e) => { setTitle(e.target.value); if (fieldErrors.title) setFieldErrors((f) => ({ ...f, title: undefined })); }}
            style={{ ...inputStyle, ...(fieldErrors.title ? FIELD_ERROR_STYLE : null) }}
            aria-invalid={!!fieldErrors.title}
          />
          <FieldError message={fieldErrors.title} />
        </label>
        <label style={fieldStyle} id={editFieldId('category')}>
          <span style={fieldLabelStyle}>Category *</span>
          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value as DocCategory); if (fieldErrors.category) setFieldErrors((f) => ({ ...f, category: undefined })); }}
            style={{ ...selectStyle, ...(fieldErrors.category ? FIELD_ERROR_STYLE : null) }}
            aria-invalid={!!fieldErrors.category}
          >
            <option value="">Select a category…</option>
            <CategoryOptions />
          </select>
          <FieldError message={fieldErrors.category} />
        </label>
        <label style={fieldStyle} id={editFieldId('docDate')}>
          <span style={fieldLabelStyle}>Date on the document *</span>
          <input
            type="date"
            value={docDate}
            onChange={(e) => { setDocDate(e.target.value); if (fieldErrors.docDate) setFieldErrors((f) => ({ ...f, docDate: undefined })); }}
            style={{ ...inputStyle, ...(fieldErrors.docDate ? FIELD_ERROR_STYLE : null) }}
            aria-invalid={!!fieldErrors.docDate}
          />
          <FieldError message={fieldErrors.docDate} />
        </label>
        {error && <div style={errBoxStyle}>{error}</div>}
        <div style={actionsStyle}>
          <button type="button" style={cancelBtnStyle} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" style={saveBtnStyle} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}

/** Admin: move a document uploaded to the wrong client. Title/date/category can be corrected on the way. */
function MoveDocumentModal({
  document: d,
  currentPatientId,
  onClose,
  onMoved,
}: {
  document: PatientDocument;
  currentPatientId: string;
  onClose: () => void;
  onMoved: (title: string, toName: string) => void;
}) {
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [toPatientId, setToPatientId] = useState('');
  const [title, setTitle] = useState(d.title);
  const [category, setCategory] = useState<DocCategory | ''>((DOC_CATEGORIES as readonly string[]).includes(d.category) ? (d.category as DocCategory) : '');
  const [docDate, setDocDate] = useState(d.docDate || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPatients().then((list) => { if (!cancelled) setPatients(list.filter((p) => p.id !== currentPatientId)); });
    return () => { cancelled = true; };
  }, [currentPatientId]);

  const target = patients?.find((p) => p.id === toPatientId) || null;

  const save = async () => {
    if (saving || !d.id) return;
    if (!toPatientId) { setError('Choose the client this document belongs to.'); return; }
    if (!title.trim()) { setError('Enter a title.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(docDate)) { setError('Enter the date on the document.'); return; }
    if (!window.confirm(`Move "${title.trim()}" to ${target?.name || 'the selected client'}?\n\nIt disappears from this client's documents and appears on theirs. The original entry is recorded in the deletion audit.`)) return;
    setSaving(true);
    setError(null);
    try {
      await movePatientDocument(d.id, toPatientId, { title: title.trim(), docDate, ...(category ? { category } : {}) });
      onMoved(title.trim(), target?.name || 'the other client');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not move the document.');
      setSaving(false);
    }
  };

  return (
    <div style={backdropStyle} role="dialog" aria-modal="true" aria-label="Move document to another client">
      <div style={sheetStyle}>
        <div style={sheetTitleStyle}>Move to another client</div>
        <div style={{ ...hintStyle, marginBottom: 12 }}>File: {d.fileName}. Fix the title, category, or date at the same time if they were wrong too.</div>
        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>Move to *</span>
          <select value={toPatientId} onChange={(e) => { setToPatientId(e.target.value); setError(null); }} style={selectStyle} disabled={!patients}>
            <option value="">{patients ? 'Select a client…' : 'Loading clients…'}</option>
            {(patients || []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.mrn ? ` (#${p.mrn})` : ''}</option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>Title *</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
        </label>
        <div style={grid2Style}>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as DocCategory)} style={selectStyle}>
              <option value="">Keep current</option>
              <CategoryOptions />
            </select>
          </label>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Date on the document *</span>
            <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} style={inputStyle} />
          </label>
        </div>
        {error && <div style={errBoxStyle}>{error}</div>}
        <div style={actionsStyle}>
          <button type="button" style={cancelBtnStyle} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" style={saveBtnStyle} onClick={save} disabled={saving || !patients}>{saving ? 'Moving…' : 'Move document'}</button>
        </div>
      </div>
    </div>
  );
}

/** Staff: swap the file behind a document. Labeling stays; the old file is removed server-side. */
function ReplaceDocumentModal({
  document: d,
  actor,
  onClose,
  onReplaced,
}: {
  document: PatientDocument;
  actor: { uid: string; name: string };
  onClose: () => void;
  onReplaced: (title: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploading = pct !== null;

  const save = async () => {
    if (uploading) return;
    if (!file) { setError('Choose the file to upload in its place.'); return; }
    setError(null);
    setPct(0);
    try {
      await replaceDocumentFile(d, file, actor, (p) => setPct(p));
      onReplaced(d.title);
      onClose();
    } catch (err) {
      setPct(null);
      setError(err instanceof Error ? err.message : 'Replace failed. Please try again.');
    }
  };

  return (
    <div style={backdropStyle} role="dialog" aria-modal="true" aria-label="Replace the document file">
      <div style={sheetStyle}>
        <div style={sheetTitleStyle}>Replace the file</div>
        <div style={{ ...hintStyle, marginBottom: 12 }}>
          “{d.title}” keeps its title, category, and date. The current file ({d.fileName}) is removed once the new one is uploaded.
        </div>
        <button
          type="button"
          style={{ ...dropZoneStyle, ...(error && !file ? FIELD_ERROR_WRAP_STYLE : null) }}
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); setFile(e.dataTransfer.files?.[0] || null); setError(null); }}
        >
          <FileUp size={20} color="#5c6b7a" />
          {file ? <span style={{ fontWeight: 600, color: '#1f2937' }}>{file.name}</span> : <span style={{ color: '#5c6b7a' }}>Click to choose the new file (or drop it here)</span>}
          <span style={dropHintStyle}>PDF, image, or Word document · 20 MB max</span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={Object.keys(ALLOWED_DOC_TYPES).join(',')}
          style={{ display: 'none' }}
          onChange={(e) => { setFile(e.target.files?.[0] || null); setError(null); }}
        />
        {uploading && (
          <div style={progressWrapStyle}>
            <div style={{ ...progressBarStyle, width: `${pct}%` }} />
            <span style={progressTextStyle}>{pct}%</span>
          </div>
        )}
        {error && <div style={errBoxStyle}>{error}</div>}
        <div style={actionsStyle}>
          <button type="button" style={cancelBtnStyle} onClick={onClose} disabled={uploading}>Cancel</button>
          <button type="button" style={saveBtnStyle} onClick={save} disabled={uploading}>{uploading ? 'Uploading…' : 'Replace file'}</button>
        </div>
      </div>
    </div>
  );
}

type UploadField = 'file' | 'category' | 'docDate';
const UPLOAD_FIELD_ORDER: readonly UploadField[] = ['file', 'category', 'docDate'];
const uploadFieldId = (k: UploadField) => `doc-upload-${k}`;

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
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<UploadField, string>>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  const clearFieldError = (k: UploadField) => {
    if (fieldErrors[k]) setFieldErrors((e) => ({ ...e, [k]: undefined }));
  };

  const pickFile = (f: File | null) => {
    setFile(f);
    if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''));
    setError(null);
    if (f) clearFieldError('file');
  };

  const save = async () => {
    if (pct !== null) return;
    const errs: Partial<Record<UploadField, string>> = {};
    if (!file) errs.file = 'Choose a file to upload.';
    if (!category) errs.category = 'Choose a document category.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(docDate)) errs.docDate = 'Enter the date on the document.';
    if (!applyFieldErrors(errs, UPLOAD_FIELD_ORDER, setFieldErrors, uploadFieldId)) return;
    if (!file || !category) return;
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
          id={uploadFieldId('file')}
          style={{ ...dropZoneStyle, ...(fieldErrors.file ? FIELD_ERROR_WRAP_STYLE : null) }}
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
        <FieldError message={fieldErrors.file} />
        <input
          ref={fileInput}
          type="file"
          accept={Object.keys(ALLOWED_DOC_TYPES).join(',')}
          style={{ display: 'none' }}
          onChange={(e) => pickFile(e.target.files?.[0] || null)}
        />

        <label style={fieldStyle} id={uploadFieldId('category')}>
          <span style={fieldLabelStyle}>Category *</span>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as DocCategory);
              clearFieldError('category');
            }}
            style={{ ...selectStyle, ...(fieldErrors.category ? FIELD_ERROR_STYLE : null) }}
            aria-invalid={!!fieldErrors.category}
          >
            <option value="">Select a category…</option>
            <CategoryOptions />
          </select>
          <FieldError message={fieldErrors.category} />
        </label>

        <div style={grid2Style}>
          <label style={fieldStyle} id={uploadFieldId('docDate')}>
            <span style={fieldLabelStyle}>Date on the document *</span>
            <input
              type="date"
              value={docDate}
              onChange={(e) => {
                setDocDate(e.target.value);
                clearFieldError('docDate');
              }}
              style={{ ...inputStyle, ...(fieldErrors.docDate ? FIELD_ERROR_STYLE : null) }}
              aria-invalid={!!fieldErrors.docDate}
            />
            <FieldError message={fieldErrors.docDate} />
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
const autoChipStyle: CSSProperties = { display: 'inline-block', padding: '1px 8px', borderRadius: 999, background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe', fontSize: 10.5, fontWeight: 700 };
const actionBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'white', color: '#2c3e50', border: '1px solid #d0d7de', padding: '6px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' };
const backdropStyle: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 3200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8vh 16px', overflowY: 'auto' };
const sheetStyle: CSSProperties = { width: '100%', maxWidth: 520, background: 'white', borderRadius: 12, padding: 18, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' };
const sheetTitleStyle: CSSProperties = { fontWeight: 700, fontSize: 17, color: '#1f2937', marginBottom: 12 };
const dropZoneStyle: CSSProperties = { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '22px 14px', border: '1.5px dashed #b8c4cf', borderRadius: 10, background: '#f8fafc', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, marginBottom: 14 };
const dropHintStyle: CSSProperties = { fontSize: 11.5, color: '#8a949e' };
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12, minWidth: 0 };
const fieldLabelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#5c6b7a' };
const inputStyle: CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', height: 38 };
const selectStyle: CSSProperties = withSelectChevron(inputStyle);
const hintStyle: CSSProperties = { fontSize: 11.5, color: '#8a949e', lineHeight: 1.4 };
const grid2Style: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 };
const progressWrapStyle: CSSProperties = { position: 'relative', height: 22, background: '#eef1f4', borderRadius: 999, overflow: 'hidden', marginBottom: 10 };
const progressBarStyle: CSSProperties = { position: 'absolute', inset: 0, width: 0, background: '#0e7c4a', transition: 'width 200ms ease' };
const progressTextStyle: CSSProperties = { position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 11.5, fontWeight: 700, color: '#1f2937' };
const errBoxStyle: CSSProperties = { background: '#fdeaea', color: '#b3261e', borderRadius: 6, padding: '8px 11px', fontSize: 13, marginBottom: 10 };
const actionsStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 };
const cancelBtnStyle: CSSProperties = { background: 'white', color: '#374151', border: '1px solid #d0d7de', padding: '9px 16px', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const saveBtnStyle: CSSProperties = { background: NAVY, color: 'white', border: `1px solid ${NAVY}`, padding: '9px 16px', borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
