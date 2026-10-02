'use client';

import { useId, useState, type CSSProperties } from 'react';
import { DEFAULT_DOCUMENT_FILTERS, type DocumentFilters } from '@/lib/documentBrowse';
import { withSelectChevron } from '@/lib/selectChevron';

export default function DocumentBrowseToolbar({ filters, onChange, isStaff, shown, total }: {
  filters: DocumentFilters; onChange: (filters: DocumentFilters) => void;
  isStaff: boolean; shown: number; total: number;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const set = <K extends keyof DocumentFilters>(key: K, value: DocumentFilters[K]) => onChange({ ...filters, [key]: value });
  const extra = Number(Boolean(filters.from || filters.to)) + Number(filters.source !== 'all') + Number(isStaff && filters.status !== 'active');
  const changed = Boolean(filters.search || filters.categories.length || extra || filters.sort !== 'date-desc');
  const invalid = Boolean(filters.from && filters.to && filters.from > filters.to);
  return <>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end', marginBottom: 12 }}>
      <label style={{ ...labelStyle, flex: '1 1 240px' }}>Search documents
        <input type="search" value={filters.search} onChange={(e) => set('search', e.target.value)} placeholder="Title, filename or uploader" style={inputStyle} />
      </label>
      <label style={labelStyle}>Sort by
        <select value={filters.sort} onChange={(e) => set('sort', e.target.value as DocumentFilters['sort'])} style={withSelectChevron(inputStyle)}>
          <option value="date-desc">Document date: newest first</option><option value="date-asc">Document date: oldest first</option>
          <option value="upload-desc">Upload date: newest first</option><option value="upload-asc">Upload date: oldest first</option>
          <option value="title-asc">Title: A to Z</option><option value="title-desc">Title: Z to A</option>
        </select>
      </label>
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)} style={buttonStyle}>Filters{extra ? ` (${extra})` : ''}</button>
      {changed && <button type="button" onClick={() => onChange(DEFAULT_DOCUMENT_FILTERS)} style={buttonStyle}>Clear filters</button>}
    </div>
    {open && <div id={panelId} style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        <label style={labelStyle}>Document date from
          <input type="date" lang="en-US" aria-invalid={invalid} value={filters.from} max={filters.to || undefined} onChange={(e) => set('from', e.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>Document date to
          <input type="date" lang="en-US" aria-invalid={invalid} value={filters.to} min={filters.from || undefined} onChange={(e) => set('to', e.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>Source
          <select value={filters.source} onChange={(e) => set('source', e.target.value as DocumentFilters['source'])} style={withSelectChevron(inputStyle)}>
            <option value="all">All sources</option><option value="uploaded">Uploaded files</option><option value="notes">Visit notes</option><option value="generated">Other generated documents</option>
          </select>
        </label>
        {isStaff && <label style={labelStyle}>Status
          <select value={filters.status} onChange={(e) => set('status', e.target.value as DocumentFilters['status'])} style={withSelectChevron(inputStyle)}>
            <option value="active">Active</option><option value="archived">Archived</option><option value="all">Active and archived</option>
          </select>
        </label>}
      </div>
      <p style={{ fontSize: 12, color: '#64748b', margin: '10px 0 0' }}>Dates refer to the date on the document. Select multiple category buttons above to include them together.</p>
    </div>}
    {invalid && <p role="alert" style={{ color: '#b91c1c', fontSize: 13 }}>The from date must be on or before the to date.</p>}
    <p role="status" style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>Showing {shown} of {total} documents</p>
  </>;
}
const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 600, color: '#475569', minWidth: 0, maxWidth: '100%' };
const inputStyle: CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 10px', fontSize: 13, color: '#1e3a5f', background: '#fff', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' };
const buttonStyle: CSSProperties = { ...inputStyle, fontWeight: 600, cursor: 'pointer' };
