'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { CalendarPlus, Check, ChevronLeft, ChevronRight, Undo2, X } from 'lucide-react';
import type { PatientVisit } from '@/lib/patientVisits';
import { groupVisitsByDate, monthGridDays, monthTitle, shiftMonth } from '@/lib/clientDashboardShared';

function fmtTime(hhmm?: string): string {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtDayTitle(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

interface Props {
  visits: PatientVisit[];
  today: string; // YYYY-MM-DD in the viewer's local day
  isStaff: boolean;
  busyId: string | null;
  onMark: (v: PatientVisit, status: 'completed' | 'cancelled' | 'scheduled') => void;
  onAddOn: (dateISO: string) => void; // staff: open the schedule modal preset to a day
}

/**
 * Month calendar for a client's visit schedule. Every visit (scheduled,
 * completed, cancelled) renders in place on its day, so the month reads as
 * the client's actual coverage at a glance: solid chips are scheduled, green
 * check = completed, struck-through grey = cancelled, red accent = a
 * scheduled visit whose date passed without completion. Clicking a day opens
 * a detail panel with the full visit rows and the same Done / Cancel /
 * Restore actions as the list view; staff can add a visit onto any day
 * straight from the grid.
 */
export default function VisitsCalendar({ visits, today, isStaff, busyId, onMark, onAddOn }: Props) {
  const [ty, tm] = [parseInt(today.slice(0, 4), 10), parseInt(today.slice(5, 7), 10) - 1];
  const [month, setMonth] = useState({ year: ty, month0: tm });
  const [selected, setSelected] = useState<string | null>(null);

  const grid = useMemo(() => monthGridDays(month.year, month.month0), [month]);
  const byDate = useMemo(() => groupVisitsByDate(visits), [visits]);
  const selectedVisits = selected ? byDate.get(selected) || [] : [];

  const nav = (delta: number) => {
    setMonth((m) => shiftMonth(m.year, m.month0, delta));
    setSelected(null);
  };
  const goToday = () => {
    setMonth({ year: ty, month0: tm });
    setSelected(today);
  };

  const chip = (v: PatientVisit) => {
    const overdue = v.status === 'scheduled' && v.date < today;
    const base: CSSProperties =
      v.type === 'supervisory'
        ? { background: '#e0e7ff', color: '#3730a3' }
        : { background: '#e8eef4', color: NAVY };
    const status: CSSProperties =
      v.status === 'completed'
        ? { background: '#e8f4e8', color: '#1e5c1e' }
        : v.status === 'cancelled'
          ? { background: '#f1f5f9', color: '#94a3b8', textDecoration: 'line-through' }
          : overdue
            ? { background: '#fdeaea', color: '#b3261e' }
            : {};
    const t = fmtTime(v.startTime);
    return (
      <span key={v.id} style={{ ...chipStyle, ...base, ...status }} title={`${v.type === 'supervisory' ? 'Supervisory visit' : 'Shift'}${v.nurseName ? ` · ${v.nurseName}` : ''}`}>
        {v.status === 'completed' && <Check size={9} style={{ flexShrink: 0 }} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {t ? `${t} ` : ''}
          {v.type === 'supervisory' ? 'Sup' : 'Shift'}
        </span>
      </span>
    );
  };

  return (
    <div>
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" onClick={() => nav(-1)} style={navBtnStyle} aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={() => nav(1)} style={navBtnStyle} aria-label="Next month">
            <ChevronRight size={16} />
          </button>
          <span style={titleStyle}>{monthTitle(month.year, month.month0)}</span>
        </div>
        <button type="button" onClick={goToday} style={todayBtnStyle}>
          Today
        </button>
      </div>

      <div style={weekHeaderStyle}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <span key={d} style={weekdayStyle}>
            {d}
          </span>
        ))}
      </div>

      <div style={gridStyle}>
        {grid.map((day) => {
          const dayVisits = byDate.get(day.iso) || [];
          const isToday = day.iso === today;
          const isSelected = day.iso === selected;
          return (
            <button
              key={day.iso}
              type="button"
              onClick={() => setSelected(isSelected ? null : day.iso)}
              style={{
                ...cellStyle,
                ...(day.inMonth ? null : outMonthStyle),
                ...(isSelected ? selectedCellStyle : null),
              }}
              aria-label={`${fmtDayTitle(day.iso)}${dayVisits.length ? `, ${dayVisits.length} visit${dayVisits.length === 1 ? '' : 's'}` : ''}`}
            >
              <span style={{ ...dayNumStyle, ...(isToday ? todayNumStyle : null) }}>
                {parseInt(day.iso.slice(8, 10), 10)}
              </span>
              <span style={chipColStyle}>
                {dayVisits.slice(0, 3).map(chip)}
                {dayVisits.length > 3 && <span style={moreChipStyle}>+{dayVisits.length - 3}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <span style={{ fontWeight: 700, color: '#1f2937', fontSize: 14 }}>{fmtDayTitle(selected)}</span>
            {isStaff && (
              <button type="button" onClick={() => onAddOn(selected)} style={panelAddBtnStyle}>
                <CalendarPlus size={13} /> Add visit this day
              </button>
            )}
          </div>
          {selectedVisits.length === 0 ? (
            <div style={{ fontSize: 13, color: '#7f8c8d', padding: '6px 2px' }}>No visits on this day.</div>
          ) : (
            <ul style={panelListStyle}>
              {selectedVisits.map((v) => {
                const overdue = v.status === 'scheduled' && v.date < today;
                return (
                  <li key={v.id} style={{ ...panelRowStyle, ...(v.status === 'cancelled' ? { opacity: 0.65 } : null) }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={v.type === 'supervisory' ? supChip : shiftChip}>
                          {v.type === 'supervisory' ? 'Supervisory visit' : 'Shift'}
                        </span>
                        {v.startTime && <span style={{ fontSize: 12.5, fontWeight: 700, color: '#2c3e50' }}>{fmtTime(v.startTime)}</span>}
                        {v.nurseName && <span style={{ fontSize: 13, color: '#2c3e50', fontWeight: 600 }}>{v.nurseName}</span>}
                        {v.status === 'completed' && <span style={doneChip}>Completed</span>}
                        {v.status === 'cancelled' && <span style={cancelledChip}>Cancelled</span>}
                        {overdue && <span style={overdueChip}>Past date, not completed</span>}
                      </div>
                      {v.notes && <div style={{ fontSize: 12.5, color: '#7f8c8d', marginTop: 3 }}>{v.notes}</div>}
                    </div>
                    {isStaff && v.status === 'scheduled' && (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button type="button" onClick={() => onMark(v, 'completed')} disabled={busyId === v.id} style={panelActionStyle} title="Mark completed">
                          <Check size={13} /> Done
                        </button>
                        <button type="button" onClick={() => onMark(v, 'cancelled')} disabled={busyId === v.id} style={panelActionStyle} title="Cancel this visit">
                          <X size={13} /> Cancel
                        </button>
                      </div>
                    )}
                    {isStaff && v.status !== 'scheduled' && (
                      <button type="button" onClick={() => onMark(v, 'scheduled')} disabled={busyId === v.id} style={panelActionStyle} title="Put this visit back on the schedule">
                        <Undo2 size={13} /> Restore
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const NAVY = '#1a3a5c';
const headerStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 };
const navBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: 'white', border: '1px solid #d0d7de', borderRadius: 7, color: '#2c3e50', cursor: 'pointer' };
const titleStyle: CSSProperties = { fontSize: 15, fontWeight: 700, color: '#1f2937', marginLeft: 4, minWidth: 130 };
const todayBtnStyle: CSSProperties = { background: 'white', border: '1px solid #d0d7de', borderRadius: 7, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, color: NAVY, cursor: 'pointer', fontFamily: 'inherit' };
const weekHeaderStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 };
const weekdayStyle: CSSProperties = { fontSize: 10.5, fontWeight: 700, color: '#8a949e', textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center' };
const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 };
// borderWidth/Style/Color kept longhand — selectedCellStyle overrides just the
// color, and React warns (and can mis-render) when a shorthand and a longhand
// for the same property mix across rerenders.
const cellStyle: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 3, minHeight: 74, padding: '6px 5px', background: 'white', borderWidth: 1, borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', minWidth: 0 };
const outMonthStyle: CSSProperties = { background: '#f8fafc', opacity: 0.6 };
const selectedCellStyle: CSSProperties = { borderColor: NAVY, boxShadow: `0 0 0 1px ${NAVY}` };
const dayNumStyle: CSSProperties = { fontSize: 12, fontWeight: 700, color: '#5c6b7a', lineHeight: '18px' };
const todayNumStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 999, background: NAVY, color: 'white', lineHeight: 1 };
const chipColStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 };
const chipStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 5px', borderRadius: 5, fontSize: 10, fontWeight: 700, minWidth: 0, maxWidth: '100%' };
const moreChipStyle: CSSProperties = { fontSize: 10, fontWeight: 700, color: '#8a949e', paddingLeft: 3 };
const panelStyle: CSSProperties = { marginTop: 10, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px' };
const panelHeaderStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 };
const panelAddBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, background: NAVY, color: 'white', border: 'none', padding: '5px 11px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const panelListStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 };
const panelRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 8 };
const panelActionStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'white', color: '#2c3e50', border: '1px solid #d0d7de', padding: '5px 9px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' };
const supChip: CSSProperties = { display: 'inline-block', padding: '1px 8px', borderRadius: 999, background: '#e0e7ff', color: '#3730a3', fontSize: 10.5, fontWeight: 700 };
const shiftChip: CSSProperties = { display: 'inline-block', padding: '1px 8px', borderRadius: 999, background: '#e8eef4', color: NAVY, fontSize: 10.5, fontWeight: 700 };
const doneChip: CSSProperties = { display: 'inline-block', padding: '1px 8px', borderRadius: 999, background: '#e8f4e8', color: '#1e5c1e', fontSize: 10.5, fontWeight: 700 };
const cancelledChip: CSSProperties = { display: 'inline-block', padding: '1px 8px', borderRadius: 999, background: '#f1f5f9', color: '#64748b', fontSize: 10.5, fontWeight: 700 };
const overdueChip: CSSProperties = { display: 'inline-block', padding: '1px 8px', borderRadius: 999, background: '#fdeaea', color: '#b3261e', fontSize: 10.5, fontWeight: 700 };
