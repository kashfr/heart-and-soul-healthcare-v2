'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, RefreshCw, LayoutGrid, List } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import { useAuth } from '@/components/AuthProvider';
import ReferralBoard from './ReferralBoard';
import ReferralTable from './ReferralTable';
import ReferralDetail from './ReferralDetail';
import PrintOverlay from './PrintOverlay';
import {
  statusFromStage,
  type Referral, type ReferralStage, type StaffOption,
} from './types';

type View = 'board' | 'table';
const VIEW_KEY = 'referrals-view';

export default function ReferralsPage() {
  // Deleting referrals is admin-only; the VA gets the full workflow minus delete.
  const { role } = useAuth();
  const canDelete = role === 'admin';
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('board');
  const [q, setQ] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [printList, setPrintList] = useState<Referral[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Per-referral request sequence. Each mutation bumps the counter and records
  // its number; a response only applies if it's still the latest for that id, so
  // a slow earlier response can't clobber a newer optimistic state.
  const reqCounter = useRef(0);
  const latestReq = useRef<Map<string, number>>(new Map());

  // Restore the saved view once on mount (SSR-safe).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === 'board' || saved === 'table') setView(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [refRes, staffRes] = await Promise.all([
        authedFetch('/api/admin/referrals'),
        authedFetch('/api/admin/users'),
      ]);
      if (!refRes.ok) {
        const data = await refRes.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${refRes.status}).`);
      }
      const refData = await refRes.json();
      setReferrals(refData.referrals ?? []);

      // Staff list powers the assignee picker; non-fatal if it fails.
      if (staffRes.ok) {
        const staffData = await staffRes.json();
        const options: StaffOption[] = (staffData.users ?? [])
          .filter((u: { active?: boolean }) => u.active !== false)
          .map((u: { uid: string; displayName: string | null; role: string | null }) => ({
            uid: u.uid,
            displayName: u.displayName ?? '(unnamed)',
            role: u.role ?? '',
            active: true,
          }))
          .sort((a: StaffOption, b: StaffOption) => a.displayName.localeCompare(b.displayName));
        setStaff(options);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load referrals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The open drawer is derived from the live list, so it always reflects the
  // latest data for its referral without a syncing effect. Resolves to null if
  // the referral disappears (e.g. filtered out by a refetch).
  const selected = useMemo(
    () => (selectedId ? referrals.find((r) => r.id === selectedId) ?? null : null),
    [referrals, selectedId]
  );

  // Close drawer / print preview on Escape.
  useEffect(() => {
    if (!selectedId && !printList) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (printList) setPrintList(null);
      else setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, printList]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return referrals.filter((r) => {
      if (assigneeFilter === 'unassigned' && r.assigneeUid) return false;
      if (assigneeFilter !== 'all' && assigneeFilter !== 'unassigned' && r.assigneeUid !== assigneeFilter) {
        return false;
      }
      if (!needle) return true;
      const hay =
        `${r.clientName} ${r.clientEmail} ${r.clientPhone} ${r.county} ${r.program} ${r.referrerName ?? ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [referrals, q, assigneeFilter]);

  // --- Mutations (optimistic, with server reconcile) ---

  // Shared optimistic-mutation runner. Applies `patch` to the card immediately,
  // sends the PATCH, and reconciles — but only if this is still the latest
  // request for the card, so overlapping mutations don't clobber each other. On
  // failure it rolls back just this card to the snapshot it captured (never a
  // full reload, which would also wipe an open drawer's optimistic edits).
  const mutate = useCallback(
    async (
      id: string,
      apply: (r: Referral) => Referral,
      body: Record<string, unknown>,
      failMsg: string
    ) => {
      const seq = ++reqCounter.current;
      latestReq.current.set(id, seq);
      const isLatest = () => latestReq.current.get(id) === seq;

      let snapshot: Referral | null = null;
      setReferrals((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          snapshot = r;
          return apply(r);
        })
      );
      setBusyId(id);

      try {
        const res = await authedFetch(`/api/admin/referrals/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Update failed (${res.status}).`);
        }
        const data = await res.json();
        if (data.referral && isLatest()) {
          setReferrals((prev) => prev.map((r) => (r.id === id ? data.referral : r)));
        }
      } catch (err) {
        if (isLatest()) {
          alert(err instanceof Error ? err.message : failMsg);
          if (snapshot) {
            const restore = snapshot;
            setReferrals((prev) => prev.map((r) => (r.id === id ? restore : r)));
          }
        }
      } finally {
        if (isLatest()) setBusyId((b) => (b === id ? null : b));
      }
    },
    []
  );

  const handleMove = useCallback(
    (id: string, stage: ReferralStage, order: number) =>
      mutate(
        id,
        (r) => ({ ...r, stage, status: statusFromStage(stage), order }),
        { stage, order },
        'Could not move referral.'
      ),
    [mutate]
  );

  const handleAssign = useCallback(
    (id: string, assignee: { uid: string; name: string } | null) =>
      mutate(
        id,
        (r) => ({ ...r, assigneeUid: assignee?.uid ?? null, assigneeName: assignee?.name ?? null }),
        { assignee },
        'Could not assign referral.'
      ),
    [mutate]
  );

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await authedFetch(`/api/admin/referrals/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Delete failed (${res.status}).`);
      }
      setReferrals((prev) => prev.filter((r) => r.id !== id));
      setSelectedId((cur) => (cur === id ? null : cur));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not delete referral.');
    }
  }, []);

  const handleDeleteMany = useCallback(async (ids: string[]) => {
    const results = await Promise.allSettled(
      ids.map((id) => authedFetch(`/api/admin/referrals/${id}`, { method: 'DELETE' }))
    );
    const deleted = new Set<string>();
    let failures = 0;
    results.forEach((res, i) => {
      if (res.status === 'fulfilled' && res.value.ok) deleted.add(ids[i]);
      else failures++;
    });
    if (deleted.size > 0) {
      setReferrals((prev) => prev.filter((r) => !deleted.has(r.id)));
      setSelectedId((cur) => (cur && deleted.has(cur) ? null : cur));
    }
    if (failures > 0) alert(`${failures} referral${failures === 1 ? '' : 's'} could not be deleted.`);
  }, []);

  const openPrint = (list: Referral[]) => {
    if (list.length > 0) setPrintList(list);
  };

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <header style={headerStyle}>
          <div>
            <p style={kickerStyle}>Admin</p>
            <h1 style={titleStyle}>Referrals</h1>
            <p style={subtitleStyle}>
              Track incoming referrals from the GAPP and Heart &amp; Soul websites through your
              intake pipeline.
            </p>
          </div>
          <button onClick={load} style={refreshBtnStyle} title="Refresh">
            <RefreshCw size={15} /> Refresh
          </button>
        </header>

        <div style={toolbarStyle}>
          <div style={segmentStyle}>
            <button
              onClick={() => changeView('board')}
              style={view === 'board' ? { ...segBtn, ...segBtnActive } : segBtn}
              aria-pressed={view === 'board'}
            >
              <LayoutGrid size={15} /> Board
            </button>
            <button
              onClick={() => changeView('table')}
              style={view === 'table' ? { ...segBtn, ...segBtnActive } : segBtn}
              aria-pressed={view === 'table'}
            >
              <List size={15} /> Table
            </button>
          </div>

          <div style={{ flex: 1 }} />

          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            style={filterSelectStyle}
            aria-label="Filter by assignee"
          >
            <option value="all">All assignees</option>
            <option value="unassigned">Unassigned</option>
            {staff.map((s) => (
              <option key={s.uid} value={s.uid}>
                {s.displayName}
              </option>
            ))}
          </select>

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
        ) : referrals.length === 0 ? (
          <div style={emptyStyle}>No referrals yet.</div>
        ) : view === 'board' ? (
          <ReferralBoard referrals={filtered} onOpen={(r) => setSelectedId(r.id)} onMove={handleMove} />
        ) : (
          <ReferralTable
            referrals={filtered}
            onOpen={(r) => setSelectedId(r.id)}
            onPrint={openPrint}
            onDelete={handleDeleteMany}
            canDelete={canDelete}
          />
        )}
      </div>

      {selected && (
        <ReferralDetail
          key={selected.id}
          referral={selected}
          staff={staff}
          busy={busyId === selected.id}
          onClose={() => setSelectedId(null)}
          onStageChange={(stage) => handleMove(selected.id, stage, selected.order)}
          onAssign={(assignee) => handleAssign(selected.id, assignee)}
          onPrint={(r) => openPrint([r])}
          onDelete={() => handleDelete(selected.id)}
          canDelete={canDelete}
        />
      )}

      {printList && <PrintOverlay printList={printList} onClose={() => setPrintList(null)} />}

      <style>{`
        @keyframes referralDrawerIn {
          from { transform: translateX(24px); opacity: 0.6; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  minHeight: '70vh',
  background: '#f5f7fa',
  padding: '32px 20px',
};
const wrapStyle: React.CSSProperties = { maxWidth: 1280, margin: '0 auto' };
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
const subtitleStyle: React.CSSProperties = { color: '#7f8c8d', fontSize: 15, marginTop: 6, maxWidth: 640 };
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
  flexShrink: 0,
};
const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 16,
  flexWrap: 'wrap',
};
const segmentStyle: React.CSSProperties = {
  display: 'inline-flex',
  background: '#eef1f5',
  borderRadius: 9,
  padding: 3,
  gap: 2,
};
const segBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'transparent',
  border: 'none',
  borderRadius: 7,
  padding: '6px 14px',
  fontSize: 13,
  fontWeight: 600,
  color: '#5c6b7a',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const segBtnActive: React.CSSProperties = {
  background: 'white',
  color: '#1a3a5c',
  boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
};
// Custom chevron-down to match selects elsewhere on the site (e.g. the patient
// form's "Sex" dropdown), with right padding so the arrow isn't cramped.
const SELECT_CHEVRON =
  "white url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\") no-repeat right 12px center";

const filterSelectStyle: React.CSSProperties = {
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  padding: '8px 12px',
  paddingRight: 36,
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
  background: SELECT_CHEVRON,
  backgroundSize: '14px',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const searchWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: 'white',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  padding: '7px 12px',
  minWidth: 260,
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
