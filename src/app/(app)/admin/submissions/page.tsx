'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Archive as ArchiveIcon, Download, RotateCcw, X, Search, Plus, CheckCircle2, Clock, FileSpreadsheet } from 'lucide-react';
import {
  getSubmissions,
  getNurseAccessibleSubmissions,
  setSubmissionsArchive,
  needsCosign,
  clarificationTurnLabel,
  type ArchiveView,
  type SubmissionSummary,
} from '@/lib/submissions';
import { loadDraft, deleteDraft, type NoteDraft } from '@/lib/drafts';
import { authedFetch } from '@/lib/authedFetch';
import CoSignModal from '@/components/CoSignModal';
import {
  buildZip,
  buildMergedPdf,
  triggerDownload,
  type BatchExportProgress,
  type ExportFormat,
} from '@/lib/batchExport';
import { logExport } from '@/lib/audit';
import { useAuth, useEffectiveUser } from '@/components/AuthProvider';
import { useSettings } from '@/components/SettingsProvider';
import { RN_COSIGN_SESSION_KEY } from '@/lib/settings';
import { RANGE_PRESETS, describeRange, isRangePreset, resolveRange, type RangePreset } from '@/lib/dateRange';
import {
  QTY_VIEW_LABEL,
  fmtDollars,
  fmtH,
  fmtUnits,
  hoursInRange,
  segmentsToDollars,
  segmentsToUnits,
  splitShiftByDay,
  totalOfSegments,
  touchesRange,
  type DaySegment,
  type HoursBucket,
  type QtyView,
} from '@/lib/shiftHours';
import { getBillingRates, type BillingRate } from '@/lib/billingRates';
import { resolveRate, resolveRateRow } from '@/lib/billingRatesShared';
import { getPatients } from '@/lib/patients';
import { getProgram } from '@/lib/programs';
import { formatDateUS, formatDateUSFile } from '@/lib/dateFormat';

const MAX_BATCH = 50;
// PAGE_SIZE used to be a constant here; it's now driven by
// settings.submissions.pageSize so an admin can tune it from
// /admin/settings without a deploy. The constant below is the
// fallback for any code path that runs before the settings hook
// hydrates (rare — the page only renders the table after auth).
const FALLBACK_PAGE_SIZE = 25;

// 'team' is nurse-only: notes for patients she's on the care team for
// where the AUTHOR is somebody else. Used to browse what her teammates
// have written without her own notes mixed in. Archive state still
// applies (uses the nurse-personal archive field), so a nurse can
// archive a care-team note from her view without affecting anyone
// else's. Admin/supervisor never see this scope.
type Scope = 'active' | 'archived' | 'all' | 'team';
type SortKey = 'submittedAt' | 'dateOfService' | 'clientName' | 'nurseName' | 'hours' | 'credential' | 'flags';
type SortDir = 'asc' | 'desc';

function parseDateOfService(mmddyyyy: string): Date | null {
  const [m, d, y] = mmddyyyy.split('/').map(Number);
  if (!m || !d || !y) return null;
  return new Date(y, m - 1, d);
}

/** Local calendar date as 'YYYY-MM-DD' (the date-of-service convention). */
function localTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CREDENTIAL_RANK: Record<string, number> = { RN: 0, LPN: 1, CNA: 2, HHA: 3 };
function credentialRank(c: string): number {
  return CREDENTIAL_RANK[(c || '').toUpperCase()] ?? 9;
}

/** Hours per client/nurse for the pivot under the totals strip. Shift hours
 *  and RN oversight hours are kept apart (they are paid from different
 *  authorization lines and are never summed). */
interface HoursPivotRow {
  key: string;
  hours: number;
  /** Billable units (each calendar day rounded up separately). */
  units: number;
  shifts: number;
  rnHours: number;
  rnUnits: number;
  visits: number;
  /** Dollars at each client's line rate; null when any counted row lacks a rate. */
  dollars: number | null;
  rnDollars: number | null;
  /** By-day pivot only: who worked that day. By-nurse pivot: the nurse's credential(s). */
  who?: string;
}

function csvCell(v: string | number): string {
  const str = String(v ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
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
  const { user, profile, loading: authLoading } = useAuth();
  // Effective identity: the impersonated nurse when an admin is "viewing as".
  // The list scopes to the effective nurse so an admin previews her view.
  const { uid: effectiveUid, role, isViewingAs } = useEffectiveUser();
  const isNurse = role === 'nurse';
  /** Whether the signed-in user can co-sign HHA/CNA/LPN notes. Their staff
      profile credential must be RN; their portal role can be anything. */
  const isRn = profile?.credential === 'RN';
  const searchParams = useSearchParams();
  const router = useRouter();
  // Org-wide defaults from /admin/settings. `settings` is the merged
  // shape and never null, so we can read fields directly without a
  // loading check — the very first render uses the hard-coded
  // DEFAULT_SETTINGS until the live doc lands a moment later.
  const { settings: appSettings, ready: settingsReady } = useSettings();
  const subDefaults = appSettings.submissions;
  // Memoize the cosign required-credentials Set so every needsCosign
  // call below gets the same reference (and doesn't rebuild the Set
  // on every row render).
  const requiredCosignCreds = useMemo(
    () => new Set(appSettings.cosign.requiredCredentials),
    [appSettings.cosign.requiredCredentials],
  );

  const scope: Scope =
    searchParams.get('view') === 'archived'
      ? 'archived'
      : searchParams.get('view') === 'all'
      ? 'all'
      : searchParams.get('view') === 'team'
      ? 'team'
      : (subDefaults.defaultScope as Scope);
  const qParam = searchParams.get('q') ?? '';
  // Default sort + direction now come from settings/global so an admin
  // can flip them from /admin/settings without a code change. URL
  // params still override per-session.
  const sortParam = (searchParams.get('sort') as SortKey) || subDefaults.defaultSort;
  const dirParam = (searchParams.get('dir') as SortDir) || subDefaults.defaultDir;
  const credParam = searchParams.get('cred') ?? '';
  const nurseParam = searchParams.get('nurse') ?? '';
  const clientParam = searchParams.get('client') ?? '';
  // Owner-only views for the Hours column / totals: hours or 15-minute units
  // (?u=units), and, independently, dollars at the client's line rate shown
  // alongside (?usd=1).
  const qtyView: QtyView = searchParams.get('u') === 'units' ? 'units' : 'hours';
  const showDollars = searchParams.get('usd') === '1';
  // Date-of-service range: a relative preset, a picked month (?range=m&m=YYYY-MM)
  // or an explicit window (?range=c&from=&to=). Resolved to ISO bounds below.
  const rangeRaw = searchParams.get('range');
  const rangePreset: RangePreset = isRangePreset(rangeRaw) ? rangeRaw : '';
  const monthParam = searchParams.get('m') ?? '';
  const fromParam = searchParams.get('from') ?? '';
  const toParam = searchParams.get('to') ?? '';
  const flagAbnormal = searchParams.get('abn') === '1';
  const flagIncident = searchParams.get('inc') === '1';
  const flagPhysNotified = searchParams.get('phy') === '1';
  const flagNeedsCosign = searchParams.get('cosign') === '1';
  const flagHospitalEr = searchParams.get('hosp') === '1';
  const flagMedChange = searchParams.get('med') === '1';
  const flagOpen = searchParams.get('flag') === '1';
  const page = Math.max(1, Number(searchParams.get('p') || '1'));
  // Current filter/sort state, carried to the note detail page so its
  // "Back to Submissions" returns to this exact filtered view.
  const returnQs = searchParams.toString();

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
  /** Which form the saved/discarded draft came from ('oversight' or the shift note). */
  const [draftToastKind, setDraftToastKind] = useState<'note' | 'oversight'>('note');
  const [draftDiscardedToast, setDraftDiscardedToast] = useState(false);
  /** The notes currently shown in the co-sign modal (1 = per-note flow, many = batch). */
  const [cosignTargets, setCosignTargets] = useState<SubmissionSummary[]>([]);
  /** Toast: how many notes were just cosigned. Auto-clears. */
  const [cosignToast, setCosignToast] = useState<number>(0);
  // The caller's own in-progress draft (one per user). Surfaced in a banner
  // so nurses landing here after Save & exit can get back to their note.
  const [myDraft, setMyDraft] = useState<NoteDraft | null>(null);
  const [discardingDraft, setDiscardingDraft] = useState(false);

  // Show a confirmation toast when we arrive here via Save & exit or Discard.
  // Both share the same dismissal pattern; only one can be true at a time.
  useEffect(() => {
    const savedParam = searchParams.get('draftSaved');
    const discardedParam = searchParams.get('discarded');
    const saved = savedParam === '1' || savedParam === 'oversight';
    const discarded = discardedParam === '1' || discardedParam === 'oversight';
    if (!saved && !discarded) return;
    setDraftToastKind(savedParam === 'oversight' || discardedParam === 'oversight' ? 'oversight' : 'note');
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

  const reloadSubmissions = useCallback(async () => {
    if (!user) return;
    // Pass the admin-configured vital range overrides so the
    // "Abnormal vitals" pill respects custom thresholds set via
    // /admin/settings. The helper handles undefined fine — it just
    // uses the hard-coded defaults.
    const vitalsOverride = appSettings.vitals.rangesByAgeGroup;
    // Nurses see two slices: their own authored notes PLUS any notes
    // for patients on their care team (Phase 3 visibility). The
    // multi-query helper handles the merge so the dashboard can keep
    // treating the result as a single flat list. Admin/supervisor
    // still get the full set via the unscoped path.
    if (isNurse && effectiveUid) {
      setAllSubmissions(await getNurseAccessibleSubmissions(effectiveUid, { vitalsOverride }));
    } else {
      setAllSubmissions(await getSubmissions({ vitalsOverride }));
    }
  }, [isNurse, effectiveUid, appSettings.vitals.rangesByAgeGroup]);

  useEffect(() => {
    if (authLoading) return;
    (async () => {
      try {
        await reloadSubmissions();
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, reloadSubmissions]);

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

  // When an RN lands here with no filters applied at all, default to the
  // "Needs co-signature" view — that's almost always what they came for.
  // We only do this once per session via sessionStorage so the RN can clear
  // the filter and not have it reappear every time they navigate back.
  // The whole behavior is opt-out via settings.submissions.rnDefaultsToNeedsCosign
  // so an admin can disable it for the org from /admin/settings.
  //
  // IMPORTANT: wait for `settingsReady`. SettingsProvider serves the hard-coded
  // DEFAULT_SETTINGS (rnDefaultsToNeedsCosign: true) until the saved doc loads.
  // Without this gate, on a fresh mount (e.g. landing here after discarding a
  // new note) the effect would read the default `true` and apply ?cosign=1 even
  // when the org has the setting turned OFF — then the sessionStorage guard hid
  // it from re-firing, which is exactly the "checked once, can't reproduce" bug.
  useEffect(() => {
    if (!isRn || authLoading || !settingsReady) return;
    if (!subDefaults.rnDefaultsToNeedsCosign) return;
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(RN_COSIGN_SESSION_KEY) === '1') return;
    const hasAnyFilter =
      qParam || credParam || nurseParam || clientParam || rangePreset ||
      flagAbnormal || flagIncident || flagPhysNotified || flagNeedsCosign || flagHospitalEr || flagMedChange || flagOpen;
    if (hasAnyFilter) {
      sessionStorage.setItem(RN_COSIGN_SESSION_KEY, '1');
      return;
    }
    sessionStorage.setItem(RN_COSIGN_SESSION_KEY, '1');
    updateParams({ cosign: '1' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRn, authLoading, settingsReady, subDefaults.rnDefaultsToNeedsCosign]);

  // Scope filter (independent per role).
  // The 'team' scope is nurse-only — it shows notes for patients
  // she's on the care team for BUT was authored by someone else.
  // Archive state still applies via the nurse-personal archive field
  // so a nurse can hide team notes from her view without affecting
  // anyone else.
  const scoped = useMemo(() => {
    const key: 'archivedAt' | 'nurseArchivedAt' = isNurse ? 'nurseArchivedAt' : 'archivedAt';
    if (scope === 'team') {
      const myUid = effectiveUid;
      return allSubmissions.filter(
        (s) => s[key] == null && s.nurseId && s.nurseId !== myUid,
      );
    }
    if (scope === 'all') return allSubmissions;
    return allSubmissions.filter((s) =>
      scope === 'archived' ? s[key] != null : s[key] == null
    );
  }, [allSubmissions, scope, isNurse, effectiveUid]);

  const activeCount = useMemo(() => {
    const key: 'archivedAt' | 'nurseArchivedAt' = isNurse ? 'nurseArchivedAt' : 'archivedAt';
    return allSubmissions.filter((s) => s[key] == null).length;
  }, [allSubmissions, isNurse]);
  const archivedCount = allSubmissions.length - activeCount;
  // Team count: only relevant for nurses. Counts active (non-personally-
  // archived) notes authored by other care-team members. Used to label
  // the Care team tab and to suppress the tab entirely when she has no
  // team-visible notes yet.
  const teamCount = useMemo(() => {
    if (!isNurse) return 0;
    const myUid = effectiveUid;
    return allSubmissions.filter(
      (s) => s.nurseArchivedAt == null && s.nurseId && s.nurseId !== myUid,
    ).length;
  }, [allSubmissions, isNurse, effectiveUid]);

  // List of unique nurses for the admin filter dropdown.
  const nurseOptions = useMemo(() => {
    const set = new Set<string>();
    allSubmissions.forEach((s) => s.nurseName && set.add(s.nurseName));
    return Array.from(set).sort();
  }, [allSubmissions]);
  const clientOptions = useMemo(() => {
    const set = new Set<string>();
    allSubmissions.forEach((s) => s.clientName && set.add(s.clientName));
    return Array.from(set).sort();
  }, [allSubmissions]);

  // Memoized so the range does not shift under a midnight boundary mid-session.
  const todayIso = useMemo(() => localTodayISO(), []);
  const { fromISO: rangeFrom, toISO: rangeTo } = useMemo(
    () => resolveRange(rangePreset, { month: monthParam, from: fromParam, to: toParam }, todayIso),
    [rangePreset, monthParam, fromParam, toParam, todayIso],
  );
  const rangeActive = Boolean(rangeFrom || rangeTo);

  // Each note's hours cut at midnight (shiftHours.ts), computed once per load.
  // Drives the range filter (a 19:00 to 07:00 shift on 8/31 belongs to
  // September too), the Hours column, and the totals strip, so the numbers
  // agree with the client Hours tab and the roster badges.
  const segmentsById = useMemo(() => {
    const m = new Map<string, DaySegment[]>();
    for (const s of allSubmissions) m.set(s.id, splitShiftByDay(s));
    return m;
  }, [allSubmissions]);

  // Hours a row contributes to the current view: the in-range slice when a
  // range is set, else the whole shift / visit. RN oversight visits (time in
  // to time out) are a separate bucket: shown in a blue chip, totalled apart,
  // never added to shift hours. null when the note has no usable window.
  const rowHours = useCallback(
    (s: SubmissionSummary): number | null => {
      const segs = segmentsById.get(s.id) ?? [];
      if (segs.length === 0) return null;
      return rangeActive ? hoursInRange(segs, rangeFrom, rangeTo) : totalOfSegments(segs);
    },
    [segmentsById, rangeActive, rangeFrom, rangeTo],
  );
  const isOversight = (s: SubmissionSummary) => s.noteType === 'rn-oversight-visit';
  /** How many flag badges the Flags column shows for a row (the Flags sort). */
  const flagCount = (s: SubmissionSummary): number =>
    [
      s.hasCriticalVitals || s.hasAbnormalVitals,
      s.hasIncident,
      s.physicianNotified,
      s.hospitalAdmission || s.erUrgentCare,
      s.medChangeReported,
      needsCosign(s, requiredCosignCreds),
      s.clarificationStatus === 'open',
      s.clarificationBlocksNotes,
    ].filter(Boolean).length;

  // A note is in range when any of its days is. Notes with no usable day
  // segments (no hours and no times) fall back to the date of service.
  const noteTouchesRange = useCallback(
    (s: SubmissionSummary): boolean => {
      const segs = segmentsById.get(s.id) ?? [];
      if (segs.length > 0) return touchesRange(segs, rangeFrom, rangeTo);
      if (!s.dateISO) return false;
      if (rangeFrom && s.dateISO < rangeFrom) return false;
      if (rangeTo && s.dateISO > rangeTo) return false;
      return true;
    },
    [segmentsById, rangeFrom, rangeTo],
  );

  // Hours are an owner-only surface (billing + parent questions); the
  // effective role hides the column while previewing a nurse's view.
  const showHours = role === 'admin';

  // The billing rate table (owner-only) plus each client's program, so the
  // dollar view can price every day at the rate in force for that program
  // and bucket on that date.
  const [rates, setRates] = useState<BillingRate[]>([]);
  const [programByPatient, setProgramByPatient] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!showHours) return;
    let cancelled = false;
    Promise.all([getBillingRates(), getPatients()])
      .then(([r, patients]) => {
        if (cancelled) return;
        setRates(r);
        setProgramByPatient(new Map(patients.map((p) => [p.id || '', p.program || ''])));
      })
      .catch((err) => console.error('Billing rates load failed:', err));
    return () => { cancelled = true; };
  }, [showHours]);

  const bucketOf = (s: SubmissionSummary): HoursBucket => (s.noteType === 'rn-oversight-visit' ? 'oversight' : 'shift');
  const rateResolverFor = useCallback(
    (s: SubmissionSummary) => {
      const program = s.patientId ? programByPatient.get(s.patientId) || '' : '';
      const bucket = bucketOf(s);
      // The note author's credential picks a credential-specific row (GAPP
      // pays LPN and RN shifts differently); an "any nurse" row is the fallback.
      return (dateISO: string) => resolveRate(rates, program, bucket, dateISO, s.credential);
    },
    [rates, programByPatient],
  );
  /** The row's day segments inside the current range. */
  const rowSegments = useCallback(
    (s: SubmissionSummary): DaySegment[] =>
      (segmentsById.get(s.id) ?? []).filter(
        (seg) => (!rangeActive || !rangeFrom || seg.dateISO >= rangeFrom) && (!rangeActive || !rangeTo || seg.dateISO <= rangeTo),
      ),
    [segmentsById, rangeActive, rangeFrom, rangeTo],
  );
  /** "45 units × $24.36 (NOW/COMP, any nurse)" for the $ cell's tooltip. */
  const rateHint = useCallback(
    (s: SubmissionSummary): string => {
      const program = s.patientId ? programByPatient.get(s.patientId) || '' : '';
      const segs = rowSegments(s);
      const first = segs[0];
      if (!program || !first) return 'Not linked to a client on the roster, so no program to price by.';
      const row = resolveRateRow(rates, program, bucketOf(s), first.dateISO, s.credential);
      const programLabel = getProgram(program)?.label || program;
      if (!row) return `No billing rate for ${programLabel} ${bucketOf(s) === 'oversight' ? 'RN oversight' : 'shift hours'}${s.credential ? ` (${s.credential})` : ''}. Add one under Settings → Billing rates.`;
      return `${fmtUnits(segmentsToUnits(segs))} units × ${fmtDollars(row.ratePerUnit)} (${programLabel}, ${row.credential || 'any nurse'}${row.serviceCode ? `, ${row.serviceCode}${row.modifier ? ` ${row.modifier}` : ''}` : ''})`;
    },
    [rates, programByPatient, rowSegments],
  );
  /** Billable units for a row (each day rounded up to whole units). */
  const rowUnits = useCallback((s: SubmissionSummary): number => segmentsToUnits(rowSegments(s)), [rowSegments]);
  // Dollars for a row's in-view hours: each day priced at the rate in force
  // for the client's program. null when the note is unlinked, the program
  // has no rate row, or any day is unpriced.
  const rowDollars = useCallback(
    (s: SubmissionSummary): number | null => {
      if (!s.patientId) return null;
      const segs = rowSegments(s);
      if (segs.length === 0) return null;
      return segmentsToDollars(segs, rateResolverFor(s));
    },
    [rowSegments, rateResolverFor],
  );
  /** A row's quantity in the chosen view. */
  const rowQty = useCallback(
    (s: SubmissionSummary, h: number): string => (qtyView === 'units' ? fmtUnits(rowUnits(s)) : fmtH(h)),
    [qtyView, rowUnits],
  );
  /** The row's dollars as text ('—' when the client has no rate). */
  const rowDollarText = useCallback(
    (s: SubmissionSummary): string => {
      const d = rowDollars(s);
      return d == null ? '—' : fmtDollars(d);
    },
    [rowDollars],
  );

  // Defined here (rather than after `sorted`) so the cross-scope-counts memo
  // below can short-circuit when nothing is filtered.
  const hasAnyFilter =
    !!qParam ||
    !!credParam ||
    !!nurseParam ||
    !!clientParam ||
    !!rangePreset ||
    flagAbnormal ||
    flagIncident ||
    flagPhysNotified ||
    flagNeedsCosign ||
    flagHospitalEr ||
    flagMedChange ||
    flagOpen ||
    sortParam !== subDefaults.defaultSort ||
    dirParam !== subDefaults.defaultDir;

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
      if (clientParam && s.clientName !== clientParam) return false;
      if (flagAbnormal && !s.hasAbnormalVitals) return false;
      if (flagIncident && !s.hasIncident) return false;
      if (flagPhysNotified && !s.physicianNotified) return false;
      if (flagNeedsCosign && !needsCosign(s, requiredCosignCreds)) return false;
      if (flagHospitalEr && !(s.hospitalAdmission || s.erUrgentCare)) return false;
      if (flagMedChange && !s.medChangeReported) return false;
      if (flagOpen && s.clarificationStatus !== 'open') return false;
      if (rangeActive && !noteTouchesRange(s)) return false;
      return true;
    });
  }, [
    scoped,
    qParam,
    credParam,
    nurseParam,
    clientParam,
    flagAbnormal,
    flagIncident,
    flagPhysNotified,
    flagNeedsCosign,
    flagHospitalEr,
    flagMedChange,
    flagOpen,
    rangeActive,
    noteTouchesRange,
  ]);

  // Keep the bulk-action selection in lockstep with what's actually visible.
  // Without this, narrowing the search after selecting (or switching scope
  // tabs) leaves a stale "39 selected" pinned to the bulk bar even though
  // only 17 rows match — confusing, and worse, the export would actually
  // act on all 39. Re-trimming on every filter change keeps the counter
  // honest and matches the user's mental model: "selection = what I see
  // checked." Returns `prev` unchanged when no IDs were dropped so React
  // skips an unnecessary re-render.
  useEffect(() => {
    const visibleIds = new Set(filtered.map((s) => s.id));
    setSelected((prev) => {
      let dropped = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visibleIds.has(id)) next.add(id);
        else dropped = true;
      }
      return dropped ? next : prev;
    });
  }, [filtered]);

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
      if (clientParam && s.clientName !== clientParam) continue;
      if (flagAbnormal && !s.hasAbnormalVitals) continue;
      if (flagIncident && !s.hasIncident) continue;
      if (flagPhysNotified && !s.physicianNotified) continue;
      if (flagNeedsCosign && !needsCosign(s, requiredCosignCreds)) continue;
      if (flagHospitalEr && !(s.hospitalAdmission || s.erUrgentCare)) continue;
      if (flagMedChange && !s.medChangeReported) continue;
      if (flagOpen && s.clarificationStatus !== 'open') continue;
      if (rangeActive && !noteTouchesRange(s)) continue;
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
    clientParam,
    flagAbnormal,
    flagIncident,
    flagPhysNotified,
    flagNeedsCosign,
    flagHospitalEr,
    flagMedChange,
    flagOpen,
    rangeActive,
    noteTouchesRange,
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
      } else if (sortParam === 'hours') {
        av = rowHours(a) ?? -1;
        bv = rowHours(b) ?? -1;
      } else if (sortParam === 'credential') {
        // Skill order (RN, LPN, CNA, HHA), not alphabetical.
        av = credentialRank(a.credential);
        bv = credentialRank(b.credential);
      } else if (sortParam === 'flags') {
        av = flagCount(a);
        bv = flagCount(b);
      } else {
        av = a.nurseName.toLowerCase();
        bv = b.nurseName.toLowerCase();
      }
      if (av < bv) return dirParam === 'asc' ? -1 : 1;
      if (av > bv) return dirParam === 'asc' ? 1 : -1;
      // Ties (same credential, same flag count) fall back to newest service
      // date so a grouped column still reads chronologically.
      return (parseDateOfService(b.dateOfService)?.getTime() ?? 0) - (parseDateOfService(a.dateOfService)?.getTime() ?? 0);
    });
    return copy;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortParam, dirParam, rowHours, requiredCosignCreds]);

  // Totals for the whole filtered list (not just the page): the number the
  // owner reads off when a parent asks "how many hours did we use in
  // September". Shift hours and RN oversight hours are totalled separately.
  const hoursStats = useMemo(() => {
    if (!showHours) return null;
    let hours = 0;
    let shifts = 0;
    let rnHours = 0;
    let visits = 0;
    let dollars: number | null = 0;
    let rnDollars: number | null = 0;
    let unpriced = 0;
    const byClient = new Map<string, HoursPivotRow>();
    const byNurse = new Map<string, HoursPivotRow>();
    const byDay = new Map<string, HoursPivotRow & { nurses: Set<string> }>();
    const credsByNurse = new Map<string, Set<string>>();
    let units = 0;
    let rnUnits = 0;
    const blank = (key: string): HoursPivotRow => ({ key, hours: 0, units: 0, shifts: 0, rnHours: 0, rnUnits: 0, visits: 0, dollars: 0, rnDollars: 0 });
    const addMoney = (cur: number | null, add: number | null) => (cur == null || add == null ? null : cur + add);
    const bump = (m: Map<string, HoursPivotRow>, key: string, h: number, u: number, d: number | null, rn: boolean) => {
      const b = m.get(key) ?? blank(key);
      if (rn) {
        b.rnHours += h;
        b.rnUnits += u;
        b.visits += 1;
        b.rnDollars = addMoney(b.rnDollars, d);
      } else {
        b.hours += h;
        b.units += u;
        b.shifts += 1;
        b.dollars = addMoney(b.dollars, d);
      }
      m.set(key, b);
    };
    for (const s of sorted) {
      const h = rowHours(s);
      if (h == null) continue;
      const rn = isOversight(s);
      const u = rowUnits(s);
      const d = rowDollars(s);
      if (d == null) unpriced += 1;
      if (rn) {
        visits += 1;
        rnHours += h;
        rnUnits += u;
        rnDollars = addMoney(rnDollars, d);
      } else {
        shifts += 1;
        hours += h;
        units += u;
        dollars = addMoney(dollars, d);
      }
      bump(byClient, s.clientName || '(no client)', h, u, d, rn);
      bump(byNurse, s.nurseName || '(no nurse)', h, u, d, rn);
      if (s.credential) {
        const set = credsByNurse.get(s.nurseName || '(no nurse)') ?? new Set<string>();
        set.add(s.credential);
        credsByNurse.set(s.nurseName || '(no nurse)', set);
      }
      // By day: each calendar day carries exactly the hours worked on it
      // (an overnight shift lands on two days), rounded and priced per day.
      const rateFor = rateResolverFor(s);
      for (const seg of rowSegments(s)) {
        const b = byDay.get(seg.dateISO) ?? { ...blank(seg.dateISO), nurses: new Set<string>() };
        const segDollars = s.patientId ? segmentsToDollars([seg], rateFor) : null;
        const segUnits = segmentsToUnits([seg]);
        if (rn) {
          b.rnHours += seg.hours;
          b.rnUnits += segUnits;
          b.visits += 1;
          b.rnDollars = addMoney(b.rnDollars, segDollars);
        } else {
          b.hours += seg.hours;
          b.units += segUnits;
          b.shifts += 1;
          b.dollars = addMoney(b.dollars, segDollars);
        }
        if (s.nurseName) b.nurses.add(s.nurseName);
        byDay.set(seg.dateISO, b);
      }
    }
    const round = (n: number) => Math.round(n * 100) / 100;
    const roundMoney = (n: number | null) => (n == null ? null : round(n));
    const finish = (m: Map<string, HoursPivotRow>) =>
      Array.from(m.values())
        .map((b) => ({ ...b, hours: round(b.hours), rnHours: round(b.rnHours), dollars: roundMoney(b.dollars), rnDollars: roundMoney(b.rnDollars) }))
        .sort((a, b) => b.hours - a.hours || b.rnHours - a.rnHours || a.key.localeCompare(b.key));
    const days = Array.from(byDay.values())
      .map((b) => ({ ...b, hours: round(b.hours), rnHours: round(b.rnHours), dollars: roundMoney(b.dollars), rnDollars: roundMoney(b.rnDollars), who: Array.from(b.nurses).sort().join(', ') }))
      .sort((a, b) => b.key.localeCompare(a.key));
    return {
      hours: round(hours),
      units,
      shifts,
      rnHours: round(rnHours),
      rnUnits,
      visits,
      dollars: roundMoney(dollars),
      rnDollars: roundMoney(rnDollars),
      unpriced,
      clients: byClient.size,
      nurses: byNurse.size,
      byClient: finish(byClient),
      byNurse: finish(byNurse).map((b) => ({ ...b, who: Array.from(credsByNurse.get(b.key) ?? []).sort().join(' / ') })),
      byDay: days,
    };
  }, [sorted, rowHours, rowUnits, rowDollars, rowSegments, rateResolverFor, showHours]);
  const [pivot, setPivot] = useState<'' | 'client' | 'nurse' | 'day'>('');
  // Pivot column sort. Resets to each pivot's natural order when you switch
  // pivots (days newest first, clients / nurses by most hours).
  type PivotSortKey = 'key' | 'who' | 'shifts' | 'hours' | 'dollars' | 'visits' | 'rnHours' | 'rnDollars';
  const [pivotSort, setPivotSort] = useState<{ key: PivotSortKey; dir: 'asc' | 'desc' } | null>(null);
  const openPivot = (next: '' | 'client' | 'nurse' | 'day') => {
    setPivot(next);
    setPivotSort(null);
  };
  const clickPivotSort = (key: PivotSortKey) => {
    setPivotSort((cur) => {
      // First click on a text column sorts A to Z; on a number column, biggest first.
      const firstDir: 'asc' | 'desc' = key === 'key' || key === 'who' ? (pivot === 'day' && key === 'key' ? 'desc' : 'asc') : 'desc';
      if (!cur || cur.key !== key) return { key, dir: firstDir };
      return { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' };
    });
  };
  const pivotIndicator = (key: PivotSortKey) =>
    pivotSort?.key === key ? (pivotSort.dir === 'asc' ? ' ↑' : ' ↓') : '';
  const money = (d: number | null): string => (d == null ? '—' : fmtDollars(d));
  /** A pivot quantity: exact hours or whole billable units. */
  const pq = (hours: number, units: number): string => (qtyView === 'units' ? fmtUnits(units) : fmtH(hours));

  // CSV of the filtered list with per-row hours: the billing worksheet. Same
  // rows as the totals strip, so what is exported is what was on screen.
  const exportHoursCsv = async () => {
    if (!user || !hoursStats) return;
    const header = [
      'Date of service', 'Client', 'Nurse', 'Credential', 'Note type', 'Start', 'End date', 'End',
      'Total hours', 'Shift hours in range', 'RN oversight hours in range', 'Units in range', 'Amount in range', 'Submitted at', 'Note ID',
    ];
    const lines = [header.join(',')];
    for (const s of sorted) {
      const h = rowHours(s);
      const rn = isOversight(s);
      lines.push([
        s.dateOfService,
        s.clientName,
        s.nurseName,
        s.credential,
        rn ? 'RN oversight visit' : 'Shift note',
        s.shiftStart,
        formatDateUS(s.shiftEndDate),
        s.shiftEnd,
        s.totalHours,
        h == null || rn ? '' : fmtH(h),
        h == null || !rn ? '' : fmtH(h),
        h == null ? '' : fmtUnits(rowUnits(s)),
        (() => { const d = rowDollars(s); return d == null ? '' : d.toFixed(2); })(),
        s.submittedAt ? s.submittedAt.toLocaleString() : '',
        s.id,
      ].map(csvCell).join(','));
    }
    lines.push('');
    lines.push(['Shift hours', fmtH(hoursStats.hours)].join(','));
    lines.push(['Shifts', String(hoursStats.shifts)].join(','));
    lines.push(['RN oversight hours', fmtH(hoursStats.rnHours)].join(','));
    lines.push(['RN visits', String(hoursStats.visits)].join(','));
    lines.push(['Shift units', fmtUnits(hoursStats.units)].join(','));
    lines.push(['RN oversight units', fmtUnits(hoursStats.rnUnits)].join(','));
    lines.push(['Shift amount', hoursStats.dollars == null ? 'n/a (missing rate)' : hoursStats.dollars.toFixed(2)].join(','));
    lines.push(['RN oversight amount', hoursStats.rnDollars == null ? 'n/a (missing rate)' : hoursStats.rnDollars.toFixed(2)].join(','));
    lines.push(['Range', describeRange({ fromISO: rangeFrom, toISO: rangeTo })].join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const suffix = rangeFrom || rangeTo
      ? `${formatDateUSFile(rangeFrom) || 'start'}_to_${formatDateUSFile(rangeTo) || 'today'}`
      : 'all-dates';
    triggerDownload(blob, `shift-notes-hours_${suffix}.csv`);
    await logExport(user, {
      submissionIds: sorted.map((s) => s.id),
      count: sorted.length,
      format: 'hours-csv',
      dateRangeStart: rangeFrom || null,
      dateRangeEnd: rangeTo || null,
    });
  };

  // Pagination — page size from /admin/settings, with a fallback for
  // the brief window before the settings hook hydrates on first paint.
  const pageSize = subDefaults.pageSize || FALLBACK_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, sorted.length);
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
      client: null,
      range: null,
      m: null,
      from: null,
      to: null,
      abn: null,
      inc: null,
      phy: null,
      cosign: null,
      hosp: null,
      med: null,
      flag: null,
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
    const isoKey = (d: string) => {
      const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return m ? `${m[3]}-${m[1]}-${m[2]}` : d;
    };
    const dates = selectedSubmissions
      .map((s) => s.dateOfService)
      .filter(Boolean)
      .sort((a, b) => isoKey(a).localeCompare(isoKey(b)));
    return { start: dates[0] || null, end: dates[dates.length - 1] || null };
  }, [selectedSubmissions]);

  // For the bulk Co-sign button: the RN can sign every selected note (i.e. all
  // are HHA/CNA/LPN, not already cosigned, not authored by the RN). If even one
  // selected note fails this, the button shows disabled with a tooltip — cleaner
  // than letting them click and getting partial-failure messages back.
  const bulkCosignState = useMemo(() => {
    if (!isRn || selectedSubmissions.length === 0) {
      return { canBulkCosign: false, blockedReason: '' as string };
    }
    const blockers: string[] = [];
    for (const s of selectedSubmissions) {
      if (s.credential === 'RN') {
        blockers.push('RN-authored notes do not need co-sign');
        break;
      }
      if (s.cosignedAt != null) {
        blockers.push('one or more notes are already co-signed');
        break;
      }
      if (s.nurseId && s.nurseId === user?.uid) {
        blockers.push('you cannot co-sign a note you authored');
        break;
      }
      if (!needsCosign(s, requiredCosignCreds)) {
        blockers.push('one or more notes are not eligible for co-sign');
        break;
      }
    }
    return {
      canBulkCosign: blockers.length === 0,
      blockedReason: blockers[0] || '',
    };
  }, [isRn, selectedSubmissions, user?.uid]);

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
    if (!user || !role || isViewingAs) return;
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

  // Permanent delete — admin only. Goes through the Admin SDK route, which
  // snapshots the note into deletedNotes (recoverable) before removing it.
  // Gated again here defensively even though the button only renders for
  // admins: the server route is the real authorization.
  const handleRowDelete = async (s: SubmissionSummary) => {
    if (role !== 'admin') return;
    const msg =
      `Permanently delete the note for ${s.clientName} on ${s.dateOfService}?\n\n` +
      `This removes it from the submissions list. An audit copy is kept for recovery, ` +
      `but the live note will be gone. This cannot be undone from here.`;
    if (!window.confirm(msg)) return;

    setBusy(true);
    try {
      const res = await authedFetch(`/api/admin/submissions/${s.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Delete failed (${res.status})`);
      }
      setAllSubmissions((prev) => prev.filter((item) => item.id !== s.id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(s.id);
        return next;
      });
    } catch (err) {
      console.error('Failed to delete note:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete. Please try again.');
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
            {draftToastKind === 'oversight'
              ? '✓ Oversight note draft saved. Open New oversight note to resume it.'
              : '✓ Draft saved. You can resume it anytime from the progress note page.'}
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
        {cosignToast > 0 && (
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
            ✓ Co-signed {cosignToast} {cosignToast === 1 ? 'note' : 'notes'}.
          </div>
        )}
        <div style={headerStyle}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={titleStyle}>Progress Note Submissions</h1>
            <p style={subtitleStyle}>All submitted nursing progress notes</p>
          </div>
          {/* Visible to anyone who can author a progress note: any user with
              a clinical credential (HHA / CNA / LPN / RN), OR an admin (so
              they can still demo / test the flow). This catches RN-credentialed
              supervisors who are clinically licensed and need to author too.
              A pure non-clinical supervisor still doesn't see it.
              Label swaps to "Resume draft" when a draft already exists so the
              user never gets a "wait, what's this banner?" moment after
              clicking. The link target is the same either way; the
              progress-note page's existing resume-banner logic hydrates. */}
          {!isViewingAs && (!!profile?.credential || role === 'admin') && (
            <Link
              href={myDraft ? '/progress-note?resume=1' : '/progress-note'}
              style={newNoteBtnStyle}
            >
              <Plus size={16} />
              {myDraft ? 'Resume draft' : 'New progress note'}
            </Link>
          )}
          {/* RN oversight visit note — same gate the form enforces: an RN
              credential, or an admin/supervisor signing in their own name. */}
          {!isViewingAs &&
            (profile?.credential === 'RN' || role === 'admin' || role === 'supervisor') && (
              <Link href="/oversight-note" style={newNoteBtnStyle}>
                <Plus size={16} />
                New oversight note
              </Link>
            )}
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
          {/* Care team tab — nurse-only. Surfaces notes for patients
              she's on the care team for that were authored by other
              nurses (Phase 3 cross-nurse visibility). */}
          {isNurse && (
            <button
              type="button"
              role="tab"
              aria-selected={scope === 'team'}
              onClick={() => setScope('team')}
              style={scope === 'team' ? tabActiveStyle : tabStyle}
              title="Notes from other nurses on patients you also work with"
            >
              Care team <span style={tabCountStyle}>{teamCount}</span>
            </button>
          )}
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
            value={rangePreset}
            onChange={(e) => {
              const next = e.target.value as RangePreset;
              // Picking "month" defaults to the current month; "custom"
              // starts from whatever bounds the previous preset resolved to
              // so the inputs open pre-filled rather than blank.
              updateParams({
                range: next || null,
                m: next === 'm' ? monthParam || todayIso.slice(0, 7) : null,
                from: next === 'c' ? fromParam || rangeFrom || null : null,
                to: next === 'c' ? toParam || rangeTo || null : null,
                p: null,
              });
            }}
            style={selectStyle}
            aria-label="Date of service range"
          >
            {RANGE_PRESETS.map((p) => (
              <option key={p.value || 'any'} value={p.value}>{p.label}</option>
            ))}
          </select>
          {rangePreset === 'm' && (
            <input
              type="month"
              value={monthParam}
              onChange={(e) => updateParams({ m: e.target.value || null, p: null })}
              style={dateInputStyle}
              aria-label="Month"
            />
          )}
          {rangePreset === 'c' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input
                type="date"
                value={fromParam}
                max={toParam || undefined}
                onChange={(e) => updateParams({ from: e.target.value || null, p: null })}
                style={dateInputStyle}
                aria-label="From date"
              />
              <span style={{ fontSize: 12, color: '#7f8c8d' }}>to</span>
              <input
                type="date"
                value={toParam}
                min={fromParam || undefined}
                onChange={(e) => updateParams({ to: e.target.value || null, p: null })}
                style={dateInputStyle}
                aria-label="To date"
              />
            </span>
          )}

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

          {clientOptions.length > 1 && (
            <select
              value={clientParam}
              onChange={(e) => updateParams({ client: e.target.value || null, p: null })}
              style={selectStyle}
              aria-label="Client"
            >
              <option value="">All clients</option>
              {clientOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
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
            {showHours && <option value="hours:desc">Most hours</option>}
            {showHours && <option value="hours:asc">Fewest hours</option>}
            <option value="credential:asc">Credential (RN first)</option>
            <option value="flags:desc">Most flags</option>
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
          <label style={flagLabelStyle}>
            <input
              type="checkbox"
              checked={flagNeedsCosign}
              onChange={(e) => updateParams({ cosign: e.target.checked ? '1' : null, p: null })}
            />
            Needs co-signature
          </label>
          <label style={flagLabelStyle}>
            <input
              type="checkbox"
              checked={flagHospitalEr}
              onChange={(e) => updateParams({ hosp: e.target.checked ? '1' : null, p: null })}
            />
            Hospital / ER visit
          </label>
          <label style={flagLabelStyle}>
            <input
              type="checkbox"
              checked={flagMedChange}
              onChange={(e) => updateParams({ med: e.target.checked ? '1' : null, p: null })}
            />
            Med change reported
          </label>
          <label style={flagLabelStyle} title="Notes with an open correction or clarification flag">
            <input
              type="checkbox"
              checked={flagOpen}
              onChange={(e) => updateParams({ flag: e.target.checked ? '1' : null, p: null })}
            />
            Flagged
          </label>

          <div style={{ flex: 1 }} />

          {/* Always rendered so its (taller-than-the-checkboxes) box reserves the
              row height — the row no longer grows when a filter is applied. Just
              hidden + non-interactive when there's nothing to clear. */}
          <button
            type="button"
            onClick={clearAllFilters}
            style={{
              ...clearFiltersBtnStyle,
              ...(hasAnyFilter ? {} : { visibility: 'hidden', pointerEvents: 'none' }),
            }}
            aria-hidden={!hasAnyFilter}
            tabIndex={hasAnyFilter ? 0 : -1}
          >
            <X size={12} /> Clear all
          </button>
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

        {/* Bulk actions stay hidden during view-as: archive/restore and
            co-sign are live writes, and a "(read-only)" preview must not
            offer them. */}
        {!isViewingAs && selected.size > 0 && (
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
            {isRn && (
              <button
                onClick={() => setCosignTargets([...selectedSubmissions])}
                style={{
                  ...bulkCosignBtnStyle,
                  opacity: bulkCosignState.canBulkCosign ? 1 : 0.55,
                  cursor: bulkCosignState.canBulkCosign ? 'pointer' : 'not-allowed',
                }}
                disabled={busy || !bulkCosignState.canBulkCosign}
                title={
                  bulkCosignState.canBulkCosign
                    ? `Co-sign all ${selectedSubmissions.length} selected notes`
                    : `Cannot co-sign — ${bulkCosignState.blockedReason}`
                }
              >
                <CheckCircle2 size={14} />
                Co-sign selected
              </button>
            )}
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

        {/* Hours strip (owner only): totals for the whole filtered list plus
            an optional by-client / by-nurse pivot and a CSV of the rows. */}
        {!loading && hoursStats && sorted.length > 0 && (
          <div style={hoursStripStyle}>
            {/* Row 1: the numbers. Row 2: what they cover. Row 3: the
                controls, always on their own line, so toggling $ (which adds
                two dollar figures to row 1) never reflows the buttons. */}
            <div style={hoursStripRowStyle}>
              <span style={hoursStripIconStyle}><Clock size={14} /></span>
              <span style={hoursStatStyle}>
                <strong style={hoursStatNumStyle}>{pq(hoursStats.hours, hoursStats.units)}</strong>
                {qtyView === 'hours' ? ' shift hours' : ' shift units'}
                {showDollars && <strong style={{ ...hoursStatNumStyle, marginLeft: 8, color: '#166534' }}>{money(hoursStats.dollars)}</strong>}
                <span style={{ color: '#64748b' }}> · {hoursStats.shifts} {hoursStats.shifts === 1 ? 'shift' : 'shifts'}</span>
              </span>
              {(hoursStats.visits > 0 || hoursStats.rnHours > 0) && (
                <span style={{ ...hoursStatStyle, color: '#1d4ed8' }} title="RN oversight visit hours (time in to time out); never added to shift hours">
                  <strong style={{ ...hoursStatNumStyle, color: '#1d4ed8' }}>{pq(hoursStats.rnHours, hoursStats.rnUnits)}</strong>
                  {qtyView === 'hours' ? ' RN oversight hours' : ' RN oversight units'}
                  {showDollars && <strong style={{ ...hoursStatNumStyle, marginLeft: 8, color: '#166534' }}>{money(hoursStats.rnDollars)}</strong>}
                  <span style={{ color: '#3b82f6' }}> · {hoursStats.visits} {hoursStats.visits === 1 ? 'visit' : 'visits'}</span>
                </span>
              )}
              {showDollars && hoursStats.unpriced > 0 && (
                <Link href="/admin/settings/billing-rates" style={{ ...hoursStatStyle, color: '#b45309', textDecoration: 'underline' }} title="Dollars need a billing rate for the client's program (Settings → Billing rates)">
                  {hoursStats.unpriced} {hoursStats.unpriced === 1 ? 'row has' : 'rows have'} no rate
                </Link>
              )}
              <span style={hoursStatStyle}>
                <strong style={hoursStatNumStyle}>{hoursStats.clients}</strong> {hoursStats.clients === 1 ? 'client' : 'clients'}
              </span>
              <span style={hoursStatStyle}>
                <strong style={hoursStatNumStyle}>{hoursStats.nurses}</strong> {hoursStats.nurses === 1 ? 'nurse' : 'nurses'}
              </span>
            </div>
            <div style={hoursStripNoteStyle}>
              {describeRange({ fromISO: rangeFrom, toISO: rangeTo })}
              {rangeActive && ' · shifts are split at midnight; only the hours inside the range count'}
              {' · RN oversight visits are shown in blue and never added to shift hours'}
            </div>
            <div style={hoursToolbarStyle}>
              <span style={segmentedStyle} role="group" aria-label="Show as">
                {(['hours', 'units'] as QtyView[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => updateParams({ u: v === 'hours' ? null : v })}
                    style={qtyView === v ? segmentedActiveStyle : segmentedBtnStyle}
                    title={v === 'units' ? '15-minute billing units (4 per hour)' : 'Hours'}
                  >
                    {v === 'hours' ? 'Hours' : 'Units'}
                  </button>
                ))}
              </span>
              <button
                type="button"
                onClick={() => updateParams({ usd: showDollars ? null : '1' })}
                style={{ ...(showDollars ? dollarsBtnActiveStyle : pivotBtnStyle), minWidth: 60, justifyContent: 'center' }}
                title="Show dollars alongside: units × the rate on the client's authorization line"
                aria-pressed={showDollars}
              >
                $ {showDollars ? 'on' : 'off'}
              </button>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                onClick={() => openPivot(pivot === 'day' ? '' : 'day')}
                style={pivot === 'day' ? pivotBtnActiveStyle : pivotBtnStyle}
                title="Each calendar day's hours (overnight shifts split at midnight)"
              >
                By day
              </button>
              <button
                type="button"
                onClick={() => openPivot(pivot === 'client' ? '' : 'client')}
                style={pivot === 'client' ? pivotBtnActiveStyle : pivotBtnStyle}
              >
                By client
              </button>
              <button
                type="button"
                onClick={() => openPivot(pivot === 'nurse' ? '' : 'nurse')}
                style={pivot === 'nurse' ? pivotBtnActiveStyle : pivotBtnStyle}
              >
                By nurse
              </button>
              <button type="button" onClick={exportHoursCsv} style={pivotBtnStyle} title="Download these rows with hours as a spreadsheet">
                <FileSpreadsheet size={13} /> CSV
              </button>
            </div>
            {pivot && (
              <table style={{ ...pivotTableStyle, ...(pivot === 'day' ? { maxWidth: 760 } : null) }}>
                <thead>
                  <tr>
                    <th style={pivotThSortStyle} onClick={() => clickPivotSort('key')}>{pivot === 'client' ? 'Client' : pivot === 'nurse' ? 'Nurse' : 'Day'}{pivotIndicator('key')}</th>
                    {pivot === 'day' && <th style={pivotThSortStyle} onClick={() => clickPivotSort('who')}>Who{pivotIndicator('who')}</th>}
                    {pivot === 'nurse' && <th style={pivotThSortStyle} onClick={() => clickPivotSort('who')}>Type{pivotIndicator('who')}</th>}
                    <th style={{ ...pivotThSortStyle, textAlign: 'right' }} onClick={() => clickPivotSort('shifts')}>Shifts{pivotIndicator('shifts')}</th>
                    <th style={{ ...pivotThSortStyle, textAlign: 'right' }} onClick={() => clickPivotSort('hours')}>{qtyView === 'hours' ? 'Shift hours' : 'Shift units'}{pivotIndicator('hours')}</th>
                    {showDollars && <th style={{ ...pivotThSortStyle, textAlign: 'right', color: '#166534' }} onClick={() => clickPivotSort('dollars')}>Shift ${pivotIndicator('dollars')}</th>}
                    {pivot !== 'day' && <th style={{ ...pivotThSortStyle, textAlign: 'right' }} onClick={() => clickPivotSort('hours')}>Share{pivotIndicator('hours')}</th>}
                    {hoursStats.visits > 0 && <th style={{ ...pivotThSortStyle, textAlign: 'right', color: '#1d4ed8' }} onClick={() => clickPivotSort('visits')}>RN visits{pivotIndicator('visits')}</th>}
                    {hoursStats.visits > 0 && <th style={{ ...pivotThSortStyle, textAlign: 'right', color: '#1d4ed8' }} onClick={() => clickPivotSort('rnHours')}>{qtyView === 'hours' ? 'RN hours' : 'RN units'}{pivotIndicator('rnHours')}</th>}
                    {hoursStats.visits > 0 && showDollars && <th style={{ ...pivotThSortStyle, textAlign: 'right', color: '#166534' }} onClick={() => clickPivotSort('rnDollars')}>RN ${pivotIndicator('rnDollars')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const base = pivot === 'client' ? hoursStats.byClient : pivot === 'nurse' ? hoursStats.byNurse : hoursStats.byDay;
                    if (!pivotSort) return base;
                    const val = (b: HoursPivotRow): string | number => {
                      switch (pivotSort.key) {
                        case 'key': return b.key.toLowerCase();
                        case 'who': return (b.who || '').toLowerCase();
                        case 'shifts': return b.shifts;
                        case 'hours': return b.hours;
                        case 'dollars': return b.dollars ?? -1;
                        case 'visits': return b.visits;
                        case 'rnHours': return b.rnHours;
                        case 'rnDollars': return b.rnDollars ?? -1;
                      }
                    };
                    const dir = pivotSort.dir === 'asc' ? 1 : -1;
                    return [...base].sort((x, y) => {
                      const a = val(x);
                      const b = val(y);
                      return a < b ? -dir : a > b ? dir : x.key.localeCompare(y.key);
                    });
                  })().map((b) => (
                    <tr key={b.key}>
                      <td style={{ ...pivotTdStyle, whiteSpace: 'nowrap' }}>{pivot === 'day' ? formatDateUS(b.key) : b.key}</td>
                      {pivot === 'day' && <td style={{ ...pivotTdStyle, color: '#475569' }}>{b.who}</td>}
                      {pivot === 'nurse' && <td style={{ ...pivotTdStyle, color: '#475569' }}>{b.who}</td>}
                      <td style={{ ...pivotTdStyle, textAlign: 'right' }}>{b.shifts || ''}</td>
                      <td style={{ ...pivotTdStyle, textAlign: 'right', fontWeight: 700 }}>{b.shifts ? pq(b.hours, b.units) : ''}</td>
                      {showDollars && <td style={{ ...pivotTdStyle, textAlign: 'right', color: '#166534', fontWeight: 600 }}>{b.shifts ? money(b.dollars) : ''}</td>}
                      {pivot !== 'day' && (
                        <td style={{ ...pivotTdStyle, textAlign: 'right', color: '#64748b' }}>
                          {b.shifts && hoursStats.hours > 0 ? `${Math.round((b.hours / hoursStats.hours) * 100)}%` : ''}
                        </td>
                      )}
                      {hoursStats.visits > 0 && <td style={{ ...pivotTdStyle, textAlign: 'right', color: '#1d4ed8' }}>{b.visits || ''}</td>}
                      {hoursStats.visits > 0 && <td style={{ ...pivotTdStyle, textAlign: 'right', color: '#1d4ed8', fontWeight: 700 }}>{b.visits ? pq(b.rnHours, b.rnUnits) : ''}</td>}
                      {hoursStats.visits > 0 && showDollars && <td style={{ ...pivotTdStyle, textAlign: 'right', color: '#166534', fontWeight: 600 }}>{b.visits ? money(b.rnDollars) : ''}</td>}
                    </tr>
                  ))}
                </tbody>
                {pivot === 'day' && (
                  <tfoot>
                    <tr>
                      <td style={{ ...pivotTdStyle, fontWeight: 700 }} colSpan={2}>Total</td>
                      <td style={{ ...pivotTdStyle, textAlign: 'right' }}>{hoursStats.shifts}</td>
                      <td style={{ ...pivotTdStyle, textAlign: 'right', fontWeight: 700 }}>{pq(hoursStats.hours, hoursStats.units)}</td>
                      {showDollars && <td style={{ ...pivotTdStyle, textAlign: 'right', color: '#166534', fontWeight: 700 }}>{money(hoursStats.dollars)}</td>}
                      {hoursStats.visits > 0 && <td style={{ ...pivotTdStyle, textAlign: 'right', color: '#1d4ed8' }}>{hoursStats.visits}</td>}
                      {hoursStats.visits > 0 && <td style={{ ...pivotTdStyle, textAlign: 'right', color: '#1d4ed8', fontWeight: 700 }}>{pq(hoursStats.rnHours, hoursStats.rnUnits)}</td>}
                      {hoursStats.visits > 0 && showDollars && <td style={{ ...pivotTdStyle, textAlign: 'right', color: '#166534', fontWeight: 700 }}>{money(hoursStats.rnDollars)}</td>}
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
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
                        disabled={isViewingAs}
                        ref={(el) => {
                          if (el) el.indeterminate = someOnPageSelected;
                        }}
                        onChange={toggleAllOnPage}
                        aria-label="Select all on this page"
                        style={checkboxStyle}
                      />
                    </th>
                    <th
                      style={{ ...thStyle, width: 48, textAlign: 'right', color: '#94a3b8' }}
                      title="Row number across the whole filtered list (continuous across pages)"
                    >
                      #
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
                    <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => setSort('credential')} title="Sort by nurse type (RN, LPN, CNA, HHA)">
                      Credential{sortIndicator('credential')}
                    </th>
                    {showHours && (
                      <th
                        style={{ ...thStyle, cursor: 'pointer', textAlign: 'right', whiteSpace: 'nowrap' }}
                        onClick={() => setSort('hours')}
                        title={rangeActive ? 'Hours inside the selected range (shifts split at midnight)' : 'Total shift hours'}
                      >
                        {QTY_VIEW_LABEL[qtyView]}{sortIndicator('hours')}
                      </th>
                    )}
                    <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => setSort('flags')} title="Sort by how many flags a note has">
                      Flags{sortIndicator('flags')}
                    </th>
                    <th
                      style={{ ...thStyle, cursor: 'pointer' }}
                      onClick={() => setSort('submittedAt')}
                    >
                      Submitted At{sortIndicator('submittedAt')}
                    </th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
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
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#cbd5e1' }}>—</td>
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
                      {showHours && <td style={{ ...tdStyle, textAlign: 'right', color: '#cbd5e1' }}>—</td>}
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
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
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
                    // The whole row navigates to the note (replaces the old "View"
                    // button, freeing space so the action buttons fit on one line).
                    const viewHref = `/admin/submissions/${s.id}${returnQs ? `?back=${encodeURIComponent(returnQs)}` : ''}`;
                    const restingBg = isSelected ? '#eef5ff' : i % 2 === 1 ? '#f9fafb' : 'white';
                    return (
                      <tr
                        key={s.id}
                        onClick={() => router.push(viewHref)}
                        style={{
                          ...(i % 2 === 1 ? altRowStyle : {}),
                          ...(isSelected ? { backgroundColor: '#eef5ff' } : {}),
                          cursor: 'pointer',
                        }}
                        title={`Open ${s.clientName}'s note`}
                        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f1f5f9'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = restingBg; }}
                      >
                        <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isViewingAs}
                            onChange={() => toggleRow(s.id)}
                            aria-label={`Select ${s.clientName} ${s.dateOfService}`}
                            style={checkboxStyle}
                          />
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                          {pageStart + i + 1}
                        </td>
                        <td style={tdStyle}>
                          {s.dateOfService}
                        </td>
                        <td style={tdStyle}>
                          {s.clientName}
                          {s.noteType === 'rn-oversight-visit' && (
                            <span
                              style={{
                                marginLeft: 6,
                                padding: '1px 6px',
                                borderRadius: 4,
                                fontSize: 10.5,
                                fontWeight: 700,
                                background: '#eef4fb',
                                color: '#1a3a5c',
                                border: '1px solid #c8def5',
                                whiteSpace: 'nowrap',
                              }}
                              title="RN oversight visit note"
                            >
                              OVERSIGHT
                            </span>
                          )}
                        </td>
                        <td style={tdStyle}>{s.nurseName}</td>
                        <td style={tdStyle}>
                          <span style={credentialBadge}>{s.credential}</span>
                        </td>
                        {showHours && (() => {
                          const h = rowHours(s);
                          const rn = isOversight(s);
                          const total = totalOfSegments(segmentsById.get(s.id) ?? []);
                          const partial = h != null && rangeActive && Math.abs(total - h) >= 0.01;
                          return (
                            <td
                              style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
                              title={
                                h == null
                                  ? 'No usable time window on this note'
                                  : rn
                                    ? `RN oversight visit, ${s.shiftStart || '?'} to ${s.shiftEnd || '?'}. Counted as RN oversight hours, not shift hours.`
                                    : partial
                                      ? `${fmtH(h)} of this ${fmtH(total)}-hour shift falls inside the selected range (${s.shiftStart || '?'} to ${s.shiftEnd || '?'})`
                                      : `${s.shiftStart || '?'} to ${s.shiftEnd || '?'}`
                              }
                            >
                              {h == null ? (
                                <span style={{ color: '#cbd5e1' }}>—</span>
                              ) : rn ? (
                                <span style={rnHoursChipStyle}>RN {rowQty(s, h)}</span>
                              ) : (
                                <>
                                  <strong style={{ color: '#0f172a' }}>{rowQty(s, h)}</strong>
                                  {partial && <span style={{ color: '#94a3b8', fontSize: 11 }}> of {qtyView === 'units' ? fmtUnits(segmentsToUnits(segmentsById.get(s.id) ?? [])) : fmtH(total)}</span>}
                                </>
                              )}
                              {h != null && showDollars && (
                                <div style={{ fontSize: 11.5, color: '#166534', fontWeight: 600 }} title={rateHint(s)}>{rowDollarText(s)}</div>
                              )}
                            </td>
                          );
                        })()}
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {s.hasCriticalVitals ? (
                              <span style={{ ...flagBadgeRed, fontWeight: 700 }} title="Critical vital — provider-notification threshold">
                                Critical vital
                              </span>
                            ) : s.hasAbnormalVitals && (
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
                            {(s.hospitalAdmission || s.erUrgentCare) && (
                              <span
                                style={flagBadgeRed}
                                title={`${[s.hospitalAdmission ? 'Hospital admission' : '', s.erUrgentCare ? 'Urgent care / ER visit' : ''].filter(Boolean).join(' · ')} since the last shift`}
                              >
                                Hospital/ER
                              </span>
                            )}
                            {s.medChangeReported && (
                              <span style={flagBadgeAmber} title="Medication started, changed, or stopped since the last shift — verify the MAR">
                                Med change
                              </span>
                            )}
                            {needsCosign(s, requiredCosignCreds) && (
                              <span style={flagBadgeAmber} title="Awaiting RN co-signature">
                                Needs co-sign
                              </span>
                            )}
                            {s.clarificationStatus === 'open' && (
                              s.clarificationKind === 'correction' ? (
                                <span style={flagBadgeRed} title="Open correction flag">
                                  Needs correction
                                </span>
                              ) : (
                                <span style={flagBadgeAmber} title="Open clarification flag">
                                  Needs clarification
                                </span>
                              )
                            )}
                            {s.clarificationStatus === 'open' && s.clarificationTurn && (() => {
                              // Whose move the thread is on. The Flagged filter lists
                              // every open flag while each nav badge counts one side,
                              // so this hint is what reconciles the two numbers.
                              const viewerIsAuthor = isNurse && s.nurseId === effectiveUid;
                              const myTurn = viewerIsAuthor
                                ? s.clarificationTurn === 'nurse'
                                : !isNurse && s.clarificationTurn === 'reviewer';
                              return (
                                <span
                                  style={myTurn ? flagTurnMine : flagTurnOther}
                                  title={
                                    s.clarificationTurn === 'nurse'
                                      ? 'No reply from the nurse since the last reviewer message'
                                      : 'The nurse replied or amended; no reviewer has answered or resolved since'
                                  }
                                >
                                  {clarificationTurnLabel(s.clarificationTurn, viewerIsAuthor)}
                                </span>
                              );
                            })()}
                            {s.clarificationBlocksNotes && (
                              <span
                                style={flagBadgeBlocking}
                                title="The author can't start or submit new notes until she amends this one."
                              >
                                Blocking author
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={tdStyle}>
                          {s.submittedAt ? s.submittedAt.toLocaleString() : '--'}
                        </td>
                        {/* Actions cell stops click-propagation so the buttons
                            don't also trigger the row's open-note navigation.
                            whiteSpace:nowrap + flex nowrap keep all buttons on a
                            single line (the column claims the width it needs). */}
                        <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                            {!isViewingAs && isRn && needsCosign(s, requiredCosignCreds) && s.nurseId !== user?.uid && (
                              // The row button is now a *navigation* into the
                              // view page in cosign mode. Single-note signing
                              // must go through a full read of the note —
                              // signing from a row would let the RN co-sign
                              // without ever seeing the clinical content,
                              // which defeats the compliance review.
                              <Link
                                href={`/admin/submissions/${s.id}?cosign=1${returnQs ? `&back=${encodeURIComponent(returnQs)}` : ''}`}
                                style={rowCosignBtnStyle}
                                title="Review and co-sign this note"
                              >
                                Co-sign
                              </Link>
                            )}
                            {/* Archive button gated for nurses to own notes only.
                                The personal-archive field (nurseArchivedAt) lives
                                on the note doc itself — there's no per-nurse view
                                state — so a nurse archiving a teammate's note would
                                hide it from the teammate too. Firestore rules also
                                deny the write. Cleaner to just hide the button on
                                care-team rows; admin/supervisor still see it. */}
                            {!isViewingAs && (!isNurse || !s.nurseId || s.nurseId === effectiveUid) && (
                              rowArchived ? (
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
                              )
                            )}
                            {/* Permanent delete — admin only. No one else,
                                not even the authoring nurse, sees this. */}
                            {role === 'admin' && (
                              <button
                                onClick={() => handleRowDelete(s)}
                                style={rowDeleteBtnStyle}
                                disabled={busy}
                                title="Permanently delete this note (admin only)"
                              >
                                Delete
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
                  style={safePage <= 1 ? { ...pageBtnStyle, ...pageBtnDisabledStyle } : pageBtnStyle}
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
                  style={safePage >= pageCount ? { ...pageBtnStyle, ...pageBtnDisabledStyle } : pageBtnStyle}
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

      {cosignTargets.length > 0 && (
        <CoSignModal
          notes={cosignTargets}
          onClose={() => setCosignTargets([])}
          onSuccess={async (cosignedIds) => {
            setCosignToast(cosignedIds.length);
            // Drop the cosigned notes from the selection so the bulk bar
            // doesn't try to re-act on them, then reload from Firestore so the
            // pills + buttons reflect the new cosignedAt timestamps.
            setSelected((prev) => {
              const next = new Set(prev);
              for (const id of cosignedIds) next.delete(id);
              return next;
            });
            await reloadSubmissions();
            // Auto-clear the toast after a few seconds.
            setTimeout(() => setCosignToast(0), 5000);
          }}
        />
      )}
    </div>
  );
}

// --- Inline styles ---

const containerStyle: React.CSSProperties = {
  maxWidth: 1400,
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
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  flexWrap: 'wrap',
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

const newNoteBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#27ae60',
  color: 'white',
  padding: '10px 14px',
  borderRadius: 6,
  border: 'none',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  textDecoration: 'none',
  flexShrink: 0,
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

const dateInputStyle: React.CSSProperties = {
  padding: '7px 10px',
  border: '1px solid #dfe5ec',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'inherit',
  color: '#2c3e50',
  background: 'white',
};

const hoursStripStyle: React.CSSProperties = {
  marginBottom: 12,
  padding: '10px 14px',
  background: '#f0f7ff',
  border: '1px solid #c8def5',
  borderRadius: 8,
};

const hoursStripRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 14,
};

const hoursStripIconStyle: React.CSSProperties = {
  display: 'inline-flex',
  color: '#1a3a5c',
};

const hoursStatStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#334155',
  whiteSpace: 'nowrap',
};

const hoursStatNumStyle: React.CSSProperties = {
  fontSize: 16,
  color: '#0f172a',
  fontVariantNumeric: 'tabular-nums',
};

const segmentedStyle: React.CSSProperties = {
  display: 'inline-flex',
  border: '1px solid #c8def5',
  borderRadius: 6,
  overflow: 'hidden',
  background: 'white',
};

const segmentedBtnStyle: React.CSSProperties = {
  background: 'white',
  color: '#1a3a5c',
  border: 'none',
  padding: '5px 10px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const segmentedActiveStyle: React.CSSProperties = {
  ...segmentedBtnStyle,
  background: '#1a3a5c',
  color: 'white',
};


/** Blue = RN oversight hours, matching the client Hours tab. */
const rnHoursChipStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 7px',
  borderRadius: 999,
  fontSize: 11.5,
  fontWeight: 700,
  background: '#dbeafe',
  color: '#1d4ed8',
  border: '1px solid #bfdbfe',
};

const pivotBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  background: 'white',
  color: '#1a3a5c',
  padding: '5px 10px',
  borderRadius: 6,
  border: '1px solid #c8def5',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const pivotBtnActiveStyle: React.CSSProperties = {
  ...pivotBtnStyle,
  background: '#1a3a5c',
  color: 'white',
  // Longhand-free: overriding the `border` shorthand with borderColor makes
  // React warn about mixed shorthand/longhand on rerender.
  border: '1px solid #1a3a5c',
};

const hoursStripNoteStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: 12,
  marginTop: 6,
  lineHeight: 1.45,
};

const hoursToolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
  marginTop: 10,
  paddingTop: 10,
  borderTop: '1px solid #dbe7f5',
};

const pivotThSortStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 10px',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: '#64748b',
  borderBottom: '1px solid #e2e8f0',
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
};

const dollarsBtnActiveStyle: React.CSSProperties = {
  ...pivotBtnStyle,
  background: '#166534',
  color: 'white',
  border: '1px solid #166534',
};

const pivotTableStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 560,
  marginTop: 10,
  borderCollapse: 'collapse',
  fontSize: 13,
  background: 'white',
  borderRadius: 6,
  overflow: 'hidden',
};

const pivotThStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 10px',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: '#64748b',
  borderBottom: '1px solid #e2e8f0',
};

const pivotTdStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderBottom: '1px solid #f1f5f9',
  color: '#1e293b',
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

const bulkCosignBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#1a3a5c',
  color: 'white',
  padding: '8px 14px',
  borderRadius: 6,
  border: 'none',
  fontSize: 13,
  fontWeight: 700,
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

// Turn hints ride next to the Needs correction / clarification badge: outlined
// rather than filled so they read as a status, not another flag.
const flagTurnBase: React.CSSProperties = {
  ...flagBadgeBase,
  fontWeight: 600,
  background: 'transparent',
};

const flagTurnMine: React.CSSProperties = {
  ...flagTurnBase,
  border: '1px solid #f0b429',
  color: '#8a4b00',
};

const flagTurnOther: React.CSSProperties = {
  ...flagTurnBase,
  border: '1px solid #d0d7de',
  color: '#57606a',
};

const flagBadgeBlocking: React.CSSProperties = {
  ...flagBadgeBase,
  background: '#7f1d1d',
  color: 'white',
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
  padding: '5px 11px',
  borderRadius: 4,
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const rowArchiveBtnStyle: React.CSSProperties = {
  display: 'inline-block',
  background: '#f5f5f5',
  color: '#2c3e50',
  padding: '5px 11px',
  borderRadius: 4,
  border: '1px solid #ddd',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const rowDeleteBtnStyle: React.CSSProperties = {
  display: 'inline-block',
  background: '#fff',
  color: '#c62828',
  padding: '5px 11px',
  borderRadius: 4,
  border: '1px solid #f0b4b4',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const rowCosignBtnStyle: React.CSSProperties = {
  display: 'inline-block',
  background: '#27ae60',
  color: 'white',
  padding: '5px 11px',
  borderRadius: 4,
  border: 'none',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const checkboxStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  cursor: 'pointer',
};

// Subtle "by Andrea Hall" subtext rendered under the date-of-service
// cell on rows whose author is somebody other than the current nurse.
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

// Merged into pageBtnStyle when the button is at an edge of the pagination
// (Prev on page 1, Next on the last page). Mirrors the disabled affordances
// used elsewhere — muted bg + text, no-drop cursor — so the user can tell
// at a glance there's nowhere to go in that direction.
const pageBtnDisabledStyle: React.CSSProperties = {
  background: '#f5f7fa',
  color: '#a5afba',
  borderColor: '#e5eaf0',
  cursor: 'not-allowed',
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
