'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Archive as ArchiveIcon, Download, RotateCcw, X, Search } from 'lucide-react';
import {
  getSubmissions,
  setSubmissionsArchive,
  type ArchiveView,
  type SubmissionSummary,
} from '@/lib/submissions';
import { loadDraft, deleteDraft, type NoteDraft } from '@/lib/drafts';
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
const PAGE_SIZE = 25;

type Scope = 'active' | 'archived' | 'all';
type SortKey = 'submittedAt' | 'dateOfService' | 'clientName' | 'nurseName';
type SortDir = 'asc' | 'desc';
type DatePreset = '' | 'today' | 'week' | 'month' | '30d';

function parseDateOfService(mmddyyyy: string): Date | null {
  const [m, d, y] = mmddyyyy.split('/').map(Number);
  if (!m || !d || !y) return null;
  return new Date(y, m - 1, d);
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function presetRange(preset: DatePreset): { start: Date | null; end: Date | null } {
  if (!preset) return { start: null, end: null };
  const now = startOfDay(new Date());
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  if (preset === 'today') return { start: now, end };
  if (preset === 'week') {
    const start = new Date(now);
    start.setDate(start.getDate() - now.getDay());
    return { start, end };
  }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end };
  }
  if (preset === '30d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    return { start, end };
  }
  return { start: null, end: null };
}

function useDebounced<T>(value: T, delay = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default function SubmissionsPage() {
  const { user, role, loading: authLoading } = useAuth();
  const isNurse = role === 'nurse';
  const searchParams = useSearchParams();
  const router = useRouter();

  const scope: Scope =
    searchParams.get('view') === 'archived'
      ? 'archived'
      : searchParams.get('view') === 'all'
      ? 'all'
      : 'active';
  const qParam = searchParams.get('q') ?? '';
  const sortParam = (searchParams.get('sort') as SortKey) || 'submittedAt';
  const dirParam = (searchParams.get('dir') as SortDir) || 'desc';
  const credParam = searchParams.get('cred') ?? '';
  const nurseParam = searchParams.get('nurse') ?? '';
  const datePreset = (searchParams.get('range') as DatePreset) || '';
  const flagAbnormal = searchParams.get('abn') === '1';
  const flagIncident = searchParams.get('inc') === '1';
  const flagPhysNotified = searchParams.get('phy') === '1';
  const page = Math.max(1, Number(searchParams.get('p') || '1'));

  const [allSubmissions, setAllSubmissions] = useState<SubmissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('zip');
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<BatchExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [queryInput, setQueryInput] = useState(qParam);
  const debouncedQuery = useDebounced(queryInput, 250);
  const [draftSavedToast, setDraftSavedToast] = useState(false);
  const [draftDiscardedToast, setDraftDiscardedToast] = useState(false);
  // The caller's own in-progress draft (one per user). Surfaced in a banner
  // so nurses landing here after Save & exit can get back to their note.
  const [myDraft, setMyDraft] = useState<NoteDraft | null>(null);
  const [discardingDraft, setDiscardingDraft] = useState(false);

  // Show a confirmation toast when we arrive here via Save & exit or Discard.
  // Both share the same dismissal pattern; only one can be true at a time.
  useEffect(() => {
    const saved = searchParams.get('draftSaved') === '1';
    const discarded = searchParams.get('discarded') === '1';
    if (!saved && !discarded) return;
    if (saved) setDraftSavedToast(true);
    if (discarded) setDraftDiscardedToast(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('draftSaved');
    params.delete('discarded');
    const qs = params.toString();
    router.replace(qs ? `/admin/submissions?${qs}` : '/admin/submissions');
    const t = setTimeout(() => {
      setDraftSavedToast(false);
      setDraftDiscardedToast(false);
    }, 5000);
    return () => clearTimeout(t);
  }, [searchParams, router]);

  useEffect(() => {
    if (authLoading) return;
    (async () => {
      try {
        const options = isNurse && user ? { nurseId: user.uid } : undefined;
        setAllSubmissions(await getSubmissions(options));
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, isNurse, user]);

  // Load the caller's own draft (if any). Re-runs when the draftSaved toast
  // fires so the banner reflects a just-saved draft without a hard refresh.
  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const draft = await loadDraft(user.uid);
        if (!cancelled) setMyDraft(draft);
      } catch (err) {
        console.error('Failed to load draft:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, user, draftSavedToast]);

  const handleDiscardDraft = async () => {
    if (!user || discardingDraft) return;
    if (!window.confirm('Discard this draft? This cannot be undone.')) return;
    setDiscardingDraft(true);
    try {
      await deleteDraft(user.uid);
      setMyDraft(null);
    } catch (err) {
      console.error('Failed to discard draft:', err);
      alert('Could not discard the draft. Please try again.');
    } finally {
      setDiscardingDraft(false);
    }
  };

  const updateParams = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    router.replace(qs ? `/admin/submissions?${qs}` : '/admin/submissions');
  };

  // Sync debounced text input back to URL.
  useEffect(() => {
    if (debouncedQuery === qParam) return;
    updateParams({ q: debouncedQuery || null, p: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  // Scope filter (independent per role).
  const scoped = useMemo(() => {
    const key: 'archivedAt' | 'nurseArchivedAt' = isNurse ? 'nurseArchivedAt' : 'archivedAt';
    if (scope === 'all') return allSubmissions;
    return allSubmissions.filter((s) =>
      scope === 'archived' ? s[key] != null : s[key] == null
    );
  }, [allSubmissions, scope, isNurse]);

  const activeCount = useMemo(() => {
    const key: 'archivedAt' | 'nurseArchivedAt' = isNurse ? 'nurseArchivedAt' : 'archivedAt';
    return allSubmissions.filter((s) => s[key] == null).length;
  }, [allSubmissions, isNurse]);
  const archivedCount = allSubmissions.length - activeCount;

  // List of unique nurses for the admin filter dropdown.
  const nurseOptions = useMemo(() => {
    const set = new Set<string>();
    allSubmissions.forEach((s) => s.nurseName && set.add(s.nurseName));
    return Array.from(set).sort();
  }, [allSubmissions]);

  const { start: rangeStart, end: rangeEnd } = useMemo(
    () => presetRange(datePreset),
    [datePreset]
  );

  // Defined here (rather than after `sorted`) so the cross-scope-counts memo
  // below can short-circuit when nothing is filtered.
  const hasAnyFilter =
    !!qParam ||
    !!credParam ||
    !!nurseParam ||
    !!datePreset ||
    flagAbnormal ||
    flagIncident ||
    flagPhysNotified ||
    sortParam !== 'submittedAt' ||
    dirParam !== 'desc';

  // Search + filters.
  const filtered = useMemo(() => {
    const q = qParam.trim().toLowerCase();
    return scoped.filter((s) => {
      if (q) {
        const hay =
          `${s.clientName} ${s.nurseName} ${s.diagnosis} ${s.dateOfService}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (credParam && s.credential !== credParam) return false;
      if (nurseParam && s.nurseName !== nurseParam) return false;
      if (flagAbnormal && !s.hasAbnormalVitals) return false;
      if (flagIncident && !s.hasIncident) return false;
      if (flagPhysNotified && !s.physicianNotified) return false;
      if (rangeStart || rangeEnd) {
        const d = parseDateOfService(s.dateOfService);
        if (!d) return false;
        if (rangeStart && d < rangeStart) return false;
        if (rangeEnd && d > rangeEnd) return false;
      }
      return true;
    });
  }, [
    scoped,
    qParam,
    credParam,
    nurseParam,
    flagAbnormal,
    flagIncident,
    flagPhysNotified,
    rangeStart,
    rangeEnd,
  ]);

  // Cross-scope match counts — apply every filter EXCEPT scope to the full
  // submission set, then bucket by archived state. Powers the "0 in Active —
  // try Archived (3)" affordance so a search that lands in the wrong tab
  // doesn't dead-end. Skipped entirely when no filter is active.
  const crossScopeCounts = useMemo(() => {
    if (!hasAnyFilter) return null;
    const q = qParam.trim().toLowerCase();
    const archivedKey: 'archivedAt' | 'nurseArchivedAt' = isNurse
      ? 'nurseArchivedAt'
      : 'archivedAt';
    let active = 0;
    let archived = 0;
    for (const s of allSubmissions) {
      if (q) {
        const hay = `${s.clientName} ${s.nurseName} ${s.diagnosis} ${s.dateOfService}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      if (credParam && s.credential !== credParam) continue;
      if (nurseParam && s.nurseName !== nurseParam) continue;
      if (flagAbnormal && !s.hasAbnormalVitals) continue;
      if (flagIncident && !s.hasIncident) continue;
      if (flagPhysNotified && !s.physicianNotified) continue;
      if (rangeStart || rangeEnd) {
        const d = parseDateOfService(s.dateOfService);
        if (!d) continue;
        if (rangeStart && d < rangeStart) continue;
        if (rangeEnd && d > rangeEnd) continue;
      }
      if (s[archivedKey] != null) archived++;
      else active++;
    }
    return { active, archived, total: active + archived };
  }, [
    hasAnyFilter,
    allSubmissions,
    isNurse,
    qParam,
    credParam,
    nurseParam,
    flagAbnormal,
    flagIncident,
    flagPhysNotified,
    rangeStart,
    rangeEnd,
  ]);

  // Sort.
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let av: string | number | null = '';
      let bv: string | number | null = '';
      if (sortParam === 'submittedAt') {
        av = a.submittedAt?.getTime() ?? 0;
        bv = b.submittedAt?.getTime() ?? 0;
      } else if (sortParam === 'dateOfService') {
        av = parseDateOfService(a.dateOfService)?.getTime() ?? 0;
        bv = parseDateOfService(b.dateOfService)?.getTime() ?? 0;
      } else if (sortParam === 'clientName') {
        av = a.clientName.toLowerCase();
        bv = b.clientName.toLowerCase();
      } else {
        av = a.nurseName.toLowerCase();
        bv = b.nurseName.toLowerCase();
      }
      if (av < bv) return dirParam === 'asc' ? -1 : 1;
      if (av > bv) return dirParam === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [filtered, sortParam, dirParam]);

  // Pagination.
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, sorted.length);
  const submissions = sorted.slice(pageStart, pageEnd);

  const setScope = (next: Scope) => {
    setSelected(new Set());
    updateParams({ view: next === 'active' ? null : next, p: null });
  };

  const setSort = (key: SortKey) => {
    if (sortParam === key) {
      updateParams({ dir: dirParam === 'asc' ? 'desc' : 'asc', p: null });
    } else {
      updateParams({ sort: key, dir: 'desc', p: null });
    }
  };

  const clearAllFilters = () => {
    setQueryInput('');
    setSelected(new Set());
    updateParams({
      q: null,
      cred: null,
      nurse: null,
      range: null,
      abn: null,
      inc: null,
      phy: null,
      sort: null,
      dir: null,
      p: null,
    });
  };

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const selectedSubmissions = useMemo(
    () => sorted.filter((s) => selected.has(s.id)),
    [sorted, selected]
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

  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const ids = submissions.map((s) => s.id);
      const allOnPage = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allOnPage) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const handleBulkArchive = async (action: 'archive' | 'restore') => {
    if (!user || !role) return;
    if (selectedIds.length === 0) return;
    if (action === 'archive') {
      const msg = isNurse
        ? `Archive ${selectedIds.length} note${selectedIds.length === 1 ? '' : 's'} from your view? Your supervisor will still see them. Nothing is deleted.`
        : `Archive ${selectedIds.length} note${selectedIds.length === 1 ? '' : 's'}? They will be hidden from the default view but nothing is deleted.`;
      if (!window.confirm(msg)) return;
    }
    setBusy(true);
    try {
      await setSubmissionsArchive(
        selectedIds,
        isNurse ? 'nurse' : 'staff',
        action,
        { uid: user.uid, displayName: user.displayName, role }
      );
      setAllSubmissions((prev) =>
        prev.map((s) => {
          if (!selected.has(s.id)) return s;
          const key = isNurse ? 'nurseArchivedAt' : 'archivedAt';
          return { ...s, [key]: action === 'archive' ? new Date() : null };
        })
      );
      clearSelection();
    } catch (err) {
      console.error(`Failed to ${action}:`, err);
      alert(`Failed to ${action}. Please try again.`);
    } finally {
      setBusy(false);
    }
  };

  const handleRowArchive = async (s: SubmissionSummary, action: 'archive' | 'restore') => {
    if (!user || !role) return;
    if (action === 'archive') {
      const msg = isNurse
        ? `Archive the note for ${s.clientName} on ${s.dateOfService} from your view? Your supervisor will still see it. Nothing is deleted.`
        : `Archive the note for ${s.clientName} on ${s.dateOfService}? It will be hidden from the default view but nothing is deleted.`;
      if (!window.confirm(msg)) return;
    }
    setBusy(true);
    try {
      await setSubmissionsArchive(
        [s.id],
        isNurse ? 'nurse' : 'staff',
        action,
        { uid: user.uid, displayName: user.displayName, role }
      );
      setAllSubmissions((prev) =>
        prev.map((item) => {
          if (item.id !== s.id) return item;
          const key = isNurse ? 'nurseArchivedAt' : 'archivedAt';
          return { ...item, [key]: action === 'archive' ? new Date() : null };
        })
      );
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(s.id);
        return next;
      });
    } catch (err) {
      console.error(`Failed to ${action}:`, err);
      alert(`Failed to ${action}. Please try again.`);
    } finally {
      setBusy(false);
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

  const pageIds = submissions.map((s) => s.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected = pageIds.some((id) => selected.has(id)) && !allOnPageSelected;

  // The draft row is pinned at the top of the table on Active and All scopes
  // (never Archived — drafts aren't archivable). It only appears on the first
  // page since it isn't counted in the paginator.
  const showDraftRow = myDraft != null && scope !== 'archived' && safePage === 1;

  const sortIndicator = (key: SortKey) =>
    sortParam === key ? (dirParam === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        {draftSavedToast && (
          <div
            role="status"
            style={{
              background: '#d1fae5',
              border: '1px solid #10b981',
              color: '#065f46',
              borderRadius: '6px',
              padding: '12px 16px',
              marginBottom: '16px',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            ✓ Draft saved. You can resume it anytime from the progress note page.
          </div>
        )}
        {draftDiscardedToast && (
          <div
            role="status"
            style={{
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              color: '#991b1b',
              borderRadius: '6px',
              padding: '12px 16px',
              marginBottom: '16px',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            Draft discarded. Nothing was saved.
          </div>
        )}
        <div style={headerStyle}>
          <h1 style={titleStyle}>Progress Note Submissions</h1>
          <p style={subtitleStyle}>All submitted nursing progress notes</p>
        </div>

        <div style={tabsStyle} role="tablist" aria-label="Submissions view">
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'active'}
            onClick={() => setScope('active')}
            style={scope === 'active' ? tabActiveStyle : tabStyle}
          >
            Active <span style={tabCountStyle}>{activeCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'archived'}
            onClick={() => setScope('archived')}
            style={scope === 'archived' ? tabActiveStyle : tabStyle}
          >
            Archived <span style={tabCountStyle}>{archivedCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'all'}
            onClick={() => setScope('all')}
            style={scope === 'all' ? tabActiveStyle : tabStyle}
            title="Search across active + archived"
          >
            All <span style={tabCountStyle}>{allSubmissions.length}</span>
          </button>
        </div>

        {/* Filter bar */}
        <div style={filterBarStyle}>
          <div style={searchWrapStyle}>
            <Search size={14} style={searchIconStyle} aria-hidden />
            <input
              type="search"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Search client, nurse, diagnosis, date…"
              style={searchInputStyle}
              aria-label="Search submissions"
            />
          </div>

          <select
            value={datePreset}
            onChange={(e) => updateParams({ range: e.target.value || null, p: null })}
            style={selectStyle}
            aria-label="Date of service range"
          >
            <option value="">Any date</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="30d">Last 30 days</option>
          </select>

          <select
            value={credParam}
            onChange={(e) => updateParams({ cred: e.target.value || null, p: null })}
            style={selectStyle}
            aria-label="Credential"
          >
            <option value="">All credentials</option>
            <option value="HHA">HHA</option>
            <option value="CNA">CNA</option>
            <option value="LPN">LPN</option>
            <option value="RN">RN</option>
          </select>

          {!isNurse && nurseOptions.length > 0 && (
            <select
              value={nurseParam}
              onChange={(e) => updateParams({ nurse: e.target.value || null, p: null })}
              style={selectStyle}
              aria-label="Nurse"
            >
              <option value="">All nurses</option>
              {nurseOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}

          <select
            value={`${sortParam}:${dirParam}`}
            onChange={(e) => {
              const [k, d] = e.target.value.split(':') as [SortKey, SortDir];
              updateParams({ sort: k, dir: d, p: null });
            }}
            style={selectStyle}
            aria-label="Sort by"
          >
            <option value="submittedAt:desc">Newest submitted</option>
            <option value="submittedAt:asc">Oldest submitted</option>
            <option value="dateOfService:desc">Newest service date</option>
            <option value="dateOfService:asc">Oldest service date</option>
            <option value="clientName:asc">Client A–Z</option>
            <option value="clientName:desc">Client Z–A</option>
            <option value="nurseName:asc">Nurse A–Z</option>
            <option value="nurseName:desc">Nurse Z–A</option>
          </select>
        </div>

        <div style={flagsRowStyle}>
          <label style={flagLabelStyle}>
            <input
              type="checkbox"
              checked={flagAbnormal}
              onChange={(e) => updateParams({ abn: e.target.checked ? '1' : null, p: null })}
            />
            Abnormal vitals
          </label>
          <label style={flagLabelStyle}>
            <input
              type="checkbox"
              checked={flagIncident}
              onChange={(e) => updateParams({ inc: e.target.checked ? '1' : null, p: null })}
            />
            Incident reported
          </label>
          <label style={flagLabelStyle}>
            <input
              type="checkbox"
              checked={flagPhysNotified}
              onChange={(e) => updateParams({ phy: e.target.checked ? '1' : null, p: null })}
            />
            Physician notified
          </label>

          <div style={{ flex: 1 }} />

          {hasAnyFilter && (
            <button type="button" onClick={clearAllFilters} style={clearFiltersBtnStyle}>
              <X size={12} /> Clear all
            </button>
          )}
        </div>

        {/* Prominent result banner — only shown when a filter is active.
            Tells the nurse/admin exactly how many matches they have, and when
            the current scope has zero hits, surfaces matches in other scopes
            as one-click switches so a search doesn't dead-end on the wrong
            tab. */}
        {hasAnyFilter && (
          <div
            style={{
              ...resultBannerStyle,
              ...(sorted.length === 0 && crossScopeCounts && crossScopeCounts.total > 0
                ? resultBannerEmptyStyle
                : sorted.length === 0
                  ? resultBannerNoneStyle
                  : resultBannerHitStyle),
            }}
          >
            {sorted.length > 0 && (
              <>
                <strong style={{ fontSize: 15, color: '#0f172a' }}>
                  {sorted.length} {sorted.length === 1 ? 'match' : 'matches'}
                </strong>
                <span style={{ color: '#475569', fontSize: 13 }}>
                  {sorted.length !== scoped.length && (
                    <> · filtered from {scoped.length} in {scope === 'all' ? 'All' : scope === 'archived' ? 'Archived' : 'Active'}</>
                  )}
                  {pageCount > 1 && (
                    <> · showing {pageStart + 1}–{pageEnd}</>
                  )}
                </span>
              </>
            )}
            {sorted.length === 0 && (
              <>
                <strong style={{ fontSize: 15, color: '#7c2d12' }}>
                  No matches in {scope === 'all' ? 'All' : scope === 'archived' ? 'Archived' : 'Active'}
                </strong>
                {crossScopeCounts && crossScopeCounts.total > 0 && (
                  <span style={{ color: '#334155', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span>·</span>
                    <span>Try:</span>
                    {scope !== 'active' && crossScopeCounts.active > 0 && (
                      <button type="button" onClick={() => setScope('active')} style={scopeJumpBtnStyle}>
                        Active ({crossScopeCounts.active})
                      </button>
                    )}
                    {scope !== 'archived' && crossScopeCounts.archived > 0 && (
                      <button type="button" onClick={() => setScope('archived')} style={scopeJumpBtnStyle}>
                        Archived ({crossScopeCounts.archived})
                      </button>
                    )}
                    {scope !== 'all' && (
                      <button type="button" onClick={() => setScope('all')} style={scopeJumpBtnStyle}>
                        All ({crossScopeCounts.total})
                      </button>
                    )}
                  </span>
                )}
              </>
            )}
          </div>
        )}

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
            <button onClick={openExportModal} style={exportBtnStyle} disabled={busy}>
              <Download size={14} />
              Export as PDF
            </button>
            {scope !== 'archived' ? (
              <button
                onClick={() => handleBulkArchive('archive')}
                style={archiveBtnStyle}
                disabled={busy}
              >
                <ArchiveIcon size={14} />
                Archive
              </button>
            ) : (
              <button
                onClick={() => handleBulkArchive('restore')}
                style={restoreBtnStyle}
                disabled={busy}
              >
                <RotateCcw size={14} />
                Restore
              </button>
            )}
            <button onClick={clearSelection} style={clearBtnStyle} disabled={busy}>
              <X size={14} />
              Clear
            </button>
          </div>
        )}

        {loading ? (
          <div style={loadingStyle}>
            <p>Loading submissions...</p>
          </div>
        ) : sorted.length === 0 && !showDraftRow ? (
          <div style={emptyStyle}>
            <p style={emptyTitleStyle}>
              {allSubmissions.length === 0 ? 'No submissions yet' : 'No matches'}
            </p>
            <p style={emptySubStyle}>
              {allSubmissions.length === 0
                ? 'Submitted progress notes will appear here.'
                : 'Try clearing a filter or broadening your search.'}
            </p>
          </div>
        ) : (
          <>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 40 }}>
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someOnPageSelected;
                        }}
                        onChange={toggleAllOnPage}
                        aria-label="Select all on this page"
                        style={checkboxStyle}
                      />
                    </th>
                    <th
                      style={{ ...thStyle, cursor: 'pointer' }}
                      onClick={() => setSort('dateOfService')}
                    >
                      Date of Service{sortIndicator('dateOfService')}
                    </th>
                    <th
                      style={{ ...thStyle, cursor: 'pointer' }}
                      onClick={() => setSort('clientName')}
                    >
                      Client Name{sortIndicator('clientName')}
                    </th>
                    <th
                      style={{ ...thStyle, cursor: 'pointer' }}
                      onClick={() => setSort('nurseName')}
                    >
                      Nurse{sortIndicator('nurseName')}
                    </th>
                    <th style={thStyle}>Credential</th>
                    <th style={thStyle}>Flags</th>
                    <th
                      style={{ ...thStyle, cursor: 'pointer' }}
                      onClick={() => setSort('submittedAt')}
                    >
                      Submitted At{sortIndicator('submittedAt')}
                    </th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {showDraftRow && myDraft && (
                    <tr style={{ background: '#fffbeb', borderLeft: '3px solid #f59e0b' }}>
                      <td style={tdStyle}>
                        {/* Draft rows are never bulk-selectable — batch export
                            and archive only apply to submitted notes. */}
                        <input
                          type="checkbox"
                          disabled
                          aria-label="Drafts cannot be selected"
                          style={{ ...checkboxStyle, cursor: 'not-allowed', opacity: 0.4 }}
                        />
                      </td>
                      <td style={tdStyle}>
                        {myDraft.dateOfService
                          ? (() => {
                              // dateOfService is stored as YYYY-MM-DD in the draft
                              const [y, m, d] = myDraft.dateOfService.split('-');
                              return y && m && d ? `${m}/${d}/${y}` : myDraft.dateOfService;
                            })()
                          : '—'}
                      </td>
                      <td style={tdStyle}>{myDraft.clientName || <em style={{ color: '#94a3b8' }}>Not set</em>}</td>
                      <td style={tdStyle}>{myDraft.nurseName || <em style={{ color: '#94a3b8' }}>Not set</em>}</td>
                      <td style={tdStyle}>
                        <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={draftBadgeStyle} title="This note hasn't been submitted yet">
                          Draft
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {myDraft.updatedAt ? (
                          <span title={myDraft.updatedAt.toLocaleString()}>
                            Saved {myDraft.updatedAt.toLocaleString([], {
                              month: 'short', day: 'numeric',
                              hour: 'numeric', minute: '2-digit',
                            })}
                          </span>
                        ) : '--'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                          <Link href="/progress-note?resume=1" style={viewBtnStyle}>
                            Resume
                          </Link>
                          <button
                            onClick={handleDiscardDraft}
                            disabled={discardingDraft}
                            style={rowArchiveBtnStyle}
                          >
                            {discardingDraft ? 'Discarding…' : 'Discard'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {submissions.map((s, i) => {
                    const isSelected = selected.has(s.id);
                    const rowArchived = isNurse ? s.nurseArchivedAt != null : s.archivedAt != null;
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
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {s.hasAbnormalVitals && (
                              <span style={flagBadgeRed} title="Abnormal vitals">
                                Vitals
                              </span>
                            )}
                            {s.hasIncident && (
                              <span style={flagBadgeAmber} title="Incident reported">
                                Incident
                              </span>
                            )}
                            {s.physicianNotified && (
                              <span style={flagBadgeBlue} title="Physician notified">
                                Physician
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={tdStyle}>
                          {s.submittedAt ? s.submittedAt.toLocaleString() : '--'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                            <Link href={`/admin/submissions/${s.id}`} style={viewBtnStyle}>
                              View
                            </Link>
                            {rowArchived ? (
                              <button
                                onClick={() => handleRowArchive(s, 'restore')}
                                style={rowArchiveBtnStyle}
                                disabled={busy}
                              >
                                Restore
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRowArchive(s, 'archive')}
                                style={rowArchiveBtnStyle}
                                disabled={busy}
                              >
                                Archive
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pageCount > 1 && (
              <div style={paginationStyle}>
                <button
                  type="button"
                  onClick={() => updateParams({ p: String(safePage - 1) })}
                  disabled={safePage <= 1}
                  style={pageBtnStyle}
                >
                  ← Prev
                </button>
                <span style={pageMetaStyle}>
                  Page {safePage} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => updateParams({ p: String(safePage + 1) })}
                  disabled={safePage >= pageCount}
                  style={pageBtnStyle}
                >
                  Next →
                </button>
              </div>
            )}
          </>
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

const tabsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  marginBottom: 14,
  borderBottom: '1px solid #e0e0e0',
};

const tabStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  padding: '10px 16px',
  fontSize: 14,
  fontWeight: 600,
  color: '#5c6b7a',
  cursor: 'pointer',
  fontFamily: 'inherit',
  marginBottom: -1,
};

const tabActiveStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: '10px 16px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  color: '#2c3e50',
  borderBottom: '2px solid #27ae60',
  marginBottom: -1,
};

const tabCountStyle: React.CSSProperties = {
  display: 'inline-block',
  marginLeft: 6,
  padding: '1px 8px',
  background: '#eef1f4',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  color: '#5c6b7a',
};

const filterBarStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
  marginBottom: 10,
};

const searchWrapStyle: React.CSSProperties = {
  position: 'relative',
  flex: '1 1 260px',
  minWidth: 220,
};

const searchIconStyle: React.CSSProperties = {
  position: 'absolute',
  left: 10,
  top: '50%',
  transform: 'translateY(-50%)',
  color: '#7f8c8d',
  pointerEvents: 'none',
};

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px 8px 30px',
  border: '1px solid #dfe5ec',
  borderRadius: 6,
  fontSize: 14,
  fontFamily: 'inherit',
};

const selectStyle: React.CSSProperties = {
  // Custom chevron via inline SVG so the dropdown matches the contact page's
  // form-select look. Native chevron is suppressed with appearance: none.
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  padding: '8px 32px 8px 10px',
  border: '1px solid #dfe5ec',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'inherit',
  background:
    "white url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\") no-repeat right 10px center",
  backgroundSize: '14px',
  color: '#2c3e50',
  cursor: 'pointer',
};

const flagsRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 14,
  marginBottom: 14,
  padding: '8px 12px',
  background: '#f8fafc',
  borderRadius: 6,
  border: '1px solid #eef1f4',
  fontSize: 13,
};

const flagLabelStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  color: '#2c3e50',
  cursor: 'pointer',
};

const resultBannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  padding: '10px 14px',
  borderRadius: 8,
  marginBottom: 12,
  fontSize: 14,
  border: '1px solid transparent',
};

// Filter active, matches found.
const resultBannerHitStyle: React.CSSProperties = {
  background: '#f0f9ff',
  borderColor: '#bae6fd',
};

// Filter active, no matches in current scope, matches in another scope.
const resultBannerEmptyStyle: React.CSSProperties = {
  background: '#fff7ed',
  borderColor: '#fed7aa',
};

// Filter active, zero matches anywhere.
const resultBannerNoneStyle: React.CSSProperties = {
  background: '#f8fafc',
  borderColor: '#e2e8f0',
};

const scopeJumpBtnStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #fb923c',
  color: '#9a3412',
  padding: '4px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const clearFiltersBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: 'white',
  color: '#5c6b7a',
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid #dfe5ec',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const archiveBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#5c6b7a',
  color: 'white',
  padding: '8px 14px',
  borderRadius: 6,
  border: 'none',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const restoreBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#34495e',
  color: 'white',
  padding: '8px 14px',
  borderRadius: 6,
  border: 'none',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
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
  userSelect: 'none',
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

const flagBadgeBase: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  borderRadius: 3,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.3,
  whiteSpace: 'nowrap',
};

const flagBadgeRed: React.CSSProperties = {
  ...flagBadgeBase,
  background: '#fdecea',
  color: '#b3261e',
};

const flagBadgeAmber: React.CSSProperties = {
  ...flagBadgeBase,
  background: '#fff4e5',
  color: '#a35400',
};

const flagBadgeBlue: React.CSSProperties = {
  ...flagBadgeBase,
  background: '#e8eef4',
  color: '#1a3a5c',
};

const draftBadgeStyle: React.CSSProperties = {
  ...flagBadgeBase,
  background: '#fef3c7',
  color: '#92400e',
  border: '1px solid #fcd34d',
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

const rowArchiveBtnStyle: React.CSSProperties = {
  display: 'inline-block',
  background: '#f5f5f5',
  color: '#2c3e50',
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

const paginationStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
  marginTop: 16,
};

const pageBtnStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid #dfe5ec',
  color: '#2c3e50',
  padding: '6px 12px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const pageMetaStyle: React.CSSProperties = {
  color: '#5c6b7a',
  fontSize: 13,
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
