'use client';

import { useEffect, useState } from 'react';
import { History, ChevronDown, ChevronRight } from 'lucide-react';
import { getEditHistory, type EditHistoryEntry } from '@/lib/submissions';
import type { Role } from '@/lib/auth';

function prettyFieldName(key: string): string {
  const cleaned = key.replace(/^q\d+_/, '').replace(/_/g, ' ');
  return cleaned
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
    .replace(/\s+/g, ' ');
}

function prettyValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') {
    if (v.startsWith('data:image/')) return '(signature image)';
    return v.length > 200 ? v.slice(0, 200) + '…' : v;
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export default function RevisionHistory({ submissionId }: { submissionId: string }) {
  const [entries, setEntries] = useState<EditHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const rows = await getEditHistory(submissionId);
        setEntries(rows);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load history.');
      }
    })();
  }, [submissionId]);

  if (entries === null && !error) {
    return (
      <div style={wrapStyle}>
        <div style={headerRowStyle}>
          <History size={16} color="#5c6b7a" />
          <strong style={titleStyle}>Revision history</strong>
          <span style={countStyle}>loading…</span>
        </div>
      </div>
    );
  }

  return (
    <div style={wrapStyle} className="no-print">
      <button
        onClick={() => setCollapsed((c) => !c)}
        style={headerBtnStyle}
        aria-expanded={!collapsed}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        <History size={16} color="#5c6b7a" />
        <strong style={titleStyle}>Revision history</strong>
        <span style={countStyle}>
          {entries && entries.length === 0 ? 'No edits' : `${entries?.length ?? 0} edit${entries?.length === 1 ? '' : 's'}`}
        </span>
      </button>

      {!collapsed && (
        <div style={bodyStyle}>
          {error && <div style={errorStyle}>{error}</div>}
          {entries && entries.length === 0 && !error && (
            <div style={emptyStyle}>
              This note has not been edited since it was submitted.
            </div>
          )}
          {entries && entries.length > 0 && (
            <ol style={listStyle}>
              {entries.map((e) => (
                <RevisionEntry key={e.id} entry={e} />
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function RevisionEntry({ entry }: { entry: EditHistoryEntry }) {
  const changedKeys = Object.keys(entry.changes);
  const [open, setOpen] = useState(false);
  const when = entry.editedAt ? entry.editedAt.toLocaleString() : '—';
  return (
    <li style={entryStyle}>
      <button onClick={() => setOpen((o) => !o)} style={entryHeaderStyle}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span style={{ fontWeight: 600 }}>
          {entry.editedByName || entry.editedBy || 'Unknown editor'}
        </span>
        <span style={roleBadgeStyle(entry.editedByRole)}>{entry.editedByRole}</span>
        <span style={{ color: '#7f8c8d', fontSize: 12 }}>· {when}</span>
        <span style={{ marginLeft: 'auto', color: '#5c6b7a', fontSize: 12 }}>
          {changedKeys.length} field{changedKeys.length === 1 ? '' : 's'} changed
        </span>
      </button>

      {open && (
        <div style={diffWrapStyle}>
          {changedKeys.length === 0 ? (
            <div style={{ fontSize: 13, color: '#7f8c8d' }}>No field-level changes recorded.</div>
          ) : (
            <table style={diffTableStyle}>
              <thead>
                <tr>
                  <th style={diffThStyle}>Field</th>
                  <th style={diffThStyle}>From</th>
                  <th style={diffThStyle}>To</th>
                </tr>
              </thead>
              <tbody>
                {changedKeys.map((k) => (
                  <tr key={k}>
                    <td style={diffTdFieldStyle}>{prettyFieldName(k)}</td>
                    <td style={diffTdFromStyle}>{prettyValue(entry.changes[k].from)}</td>
                    <td style={diffTdToStyle}>{prettyValue(entry.changes[k].to)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </li>
  );
}

const wrapStyle: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, background: 'white', marginTop: 20 };
const headerRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px' };
const headerBtnStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: '#2c3e50' };
const titleStyle: React.CSSProperties = { fontSize: 14, color: '#2c3e50' };
const countStyle: React.CSSProperties = { marginLeft: 'auto', fontSize: 12, color: '#7f8c8d' };
const bodyStyle: React.CSSProperties = { padding: '0 14px 14px' };
const emptyStyle: React.CSSProperties = { padding: '16px', background: '#f8fafc', borderRadius: 6, color: '#7f8c8d', fontSize: 13, textAlign: 'center' };
const errorStyle: React.CSSProperties = { padding: '10px 12px', background: '#fdecea', color: '#b3261e', borderRadius: 6, fontSize: 13, marginBottom: 10 };
const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 };
const entryStyle: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 6, background: '#fafbfc' };
const entryHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', fontSize: 13, color: '#2c3e50' };
const diffWrapStyle: React.CSSProperties = { padding: '0 12px 12px' };
const diffTableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const diffThStyle: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e5e7eb', color: '#5c6b7a', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 };
const diffTdFieldStyle: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #f1f3f5', fontWeight: 600, color: '#2c3e50', width: '22%' };
const diffTdFromStyle: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #f1f3f5', color: '#a33', background: '#fdecea', verticalAlign: 'top', whiteSpace: 'pre-wrap' };
const diffTdToStyle: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #f1f3f5', color: '#2a7a2a', background: '#e8f4e8', verticalAlign: 'top', whiteSpace: 'pre-wrap' };

function roleBadgeStyle(role: Role | null): React.CSSProperties {
  const map: Record<string, { bg: string; fg: string }> = {
    admin: { bg: '#fef3c7', fg: '#78350f' },
    supervisor: { bg: '#e0e7ff', fg: '#3730a3' },
    nurse: { bg: '#e8f4e8', fg: '#166534' },
  };
  const c = (role && map[role]) || { bg: '#f1f5f9', fg: '#64748b' };
  return {
    display: 'inline-block',
    padding: '1px 8px',
    fontSize: 10,
    fontWeight: 700,
    borderRadius: 999,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    background: c.bg,
    color: c.fg,
  };
}
