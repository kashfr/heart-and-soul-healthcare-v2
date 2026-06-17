'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, X, Inbox, Phone, Mail, RefreshCw } from 'lucide-react';
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

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ReferralsPage() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>('active');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Referral | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

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

  // Close the detail modal on Escape.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

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

  const counts = useMemo(
    () => ({
      newCount: referrals.filter((r) => r.status === 'new').length,
      active: referrals.filter((r) => r.status !== 'archived').length,
      archived: referrals.filter((r) => r.status === 'archived').length,
    }),
    [referrals]
  );

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
                onClick={() => setScope(s)}
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
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Program</th>
                  <th style={thStyle}>County</th>
                  <th style={thStyle}>Source</th>
                  <th style={thStyle}>Received</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
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
                  <DetailRow label="Program" value={selected.program} />
                  <DetailRow label="County" value={selected.county} />
                  {selected.referrerName ? (
                    <DetailRow label="Referred by" value={selected.referrerName} />
                  ) : null}
                  {selected.details.map((d, i) => (
                    <DetailRow key={i} label={d.label} value={d.value} />
                  ))}
                </tbody>
              </table>
            </div>

            <div style={modalFooterStyle}>
              <StatusBadge status={selected.status} />
              <div style={{ flex: 1 }} />
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
const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid #f1f5f9',
  color: '#374151',
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
};
const actionBtnStyle: React.CSSProperties = {
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
