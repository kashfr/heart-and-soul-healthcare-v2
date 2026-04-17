'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { Download, X } from 'lucide-react';
import { getSubmissions, deleteSubmission, type SubmissionSummary } from '@/lib/submissions';
import {
  buildZip,
  buildMergedPdf,
  triggerDownload,
  type BatchExportProgress,
  type ExportFormat,
} from '@/lib/batchExport';
import { logExport } from '@/lib/audit';
import { useAuth } from '@/components/AuthProvider';

const MAX_BATCH = 50;

export default function SubmissionsPage() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('zip');
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<BatchExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setSubmissions(await getSubmissions());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const selectedSubmissions = useMemo(
    () => submissions.filter((s) => selected.has(s.id)),
    [submissions, selected]
  );

  const dateRange = useMemo(() => {
    if (selectedSubmissions.length === 0) return { start: null, end: null };
    const dates = selectedSubmissions
      .map((s) => s.dateOfService)
      .filter(Boolean)
      .sort();
    return { start: dates[0] || null, end: dates[dates.length - 1] || null };
  }, [selectedSubmissions]);

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      if (prev.size === submissions.length) return new Set();
      return new Set(submissions.map((s) => s.id));
    });
  };

  const clearSelection = () => setSelected(new Set());

  const handleDelete = async (s: SubmissionSummary) => {
    if (!window.confirm(`Delete progress note for ${s.clientName} on ${s.dateOfService}?`)) return;
    try {
      await deleteSubmission(s.id);
      setSubmissions((prev) => prev.filter((item) => item.id !== s.id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(s.id);
        return next;
      });
    } catch (err) {
      console.error('Failed to delete submission:', err);
      alert('Failed to delete submission. Please try again.');
    }
  };

  const openExportModal = () => {
    setExportError(null);
    setProgress(null);
    setModalOpen(true);
  };

  const closeExportModal = () => {
    if (exporting) return;
    setModalOpen(false);
  };

  const handleExport = async () => {
    if (!user) {
      setExportError('You must be signed in to export.');
      return;
    }
    if (selectedIds.length === 0) return;
    if (selectedIds.length > MAX_BATCH) {
      setExportError(`Select no more than ${MAX_BATCH} at a time.`);
      return;
    }

    setExporting(true);
    setExportError(null);
    try {
      const result =
        format === 'zip'
          ? await buildZip(selectedIds, setProgress)
          : await buildMergedPdf(selectedIds, setProgress);

      triggerDownload(result.blob, result.filename);

      await logExport(user, {
        submissionIds: selectedIds,
        count: result.pdfCount,
        format,
        dateRangeStart: result.dateRange.start,
        dateRangeEnd: result.dateRange.end,
      });

      setModalOpen(false);
      clearSelection();
    } catch (err) {
      console.error('Batch export failed:', err);
      setExportError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
      setProgress(null);
    }
  };

  const allSelected = submissions.length > 0 && selected.size === submissions.length;
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>Progress Note Submissions</h1>
          <p style={subtitleStyle}>All submitted nursing progress notes</p>
        </div>

        {selected.size > 0 && (
          <div style={bulkBarStyle}>
            <span style={{ fontWeight: 600, color: '#2c3e50' }}>
              {selected.size} selected
            </span>
            {dateRange.start && (
              <span style={bulkMetaStyle}>
                {dateRange.start === dateRange.end
                  ? dateRange.start
                  : `${dateRange.start} → ${dateRange.end}`}
              </span>
            )}
            <div style={{ flex: 1 }} />
            <button onClick={openExportModal} style={exportBtnStyle}>
              <Download size={14} />
              Export as PDF
            </button>
            <button onClick={clearSelection} style={clearBtnStyle}>
              <X size={14} />
              Clear
            </button>
          </div>
        )}

        {loading ? (
          <div style={loadingStyle}>
            <p>Loading submissions...</p>
          </div>
        ) : submissions.length === 0 ? (
          <div style={emptyStyle}>
            <p style={emptyTitleStyle}>No submissions yet</p>
            <p style={emptySubStyle}>Submitted progress notes will appear here.</p>
          </div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 40 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleAll}
                      aria-label="Select all"
                      style={checkboxStyle}
                    />
                  </th>
                  <th style={thStyle}>Date of Service</th>
                  <th style={thStyle}>Client Name</th>
                  <th style={thStyle}>Nurse</th>
                  <th style={thStyle}>Credential</th>
                  <th style={thStyle}>Submitted At</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s, i) => {
                  const isSelected = selected.has(s.id);
                  return (
                    <tr
                      key={s.id}
                      style={{
                        ...(i % 2 === 1 ? altRowStyle : {}),
                        ...(isSelected ? { backgroundColor: '#eef5ff' } : {}),
                      }}
                    >
                      <td style={tdStyle}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(s.id)}
                          aria-label={`Select ${s.clientName} ${s.dateOfService}`}
                          style={checkboxStyle}
                        />
                      </td>
                      <td style={tdStyle}>{s.dateOfService}</td>
                      <td style={tdStyle}>{s.clientName}</td>
                      <td style={tdStyle}>{s.nurseName}</td>
                      <td style={tdStyle}>
                        <span style={credentialBadge}>{s.credential}</span>
                      </td>
                      <td style={tdStyle}>
                        {s.submittedAt ? s.submittedAt.toLocaleString() : '--'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                          <Link
                            href={`/admin/submissions/${s.id}`}
                            style={viewBtnStyle}
                          >
                            View
                          </Link>
                          <button onClick={() => handleDelete(s)} style={deleteBtnStyle}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div style={modalBackdropStyle} onClick={closeExportModal}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h2 style={{ margin: 0, fontSize: 18, color: '#2c3e50' }}>Export progress notes</h2>
              <button
                onClick={closeExportModal}
                disabled={exporting}
                style={modalCloseStyle}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 20 }}>
              <p style={{ margin: '0 0 14px', color: '#2c3e50', fontSize: 14 }}>
                You&apos;re about to export <strong>{selected.size}</strong> progress note
                {selected.size === 1 ? '' : 's'}
                {dateRange.start && (
                  <>
                    {' '}from <strong>{dateRange.start}</strong>
                    {dateRange.end && dateRange.end !== dateRange.start && (
                      <> to <strong>{dateRange.end}</strong></>
                    )}
                  </>
                )}
                .
              </p>

              <fieldset style={fieldsetStyle} disabled={exporting}>
                <legend style={legendStyle}>Format</legend>
                <label style={radioLabelStyle}>
                  <input
                    type="radio"
                    name="format"
                    value="zip"
                    checked={format === 'zip'}
                    onChange={() => setFormat('zip')}
                  />
                  <div>
                    <div style={{ fontWeight: 600, color: '#2c3e50' }}>
                      ZIP of individual PDFs
                    </div>
                    <div style={radioDescStyle}>
                      One PDF per note, named by date + client + nurse. Best for searching or attaching a single note to a record.
                    </div>
                  </div>
                </label>
                <label style={radioLabelStyle}>
                  <input
                    type="radio"
                    name="format"
                    value="merged-pdf"
                    checked={format === 'merged-pdf'}
                    onChange={() => setFormat('merged-pdf')}
                  />
                  <div>
                    <div style={{ fontWeight: 600, color: '#2c3e50' }}>
                      Single merged PDF
                    </div>
                    <div style={radioDescStyle}>
                      All notes combined into one file with page breaks. Best for audit review or handing off a batch in one document.
                    </div>
                  </div>
                </label>
              </fieldset>

              {progress && exporting && (
                <div style={progressStyle}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#2c3e50' }}>
                    {progress.stage === 'assembling'
                      ? 'Assembling archive…'
                      : `Rendering ${progress.completed}/${progress.total}…`}
                  </div>
                  <div style={progressTrackStyle}>
                    <div
                      style={{
                        ...progressFillStyle,
                        width: `${(progress.completed / progress.total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {exportError && <div style={errorStyle}>{exportError}</div>}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button
                  onClick={closeExportModal}
                  disabled={exporting}
                  style={secondaryBtnStyle}
                >
                  Cancel
                </button>
                <button onClick={handleExport} disabled={exporting} style={primaryBtnStyle}>
                  {exporting ? 'Exporting…' : 'Download'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Inline styles ---

const containerStyle: React.CSSProperties = {
  maxWidth: 1100,
  margin: '0 auto',
  padding: 20,
};

const wrapStyle: React.CSSProperties = {
  background: 'white',
  padding: 30,
  borderRadius: 8,
  boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
};

const headerStyle: React.CSSProperties = {
  textAlign: 'center',
  marginBottom: 24,
  borderBottom: '3px solid #2c3e50',
  paddingBottom: 16,
};

const titleStyle: React.CSSProperties = {
  color: '#2c3e50',
  fontSize: 24,
  marginBottom: 4,
  marginTop: 0,
};

const subtitleStyle: React.CSSProperties = {
  color: '#7f8c8d',
  fontSize: 14,
  margin: 0,
};

const controlsStyle: React.CSSProperties = {
  marginBottom: 14,
  display: 'flex',
  gap: 16,
  alignItems: 'center',
};

const backLinkStyle: React.CSSProperties = {
  color: '#27ae60',
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: 14,
};

const bulkBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 14px',
  background: '#eef5ff',
  border: '1px solid #bfd6f3',
  borderRadius: 8,
  marginBottom: 14,
  fontSize: 13,
};

const bulkMetaStyle: React.CSSProperties = {
  color: '#5c6b7a',
  fontSize: 12,
  padding: '2px 8px',
  background: 'white',
  border: '1px solid #dfe5ec',
  borderRadius: 999,
};

const exportBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#27ae60',
  color: 'white',
  padding: '8px 14px',
  borderRadius: 6,
  border: 'none',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const clearBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: 'white',
  color: '#5c6b7a',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #dfe5ec',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const loadingStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '40px 20px',
  color: '#666',
};

const emptyStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '60px 20px',
  background: '#f9f9f9',
  borderRadius: 8,
};

const emptyTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: '#2c3e50',
  marginBottom: 8,
};

const emptySubStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#7f8c8d',
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: 'auto',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  borderBottom: '2px solid #2c3e50',
  color: '#2c3e50',
  fontWeight: 700,
  fontSize: 13,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #e0e0e0',
  color: '#333',
};

const altRowStyle: React.CSSProperties = {
  backgroundColor: '#f9fafb',
};

const credentialBadge: React.CSSProperties = {
  display: 'inline-block',
  background: '#e8eef4',
  color: '#1a3a5c',
  padding: '2px 8px',
  borderRadius: 4,
  fontWeight: 600,
  fontSize: 12,
};

const viewBtnStyle: React.CSSProperties = {
  display: 'inline-block',
  background: '#34495e',
  color: 'white',
  padding: '6px 16px',
  borderRadius: 4,
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 600,
};

const deleteBtnStyle: React.CSSProperties = {
  display: 'inline-block',
  background: '#f5f5f5',
  color: '#c44',
  padding: '6px 16px',
  borderRadius: 4,
  border: '1px solid #ddd',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const checkboxStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  cursor: 'pointer',
};

const modalBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: 'white',
  width: '100%',
  maxWidth: 520,
  maxHeight: '90vh',
  overflowY: 'auto',
  borderRadius: 10,
  boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
};

const modalHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
  borderBottom: '1px solid #f1f3f5',
};

const modalCloseStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 20,
  cursor: 'pointer',
  color: '#7f8c8d',
};

const fieldsetStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 12,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const legendStyle: React.CSSProperties = {
  padding: '0 6px',
  fontSize: 12,
  fontWeight: 700,
  color: '#5c6b7a',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const radioLabelStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  padding: 10,
  border: '1px solid transparent',
  borderRadius: 6,
  cursor: 'pointer',
  alignItems: 'flex-start',
};

const radioDescStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#5c6b7a',
  marginTop: 2,
  lineHeight: 1.4,
};

const progressStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 12,
  background: '#f8fafc',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
};

const progressTrackStyle: React.CSSProperties = {
  marginTop: 8,
  background: '#e5e7eb',
  borderRadius: 999,
  overflow: 'hidden',
  height: 6,
};

const progressFillStyle: React.CSSProperties = {
  background: '#27ae60',
  height: '100%',
  transition: 'width 0.2s',
};

const errorStyle: React.CSSProperties = {
  marginTop: 12,
  padding: '10px 12px',
  background: '#fdecea',
  color: '#b3261e',
  borderRadius: 6,
  fontSize: 13,
};

const primaryBtnStyle: React.CSSProperties = {
  background: '#27ae60',
  color: 'white',
  padding: '10px 14px',
  borderRadius: 6,
  border: 'none',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const secondaryBtnStyle: React.CSSProperties = {
  background: '#eef1f4',
  color: '#2c3e50',
  padding: '10px 14px',
  borderRadius: 6,
  border: 'none',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
