'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, History, Pill } from 'lucide-react';
import {
  getMarOrders,
  getAdministrationsForDay,
  getAdministrationsForOrder,
  orderAppliesOn,
  type MarOrder,
  type MarAdministration,
} from '@/lib/mar';

const ADMIN_BY_LABELS: Record<string, string> = {
  nurse: 'Nurse',
  family: 'Family member',
  responsibleParty: 'Responsible party',
  self: 'Client (self)',
  proxy: 'Proxy',
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(iso: string, delta: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** Who physically gave the dose, for display. */
function givenByLabel(a: MarAdministration): string {
  const type = a.administeredByType || 'nurse';
  if (type === 'nurse') return a.documentedByName || a.initials || 'Nurse';
  const label = ADMIN_BY_LABELS[type] || 'Other';
  return a.administratorName ? `${label} · ${a.administratorName}` : label;
}

interface Props {
  patientId: string;
  patientName: string;
  initialDate: string; // usually the note's date of service
  onClose: () => void;
}

export default function MedChart({ patientId, patientName, initialDate, onClose }: Props) {
  const today = todayISO();
  const [day, setDay] = useState(initialDate && initialDate <= today ? initialDate : today);
  const [orders, setOrders] = useState<MarOrder[]>([]);
  const [dayAdmins, setDayAdmins] = useState<MarAdministration[]>([]);
  const [loading, setLoading] = useState(true);
  const [dayLoading, setDayLoading] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [timelines, setTimelines] = useState<Record<string, MarAdministration[]>>({});
  const [timelineLoading, setTimelineLoading] = useState<string | null>(null);

  // Render into a portal on document.body: standard full-screen-overlay hygiene
  // so this fixed sheet can never be clipped or out-stacked by an ancestor's
  // stacking/scroll context. Portal only after mount so SSR/hydration stays in sync.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // While the chart is open: Escape closes it, and the page behind it is locked
  // from scrolling so the user can't get "lost" underneath the overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Orders load once (all of them; discontinued ones still matter for past days).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await getMarOrders(patientId);
      if (cancelled) return;
      setOrders(all);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  // Administrations reload per selected day.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDayLoading(true);
      const admins = await getAdministrationsForDay(patientId, day);
      if (cancelled) return;
      setDayAdmins(admins);
      setDayLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId, day]);

  const toggleHistory = async (orderId: string) => {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null);
      return;
    }
    setExpandedOrderId(orderId);
    if (!timelines[orderId]) {
      setTimelineLoading(orderId);
      const items = await getAdministrationsForOrder(patientId, orderId);
      setTimelines((prev) => ({ ...prev, [orderId]: items.slice(0, 14) }));
      setTimelineLoading(null);
    }
  };

  // Orders that applied on the selected day, plus any administration that day
  // that doesn't belong to one of them (unlisted doses, backdated-order cases).
  // Administrations are append-only facts: they ALWAYS display on the day they
  // happened, even if their order's window was later changed around them.
  const dayOrders = useMemo(() => orders.filter((o) => orderAppliesOn(o, day)), [orders, day]);
  const consumedIds = new Set<string>();

  const matchFor = (order: MarOrder, slot: string): MarAdministration | undefined => {
    const m = dayAdmins.find(
      (a) => a.orderId === (order.id || '') && a.scheduledTime === slot && !consumedIds.has(a.id || ''),
    );
    if (m?.id) consumedIds.add(m.id);
    return m;
  };

  const rows = dayOrders.map((order) => {
    const slots = order.isPRN ? ['PRN'] : order.scheduledTimes || [];
    const slotRows = slots.map((slot) => ({ slot, admin: matchFor(order, slot) }));
    // PRN meds can have several doses in one day; pick up the extras.
    if (order.isPRN) {
      for (const a of dayAdmins) {
        if (a.orderId === (order.id || '') && a.scheduledTime === 'PRN' && !consumedIds.has(a.id || '')) {
          consumedIds.add(a.id || '');
          slotRows.push({ slot: 'PRN', admin: a });
        }
      }
    }
    return { order, slotRows };
  });

  const extras = dayAdmins.filter((a) => !consumedIds.has(a.id || ''));
  const isToday = day === today;

  if (!mounted) return null;

  return createPortal(
    <div style={sheet} role="dialog" aria-modal="true" aria-label="Medication chart">
      <div style={sheetInner}>
        {/* Not a <header> element: the progress-note layout hides all <header>/
            <footer> tags (marketing chrome) with `display:none !important`, which
            would also swallow this bar and its close button. */}
        <div style={header}>
          <div style={headerTop}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Pill size={18} color="#1a3a5c" />
              <div style={{ minWidth: 0 }}>
                <div style={titleStyle}>Medication chart</div>
                <div style={subtitleStyle}>{patientName} · read-only</div>
              </div>
            </div>
            <button type="button" onClick={onClose} style={closeBtn} aria-label="Close chart">
              <X size={20} />
            </button>
          </div>
          <div style={dayNav}>
            <button type="button" onClick={() => setDay(addDays(day, -1))} style={navBtn} aria-label="Previous day">
              <ChevronLeft size={20} />
            </button>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={dayTitle}>{dayLabel(day)}</div>
              {isToday ? (
                <span style={todayTag}>Today</span>
              ) : (
                <button type="button" onClick={() => setDay(today)} style={todayJump}>
                  Jump to today
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setDay(addDays(day, 1))}
              style={{ ...navBtn, visibility: isToday ? 'hidden' : 'visible' }}
              aria-label="Next day"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div style={content}>
          {loading || dayLoading ? (
            <div style={emptyCard}>Loading…</div>
          ) : rows.length === 0 && extras.length === 0 ? (
            <div style={emptyCard}>No medications were on the MAR for this day.</div>
          ) : (
            <>
              {rows.map(({ order, slotRows }) => (
                <div key={order.id} style={medCard}>
                  <div style={medHead}>
                    <div style={{ minWidth: 0 }}>
                      <div style={medName}>{order.medName}</div>
                      <div style={medMeta}>
                        {order.dose}
                        {order.units ? ` ${order.units}` : ''} · {order.route}
                        {order.frequencyLabel ? ` · ${order.frequencyLabel}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => order.id && toggleHistory(order.id)}
                      style={historyBtn}
                      aria-label={`History for ${order.medName}`}
                    >
                      <History size={14} /> History
                    </button>
                  </div>

                  {slotRows.map(({ slot, admin }, i) => (
                    <div key={`${slot}-${i}`} style={slotRow}>
                      <span style={slot === 'PRN' ? prnBadge : slotBadge}>{slot === 'PRN' ? 'PRN' : slot}</span>
                      {admin ? (
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={statusPill[admin.status] || statusPill.given}>
                            {admin.status === 'given' ? 'Given' : admin.status === 'held' ? 'Held' : 'Refused'}
                            {admin.status === 'given' && admin.actualTime ? ` ${admin.actualTime}` : ''}
                            {admin.initials ? ` · ${admin.initials}` : ''}
                          </span>
                          <div style={byLine}>
                            {admin.status === 'given' ? `By ${givenByLabel(admin)}` : admin.reason ? `Reason: ${admin.reason}` : ''}
                            {admin.status === 'given' && admin.reason ? ` · for ${admin.reason}` : ''}
                            {admin.administeredByType !== 'nurse' && admin.documentedByName
                              ? ` · documented by ${admin.documentedByName}`
                              : ''}
                          </div>
                        </div>
                      ) : (
                        <span style={notDocPill}>{order.isPRN ? 'None documented' : 'Not documented'}</span>
                      )}
                    </div>
                  ))}

                  {expandedOrderId === order.id && (
                    <div style={timelineBox}>
                      {timelineLoading === order.id ? (
                        <div style={timelineEmpty}>Loading history…</div>
                      ) : (timelines[order.id || ''] || []).length === 0 ? (
                        <div style={timelineEmpty}>No administrations recorded yet.</div>
                      ) : (
                        (timelines[order.id || ''] || []).map((a) => (
                          <div key={a.id} style={timelineRow}>
                            <span style={timelineDate}>{dayLabel(a.date).replace(`, ${a.date.slice(0, 4)}`, '')}</span>
                            <span style={statusPill[a.status] || statusPill.given}>
                              {a.status === 'given' ? 'Given' : a.status === 'held' ? 'Held' : 'Refused'}
                              {a.status === 'given' && a.actualTime ? ` ${a.actualTime}` : ''}
                              {a.initials ? ` · ${a.initials}` : ''}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}

              {extras.length > 0 && (
                <div style={medCard}>
                  <div style={medHead}>
                    <div>
                      <div style={medName}>Also documented this day</div>
                      <div style={medMeta}>Doses outside the day&apos;s scheduled orders (e.g. newly added meds)</div>
                    </div>
                  </div>
                  {extras.map((a) => (
                    <div key={a.id} style={slotRow}>
                      <span style={prnBadge}>{a.scheduledTime === 'unscheduled' ? '-' : a.scheduledTime}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: '#1f2937', fontSize: 14 }}>
                          {a.medNameSnapshot}
                          <span style={{ color: '#6b7280', fontWeight: 400 }}>
                            {a.doseSnapshot ? ` ${a.doseSnapshot}` : ''}
                            {a.unitsSnapshot ? ` ${a.unitsSnapshot}` : ''}
                          </span>
                        </div>
                        <span style={statusPill[a.status] || statusPill.given}>
                          {a.status === 'given' ? 'Given' : a.status === 'held' ? 'Held' : 'Refused'}
                          {a.status === 'given' && a.actualTime ? ` ${a.actualTime}` : ''}
                          {a.initials ? ` · ${a.initials}` : ''}
                        </span>
                        <div style={byLine}>
                          By {givenByLabel(a)}
                          {a.status === 'given' && a.reason ? ` · for ${a.reason}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const sheet: CSSProperties = { position: 'fixed', inset: 0, background: '#f5f7fa', zIndex: 3000, overflowY: 'auto', WebkitOverflowScrolling: 'touch' };
const sheetInner: CSSProperties = { maxWidth: 760, margin: '0 auto', minHeight: '100%', display: 'flex', flexDirection: 'column' };
const header: CSSProperties = { position: 'sticky', top: 0, zIndex: 10, background: 'white', borderBottom: '1px solid #e5e7eb', padding: '10px 14px 8px' };
const headerTop: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 };
const titleStyle: CSSProperties = { fontWeight: 700, color: '#1f2937', fontSize: 16, lineHeight: 1.2 };
const subtitleStyle: CSSProperties = { fontSize: 12.5, color: '#7f8c8d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const closeBtn: CSSProperties = { width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#f1f3f5', border: 'none', borderRadius: 10, color: '#2c3e50', cursor: 'pointer', flexShrink: 0 };
const dayNav: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 };
const navBtn: CSSProperties = { width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'white', border: '1px solid #d0d7de', borderRadius: 10, color: '#2c3e50', cursor: 'pointer', flexShrink: 0 };
const dayTitle: CSSProperties = { fontWeight: 700, color: '#1f2937', fontSize: 15 };
const todayTag: CSSProperties = { display: 'inline-block', marginTop: 2, fontSize: 11, fontWeight: 700, color: '#0e7c4a', background: '#e8f4e8', padding: '1px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.4 };
const todayJump: CSSProperties = { marginTop: 2, fontSize: 12, fontWeight: 600, color: '#1a73c4', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 };
const content: CSSProperties = { padding: 14, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 };
const emptyCard: CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '28px 16px', textAlign: 'center', color: '#7f8c8d', fontSize: 14 };
const medCard: CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 };
const medHead: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 6 };
const medName: CSSProperties = { fontWeight: 700, color: '#1f2937', fontSize: 15 };
const medMeta: CSSProperties = { fontSize: 12.5, color: '#6b7280', marginTop: 2, lineHeight: 1.4 };
const historyBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, background: 'white', color: '#1a3a5c', border: '1px solid #c8def5', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, minHeight: 36 };
const slotRow: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderTop: '1px solid #f1f3f5' };
const slotBadge: CSSProperties = { background: '#eef4fb', color: '#1a3a5c', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, border: '1px solid #c8def5', flexShrink: 0, minWidth: 54, textAlign: 'center' };
const prnBadge: CSSProperties = { background: '#fef3e2', color: '#b56a17', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, flexShrink: 0, minWidth: 54, textAlign: 'center' };
const basePill: CSSProperties = { display: 'inline-block', fontSize: 12.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999 };
const statusPill: Record<string, CSSProperties> = {
  given: { ...basePill, background: '#e8f4e8', color: '#2a7a2a' },
  held: { ...basePill, background: '#fef3e2', color: '#b56a17' },
  refused: { ...basePill, background: '#fdeaea', color: '#c0392b' },
};
const notDocPill: CSSProperties = { ...basePill, background: '#f1f3f5', color: '#7f8c8d', fontWeight: 600 };
const byLine: CSSProperties = { fontSize: 12, color: '#7f8c8d', marginTop: 4, lineHeight: 1.4 };
const timelineBox: CSSProperties = { marginTop: 8, borderTop: '1px solid #e5e7eb', paddingTop: 8 };
const timelineRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f7f8f9' };
const timelineDate: CSSProperties = { fontSize: 12.5, color: '#5c6b7a', fontWeight: 600, minWidth: 86 };
const timelineEmpty: CSSProperties = { fontSize: 13, color: '#7f8c8d', padding: '6px 0' };
