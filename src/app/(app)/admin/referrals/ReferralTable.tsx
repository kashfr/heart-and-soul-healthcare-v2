'use client';

import { useEffect, useMemo, useState } from 'react';
import { Printer, Download, Trash2, Share2, X, Check } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import {
  downloadCsv, formatDate, initials,
  REFERRAL_STAGES, STAGE_ACCENT, STAGE_LABEL, SOURCE_LABEL,
  type Referral, type ReferralStage,
} from './types';
import ShareBadge from './ShareBadge';

type SortKey =
  | 'clientName' | 'program' | 'county' | 'source'
  | 'submittedAt' | 'stage' | 'assigneeName';
type SortDir = 'asc' | 'desc';

interface Props {
  referrals: Referral[];
  onOpen: (referral: Referral) => void;
  onPrint: (list: Referral[]) => void;
  onDelete: (ids: string[]) => void;
  canDelete: boolean;
  /** Refetch the board after a bulk share that may have moved cards' stages. */
  onChanged?: () => void;
}

const STAGE_RANK: Record<ReferralStage, number> = REFERRAL_STAGES.reduce(
  (acc, s, i) => ({ ...acc, [s]: i }),
  {} as Record<ReferralStage, number>
);

export default function ReferralTable({ referrals, onOpen, onPrint, onDelete, canDelete, onChanged }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('submittedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [shareOpen, setShareOpen] = useState(false);

  const sorted = useMemo(() => {
    const arr = [...referrals];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'submittedAt') {
        cmp =
          (a.submittedAt ? Date.parse(a.submittedAt) : 0) -
          (b.submittedAt ? Date.parse(b.submittedAt) : 0);
      } else if (sortKey === 'stage') {
        cmp = STAGE_RANK[a.stage] - STAGE_RANK[b.stage];
      } else if (sortKey === 'source') {
        cmp = (SOURCE_LABEL[a.source] ?? a.source).localeCompare(
          SOURCE_LABEL[b.source] ?? b.source
        );
      } else {
        cmp = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), undefined, {
          sensitivity: 'base',
        });
      }
      if (cmp === 0) cmp = a.id.localeCompare(b.id); // stable tiebreaker
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [referrals, sortKey, sortDir]);

  const setSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'submittedAt' ? 'desc' : 'asc');
    }
  };
  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  const ariaSort = (key: SortKey): React.AriaAttributes['aria-sort'] =>
    sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined;

  const selectedVisible = useMemo(
    () => sorted.filter((r) => selectedIds.has(r.id)),
    [sorted, selectedIds]
  );
  const allVisibleSelected = sorted.length > 0 && sorted.every((r) => selectedIds.has(r.id));
  const someVisibleSelected = sorted.some((r) => selectedIds.has(r.id)) && !allVisibleSelected;

  const toggleOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAllVisible = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) sorted.forEach((r) => next.delete(r.id));
      else sorted.forEach((r) => next.add(r.id));
      return next;
    });
  const clearSelection = () => setSelectedIds(new Set());

  const actionTarget = selectedVisible.length > 0 ? selectedVisible : sorted;

  return (
    <div>
      <div style={actionsBarStyle}>
        <div style={{ fontSize: 13, color: '#5c6b7a', fontWeight: 600 }}>
          {selectedVisible.length > 0
            ? `${selectedVisible.length} selected`
            : `${sorted.length} referral${sorted.length === 1 ? '' : 's'}`}
        </div>
        {selectedVisible.length > 0 && (
          <button onClick={clearSelection} style={linkBtnStyle}>
            Clear
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => actionTarget.length > 0 && onPrint(actionTarget)}
          style={ghostBtnStyle}
          title="Open a printable call sheet for these referrals"
        >
          <Printer size={15} /> Print
          {selectedVisible.length > 0 ? ` (${selectedVisible.length})` : ' all'}
        </button>
        <button onClick={() => downloadCsv(actionTarget)} style={ghostBtnStyle}>
          <Download size={15} /> Export CSV
        </button>
        {selectedVisible.length > 0 && (
          <button onClick={() => setShareOpen(true)} style={shareBtnStyle}>
            <Share2 size={15} /> Share ({selectedVisible.length})
          </button>
        )}
        {canDelete && selectedVisible.length > 0 && (
          <button
            onClick={() => {
              const n = selectedVisible.length;
              if (confirm(`Delete ${n} referral${n === 1 ? '' : 's'}? They'll be removed from the board. An admin can recover them from the deleted-referrals audit.`)) {
                onDelete(selectedVisible.map((r) => r.id));
                clearSelection();
              }
            }}
            style={deleteBtnStyle}
          >
            <Trash2 size={15} /> Delete ({selectedVisible.length})
          </button>
        )}
      </div>

      {shareOpen && selectedVisible.length > 0 && (
        <BulkShareModal
          referrals={selectedVisible}
          onClose={() => setShareOpen(false)}
          onDone={() => { setShareOpen(false); clearSelection(); onChanged?.(); }}
        />
      )}

      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 40 }}>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someVisibleSelected;
                  }}
                  onChange={toggleAllVisible}
                  aria-label="Select all referrals"
                  style={{ cursor: 'pointer' }}
                />
              </th>
              <th style={{ ...thStyle, width: 48, textAlign: 'right' }}>#</th>
              <th style={sortThStyle} onClick={() => setSort('clientName')} aria-sort={ariaSort('clientName')}>
                Name{sortIndicator('clientName')}
              </th>
              <th style={sortThStyle} onClick={() => setSort('program')} aria-sort={ariaSort('program')}>
                Program{sortIndicator('program')}
              </th>
              <th style={sortThStyle} onClick={() => setSort('county')} aria-sort={ariaSort('county')}>
                County{sortIndicator('county')}
              </th>
              <th style={sortThStyle} onClick={() => setSort('source')} aria-sort={ariaSort('source')}>
                Source{sortIndicator('source')}
              </th>
              <th style={thStyle}>Shared</th>
              <th style={sortThStyle} onClick={() => setSort('assigneeName')} aria-sort={ariaSort('assigneeName')}>
                Assigned{sortIndicator('assigneeName')}
              </th>
              <th style={sortThStyle} onClick={() => setSort('submittedAt')} aria-sort={ariaSort('submittedAt')}>
                Received{sortIndicator('submittedAt')}
              </th>
              <th style={sortThStyle} onClick={() => setSort('stage')} aria-sort={ariaSort('stage')}>
                Stage{sortIndicator('stage')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr
                key={r.id}
                onClick={() => onOpen(r)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen(r);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Open referral from ${r.clientName || 'unknown'}`}
                style={{ cursor: 'pointer' }}
              >
                <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(r.id)}
                    onChange={() => toggleOne(r.id)}
                    aria-label={`Select referral from ${r.clientName || 'unknown'}`}
                    style={{ cursor: 'pointer' }}
                  />
                </td>
                <td style={indexTdStyle}>{i + 1}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{r.clientName || '—'}</td>
                <td style={tdStyle}>{r.program || '—'}</td>
                <td style={tdStyle}>{r.county || '—'}</td>
                <td style={tdStyle}>
                  <span style={sourceBadge}>{SOURCE_LABEL[r.source] ?? r.source}</span>
                </td>
                <td style={tdStyle}>
                  {r.shareSummary && r.shareSummary.total > 0 ? (
                    <ShareBadge summary={r.shareSummary} />
                  ) : (
                    <span style={{ color: '#cbd5e1' }}>—</span>
                  )}
                </td>
                <td style={tdStyle}>
                  {r.assigneeName ? (
                    <span style={assigneeCellStyle}>
                      <span style={miniAvatarStyle}>{initials(r.assigneeName)}</span>
                      {r.assigneeName}
                    </span>
                  ) : (
                    <span style={{ color: '#9ca3af' }}>—</span>
                  )}
                </td>
                <td style={tdStyle}>{formatDate(r.submittedAt)}</td>
                <td style={tdStyle}>
                  <StageBadge stage={r.stage} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StageBadge({ stage }: { stage: ReferralStage }) {
  return (
    <span style={stageBadgeStyle}>
      <span style={{ ...stageBadgeDot, background: STAGE_ACCENT[stage] }} aria-hidden />
      {STAGE_LABEL[stage]}
    </span>
  );
}

function BulkShareModal({
  referrals,
  onClose,
  onDone,
}: {
  referrals: Referral[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [agencies, setAgencies] = useState<{ id: string; name: string; email: string }[]>([]);
  const [agency, setAgency] = useState('');
  const [email, setEmail] = useState('');
  const [expiry, setExpiry] = useState(14);
  const [move, setMove] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ createdCount: number; failedCount: number; movedCount: number; emailSent: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch('/api/admin/agencies');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setAgencies(
            (data.agencies ?? []).map((a: { id: string; name: string; email: string }) => ({
              id: a.id, name: a.name, email: a.email,
            }))
          );
        }
      } catch {
        /* non-fatal: autocomplete just won't be available */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onAgencyName = (value: string) => {
    setAgency(value);
    const match = agencies.find((a) => a.name.toLowerCase() === value.trim().toLowerCase());
    if (match) setEmail(match.email);
  };

  const submit = async () => {
    if (!agency.trim() || !email.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await authedFetch('/api/admin/referrals/bulk-share', {
        method: 'POST',
        body: JSON.stringify({
          referralIds: referrals.map((r) => r.id),
          partnerAgency: agency.trim(),
          partnerEmail: email.trim(),
          expiresInDays: expiry,
          moveToReferredOut: move,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      setResult({
        createdCount: data.createdCount ?? 0,
        failedCount: data.failedCount ?? 0,
        movedCount: data.movedCount ?? 0,
        emailSent: !!data.emailSent,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share referrals.');
    } finally {
      setSending(false);
    }
  };

  const n = referrals.length;
  return (
    <div style={modalBackdropStyle} onClick={onClose}>
      <div style={modalCardStyle} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={modalHeaderStyle}>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#2c3e50' }}>
            Share {n} referral{n === 1 ? '' : 's'} with an agency
          </div>
          <button onClick={onClose} style={modalCloseStyle} aria-label="Close"><X size={18} /></button>
        </div>

        {result ? (
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1e7a3d', fontWeight: 700, marginBottom: 8 }}>
              <Check size={18} /> Shared {result.createdCount} referral{result.createdCount === 1 ? '' : 's'} with {agency}
            </div>
            <div style={{ fontSize: 13.5, color: '#5c6b7a', lineHeight: 1.5 }}>
              {result.emailSent
                ? `One email with all ${result.createdCount} link${result.createdCount === 1 ? '' : 's'} was sent to ${email}.`
                : 'The links were created, but the email could not be sent — you can copy each from its referral.'}
              {result.failedCount > 0 && ` ${result.failedCount} could not be shared.`}
            </div>
            {result.movedCount > 0 && (
              <div style={{ fontSize: 13, color: '#5c6b7a', marginTop: 6 }}>
                Moved {result.movedCount} to Referred Out.
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <button onClick={onDone} style={modalPrimaryStyle}>Done</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              value={agency}
              onChange={(e) => onAgencyName(e.target.value)}
              placeholder="Partner agency name"
              style={modalInputStyle}
              list="bulk-agency-options"
              autoComplete="off"
              autoFocus
            />
            <datalist id="bulk-agency-options">
              {agencies.map((a) => <option key={a.id} value={a.name} />)}
            </datalist>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Partner email"
              type="email"
              style={modalInputStyle}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#5c6b7a' }}>Expires in</span>
              <select value={expiry} onChange={(e) => setExpiry(Number(e.target.value))} style={modalSelectStyle}>
                {[7, 14, 30, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#5c6b7a', cursor: 'pointer' }}>
              <input type="checkbox" checked={move} onChange={(e) => setMove(e.target.checked)} />
              Move {n === 1 ? 'it' : 'them'} to Referred Out (mark as handed off)
            </label>
            {error && <div style={{ color: '#b3261e', fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
              <button onClick={onClose} style={ghostBtnStyle}>Cancel</button>
              <button
                onClick={submit}
                disabled={sending || !agency.trim() || !email.trim()}
                style={{ ...modalPrimaryStyle, opacity: sending || !agency.trim() || !email.trim() ? 0.55 : 1 }}
              >
                {sending ? 'Sending…' : `Create & email ${n} link${n === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const SELECT_CHEVRON =
  "white url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\") no-repeat right 10px center";

const shareBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1a3a5c', color: 'white',
  border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
};
const modalBackdropStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const modalCardStyle: React.CSSProperties = {
  background: 'white', borderRadius: 12, width: '100%', maxWidth: 460,
  boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
};
const modalHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '16px 20px', borderBottom: '1px solid #e5e7eb',
};
const modalCloseStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex',
};
const modalInputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8,
  padding: '9px 11px', fontSize: 14, fontFamily: 'inherit', color: '#111827',
};
const modalSelectStyle: React.CSSProperties = {
  appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
  border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 8px', paddingRight: 28,
  fontSize: 13, fontFamily: 'inherit', color: '#111827',
  background: SELECT_CHEVRON, backgroundSize: '14px', cursor: 'pointer',
};
const modalPrimaryStyle: React.CSSProperties = {
  background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 8, padding: '9px 16px',
  fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};

const actionsBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 12,
};
const linkBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#1a3a5c',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  textDecoration: 'underline',
};
const ghostBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'white',
  color: '#5c6b7a',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const deleteBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'white',
  color: '#b3261e',
  border: '1px solid #f0c2bd',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const tableWrapStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  overflow: 'hidden',
};
const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
};
const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 16px',
  fontSize: 12,
  fontWeight: 700,
  color: '#5c6b7a',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  borderBottom: '1px solid #e5e7eb',
  background: '#f9fafb',
};
const sortThStyle: React.CSSProperties = {
  ...thStyle,
  cursor: 'pointer',
  userSelect: 'none',
};
const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid #f1f5f9',
  color: '#374151',
};
const indexTdStyle: React.CSSProperties = {
  ...tdStyle,
  width: 48,
  textAlign: 'right',
  color: '#94a3b8',
  fontVariantNumeric: 'tabular-nums',
};
const sourceBadge: React.CSSProperties = {
  display: 'inline-block',
  background: '#eef5ff',
  color: '#1a3a5c',
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};
const assigneeCellStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
};
const miniAvatarStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 999,
  background: '#1a3a5c',
  color: 'white',
  fontSize: 10,
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};
const stageBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#f1f5f9',
  color: '#334155',
  padding: '3px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: 'nowrap',
};
const stageBadgeDot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
};
