'use client';

import { useState } from 'react';
import { History, ChevronDown, ChevronRight } from 'lucide-react';
import { buildAmendmentWhyLog } from '@/lib/revisionFormat';
import type { EditHistoryEntry } from '@/lib/submissions';
import type { Role } from '@/lib/auth';

/**
 * Compact "why" log for a note's amendments. The WHAT (old value -> new value,
 * per field) now renders inline in the note body, struck through with the
 * corrected value beneath it — so this no longer repeats a field-by-field
 * from/to table. It lists one line per amendment EVENT: who, their role, when,
 * and the stated reason. Shown to everyone who can view the note (the change is
 * part of the record). Entries are passed in from the page (single fetch).
 */
export default function RevisionHistory({ entries }: { entries: EditHistoryEntry[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const log = buildAmendmentWhyLog(entries);
  // "Amendments" = events that changed a field or carried a reason (archive/
  // restore action markers aren't amendments to the clinical content).
  const count = entries.filter(
    (e) => Object.keys(e.changes || {}).length > 0 || (e.reason || '').trim(),
  ).length;

  return (
    <div style={wrapStyle} className="no-print">
      <button onClick={() => setCollapsed((c) => !c)} style={headerBtnStyle} aria-expanded={!collapsed}>
        {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        <History size={16} color="#5c6b7a" />
        <strong style={titleStyle}>Amendment history</strong>
        <span style={countStyle}>
          {count === 0 ? 'No amendments' : `${count} amendment${count === 1 ? '' : 's'}`}
        </span>
      </button>

      {!collapsed && (
        <div style={bodyStyle}>
          {count === 0 ? (
            <div style={emptyStyle}>This note has not been amended since it was submitted.</div>
          ) : (
            <>
              <p style={noteStyle}>
                Each field&apos;s change is shown in place above, struck through with the corrected value and a
                timestamp. This log records the stated reason for each amendment.
              </p>
              <ol style={listStyle}>
                {log.length === 0 ? (
                  <li style={emptyReasonStyle}>No reasons were recorded.</li>
                ) : (
                  log.map((e, i) => (
                    <li key={i} style={entryStyle}>
                      <div style={entryHeaderStyle}>
                        <span style={{ fontWeight: 600 }}>{e.editedByName || 'Unknown editor'}</span>
                        {e.editedByRole && (
                          <span style={roleBadgeStyle(e.editedByRole as Role)}>{e.editedByRole}</span>
                        )}
                        <span style={{ color: '#7f8c8d', fontSize: 12 }}>
                          · {e.editedAt ? e.editedAt.toLocaleString() : '—'}
                        </span>
                      </div>
                      <div style={reasonStyle}>{e.reason}</div>
                    </li>
                  ))
                )}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const wrapStyle: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, background: 'white', marginTop: 20 };
const headerBtnStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: '#2c3e50' };
const titleStyle: React.CSSProperties = { fontSize: 14, color: '#2c3e50' };
const countStyle: React.CSSProperties = { marginLeft: 'auto', fontSize: 12, color: '#7f8c8d' };
const bodyStyle: React.CSSProperties = { padding: '0 14px 14px' };
const noteStyle: React.CSSProperties = { margin: '0 0 10px', fontSize: 12.5, color: '#7f8c8d', lineHeight: 1.5 };
const emptyStyle: React.CSSProperties = { padding: '16px', background: '#f8fafc', borderRadius: 6, color: '#7f8c8d', fontSize: 13, textAlign: 'center' };
const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 };
const entryStyle: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 6, background: '#fafbfc', padding: '10px 12px' };
const entryHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#2c3e50' };
const reasonStyle: React.CSSProperties = { marginTop: 6, color: '#334155', fontSize: 12.5, lineHeight: 1.45 };
const emptyReasonStyle: React.CSSProperties = { ...entryStyle, color: '#7f8c8d', fontSize: 13 };

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
