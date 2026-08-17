'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, ClipboardList, FileDown } from 'lucide-react';
import { getPatient, getPatientClinical, type Patient, type PatientClinical } from '@/lib/patients';
import { getCareTasks, normalizeTimesPerDay, type CareTask } from '@/lib/careTasks';
import { getTarEntriesForRange, type TarEntry } from '@/lib/tar';
import {
  indexTarEntriesByCell,
  resolveCurrentTarEntries,
  tarCellKey,
  tarCellLabel,
} from '@/lib/tarShared';
import { physicianAttributionPending } from '@/lib/marShared';
import { authedFetch } from '@/lib/authedFetch';
import { triggerDownload } from '@/lib/batchExport';
import { useAuth, useEffectiveUser } from '@/components/AuthProvider';
import RecordTreatmentModal from './RecordTreatmentModal';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function dayISO(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, '0')}`;
}
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
function weekdayLetter(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number);
  return DOW[new Date(y, m - 1, day).getDay()];
}

interface GridRow {
  task: CareTask;
  slotIndex: number;
  timesPerDay: number;
}

export default function MonthlyTarPage() {
  const params = useParams();
  const patientId = String(params.patientId);
  // Same grid, two routes — /admin/records/[id]/tar and the standalone
  // /admin/treatments/[id] picker. The back-link follows the route rather than
  // the role, since staff reach the picker too. See the MAR page for the reason.
  const pathname = usePathname();
  const cameFromPicker = pathname.startsWith('/admin/treatments');
  const { role, isViewingAs } = useEffectiveUser();
  const { profile } = useAuth();
  const isNurse = role === 'nurse';

  const [month, setMonth] = useState(currentMonth());
  const [patient, setPatient] = useState<Patient | null>(null);
  const [clinical, setClinical] = useState<PatientClinical | null>(null);
  const [tasks, setTasks] = useState<CareTask[]>([]);
  const [entries, setEntries] = useState<TarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthLoading, setMonthLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [recordFor, setRecordFor] = useState<{ task: CareTask; date: string; slotIndex: number; timesPerDay: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const days = daysInMonth(month);
  const monthStart = dayISO(month, 1);
  const monthEnd = dayISO(month, days);
  const isCurrentMonth = month === currentMonth();

  // Carrying out a treatment is a licensed act for SKILLED tasks, so the gate is
  // the nursing credential, exactly as the MAR grid gates charting a dose
  // (see #116). Aide-level tasks ('any') are open to any active non-VA profile,
  // which is the whole point of the level flag on a care task. "View as" is
  // read-only, so impersonation can never reach a write.
  const hasLicense = profile?.credential === 'RN' || profile?.credential === 'LPN';
  const canChartAny = !isViewingAs && profile?.active === true && profile?.role !== 'va';
  const canChart = (task: CareTask) => canChartAny && (task.level === 'skilled' ? hasLicense : true);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Whole month on desktop; a 3-day window on a phone, since a 31-column grid is
  // unusable there. Mirrors the MAR grid's behaviour.
  const visibleDays = useMemo<number[]>(() => {
    if (!isMobile) return Array.from({ length: days }, (_, i) => i + 1);
    const anchor = isCurrentMonth ? Number(todayISO().slice(8, 10)) : 1;
    const start = Math.min(Math.max(anchor - 1, 1), Math.max(1, days - 2));
    return [start, start + 1, start + 2].filter((d) => d <= days);
  }, [isMobile, days, isCurrentMonth]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, c, t] = await Promise.all([
        getPatient(patientId),
        getPatientClinical(patientId),
        getCareTasks(patientId),
      ]);
      if (cancelled) return;
      setPatient(p);
      setClinical(c);
      setTasks(t);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMonthLoading(true);
      const items = await getTarEntriesForRange(patientId, monthStart, monthEnd);
      if (cancelled) return;
      setEntries(items);
      setMonthLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId, monthStart, monthEnd]);

  const refreshEntries = async () => {
    setEntries(await getTarEntriesForRange(patientId, monthStart, monthEnd));
  };

  // A correction supersedes the entry it amends, so resolve chains before
  // indexing: a cell must show the current truth, not every revision.
  const cellMap = useMemo(
    () => indexTarEntriesByCell(resolveCurrentTarEntries(entries)),
    [entries],
  );

  // One row per task, plus extra rows when an order calls for the treatment more
  // than once a day (the RN supervisor asked for a single daily box by default,
  // editable where a specific order needs more).
  const rows = useMemo<GridRow[]>(() => {
    const active = tasks
      .filter((t) => t.status === 'active')
      .sort((a, b) =>
        a.categoryLabel === b.categoryLabel
          ? (a.name || '').localeCompare(b.name || '')
          : (a.categoryLabel || '').localeCompare(b.categoryLabel || ''),
      );
    const out: GridRow[] = [];
    for (const task of active) {
      const n = normalizeTimesPerDay(task.timesPerDay);
      for (let i = 0; i < n; i += 1) out.push({ task, slotIndex: i, timesPerDay: n });
    }
    return out;
  }, [tasks]);

  // Export is staff-only, matching the MAR: the route requires admin/supervisor.
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await authedFetch('/api/tar/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, month }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setToast(data.error || 'Export failed.');
        return;
      }
      const blob = await res.blob();
      const safeName = (patient?.name || 'client').replace(/[^a-zA-Z0-9-]+/g, '_');
      triggerDownload(blob, `TAR_${safeName}_${month}.pdf`);
    } catch {
      setToast('Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const documenter = {
    uid: profile?.uid || '',
    name: profile?.displayName || '',
    credential: profile?.credential || '',
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={wrapStyle}><div style={emptyStyle}>Loading…</div></div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <Link
          href={cameFromPicker ? '/admin/clients' : `/admin/records/${patientId}`}
          style={backLinkStyle}
        >
          <ArrowLeft size={14} /> {cameFromPicker ? 'Back to Clients' : 'Back to client record'}
        </Link>

        <div style={headerCardStyle}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={headerIconStyle}><ClipboardList size={22} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={titleStyle}>Treatment Administration Record</h1>
              <div style={headerMetaStyle}>
                {patient?.name || 'Client'}
                {patient?.dob ? ` · DOB ${patient.dob}` : ''}
                {patient?.mrn ? ` · Record #${patient.mrn}` : ''}
              </div>
            </div>
            {!isNurse && (
              <button type="button" onClick={handleExport} style={exportBtnStyle} disabled={exporting}>
                <FileDown size={15} /> {exporting ? 'Exporting…' : 'Export PDF'}
              </button>
            )}
          </div>
          {(clinical?.allergies || clinical?.diet) && (
            <div style={headerGridStyle}>
              {clinical?.allergies && (
                <div>
                  <div style={headerFieldLabelStyle}>Allergies</div>
                  <div style={{ ...headerFieldValueStyle, color: '#b3261e', fontWeight: 700 }}>{clinical.allergies}</div>
                </div>
              )}
              {clinical?.diet && (
                <div>
                  <div style={headerFieldLabelStyle}>Diet / special instructions</div>
                  <div style={headerFieldValueStyle}>{clinical.diet}</div>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={monthNavStyle}>
          <button type="button" style={navBtnStyle} onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
            <ChevronLeft size={18} />
          </button>
          <div style={{ textAlign: 'center', minWidth: 180 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#2c3e50' }}>{monthLabel(month)}</div>
            {!isCurrentMonth && (
              <button type="button" style={jumpBtnStyle} onClick={() => setMonth(currentMonth())}>Jump to this month</button>
            )}
          </div>
          <button type="button" style={navBtnStyle} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
            <ChevronRight size={18} />
          </button>
        </div>

        {rows.length === 0 ? (
          <div style={emptyStyle}>
            No active treatments are on this client&apos;s care plan yet. Add them under Care Plans, then
            they will appear here to chart.
          </div>
        ) : (
          <>
            <div style={gridWrapStyle}>
              <table style={gridTableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...gridThStyle, ...taskColHeadStyle, textAlign: 'left' }}>Treatment</th>
                    {visibleDays.map((d) => {
                      const isToday = isCurrentMonth && dayISO(month, d) === todayISO();
                      return (
                        <th key={d} style={isToday ? { ...gridThStyle, ...todayThStyle } : gridThStyle}>
                          {d}
                          <div style={dowStyle}>{weekdayLetter(month, d)}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ task, slotIndex, timesPerDay }) => (
                    <tr key={`${task.id}-${slotIndex}`}>
                      <td style={{ ...gridTdStyle, ...taskColStyle }}>
                        {slotIndex === 0 ? (
                          <>
                            <div style={{ fontWeight: 700, color: '#1a3a5c' }}>{task.name}</div>
                            <div style={{ fontSize: 10.5, color: '#5c6b7a', marginTop: 2 }}>
                              {task.categoryLabel} · {task.frequency}
                              {task.level === 'skilled' ? ' · Skilled' : ''}
                            </div>
                            {task.instructions && (
                              <div style={{ fontSize: 10.5, color: '#2c3e50', marginTop: 3, lineHeight: 1.4 }}>
                                {task.instructions}
                              </div>
                            )}
                            {physicianAttributionPending(task) && (
                              <span style={physicianNeededChipStyle}>Physician needed</span>
                            )}
                          </>
                        ) : (
                          <div style={{ fontSize: 10.5, color: '#5c6b7a' }}>
                            {task.name} · box {slotIndex + 1} of {timesPerDay}
                          </div>
                        )}
                      </td>
                      {visibleDays.map((d) => {
                        const iso = dayISO(month, d);
                        const entry = cellMap.get(tarCellKey(task.id || '', iso, slotIndex));
                        const isToday = isCurrentMonth && iso === todayISO();
                        const chartable = canChart(task) && !entry;
                        const title = entry
                          ? [
                              entry.status === 'done' ? 'Completed' : entry.status === 'not-done' ? `Not completed: ${entry.reason}` : 'Not applicable',
                              entry.time ? `at ${entry.time}` : '',
                              entry.performerName ? `by ${entry.performerName}` : '',
                              entry.note,
                            ].filter(Boolean).join(' · ')
                          : chartable
                            ? 'Click to record'
                            : '';
                        return (
                          <td
                            key={d}
                            title={title}
                            className={chartable ? 'hs-chartable' : undefined}
                            tabIndex={chartable ? 0 : undefined}
                            role={chartable ? 'button' : undefined}
                            onKeyDown={
                              chartable
                                ? (e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setRecordFor({ task, date: iso, slotIndex, timesPerDay });
                                    }
                                  }
                                : undefined
                            }
                            onClick={chartable ? () => setRecordFor({ task, date: iso, slotIndex, timesPerDay }) : undefined}
                            style={{
                              ...gridTdStyle,
                              ...(isToday && !entry ? todayEmptyCellStyle : {}),
                              ...(chartable ? clickableCellStyle : {}),
                              ...(entry?.status === 'not-done' ? notDoneCellStyle : {}),
                              ...(entry && entry.performedByType && entry.performedByType !== 'nurse' ? familyCellStyle : {}),
                            }}
                          >
                            {tarCellLabel(entry)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {canChartAny && (
              <div style={chartHintStyle}>
                <strong>Click any box to record a treatment.</strong> Empty boxes show a faint + when you
                hover over them.
              </div>
            )}

            <div style={legendStyle}>
              Initials in a box = treatment carried out. <strong>R</strong> = not carried out; see the reason
              on hover. <strong>N/A</strong> = not applicable that day. A shaded box means the care was
              performed by family or another non-agency caregiver, recorded by the nurse. Entries cannot be
              edited once saved; a correction is recorded as a new entry. A future day can&apos;t be
              charted: you record what happened, not what will.
              {monthLoading ? ' Loading this month…' : ''}
            </div>

            {!canChartAny && (
              <div style={noticeStyle}>
                {isViewingAs
                  ? 'You are viewing as another user, which is read-only. Charting is disabled.'
                  : 'Your profile cannot chart treatments.'}
              </div>
            )}
            {canChartAny && !hasLicense && rows.some((r) => r.task.level === 'skilled') && (
              <div style={noticeStyle}>
                Skilled treatments can only be charted by an RN or LPN, so those rows are read-only for you.
                Aide-level treatments remain available.
              </div>
            )}
          </>
        )}
      </div>

      {toast && <div style={toastStyle} onClick={() => setToast(null)}>{toast}</div>}

      {recordFor && (
        <RecordTreatmentModal
          patientId={patientId}
          task={recordFor.task}
          date={recordFor.date}
          slotIndex={recordFor.slotIndex}
          timesPerDay={recordFor.timesPerDay}
          documenter={documenter}
          onClose={() => setRecordFor(null)}
          onSaved={async () => {
            setRecordFor(null);
            await refreshEntries();
          }}
        />
      )}
    </div>
  );
}

const containerStyle: React.CSSProperties = { minHeight: '70vh', background: '#f5f7fa', padding: '32px 20px' };
const wrapStyle: React.CSSProperties = { maxWidth: 1280, margin: '0 auto' };
const backLinkStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, color: '#27ae60', textDecoration: 'none', fontSize: 13, fontWeight: 600 };
const headerCardStyle: React.CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20, margin: '12px 0 16px' };
const headerIconStyle: React.CSSProperties = { width: 46, height: 46, borderRadius: 10, background: '#eef5ff', color: '#1a3a5c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const titleStyle: React.CSSProperties = { fontSize: 22, color: '#2c3e50', margin: 0 };
const headerMetaStyle: React.CSSProperties = { fontSize: 13.5, color: '#5c6b7a', marginTop: 4 };
const headerGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f3f5' };
const headerFieldLabelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#9aa6b2', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 };
const headerFieldValueStyle: React.CSSProperties = { fontSize: 14, lineHeight: 1.45 };
const monthNavStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, marginBottom: 14 };
const navBtnStyle: React.CSSProperties = { width: 38, height: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'white', border: '1px solid #d0d7de', borderRadius: 8, color: '#2c3e50', cursor: 'pointer' };
const jumpBtnStyle: React.CSSProperties = { marginTop: 2, fontSize: 12, fontWeight: 600, color: '#1a73c4', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 };
const emptyStyle: React.CSSProperties = { textAlign: 'center', padding: '40px 20px', background: 'white', borderRadius: 10, color: '#7f8c8d', fontSize: 14, border: '1px solid #e5e7eb' };
const gridWrapStyle: React.CSSProperties = { background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', overflowX: 'auto', marginBottom: 12 };
const gridTableStyle: React.CSSProperties = { borderCollapse: 'collapse', fontSize: 12, width: '100%' };
const gridThStyle: React.CSSProperties = { border: '1px solid #15324e', padding: '5px 3px', background: '#1a3a5c', color: 'white', fontWeight: 700, fontSize: 11, textAlign: 'center', minWidth: 28, lineHeight: 1.25 };
const taskColHeadStyle: React.CSSProperties = { minWidth: 210, maxWidth: 280 };
const dowStyle: React.CSSProperties = { fontSize: 8.5, fontWeight: 600, color: '#9fb6cd', textTransform: 'uppercase' };
const todayThStyle: React.CSSProperties = { background: '#fde68a', color: '#1a3a5c', border: '1px solid #d9b84a' };
const todayEmptyCellStyle: React.CSSProperties = { background: '#fffbeb' };
const gridTdStyle: React.CSSProperties = { border: '1px solid #dde3ea', padding: '6px 4px', textAlign: 'center', fontSize: 11.5, color: '#2c3e50', whiteSpace: 'nowrap' };
const taskColStyle: React.CSSProperties = { minWidth: 210, maxWidth: 280, whiteSpace: 'normal', background: '#f4f7fa', textAlign: 'left' };
const clickableCellStyle: React.CSSProperties = { cursor: 'pointer' };
const chartHintStyle: React.CSSProperties = { background: '#eef5ff', border: '1px solid #c8def5', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, color: '#1a3a5c', marginBottom: 10, lineHeight: 1.5 };
const notDoneCellStyle: React.CSSProperties = { background: '#fdecea', color: '#a3261c', fontWeight: 700 };
const familyCellStyle: React.CSSProperties = { background: '#eef5ff' };
const physicianNeededChipStyle: React.CSSProperties = { display: 'inline-block', marginTop: 4, padding: '1px 7px', borderRadius: 999, background: '#fff3e0', color: '#b45309', fontSize: 10, fontWeight: 700 };
const legendStyle: React.CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#5c6b7a', lineHeight: 1.55, marginBottom: 12 };
const exportBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1a3a5c', color: 'white', padding: '10px 16px', borderRadius: 6, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 };
const toastStyle: React.CSSProperties = { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1f2937', color: 'white', padding: '10px 18px', borderRadius: 8, fontSize: 13.5, cursor: 'pointer', zIndex: 1100 };
const noticeStyle: React.CSSProperties = { background: '#fff7ed', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: '#7c2d12', marginBottom: 12 };
