'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, FileDown, Pill } from 'lucide-react';
import {
  getPatient,
  getPatientClinical,
  type Patient,
  type PatientClinical,
} from '@/lib/patients';
import {
  getMarOrders,
  getAdministrationsForRange,
  orderOverlapsRange,
  orderAppliesOn,
  type MarOrder,
  type MarAdministration,
} from '@/lib/mar';
import { authedFetch } from '@/lib/authedFetch';
import { triggerDownload } from '@/lib/batchExport';
import { compareMarOrders, resolveCurrentAdministrations } from '@/lib/marShared';
import { useAuth, useEffectiveUser } from '@/components/AuthProvider';
import AdministerDoseModal from './AdministerDoseModal';
import MedChart from '@/app/(marketing)/progress-note/components/MedChart';

const ADMIN_BY_LABELS: Record<string, string> = {
  nurse: 'Nurse',
  family: 'Family member',
  responsibleParty: 'Responsible party',
  self: 'Client (self)',
  proxy: 'Proxy',
};

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

const DOW_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function weekdayLetter(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number);
  return DOW_LETTERS[new Date(y, m - 1, day).getDay()];
}

function formatDate(d?: string | null): string {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface GridRow {
  order: MarOrder;
  slot: string; // 'HH:MM' or 'PRN'
}

export default function MonthlyMarPage() {
  const params = useParams();
  const patientId = String(params.patientId);
  // Nurses reach this same grid from the standalone Medications picker; adjust
  // the back-link and hide the staff-only PDF export for them.
  const { role } = useEffectiveUser();
  const isNurse = role === 'nurse';
  // Charting a dose is an RN/LPN action; admins/supervisors stay read-only here
  // so they can't change a record by accident. Uses the REAL signed-in user (not
  // view-as), since the create rule requires documentedBy == auth uid.
  const { user, profile } = useAuth();
  const canAdminister =
    profile?.role === 'nurse' && (profile?.credential === 'RN' || profile?.credential === 'LPN');
  const documenter = {
    uid: user?.uid || '',
    name: profile?.displayName || '',
    credential: profile?.credential || '',
  };
  const myInitials = (profile?.displayName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const [month, setMonth] = useState(currentMonth());
  const [patient, setPatient] = useState<Patient | null>(null);
  const [clinical, setClinical] = useState<PatientClinical | null>(null);
  const [orders, setOrders] = useState<MarOrder[]>([]);
  const [admins, setAdmins] = useState<MarAdministration[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthLoading, setMonthLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Click-to-administer state: the open-dose modal (empty cell) or the day chart
  // to view/amend (documented cell). Nurses only; see canAdminister.
  const [administer, setAdminister] = useState<{ order: MarOrder; slot: string; iso: string } | null>(null);
  const [chartDay, setChartDay] = useState<string | null>(null);

  const days = daysInMonth(month);
  const monthStart = dayISO(month, 1);
  const monthEnd = dayISO(month, days);
  const isCurrentMonth = month === currentMonth();

  const refreshAdmins = async () => {
    setAdmins(await getAdministrationsForRange(patientId, monthStart, monthEnd));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, c, o] = await Promise.all([
        getPatient(patientId),
        getPatientClinical(patientId),
        getMarOrders(patientId),
      ]);
      if (cancelled) return;
      setPatient(p);
      setClinical(c);
      setOrders(o);
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
      const items = await getAdministrationsForRange(patientId, monthStart, monthEnd);
      if (cancelled) return;
      setAdmins(items);
      setMonthLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId, monthStart, monthEnd]);

  // Rows: every order whose window overlaps the month, one row per scheduled
  // time (PRN orders get one row). Discontinued orders still show for the days
  // they applied.
  const rows: GridRow[] = useMemo(() => {
    const monthOrders = orders
      .filter((o) => orderOverlapsRange(o, monthStart, monthEnd))
      .sort(compareMarOrders);
    const out: GridRow[] = [];
    for (const o of monthOrders) {
      if (o.isPRN) out.push({ order: o, slot: 'PRN' });
      else for (const t of o.scheduledTimes || []) out.push({ order: o, slot: t });
    }
    return out;
  }, [orders, monthStart, monthEnd]);

  // Collapse amendment chains: a correction supersedes the original, so each
  // dose shows its CURRENT value once across the grid and the log.
  const currentAdmins = useMemo(() => resolveCurrentAdministrations(admins), [admins]);

  // Cell lookup: orderId|date|slot -> administrations (PRN can have several).
  const cellMap = useMemo(() => {
    const map = new Map<string, MarAdministration[]>();
    for (const a of currentAdmins) {
      const k = `${a.orderId}|${a.date}|${a.scheduledTime}`;
      const arr = map.get(k) || [];
      arr.push(a);
      map.set(k, arr);
    }
    return map;
  }, [currentAdmins]);

  const rowOrderIds = useMemo(() => new Set(rows.map((r) => r.order.id || '')), [rows]);

  // Everything that belongs in the PRN / exceptions log: PRN doses, held or
  // refused doses, non-nurse administrations, and unlisted/unscheduled doses.
  const logEntries = useMemo(
    () =>
      currentAdmins
        .filter(
          (a) =>
            a.scheduledTime === 'PRN' ||
            a.scheduledTime === 'unscheduled' ||
            a.status !== 'given' ||
            (a.administeredByType && a.administeredByType !== 'nurse') ||
            !rowOrderIds.has(a.orderId),
        )
        .sort((a, b) => (a.date + (a.actualTime || '')).localeCompare(b.date + (b.actualTime || ''))),
    [currentAdmins, rowOrderIds],
  );

  // Initials legend from the month's administrations.
  const legend = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of admins) {
      if (a.initials && a.documentedByName && !map.has(a.initials)) {
        map.set(a.initials, `${a.documentedByName}${a.documentedByCredential ? `, ${a.documentedByCredential}` : ''}`);
      }
    }
    return Array.from(map.entries());
  }, [admins]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await authedFetch('/api/mar/pdf', {
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
      triggerDownload(blob, `MAR_${safeName}_${month}.pdf`);
    } catch {
      setToast('Export failed.');
    } finally {
      setExporting(false);
      setTimeout(() => setToast(null), 2600);
    }
  };

  const cellTitle = (a: MarAdministration): string => {
    const who =
      a.administeredByType && a.administeredByType !== 'nurse'
        ? `${ADMIN_BY_LABELS[a.administeredByType] || 'Other'}${a.administratorName ? ` (${a.administratorName})` : ''}`
        : a.documentedByName;
    const bits = [
      `${a.status.toUpperCase()}${a.actualTime ? ` at ${a.actualTime}` : ''}`,
      `By ${who}`,
    ];
    if (a.reason) bits.push(`Reason: ${a.reason}`);
    return bits.join(' · ');
  };

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <div style={{ marginBottom: 16 }}>
          <Link href={isNurse ? '/admin/mar' : `/admin/records/${patientId}`} style={backLinkStyle}>
            <ArrowLeft size={14} /> {isNurse ? 'Back to Medications' : 'Back to medication orders'}
          </Link>
        </div>

        {loading ? (
          <div style={emptyStyle}>Loading…</div>
        ) : !patient ? (
          <div style={emptyStyle}>Client not found.</div>
        ) : (
          <>
            <header style={headerCardStyle}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                <div style={headerIconStyle}>
                  <Pill size={22} />
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <h1 style={titleStyle}>Medication Administration Record</h1>
                  <div style={headerMetaStyle}>
                    <strong>{patient.name}</strong>
                    {patient.dob ? ` · DOB ${formatDate(patient.dob)}` : ''}
                    {clinical?.sex ? ` · ${clinical.sex}` : ''}
                    {patient.mrn ? ` · Record #${patient.mrn}` : ''}
                  </div>
                </div>
                {!isNurse && (
                  <button type="button" onClick={handleExport} disabled={exporting} style={exportBtnStyle}>
                    <FileDown size={15} /> {exporting ? 'Exporting…' : 'Export PDF'}
                  </button>
                )}
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
            </header>

            <div style={monthNavStyle}>
              <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} style={navBtnStyle} aria-label="Previous month">
                <ChevronLeft size={18} />
              </button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 17 }}>{monthLabel(month)}</div>
                {!isCurrentMonth && (
                  <button type="button" onClick={() => setMonth(currentMonth())} style={jumpBtnStyle}>
                    Jump to current month
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMonth(shiftMonth(month, 1))}
                style={{ ...navBtnStyle, visibility: isCurrentMonth ? 'hidden' : 'visible' }}
                aria-label="Next month"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {monthLoading ? (
              <div style={emptyStyle}>Loading month…</div>
            ) : rows.length === 0 ? (
              <div style={emptyStyle}>No medication orders applied during {monthLabel(month)}.</div>
            ) : (
              <div style={gridWrapStyle}>
                <table style={gridTableStyle}>
                  <thead>
                    <tr>
                      <th style={{ ...gridThStyle, ...medColHeadStyle, textAlign: 'left' }}>Medication</th>
                      <th style={{ ...gridThStyle, minWidth: 52 }}>Time</th>
                      {Array.from({ length: days }, (_, i) => {
                        const iso = dayISO(month, i + 1);
                        const isToday = iso === todayISO();
                        return (
                          <th key={i + 1} style={isToday ? { ...gridThStyle, ...todayThStyle } : gridThStyle}>
                            <div>{i + 1}</div>
                            <div style={isToday ? { ...dowStyle, color: '#8a5a0d' } : dowStyle}>
                              {weekdayLetter(month, i + 1)}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ order, slot }) => (
                      <tr key={`${order.id}-${slot}`}>
                        <td style={{ ...gridTdStyle, ...medColStyle, textAlign: 'left' }}>
                          <div style={{ fontWeight: 600, color: '#1f2937' }}>
                            {order.medName}
                            {order.status === 'discontinued' && <span style={dcChipStyle}>D/C</span>}
                          </div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>
                            {order.dose}{order.units ? ` ${order.units}` : ''} · {order.route}
                            {order.frequencyLabel ? ` · ${order.frequencyLabel}` : ''}
                          </div>
                        </td>
                        <td style={{ ...gridTdStyle, ...timeColStyle, color: slot === 'PRN' ? '#b56a17' : '#1a3a5c' }}>
                          {slot}
                        </td>
                        {Array.from({ length: days }, (_, i) => {
                          const iso = dayISO(month, i + 1);
                          // Window check only (status forced 'active' so a
                          // discontinued order still shades the days it ran).
                          const applies = orderAppliesOn({ ...order, status: 'active' }, iso);
                          const cellAdmins = cellMap.get(`${order.id}|${iso}|${slot}`) || [];
                          // Nurses can document an OPEN dose for today or a past day
                          // (late entry), never the future. A documented cell instead
                          // opens the day chart to view / amend (no second dose).
                          const chartable = canAdminister && applies && iso <= todayISO();
                          if (cellAdmins.length === 0) {
                            const emptyStyle = !applies
                              ? { ...gridTdStyle, ...inactiveCellStyle }
                              : iso === todayISO()
                                ? { ...gridTdStyle, ...todayEmptyCellStyle }
                                : gridTdStyle;
                            return (
                              <td
                                key={iso}
                                style={chartable ? { ...emptyStyle, ...clickableCellStyle } : emptyStyle}
                                onClick={chartable ? () => setAdminister({ order, slot, iso }) : undefined}
                                title={chartable ? 'Document this dose' : undefined}
                              />
                            );
                          }
                          const a = cellAdmins[0];
                          const style =
                            a.status === 'given'
                              ? givenCellStyle
                              : a.status === 'held'
                                ? heldCellStyle
                                : refusedCellStyle;
                          const label = cellAdmins.length > 1
                            ? cellAdmins.map((x) => x.initials || '·').join('/')
                            : a.initials || '✓';
                          const star = a.administeredByType && a.administeredByType !== 'nurse' ? '*' : '';
                          // A PRN ("as needed") med can be given more than once a day,
                          // so a documented PRN cell still opens the dose modal to
                          // record ANOTHER. Scheduled cells open view/amend only — never
                          // a second scheduled dose.
                          const prnAddable = slot === 'PRN' && chartable;
                          return (
                            <td
                              key={iso}
                              style={canAdminister ? { ...gridTdStyle, ...style, ...clickableCellStyle } : { ...gridTdStyle, ...style }}
                              title={
                                !canAdminister
                                  ? cellAdmins.map(cellTitle).join(' | ')
                                  : prnAddable
                                    ? `${cellAdmins.map(cellTitle).join(' | ')} — click to document another PRN dose`
                                    : `${cellAdmins.map(cellTitle).join(' | ')} — click to view / correct`
                              }
                              onClick={
                                !canAdminister
                                  ? undefined
                                  : prnAddable
                                    ? () => setAdminister({ order, slot, iso })
                                    : () => setChartDay(iso)
                              }
                            >
                              {label}{star}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={legendRowStyle}>
              <span style={{ ...legendChipStyle, background: '#d8efd8', color: '#1e5c1e' }}>Initials = given</span>
              <span style={{ ...legendChipStyle, background: '#fcebcd', color: '#8a5a0d' }}>Held</span>
              <span style={{ ...legendChipStyle, background: '#f9dcd8', color: '#a82315' }}>Refused</span>
              <span style={{ ...legendChipStyle, background: 'white', color: '#5c6b7a', border: '1px solid #dde3ea' }}>
                Blank = due, not documented
              </span>
              <span style={{ ...legendChipStyle, ...inactiveCellStyle, color: '#5c6b7a' }}>
                Hatched = order not active
              </span>
              <span style={{ ...legendChipStyle, background: '#fde68a', color: '#1a3a5c' }}>Amber column = today</span>
              <span style={{ ...legendChipStyle, background: '#eef4fb', color: '#1a3a5c' }}>* = given by family/proxy (see log)</span>
            </div>

            {legend.length > 0 && (
              <section style={sectionCardStyle}>
                <div style={sectionTitleStyle}>Initial / signature legend</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {legend.map(([init, name]) => (
                    <span key={init} style={legendEntryStyle}>
                      <strong>{init}</strong> · {name}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {logEntries.length > 0 && (
              <section style={sectionCardStyle}>
                <div style={sectionTitleStyle}>PRN, refused &amp; exception log</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={logTableStyle}>
                    <thead>
                      <tr>
                        <th style={logThStyle}>Date</th>
                        <th style={logThStyle}>Time</th>
                        <th style={logThStyle}>Medication</th>
                        <th style={logThStyle}>Status</th>
                        <th style={logThStyle}>Administered by</th>
                        <th style={logThStyle}>Reason / note</th>
                        <th style={logThStyle}>Initials</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logEntries.map((a) => (
                        <tr key={a.id}>
                          <td style={logTdStyle}>{formatDate(a.date)}</td>
                          <td style={logTdStyle}>{a.actualTime || '-'}</td>
                          <td style={logTdStyle}>
                            {a.medNameSnapshot}
                            {a.doseSnapshot ? ` ${a.doseSnapshot}` : ''}
                            {a.unitsSnapshot ? ` ${a.unitsSnapshot}` : ''}
                          </td>
                          <td style={logTdStyle}>
                            <span
                              style={
                                a.status === 'given'
                                  ? { ...statusChipStyle, background: '#e8f4e8', color: '#2a7a2a' }
                                  : a.status === 'held'
                                    ? { ...statusChipStyle, background: '#fef3e2', color: '#b56a17' }
                                    : { ...statusChipStyle, background: '#fdeaea', color: '#c0392b' }
                              }
                            >
                              {a.status}
                            </span>
                          </td>
                          <td style={logTdStyle}>
                            {a.administeredByType && a.administeredByType !== 'nurse'
                              ? `${ADMIN_BY_LABELS[a.administeredByType] || 'Other'}${a.administratorName ? ` · ${a.administratorName}` : ''}`
                              : a.documentedByName || 'Nurse'}
                          </td>
                          <td style={logTdStyle}>{a.reason || '-'}</td>
                          <td style={logTdStyle}>{a.initials || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {toast && <div style={toastStyle}>{toast}</div>}

      {administer && (
        <AdministerDoseModal
          patientId={patientId}
          order={administer.order}
          slot={administer.slot}
          dateISO={administer.iso}
          todayISO={todayISO()}
          documenter={documenter}
          defaultInitials={myInitials}
          onClose={() => setAdminister(null)}
          onSaved={() => {
            setToast('Dose documented.');
            setTimeout(() => setToast(null), 3000);
            void refreshAdmins();
          }}
        />
      )}

      {chartDay && patient && (
        <MedChart
          patientId={patientId}
          patientName={patient.name}
          initialDate={chartDay}
          documenter={documenter}
          onClose={() => {
            setChartDay(null);
            void refreshAdmins();
          }}
        />
      )}
    </div>
  );
}

const clickableCellStyle: React.CSSProperties = { cursor: 'pointer' };

function HeaderField({ label, value, highlight }: { label: string; value?: string | null; highlight?: boolean }) {
  return (
    <div>
      <div style={headerFieldLabelStyle}>{label}</div>
      <div style={{ ...headerFieldValueStyle, color: highlight && value ? '#b3261e' : '#2c3e50' }}>
        {value || <span style={{ color: '#aaa' }}>-</span>}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = { minHeight: '70vh', background: '#f5f7fa', padding: '32px 20px' };
const wrapStyle: React.CSSProperties = { maxWidth: 1280, margin: '0 auto' };
const backLinkStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, color: '#27ae60', textDecoration: 'none', fontSize: 13, fontWeight: 600 };
const headerCardStyle: React.CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20, marginBottom: 16 };
const headerIconStyle: React.CSSProperties = { width: 46, height: 46, borderRadius: 10, background: '#eef5ff', color: '#1a3a5c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const titleStyle: React.CSSProperties = { fontSize: 22, color: '#2c3e50', margin: 0 };
const headerMetaStyle: React.CSSProperties = { fontSize: 13.5, color: '#5c6b7a', marginTop: 4 };
const exportBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1a3a5c', color: 'white', padding: '10px 16px', borderRadius: 6, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 };
const headerGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f3f5' };
const headerFieldLabelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#9aa6b2', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 };
const headerFieldValueStyle: React.CSSProperties = { fontSize: 14, lineHeight: 1.45 };
const monthNavStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, marginBottom: 14 };
const navBtnStyle: React.CSSProperties = { width: 38, height: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'white', border: '1px solid #d0d7de', borderRadius: 8, color: '#2c3e50', cursor: 'pointer' };
const jumpBtnStyle: React.CSSProperties = { marginTop: 2, fontSize: 12, fontWeight: 600, color: '#1a73c4', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 };
const emptyStyle: React.CSSProperties = { textAlign: 'center', padding: '40px 20px', background: 'white', borderRadius: 10, color: '#7f8c8d', fontSize: 14, border: '1px solid #e5e7eb' };
const gridWrapStyle: React.CSSProperties = { background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', overflowX: 'auto', marginBottom: 12 };
const gridTableStyle: React.CSSProperties = { borderCollapse: 'collapse', fontSize: 12, width: '100%' };
// Navy brand header; clearly distinct from every cell state below it.
const gridThStyle: React.CSSProperties = { border: '1px solid #15324e', padding: '5px 3px', background: '#1a3a5c', color: 'white', fontWeight: 700, fontSize: 11, textAlign: 'center', minWidth: 28, lineHeight: 1.25 };
const medColHeadStyle: React.CSSProperties = { minWidth: 190, maxWidth: 240 };
const dowStyle: React.CSSProperties = { fontSize: 8.5, fontWeight: 600, color: '#9fb6cd', textTransform: 'uppercase' };
// Today's column: amber header + a faint warm tint on its empty cells.
const todayThStyle: React.CSSProperties = { background: '#fde68a', color: '#1a3a5c', border: '1px solid #d9b84a' };
const todayEmptyCellStyle: React.CSSProperties = { background: '#fffbeb' };
const gridTdStyle: React.CSSProperties = { border: '1px solid #dde3ea', padding: '6px 4px', textAlign: 'center', fontSize: 11.5, color: '#2c3e50', whiteSpace: 'nowrap' };
// Label columns get a light navy tint so the day grid reads as its own zone.
const medColStyle: React.CSSProperties = { minWidth: 190, maxWidth: 240, whiteSpace: 'normal', background: '#f4f7fa' };
const timeColStyle: React.CSSProperties = { background: '#f4f7fa', fontWeight: 700 };
const dcChipStyle: React.CSSProperties = { marginLeft: 6, fontSize: 9, fontWeight: 700, background: '#fdeaea', color: '#c0392b', padding: '1px 5px', borderRadius: 999, letterSpacing: 0.4, verticalAlign: 'middle' };
// Diagonal hatch = "order not active that day" (the paper-MAR N/A convention) -
// unmistakably different from a plain white "due but not documented" cell.
const inactiveCellStyle: React.CSSProperties = {
  background: 'repeating-linear-gradient(135deg, #e9edf2, #e9edf2 4px, #d8dfe7 4px, #d8dfe7 8px)',
};
const givenCellStyle: React.CSSProperties = { background: '#d8efd8', color: '#1e5c1e', fontWeight: 700 };
const heldCellStyle: React.CSSProperties = { background: '#fcebcd', color: '#8a5a0d', fontWeight: 700 };
const refusedCellStyle: React.CSSProperties = { background: '#f9dcd8', color: '#a82315', fontWeight: 700 };
const legendRowStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 };
const legendChipStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 999 };
const sectionCardStyle: React.CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 16 };
const sectionTitleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#2c3e50', marginBottom: 10 };
const legendEntryStyle: React.CSSProperties = { fontSize: 13, color: '#2c3e50', background: '#f8fafc', border: '1px solid #eef1f4', borderRadius: 6, padding: '5px 10px' };
const logTableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const logThStyle: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb', color: '#5c6b7a', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 };
const logTdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f3f5', color: '#2c3e50', verticalAlign: 'top' };
const statusChipStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.3 };
const toastStyle: React.CSSProperties = { position: 'fixed', bottom: 20, right: 20, background: '#2c3e50', color: 'white', padding: '10px 16px', borderRadius: 8, fontSize: 13, boxShadow: '0 8px 20px rgba(0,0,0,0.2)', zIndex: 1100 };
