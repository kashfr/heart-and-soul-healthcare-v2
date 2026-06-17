'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, X, Inbox, Phone, Mail, RefreshCw, Printer, Download } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';

type ReferralSource = 'gapp-website' | 'hs-website';
type ReferralStatus = 'new' | 'contacted' | 'archived';

interface ReferralDetail {
  label: string;
  value: string;
}

interface Referral {
  id: string;
  source: ReferralSource;
  status: ReferralStatus;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  county: string;
  program: string;
  referrerName?: string;
  details: ReferralDetail[];
  submittedAt: string | null;
}

const SOURCE_LABEL: Record<ReferralSource, string> = {
  'gapp-website': 'GAPP site',
  'hs-website': 'Heart & Soul site',
};

const STATUS_LABEL: Record<ReferralStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  archived: 'Archived',
};

type Scope = 'active' | 'archived' | 'all';
type SortKey = 'clientName' | 'program' | 'county' | 'source' | 'submittedAt' | 'status';
type SortDir = 'asc' | 'desc';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Build the ordered field rows shown in both the detail view and the print sheet.
function fieldRows(r: Referral): ReferralDetail[] {
  return [
    { label: 'Program', value: r.program },
    { label: 'County', value: r.county },
    ...(r.referrerName ? [{ label: 'Referred by', value: r.referrerName }] : []),
    ...r.details,
  ];
}

function csvEscape(value: string): string {
  const s = (value ?? '').toString();
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(list: Referral[]) {
  const headers = [
    'Name', 'Phone', 'Email', 'County', 'Program', 'Source', 'Status',
    'Received', 'Referred by', 'Details',
  ];
  const rows = list.map((r) =>
    [
      r.clientName,
      r.clientPhone,
      r.clientEmail,
      r.county,
      r.program,
      SOURCE_LABEL[r.source] ?? r.source,
      STATUS_LABEL[r.status],
      r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '',
      r.referrerName ?? '',
      r.details.map((d) => `${d.label}: ${d.value}`).join(' | '),
    ]
      .map(csvEscape)
      .join(',')
  );
  // Prepend a BOM so Excel reads UTF-8 correctly.
  const csv = '﻿' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `referrals-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ReferralsPage() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>('active');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Referral | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printList, setPrintList] = useState<Referral[] | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('submittedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch('/api/admin/referrals');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status}).`);
      }
      const data = await res.json();
      setReferrals(data.referrals ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load referrals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Close the detail modal / print preview on Escape.
  useEffect(() => {
    if (!selected && !printList) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (printList) setPrintList(null);
      else setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, printList]);

  const scoped = useMemo(() => {
    if (scope === 'all') return referrals;
    if (scope === 'archived') return referrals.filter((r) => r.status === 'archived');
    return referrals.filter((r) => r.status !== 'archived');
  }, [referrals, scope]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return scoped;
    return scoped.filter((r) => {
      const hay =
        `${r.clientName} ${r.clientEmail} ${r.clientPhone} ${r.county} ${r.program} ${r.referrerName ?? ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [scoped, q]);

  const sorted = useMemo(() => {
    const statusRank: Record<ReferralStatus, number> = { new: 0, contacted: 1, archived: 2 };
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'submittedAt') {
        cmp =
          (a.submittedAt ? Date.parse(a.submittedAt) : 0) -
          (b.submittedAt ? Date.parse(b.submittedAt) : 0);
      } else if (sortKey === 'status') {
        cmp = statusRank[a.status] - statusRank[b.status];
      } else if (sortKey === 'source') {
        cmp = (SOURCE_LABEL[a.source] ?? a.source).localeCompare(
          SOURCE_LABEL[b.source] ?? b.source
        );
      } else {
        cmp = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), undefined, {
          sensitivity: 'base',
        });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

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

  const counts = useMemo(
    () => ({
      active: referrals.filter((r) => r.status !== 'archived').length,
      archived: referrals.filter((r) => r.status === 'archived').length,
    }),
    [referrals]
  );

  // Selection + index reflect the current sorted/filtered view.
  const selectedVisible = useMemo(
    () => sorted.filter((r) => selectedIds.has(r.id)),
    [sorted, selectedIds]
  );
  const allVisibleSelected =
    sorted.length > 0 && sorted.every((r) => selectedIds.has(r.id));
  const someVisibleSelected =
    sorted.some((r) => selectedIds.has(r.id)) && !allVisibleSelected;

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

  const changeScope = (s: Scope) => {
    setScope(s);
    clearSelection();
  };

  // Print/export act on the selection when there is one, else the whole view.
  const actionTarget = selectedVisible.length > 0 ? selectedVisible : sorted;
  const openPrint = (list: Referral[]) => {
    if (list.length > 0) setPrintList(list);
  };

  const setStatus = async (referral: Referral, status: ReferralStatus) => {
    setSavingId(referral.id);
    try {
      const res = await authedFetch(`/api/admin/referrals/${referral.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Update failed (${res.status}).`);
      }
      setReferrals((prev) =>
        prev.map((r) => (r.id === referral.id ? { ...r, status } : r))
      );
      setSelected((prev) => (prev && prev.id === referral.id ? { ...prev, status } : prev));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not update referral.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <header style={headerStyle}>
          <div>
            <p style={kickerStyle}>Admin</p>
            <h1 style={titleStyle}>Referrals</h1>
            <p style={subtitleStyle}>
              Incoming referral submissions from the GAPP and Heart &amp; Soul websites.
            </p>
          </div>
          <button onClick={load} style={refreshBtnStyle} title="Refresh">
            <RefreshCw size={15} /> Refresh
          </button>
        </header>

        <div style={toolbarStyle}>
          <div style={tabsStyle}>
            {(['active', 'archived', 'all'] as Scope[]).map((s) => (
              <button
                key={s}
                onClick={() => changeScope(s)}
                style={scope === s ? { ...tabStyle, ...tabActiveStyle } : tabStyle}
              >
                {s === 'active'
                  ? `Active (${counts.active})`
                  : s === 'archived'
                  ? `Archived (${counts.archived})`
                  : 'All'}
              </button>
            ))}
          </div>
          <div style={searchWrapStyle}>
            <Search size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, email, county, program…"
              style={searchInputStyle}
            />
            {q && (
              <button onClick={() => setQ('')} style={searchClearStyle} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {!loading && !error && filtered.length > 0 && (
          <div style={actionsBarStyle}>
            <div style={{ fontSize: 13, color: '#5c6b7a', fontWeight: 600 }}>
              {selectedVisible.length > 0
                ? `${selectedVisible.length} selected`
                : `${filtered.length} referral${filtered.length === 1 ? '' : 's'}`}
            </div>
            {selectedVisible.length > 0 && (
              <button onClick={clearSelection} style={linkBtnStyle}>
                Clear
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button
              onClick={() => openPrint(actionTarget)}
              style={actionBtnStyle}
              title="Open a printable call sheet for these referrals"
            >
              <Printer size={15} /> Print
              {selectedVisible.length > 0 ? ` (${selectedVisible.length})` : ' all'}
            </button>
            <button onClick={() => downloadCsv(actionTarget)} style={archiveBtnStyle}>
              <Download size={15} /> Export CSV
            </button>
          </div>
        )}

        {loading ? (
          <div style={emptyStyle}>Loading…</div>
        ) : error ? (
          <div style={{ ...emptyStyle, color: '#b3261e' }}>
            {error}
            <div style={{ marginTop: 12 }}>
              <button onClick={load} style={refreshBtnStyle}>
                Try again
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={emptyStyle}>
            <Inbox size={28} style={{ color: '#cbd5e1', marginBottom: 8 }} />
            <div>{q ? 'No referrals match your search.' : 'No referrals yet.'}</div>
          </div>
        ) : (
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
                  <th style={sortThStyle} onClick={() => setSort('submittedAt')} aria-sort={ariaSort('submittedAt')}>
                    Received{sortIndicator('submittedAt')}
                  </th>
                  <th style={sortThStyle} onClick={() => setSort('status')} aria-sort={ariaSort('status')}>
                    Status{sortIndicator('status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelected(r);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open referral from ${r.clientName || 'unknown'}`}
                    style={rowStyle}
                  >
                    <td
                      style={tdStyle}
                      onClick={(e) => e.stopPropagation()}
                    >
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
                    <td style={tdStyle}>{formatDate(r.submittedAt)}</td>
                    <td style={tdStyle}>
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div style={modalBackdropStyle} onClick={() => setSelected(null)}>
          <div
            style={modalStyle}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Referral from ${selected.clientName || 'unknown'}`}
          >
            <div style={modalHeaderStyle}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#2c3e50' }}>
                  {selected.clientName || 'Referral'}
                </div>
                <div style={{ fontSize: 12, color: '#7f8c8d', marginTop: 2 }}>
                  {SOURCE_LABEL[selected.source] ?? selected.source} ·{' '}
                  {formatDate(selected.submittedAt)}
                </div>
              </div>
              <button onClick={() => setSelected(null)} style={closeBtnStyle} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: 20, overflowY: 'auto' }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                {selected.clientPhone && (
                  <a href={`tel:${selected.clientPhone}`} style={contactChipStyle}>
                    <Phone size={14} /> {selected.clientPhone}
                  </a>
                )}
                {selected.clientEmail && (
                  <a href={`mailto:${selected.clientEmail}`} style={contactChipStyle}>
                    <Mail size={14} /> {selected.clientEmail}
                  </a>
                )}
              </div>

              <table style={detailTableStyle}>
                <tbody>
                  {fieldRows(selected).map((d, i) => (
                    <DetailRow key={i} label={d.label} value={d.value} />
                  ))}
                </tbody>
              </table>
            </div>

            <div style={modalFooterStyle}>
              <StatusBadge status={selected.status} />
              <div style={{ flex: 1 }} />
              <button onClick={() => openPrint([selected])} style={archiveBtnStyle}>
                <Printer size={15} /> Print
              </button>
              {selected.status !== 'contacted' && (
                <button
                  onClick={() => setStatus(selected, 'contacted')}
                  disabled={savingId === selected.id}
                  style={actionBtnStyle}
                >
                  Mark contacted
                </button>
              )}
              {selected.status !== 'archived' ? (
                <button
                  onClick={() => setStatus(selected, 'archived')}
                  disabled={savingId === selected.id}
                  style={archiveBtnStyle}
                >
                  Archive
                </button>
              ) : (
                <button
                  onClick={() => setStatus(selected, 'new')}
                  disabled={savingId === selected.id}
                  style={actionBtnStyle}
                >
                  Reopen
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {printList && (
        <div style={printOverlayStyle}>
          <div className="referral-print-toolbar" style={printToolbarStyle}>
            <span style={{ fontWeight: 700 }}>
              Print preview — {printList.length} referral{printList.length === 1 ? '' : 's'}
            </span>
            <span style={{ fontSize: 12, opacity: 0.8 }}>
              Each referral prints on its own page with a call log.
            </span>
            <div style={{ flex: 1 }} />
            <button onClick={() => window.print()} style={printNowBtnStyle}>
              <Printer size={15} /> Print
            </button>
            <button onClick={() => setPrintList(null)} style={printCloseBtnStyle}>
              Close
            </button>
          </div>
          <div className="referral-print-root" style={printRootStyle}>
            {printList.map((r) => (
              <ReferralPrintSheet key={r.id} referral={r} />
            ))}
          </div>
        </div>
      )}

      <style>{`
        @media print {
          @page { margin: 0.5in; }
          body * { visibility: hidden !important; }
          .referral-print-root, .referral-print-root * { visibility: visible !important; }
          .referral-print-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 0 !important;
            background: #fff !important;
          }
          .referral-print-toolbar { display: none !important; }
          .referral-print-sheet {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            max-width: none !important;
            page-break-after: always;
          }
          .referral-print-sheet:last-child { page-break-after: auto; }
        }
      `}</style>
    </div>
  );
}

function StatusBadge({ status }: { status: ReferralStatus }) {
  const style =
    status === 'new'
      ? badgeNew
      : status === 'contacted'
      ? badgeContacted
      : badgeArchived;
  return <span style={style}>{STATUS_LABEL[status]}</span>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={detailLabelStyle}>{label}</td>
      <td style={detailValueStyle}>
        {value ? value : <span style={{ color: '#9ca3af' }}>—</span>}
      </td>
    </tr>
  );
}

// A printable one-per-page call sheet: contact info, all referral fields, and a
// blank outreach log for the nurse to fill in by hand.
function ReferralPrintSheet({ referral }: { referral: Referral }) {
  return (
    <div className="referral-print-sheet" style={sheetStyle}>
      <div style={sheetHeaderStyle}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>
            Heart &amp; Soul Healthcare
          </div>
          <div style={{ fontSize: 12, color: '#555' }}>Referral Call Sheet</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: '#555', lineHeight: 1.5 }}>
          <div>Source: {SOURCE_LABEL[referral.source] ?? referral.source}</div>
          <div>Received: {formatDate(referral.submittedAt)}</div>
          <div>Status: {STATUS_LABEL[referral.status]}</div>
        </div>
      </div>

      <h2 style={{ fontSize: 22, margin: '14px 0 6px', color: '#111' }}>
        {referral.clientName || 'Referral'}
      </h2>

      <div style={contactLineStyle}>
        <span>
          <strong>Phone:</strong> {referral.clientPhone || '________________________'}
        </span>
        <span>
          <strong>Email:</strong> {referral.clientEmail || '________________________'}
        </span>
      </div>

      <table style={printTableStyle}>
        <tbody>
          {fieldRows(referral).map((d, i) => (
            <tr key={i}>
              <td style={printLabelCell}>{d.label}</td>
              <td style={printValueCell}>{d.value || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={logTitleStyle}>Outreach Log</div>
      <table style={printTableStyle}>
        <thead>
          <tr>
            <th style={{ ...logHeadCell, width: 60 }}>Attempt</th>
            <th style={{ ...logHeadCell, width: 110 }}>Date</th>
            <th style={{ ...logHeadCell, width: 80 }}>Time</th>
            <th style={logHeadCell}>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3].map((n) => (
            <tr key={n}>
              <td style={logCell}>{n}</td>
              <td style={logCell} />
              <td style={logCell} />
              <td style={logCell}>{'☐'} Reached&nbsp;&nbsp; {'☐'} Voicemail&nbsp;&nbsp; {'☐'} No answer</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 12, fontSize: 13, color: '#111' }}>
        <strong>Follow-up date:</strong> ____________________ &nbsp;&nbsp;
        <strong>Result:</strong> {'☐'} Scheduled&nbsp;&nbsp; {'☐'} Needs info&nbsp;&nbsp; {'☐'} Not interested
      </div>

      <div style={{ marginTop: 14, fontSize: 13, fontWeight: 700, color: '#111' }}>Notes</div>
      <div style={{ marginTop: 6 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={noteLineStyle} />
        ))}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  minHeight: '70vh',
  background: '#f5f7fa',
  padding: '32px 20px',
};
const wrapStyle: React.CSSProperties = { maxWidth: 1100, margin: '0 auto' };
const headerStyle: React.CSSProperties = {
  marginBottom: 20,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
};
const kickerStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: '#27ae60',
  margin: 0,
};
const titleStyle: React.CSSProperties = { fontSize: 32, color: '#2c3e50', margin: '4px 0 0' };
const subtitleStyle: React.CSSProperties = { color: '#7f8c8d', fontSize: 15, marginTop: 6 };
const refreshBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'white',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 14,
  flexWrap: 'wrap',
};
const tabsStyle: React.CSSProperties = { display: 'flex', gap: 4 };
const tabStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 8,
  padding: '7px 14px',
  fontSize: 13,
  fontWeight: 600,
  color: '#5c6b7a',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const tabActiveStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid #d1d5db',
  color: '#1a3a5c',
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
};
const searchWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: 'white',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  padding: '7px 12px',
  minWidth: 280,
};
const searchInputStyle: React.CSSProperties = {
  border: 'none',
  outline: 'none',
  fontSize: 14,
  flex: 1,
  fontFamily: 'inherit',
  color: '#111827',
};
const searchClearStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#94a3b8',
  cursor: 'pointer',
  display: 'inline-flex',
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
const emptyStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '60px 24px',
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  color: '#5c6b7a',
  fontSize: 14,
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
const rowStyle: React.CSSProperties = { cursor: 'pointer' };
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
const badgeBase: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.3,
  whiteSpace: 'nowrap',
};
const badgeNew: React.CSSProperties = { ...badgeBase, background: '#e7f6ec', color: '#1e7a3d' };
const badgeContacted: React.CSSProperties = { ...badgeBase, background: '#fff4e0', color: '#9a6400' };
const badgeArchived: React.CSSProperties = { ...badgeBase, background: '#eef0f2', color: '#5c6b7a' };
const modalBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 16,
};
const modalStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: 12,
  width: '100%',
  maxWidth: 560,
  maxHeight: '88vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
};
const modalHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  padding: '18px 20px',
  borderBottom: '1px solid #e5e7eb',
};
const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#94a3b8',
  cursor: 'pointer',
  display: 'inline-flex',
};
const contactChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#f5f7fa',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 13,
  color: '#1a3a5c',
  textDecoration: 'none',
  fontWeight: 600,
};
const detailTableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
};
const detailLabelStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #eef0f2',
  background: '#f9fafb',
  fontWeight: 600,
  color: '#5c6b7a',
  width: 180,
  verticalAlign: 'top',
};
const detailValueStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #eef0f2',
  color: '#111827',
  whiteSpace: 'pre-wrap',
};
const modalFooterStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '14px 20px',
  borderTop: '1px solid #e5e7eb',
  flexWrap: 'wrap',
};
const actionBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#1a3a5c',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const archiveBtnStyle: React.CSSProperties = {
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

// --- Print preview overlay + sheet styles ---
const printOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: '#e9edf1',
  zIndex: 2000,
  overflowY: 'auto',
};
const printToolbarStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '12px 20px',
  background: '#1f2937',
  color: 'white',
  flexWrap: 'wrap',
};
const printNowBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#27ae60',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const printCloseBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.14)',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.35)',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const printRootStyle: React.CSSProperties = {
  padding: '24px 16px',
};
const sheetStyle: React.CSSProperties = {
  background: 'white',
  color: '#111',
  maxWidth: 760,
  margin: '0 auto 24px',
  padding: 40,
  border: '1px solid #d1d5db',
  borderRadius: 4,
  boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
  fontFamily: 'Arial, Helvetica, sans-serif',
};
const sheetHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  borderBottom: '2px solid #111',
  paddingBottom: 10,
};
const contactLineStyle: React.CSSProperties = {
  display: 'flex',
  gap: 36,
  flexWrap: 'wrap',
  fontSize: 14,
  margin: '4px 0 16px',
  color: '#111',
};
const printTableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};
const printLabelCell: React.CSSProperties = {
  border: '1px solid #999',
  padding: '6px 10px',
  background: '#f3f3f3',
  fontWeight: 700,
  width: 190,
  verticalAlign: 'top',
  color: '#111',
};
const printValueCell: React.CSSProperties = {
  border: '1px solid #999',
  padding: '6px 10px',
  color: '#111',
  whiteSpace: 'pre-wrap',
};
const logTitleStyle: React.CSSProperties = {
  marginTop: 20,
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 800,
  color: '#111',
  textTransform: 'uppercase',
  letterSpacing: 0.6,
};
const logHeadCell: React.CSSProperties = {
  border: '1px solid #999',
  padding: '6px 8px',
  background: '#f3f3f3',
  fontSize: 12,
  textAlign: 'left',
  color: '#111',
};
const logCell: React.CSSProperties = {
  border: '1px solid #999',
  padding: '12px 8px',
  fontSize: 12,
  color: '#111',
};
const noteLineStyle: React.CSSProperties = {
  borderBottom: '1px solid #aaa',
  height: 26,
};
