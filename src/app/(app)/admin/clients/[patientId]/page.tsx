'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  MapPin,
  Pill,
  FileText,
  ClipboardList,
  Activity,
  AlertTriangle,
  CalendarClock,
  FolderOpen,
  TrendingUp,
} from 'lucide-react';
import { AuthGuard } from '@/components/AuthGuard';
import { useAuth, useEffectiveUser } from '@/components/AuthProvider';
import { useSettings } from '@/components/SettingsProvider';
import { getPatient, getPatientClinical, type Patient, type PatientClinical } from '@/lib/patients';
import { getMarOrders, getAdministrationsForRange, type MarOrder, type MarAdministration } from '@/lib/mar';
import { getNotesForPatient } from '@/lib/submissions';
import { getPatientDocuments, type PatientDocument } from '@/lib/patientDocuments';
import { getVisitsForPatient, type PatientVisit } from '@/lib/patientVisits';
import DocumentsSection from './DocumentsSection';
import VisitsSection from './VisitsSection';
import {
  adverseEvents,
  ageYears,
  bestCurrency,
  careTeamFromNotes,
  currentAdmins,
  dateCurrency,
  documentCurrency,
  largestGapDays,
  latestCompletedVisitISO,
  marComplianceStats,
  notesInWindow,
  overdueVisits,
  shiftISO,
  timelinessStats,
  upcomingVisits,
  type DashboardNote,
} from '@/lib/clientDashboardShared';

// The dashboard grew to seven full sections; tabs keep each audience's view
// to one screen. The identity header stays above the tabs (context never
// scrolls away); Overview is the triage view — alerts, stat tiles, the next
// visits, and recent activity. The active tab lives in the URL (?tab=) so
// views are shareable/deep-linkable.
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'trends', label: 'Trends' },
  { key: 'readiness', label: 'Survey readiness' },
  { key: 'documents', label: 'Documents' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

function isTabKey(v: string | null): v is TabKey {
  return TABS.some((t) => t.key === v);
}

// Charts are heavy (recharts) and browser-only; load them after the shell so
// the dashboard paints fast and SSR never touches the chart lib.
const ClientCharts = dynamic(() => import('./ClientCharts'), {
  ssr: false,
  loading: () => <div style={{ padding: '24px 0', color: '#7f8c8d', fontSize: 13, textAlign: 'center' }}>Loading charts…</div>,
});

// Survey-readiness baselines for document currency. Georgia intervals vary by
// service line, so these are STARTING points the compliance nurse will tune:
// RN supervisory visits monthly, plan of care per 60-day cert period.
const SUPERVISORY_MAX_DAYS = 30;
const POC_MAX_DAYS = 60;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(hhmm?: string): string {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function initialsOf(name: string): string {
  return (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

type Signal = 'good' | 'warn' | 'bad' | 'none';

interface ActivityItem {
  when: Date;
  text: string;
  kind: 'note' | 'med' | 'dose';
}

function tsToDate(v: unknown): Date | null {
  return v && typeof (v as { toDate?: () => Date }).toDate === 'function'
    ? (v as { toDate: () => Date }).toDate()
    : null;
}

/**
 * Per-client dashboard: identity + clinical header, stat tiles, the compliance
 * nurse's survey-readiness baseline, and a recent-activity feed. Everything
 * renders from data the care team can already read (notes, MAR, patient
 * profile) — no new permissions. Charts (phase 2), documents (phase 3), and
 * scheduled visits (phase 4) extend this page.
 */
function ClientDashboardInner() {
  const params = useParams();
  const patientId = String(params.patientId);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: TabKey = isTabKey(tabParam) ? tabParam : 'overview';
  const setTab = (next: TabKey) => {
    router.replace(next === 'overview' ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  };
  const { uid, role } = useEffectiveUser();
  const isNurse = role === 'nurse';
  const { settings } = useSettings();
  // Writes (upload/archive) always act as the REAL signed-in user — the
  // Firestore create rule pins uploadedBy to auth.uid, so a view-as session
  // can't forge authorship.
  const { user, profile } = useAuth();
  const realRole = profile?.role || '';
  const realStaff = realRole === 'admin' || realRole === 'supervisor';

  const [patient, setPatient] = useState<Patient | null>(null);
  const [clinical, setClinical] = useState<PatientClinical | null>(null);
  const [orders, setOrders] = useState<MarOrder[]>([]);
  const [admins, setAdmins] = useState<MarAdministration[]>([]);
  const [notes, setNotes] = useState<DashboardNote[]>([]);
  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [visits, setVisits] = useState<PatientVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the patient currently on screen so a slow refetch for a previous
  // client can never land its documents under this one's URL.
  const patientIdRef = useRef(patientId);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const today = todayISO();
  const start90 = shiftISO(today, -89);
  const start30 = shiftISO(today, -29);

  useEffect(() => {
    let cancelled = false;
    patientIdRef.current = patientId;
    // Reset before fetching so navigating between clients can't show client
    // A's PHI under client B's URL while B's data loads.
    setLoading(true);
    setPatient(null);
    setClinical(null);
    setOrders([]);
    setAdmins([]);
    setNotes([]);
    setDocuments([]);
    setVisits([]);
    (async () => {
      const [p, c, o, a, n, docs, vis] = await Promise.all([
        getPatient(patientId),
        getPatientClinical(patientId),
        getMarOrders(patientId),
        getAdministrationsForRange(patientId, start90, today),
        getNotesForPatient(patientId),
        getPatientDocuments(patientId),
        getVisitsForPatient(patientId),
      ]);
      if (cancelled) return;
      setPatient(p);
      setClinical(c);
      setOrders(o);
      setAdmins(a);
      setNotes(n);
      setDocuments(docs);
      setVisits(vis);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // start90/today are derived from the clock; patientId is the real key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const notes90 = useMemo(() => notesInWindow(notes, start90, today), [notes, start90, today]);

  const lastVisit = notes.find((n) => n.dateISO && n.dateISO <= today)?.dateISO || '';
  const daysSinceVisit = lastVisit ? Math.max(0, Math.round((new Date(today + 'T12:00:00').getTime() - new Date(lastVisit + 'T12:00:00').getTime()) / 86400000)) : null;
  const visitsThisMonth = notes.filter((n) => n.dateISO.startsWith(today.slice(0, 7))).length;
  const activeOrders = orders.filter((o) => o.status === 'active');
  const prnCount = activeOrders.filter((o) => o.isPRN).length;

  const mar30 = useMemo(
    () => marComplianceStats(orders, admins, start30, today, today),
    [orders, admins, start30, today],
  );
  const timeliness = useMemo(() => timelinessStats(notes90), [notes90]);
  const gap = useMemo(() => largestGapDays(notes, start90, today), [notes, start90, today]);
  const adverse = useMemo(() => adverseEvents(notes90), [notes90]);
  const team = useMemo(() => careTeamFromNotes(notes), [notes]);

  // Currency tiles (baseline intervals; tune with the compliance nurse).
  // Supervisory currency counts BOTH evidence sources: uploaded visit forms
  // (docDate) and visits marked completed on the schedule — whichever is
  // fresher wins.
  const supCurrency = useMemo(
    () =>
      bestCurrency(
        documentCurrency(documents, 'Supervisory Visit', SUPERVISORY_MAX_DAYS, today),
        dateCurrency(latestCompletedVisitISO(visits, 'supervisory', today), SUPERVISORY_MAX_DAYS, today),
      ),
    [documents, visits, today],
  );
  const pocCurrency = useMemo(
    () => documentCurrency(documents, 'Plan of Care (485)', POC_MAX_DAYS, today),
    [documents, today],
  );

  // Upload rights: staff, or a nurse on THIS client's care team (real user —
  // the create rules verify the same thing server-side).
  const canUploadDocs =
    realStaff ||
    (realRole === 'nurse' && !!user?.uid && (patient?.assignedNurseIds || []).includes(user.uid));

  const address = useMemo(() => {
    const fromProfile = [patient?.street, patient?.city, patient?.state, patient?.zip].filter(Boolean).join(', ');
    if (fromProfile) return fromProfile;
    const n = notes.find((x) => x.addrLine1);
    return n ? [n.addrLine1, n.city, n.state, n.postal].filter(Boolean).join(', ') : '';
  }, [patient, notes]);

  const activity = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    // Rank note candidates by WHEN THEY WERE SUBMITTED, not date of service —
    // a backdated note submitted today belongs at the top of recent activity.
    const bySubmitted = notes
      .filter((n) => n.submittedAt)
      .sort((a, b) => (b.submittedAt?.getTime() || 0) - (a.submittedAt?.getTime() || 0))
      .slice(0, 15);
    for (const n of bySubmitted) {
      items.push({
        when: n.submittedAt as Date,
        kind: 'note',
        text: `Progress note for ${fmtDate(n.dateISO)} by ${n.nurseName || 'a nurse'}${n.credential ? `, ${n.credential}` : ''}`,
      });
    }
    for (const o of orders) {
      const created = tsToDate(o.createdAt);
      if (created) {
        items.push({ when: created, kind: 'med', text: `Medication added: ${o.medName} ${o.dose}${o.units ? ` ${o.units}` : ''}${o.createdByName ? ` (by ${o.createdByName})` : ''}` });
      }
      const dced = tsToDate(o.discontinuedAt);
      if (dced) {
        items.push({ when: dced, kind: 'med', text: `Medication discontinued: ${o.medName}${o.discontinuedByName ? ` (by ${o.discontinuedByName})` : ''}` });
      }
    }
    // Amendment-resolved, so a corrected record never shows beside its correction.
    for (const a of currentAdmins(admins)) {
      if (a.status === 'held' || a.status === 'refused') {
        const when = tsToDate(a.at);
        if (when) {
          items.push({ when, kind: 'dose', text: `Dose ${a.status}: ${a.medNameSnapshot} on ${fmtDate(a.date)}${a.reason ? ` (${a.reason})` : ''}` });
        }
      }
    }
    return items.sort((x, y) => y.when.getTime() - x.when.getTime()).slice(0, 10);
  }, [notes, orders, admins]);

  const age = patient?.dob ? ageYears(patient.dob, today) : null;
  const marHref = isNurse ? `/admin/mar/${patientId}` : `/admin/records/${patientId}/mar`;

  // Survey-readiness signals (baseline thresholds; tune with the compliance nurse).
  const timelinessSignal: Signal =
    timeliness.pctSameDay === null ? 'none' : timeliness.pctSameDay >= 90 ? 'good' : timeliness.pctSameDay >= 75 ? 'warn' : 'bad';
  const gapSignal: Signal = gap === null ? 'none' : gap <= 7 ? 'good' : gap <= 14 ? 'warn' : 'bad';
  const prnSignal: Signal = mar30.prnGiven === 0 ? 'none' : mar30.prnPendingResult === 0 ? 'good' : 'warn';
  const doseSignal: Signal = mar30.expected === 0 ? 'none' : mar30.undocumented === 0 ? 'good' : 'bad';
  const adverseSignal: Signal =
    adverse.length === 0 ? 'good' : adverse.every((e) => e.physNotified === 'Yes') ? 'warn' : 'bad';

  // Overview tab derivations: the alert strip surfaces every red condition
  // from anywhere on the dashboard with a jump to where it lives, and the
  // Survey-readiness tab label wears the count of red signals so problems
  // are visible from every tab.
  const overdueList = useMemo(() => overdueVisits(visits, today), [visits, today]);
  const nextVisits = useMemo(() => upcomingVisits(visits, today, 3), [visits, today]);
  const alerts: Array<{ text: string; go: () => void }> = [];
  if (overdueList.length > 0) {
    alerts.push({
      text: `${overdueList.length} visit${overdueList.length === 1 ? '' : 's'} past date, not completed`,
      go: () => setTab('schedule'),
    });
  }
  if (mar30.undocumented > 0) {
    alerts.push({
      text: `${mar30.undocumented} scheduled dose${mar30.undocumented === 1 ? '' : 's'} undocumented (30d)`,
      go: () => router.push(marHref),
    });
  }
  if (mar30.prnPendingResult > 0) {
    alerts.push({
      text: `${mar30.prnPendingResult} PRN result${mar30.prnPendingResult === 1 ? '' : 's'} pending`,
      go: () => router.push(marHref),
    });
  }
  if (adverseSignal === 'bad') {
    alerts.push({ text: 'Adverse reaction without physician notification', go: () => setTab('readiness') });
  }
  if (supCurrency.status === 'bad') {
    alerts.push({ text: 'Supervisory visit overdue', go: () => setTab('schedule') });
  } else if (supCurrency.status === 'none') {
    alerts.push({ text: 'No supervisory visit on record', go: () => setTab('schedule') });
  }
  if (pocCurrency.status === 'bad') {
    alerts.push({ text: 'Plan of care out of date', go: () => setTab('documents') });
  } else if (pocCurrency.status === 'none') {
    alerts.push({ text: 'No plan of care on file', go: () => setTab('documents') });
  }
  const readinessBadge = [
    timelinessSignal,
    gapSignal,
    doseSignal,
    prnSignal,
    adverseSignal,
    supCurrency.status,
    pocCurrency.status,
  ].filter((s) => s === 'bad').length;

  return (
    <div style={containerStyle}>
      <div style={{ marginBottom: 14 }}>
        <Link href="/admin/clients" style={backLinkStyle}>
          <ArrowLeft size={14} /> Back to Clients
        </Link>
      </div>

      {loading ? (
        <div style={emptyCardStyle}>Loading dashboard…</div>
      ) : !patient ? (
        <div style={emptyCardStyle}>Client not found.</div>
      ) : isNurse && !(patient.assignedNurseIds || []).includes(uid || '') ? (
        // Not on this client's care team: her data reads would all be denied by
        // Firestore rules and return empty, which would render as affirmative
        // "all clear" compliance cards — misinformation, not privacy. Say the
        // truth instead.
        <div style={emptyCardStyle}>
          You&apos;re not on {patient.name ? `${patient.name}'s` : 'this client&apos;s'} care team, so their
          record isn&apos;t available to you. If this client was recently assigned to you, ask your
          supervisor to add you to the care team.
        </div>
      ) : (
        <>
          {/* Identity header */}
          <header style={headerCardStyle}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
              <div style={avatarStyle}>{initialsOf(patient.name)}</div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <h1 style={titleStyle}>{patient.name}</h1>
                <div style={identityLineStyle}>
                  {age !== null ? `${age} yrs · ` : ''}
                  {patient.dob ? `DOB ${fmtDate(patient.dob)}` : ''}
                  {patient.mrn ? ` · Record #${patient.mrn}` : ''}
                  {clinical?.sex ? ` · ${clinical.sex}` : ''}
                </div>
                {address && (
                  <div style={addressLineStyle}>
                    <MapPin size={13} style={{ flexShrink: 0, marginTop: 2 }} /> {address}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link href={marHref} style={primaryActionStyle}>
                  <Pill size={15} /> Open MAR
                </Link>
                {isNurse ? (
                  <Link href="/progress-note" style={secondaryActionStyle}>
                    <FileText size={15} /> New progress note
                  </Link>
                ) : (
                  <Link href={`/admin/records/${patientId}`} style={secondaryActionStyle}>
                    <ClipboardList size={15} /> Manage record
                  </Link>
                )}
              </div>
            </div>
            <div style={headerGridStyle}>
              <HeaderField label="Diagnosis" value={patient.diagnosis} />
              <HeaderField label="Allergies" value={clinical?.allergies} highlight />
              <HeaderField
                label="Attending physician"
                value={[clinical?.physicianName, clinical?.physicianPhone].filter(Boolean).join(' · ')}
              />
              <HeaderField label="Diet / special instructions" value={clinical?.diet} />
            </div>
            {team.length > 0 && (
              <div style={teamRowStyle}>
                <span style={teamLabelStyle}>Care team:</span>
                {team.map((m) => (
                  <span key={m.uid} style={teamChipStyle} title={m.name}>
                    <span style={teamInitialsStyle}>{initialsOf(m.name)}</span>
                    {m.name}
                    {m.credential ? `, ${m.credential}` : ''}
                  </span>
                ))}
              </div>
            )}
          </header>

          {/* Tab bar */}
          <div style={tabBarStyle} role="tablist" aria-label="Dashboard sections">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                style={{ ...tabBtnStyle, ...(tab === t.key ? tabBtnActiveStyle : null) }}
              >
                {t.label}
                {t.key === 'readiness' && readinessBadge > 0 && <span style={tabBadgeStyle}>{readinessBadge}</span>}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <>
              {/* Alert strip: every red condition anywhere on the dashboard,
                  each jumping to where it lives. */}
              {alerts.length > 0 ? (
                <div style={alertStripStyle}>
                  {alerts.map((a, i) => (
                    <button key={i} type="button" onClick={a.go} style={alertItemStyle}>
                      <AlertTriangle size={13} style={{ flexShrink: 0 }} /> {a.text}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={allClearStyle}>Nothing needs attention right now.</div>
              )}

          {/* Stat tiles */}
          <div style={tileGridStyle}>
            <StatTile
              label="Last visit"
              value={lastVisit ? (daysSinceVisit === 0 ? 'Today' : `${daysSinceVisit}d ago`) : 'None yet'}
              sub={lastVisit ? fmtDate(lastVisit) : 'No notes documented'}
            />
            <StatTile label="Visits this month" value={String(visitsThisMonth)} sub={today.slice(0, 7)} />
            <StatTile
              label="Active medications"
              value={String(activeOrders.length)}
              sub={prnCount > 0 ? `${prnCount} PRN` : activeOrders.length > 0 ? 'All scheduled' : 'None on file'}
            />
            <StatTile
              label="MAR compliance (30d)"
              value={mar30.pctGiven === null ? '—' : `${mar30.pctGiven}%`}
              sub={mar30.expected === 0 ? 'No scheduled doses due' : `${mar30.given}/${mar30.expected} scheduled doses given`}
            />
          </div>

              {/* Next visits, compact — the full calendar lives on Schedule */}
              <section style={sectionCardStyle}>
                <div style={{ ...sectionTitleStyle, marginBottom: 12 }}>
                  <CalendarClock size={16} /> Next visits
                </div>
                {nextVisits.length === 0 ? (
                  <div style={emptyInlineStyle}>No upcoming visits scheduled.</div>
                ) : (
                  <ul style={miniVisitListStyle}>
                    {nextVisits.map((v) => (
                      <li key={v.id} style={miniVisitRowStyle}>
                        <span style={{ fontWeight: 700, color: '#1a3a5c', minWidth: 96, flexShrink: 0 }}>{fmtDate(v.date)}</span>
                        <span style={{ color: '#2c3e50', minWidth: 0 }}>
                          {v.type === 'supervisory' ? 'Supervisory visit' : 'Shift'}
                          {v.startTime ? ` · ${fmtTime(v.startTime)}` : ''}
                          {v.nurseName ? ` · ${v.nurseName}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" onClick={() => setTab('schedule')} style={jumpLinkStyle}>
                  Full schedule
                </button>
              </section>
            </>
          )}

          {tab === 'schedule' && (
          <section style={sectionCardStyle}>
            <div style={{ ...sectionTitleStyle, marginBottom: 12 }}>
              <CalendarClock size={16} /> Schedule
            </div>
            <VisitsSection
              patientId={patientId}
              visits={visits}
              isStaff={realStaff}
              actor={{ uid: user?.uid || '', name: profile?.displayName || user?.email || '' }}
              careTeam={team}
              onChanged={() => {
                void getVisitsForPatient(patientId).then((vis) => {
                  if (patientIdRef.current === patientId) setVisits(vis);
                });
              }}
              onToast={showToast}
            />
          </section>
          )}

          {/* Trends & charts (recharts chunk loads only when this tab opens) */}
          {tab === 'trends' && (
          <section style={sectionCardStyle}>
            <div style={{ ...sectionTitleStyle, marginBottom: 12 }}>
              <TrendingUp size={16} /> Trends
            </div>
            <ClientCharts
              notes={notes}
              admins={admins}
              dob={patient.dob}
              vitalsOverride={settings.vitals.rangesByAgeGroup}
            />
          </section>
          )}

          {/* Survey readiness */}
          {tab === 'readiness' && (
          <section style={sectionCardStyle}>
            <div style={sectionTitleStyle}>
              <Activity size={16} /> Survey readiness · baseline
            </div>
            <p style={sectionSubStyle}>
              Signals a surveyor checks first, computed from the last 90 days (medication window: 30 days).
              Thresholds are a starting point — adjust with your compliance nurse.
            </p>
            <div style={readinessGridStyle}>
              <ReadinessCard
                signal={timelinessSignal}
                title="Documentation timeliness"
                value={timeliness.pctSameDay === null ? 'No notes in window' : `${timeliness.pctSameDay}% same-day`}
                detail={timeliness.late > 0 ? `${timeliness.late} late ${timeliness.late === 1 ? 'entry' : 'entries'}` : 'No late entries'}
              />
              <ReadinessCard
                signal={gapSignal}
                title="Continuity of care"
                value={gap === null ? 'No visits in window' : `Largest gap: ${gap}d`}
                detail={daysSinceVisit !== null ? `${daysSinceVisit}d since last visit` : 'No visits yet'}
              />
              <ReadinessCard
                signal={doseSignal}
                title="Scheduled doses (30d)"
                value={mar30.expected === 0 ? 'None due' : mar30.undocumented === 0 ? 'All documented' : `${mar30.undocumented} undocumented`}
                detail={`${mar30.given} given · ${mar30.held} held · ${mar30.refused} refused`}
              />
              <ReadinessCard
                signal={prnSignal}
                title="PRN follow-up (30d)"
                value={mar30.prnGiven === 0 ? 'No PRN doses' : mar30.prnPendingResult === 0 ? 'All results recorded' : `${mar30.prnPendingResult} result${mar30.prnPendingResult === 1 ? '' : 's'} pending`}
                detail={mar30.prnGiven > 0 ? `${mar30.prnGiven} PRN dose${mar30.prnGiven === 1 ? '' : 's'} given` : 'Nothing to follow up'}
                href={mar30.prnPendingResult > 0 ? marHref : undefined}
              />
              <ReadinessCard
                signal={adverseSignal}
                title="Adverse reactions (90d)"
                value={adverse.length === 0 ? 'None reported' : `${adverse.length} reported`}
                detail={
                  adverse.length === 0
                    ? ''
                    : adverse.every((e) => e.physNotified === 'Yes')
                      ? 'Physician notified on all'
                      : 'Physician notification incomplete'
                }
              />
              <ReadinessCard
                signal={supCurrency.status}
                title="Supervisory visits"
                value={
                  supCurrency.status === 'none'
                    ? 'No visit form on file'
                    : `Last visit ${supCurrency.daysSince}d ago`
                }
                detail={
                  supCurrency.status === 'none'
                    ? 'Schedule + complete visits, or upload visit forms, to track (30-day baseline)'
                    : `${fmtDate(supCurrency.newestDateISO)} · due every ${SUPERVISORY_MAX_DAYS}d (baseline)`
                }
                icon={<CalendarClock size={14} />}
              />
              <ReadinessCard
                signal={pocCurrency.status}
                title="Plan of care currency"
                value={
                  pocCurrency.status === 'none'
                    ? 'No plan of care on file'
                    : `Current plan ${pocCurrency.daysSince}d old`
                }
                detail={
                  pocCurrency.status === 'none'
                    ? 'Upload the plan of care (485) to track (60-day baseline)'
                    : `${fmtDate(pocCurrency.newestDateISO)} · ${POC_MAX_DAYS}d cert period (baseline)`
                }
                icon={<FolderOpen size={14} />}
              />
            </div>
          </section>
          )}

          {/* Documents */}
          {tab === 'documents' && (
          <section style={sectionCardStyle}>
            <div style={{ ...sectionTitleStyle, marginBottom: 12 }}>
              <FolderOpen size={16} /> Documents
            </div>
            <DocumentsSection
              patientId={patientId}
              documents={documents}
              canUpload={canUploadDocs}
              isStaff={realStaff}
              uploader={{
                uid: user?.uid || '',
                name: profile?.displayName || user?.email || '',
                role: realRole,
              }}
              onChanged={() => {
                void getPatientDocuments(patientId).then((docs) => {
                  if (patientIdRef.current === patientId) setDocuments(docs);
                });
              }}
              onToast={showToast}
            />
          </section>
          )}

          {/* Recent activity (Overview: renders below Next visits) */}
          {tab === 'overview' && (
          <section style={sectionCardStyle}>
            <div style={sectionTitleStyle}>
              <ClipboardList size={16} /> Recent activity
            </div>
            {activity.length === 0 ? (
              <div style={emptyInlineStyle}>Nothing documented yet for this client.</div>
            ) : (
              <ul style={activityListStyle}>
                {activity.map((a, i) => (
                  <li key={i} style={activityRowStyle}>
                    <span style={activityIconStyle(a.kind)}>
                      {a.kind === 'note' ? <FileText size={13} /> : a.kind === 'med' ? <Pill size={13} /> : <AlertTriangle size={13} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>{a.text}</span>
                    <span style={activityWhenStyle}>
                      {a.when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          )}
        </>
      )}

      {toast && <div style={toastStyle}>{toast}</div>}
    </div>
  );
}

export default function ClientDashboardPage() {
  return (
    <AuthGuard allow={['admin', 'supervisor', 'nurse']}>
      <ClientDashboardInner />
    </AuthGuard>
  );
}

function HeaderField({ label, value, highlight }: { label: string; value?: string | null; highlight?: boolean }) {
  return (
    <div>
      <div style={headerFieldLabelStyle}>{label}</div>
      <div style={{ ...headerFieldValueStyle, color: highlight && value ? '#b3261e' : '#2c3e50' }}>{value || '—'}</div>
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={tileStyle}>
      <div style={tileLabelStyle}>{label}</div>
      <div style={tileValueStyle}>{value}</div>
      {sub && <div style={tileSubStyle}>{sub}</div>}
    </div>
  );
}

const SIGNAL_COLORS: Record<Signal, { bg: string; border: string; fg: string }> = {
  good: { bg: '#e8f4e8', border: '#bfe3bf', fg: '#1e5c1e' },
  warn: { bg: '#fff7e6', border: '#f5d9a8', fg: '#8a5a0d' },
  bad: { bg: '#fdeaea', border: '#f3c1bd', fg: '#b3261e' },
  none: { bg: '#f8fafc', border: '#e5e7eb', fg: '#64748b' },
};

function ReadinessCard({
  signal,
  title,
  value,
  detail,
  href,
  icon,
}: {
  signal: Signal;
  title: string;
  value: string;
  detail?: string;
  href?: string;
  icon?: React.ReactNode;
}) {
  const c = SIGNAL_COLORS[signal];
  const body = (
    <div style={{ ...readinessCardStyle, background: c.bg, borderColor: c.border }}>
      <div style={{ ...readinessTitleStyle, color: c.fg }}>
        {icon} {title}
      </div>
      <div style={{ ...readinessValueStyle, color: signal === 'none' ? '#64748b' : '#1f2937' }}>{value}</div>
      {detail ? <div style={readinessDetailStyle}>{detail}</div> : null}
    </div>
  );
  return href ? (
    <Link href={href} style={{ textDecoration: 'none' }}>
      {body}
    </Link>
  ) : (
    body
  );
}

const NAVY = '#1a3a5c';
const containerStyle: React.CSSProperties = { maxWidth: 1080, margin: '0 auto', padding: 20 };
const backLinkStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, color: '#0e7c4a', fontSize: 13.5, fontWeight: 600, textDecoration: 'none' };
const emptyCardStyle: React.CSSProperties = { padding: '32px 16px', textAlign: 'center', color: '#7f8c8d', fontSize: 14, background: 'white', border: '1px solid #e5e7eb', borderRadius: 12 };
const headerCardStyle: React.CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 18, marginBottom: 14 };
const avatarStyle: React.CSSProperties = { width: 52, height: 52, borderRadius: 14, background: '#e8eef4', color: NAVY, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, flexShrink: 0 };
const titleStyle: React.CSSProperties = { fontSize: 22, color: '#1f2937', margin: 0, lineHeight: 1.2 };
const identityLineStyle: React.CSSProperties = { fontSize: 13.5, color: '#5c6b7a', marginTop: 4 };
const addressLineStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 13, color: '#5c6b7a', marginTop: 4 };
const primaryActionStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: NAVY, color: 'white', padding: '9px 14px', borderRadius: 8, fontSize: 13.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' };
const secondaryActionStyle: React.CSSProperties = { ...primaryActionStyle, background: 'white', color: NAVY, border: `1px solid ${NAVY}` };
const headerGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1f3f5' };
const headerFieldLabelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#8a949e', textTransform: 'uppercase', letterSpacing: 0.4 };
const headerFieldValueStyle: React.CSSProperties = { fontSize: 13.5, marginTop: 3, lineHeight: 1.4 };
const teamRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f3f5' };
const teamLabelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#8a949e', textTransform: 'uppercase', letterSpacing: 0.4 };
const teamChipStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 999, padding: '3px 10px 3px 4px', fontSize: 12.5, color: '#2c3e50', fontWeight: 600 };
const teamInitialsStyle: React.CSSProperties = { width: 22, height: 22, borderRadius: 999, background: '#e8eef4', color: NAVY, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 };
const tileGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 };
const tileStyle: React.CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' };
const tileLabelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: '#8a949e', textTransform: 'uppercase', letterSpacing: 0.4 };
const tileValueStyle: React.CSSProperties = { fontSize: 24, fontWeight: 800, color: '#1f2937', marginTop: 4, lineHeight: 1.1 };
const tileSubStyle: React.CSSProperties = { fontSize: 12.5, color: '#7f8c8d', marginTop: 3 };
const sectionCardStyle: React.CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 18, marginBottom: 14 };
// Folder-style tabs: the active tab is a raised white card that fuses with
// the page below (its bottom border goes white over the bar's rule line);
// inactive tabs sit muted behind it. Every border property is LONGHAND in
// both states — mixing a border shorthand with a longhand override makes
// React drop/re-add properties across rerenders (dev warning + real styling
// bugs), so the keys stay constant and only their values change.
const TAB_EDGE = '#d0d7de';
const tabBarStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-end', gap: 4, margin: '4px 0 16px', overflowX: 'auto', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: TAB_EDGE, paddingTop: 2 };
const tabBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#e8edf2',
  color: '#5c6b7a',
  padding: '9px 16px',
  fontSize: 13.5,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  borderTopLeftRadius: 10,
  borderTopRightRadius: 10,
  marginBottom: -1,
  borderTopWidth: 1,
  borderTopStyle: 'solid',
  borderTopColor: TAB_EDGE,
  borderLeftWidth: 1,
  borderLeftStyle: 'solid',
  borderLeftColor: TAB_EDGE,
  borderRightWidth: 1,
  borderRightStyle: 'solid',
  borderRightColor: TAB_EDGE,
  borderBottomWidth: 1,
  borderBottomStyle: 'solid',
  borderBottomColor: TAB_EDGE,
};
const tabBtnActiveStyle: React.CSSProperties = {
  background: 'white',
  color: '#1a3a5c',
  fontWeight: 700,
  borderTopColor: '#1a3a5c',
  borderTopWidth: 3,
  paddingTop: 7,
  borderBottomColor: 'white',
};
const tabBadgeStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999, background: '#b3261e', color: 'white', fontSize: 10.5, fontWeight: 700 };
const alertStripStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 };
const alertItemStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fdeaea', color: '#b3261e', border: '1px solid #f3c1bd', borderRadius: 999, padding: '6px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const allClearStyle: React.CSSProperties = { background: '#e8f4e8', color: '#1e5c1e', borderRadius: 8, padding: '8px 13px', fontSize: 12.5, fontWeight: 600, marginBottom: 14 };
const miniVisitListStyle: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 };
const miniVisitRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 10px', background: '#f8fafc', borderRadius: 8, fontSize: 13 };
const jumpLinkStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#1a3a5c', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: '8px 2px 0', textDecoration: 'underline' };
const sectionTitleStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: NAVY };
const sectionSubStyle: React.CSSProperties = { fontSize: 12.5, color: '#7f8c8d', margin: '6px 0 12px', lineHeight: 1.5 };
const readinessGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 };
const readinessCardStyle: React.CSSProperties = { border: '1px solid', borderRadius: 10, padding: '12px 14px', height: '100%' };
const readinessTitleStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 };
const readinessValueStyle: React.CSSProperties = { fontSize: 15.5, fontWeight: 700, marginTop: 6 };
const readinessDetailStyle: React.CSSProperties = { fontSize: 12.5, color: '#64748b', marginTop: 3 };
const emptyInlineStyle: React.CSSProperties = { padding: '18px 0 6px', color: '#7f8c8d', fontSize: 13.5 };
const activityListStyle: React.CSSProperties = { listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 };
const activityRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13.5, color: '#2c3e50', lineHeight: 1.4 };
const activityWhenStyle: React.CSSProperties = { fontSize: 12, color: '#8a949e', whiteSpace: 'nowrap' };
const toastStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 24,
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#1f2937',
  color: 'white',
  padding: '10px 18px',
  borderRadius: 8,
  fontSize: 13.5,
  fontWeight: 600,
  boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
  zIndex: 3300,
};

function activityIconStyle(kind: 'note' | 'med' | 'dose'): React.CSSProperties {
  const palette =
    kind === 'note'
      ? { bg: '#e8eef4', fg: NAVY }
      : kind === 'med'
        ? { bg: '#e8f4e8', fg: '#1e5c1e' }
        : { bg: '#fff7e6', fg: '#8a5a0d' };
  return {
    width: 24,
    height: 24,
    borderRadius: 8,
    background: palette.bg,
    color: palette.fg,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };
}
