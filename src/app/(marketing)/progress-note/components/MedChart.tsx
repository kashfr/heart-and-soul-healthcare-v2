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
import { resolveCurrentAdministrations } from '@/lib/marShared';
import { authedFetch } from '@/lib/authedFetch';

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
  // The signed-in nurse, when the chart is opened from a note. Enables the
  // "correct an entry" (amend) action. Omit for a purely read-only chart.
  documenter?: { uid: string; name: string; credential: string };
}

export default function MedChart({ patientId, patientName, initialDate, onClose, documenter }: Props) {
  const today = todayISO();
  const [day, setDay] = useState(initialDate && initialDate <= today ? initialDate : today);
  const [orders, setOrders] = useState<MarOrder[]>([]);
  const [dayAdmins, setDayAdmins] = useState<MarAdministration[]>([]);
  const [loading, setLoading] = useState(true);
  const [dayLoading, setDayLoading] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [timelines, setTimelines] = useState<Record<string, MarAdministration[]>>({});
  const [timelineLoading, setTimelineLoading] = useState<string | null>(null);
  // Amend ("correct an entry") state. amendFor is the administration id being
  // corrected; refreshKey re-pulls the day after a successful amendment.
  const [refreshKey, setRefreshKey] = useState(0);
  const [amendFor, setAmendFor] = useState<string | null>(null);
  const [amendStatus, setAmendStatus] = useState<'given' | 'held' | 'refused'>('given');
  const [amendTime, setAmendTime] = useState('');
  const [amendReason, setAmendReason] = useState('');
  const [amendOutcome, setAmendOutcome] = useState('');
  // Baseline the outcome loaded into the form, so we only SEND it when the
  // amender actually edited it — an untouched (possibly stale) value must not
  // overwrite a result recorded concurrently via /api/mar/outcome.
  const [amendOutcomeOrig, setAmendOutcomeOrig] = useState('');
  // D.4.d attestation on held/refused corrections. Seeded from the record so
  // a nurse who reaches the prescriber AFTER documenting can add it here (the
  // capture checkboxes promise exactly that).
  const [amendNotified, setAmendNotified] = useState(false);
  const [amendNotifiedOrig, setAmendNotifiedOrig] = useState(false);
  const [amendWhy, setAmendWhy] = useState('');
  const [amendBusy, setAmendBusy] = useState(false);
  const [amendError, setAmendError] = useState<string | null>(null);

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
  }, [patientId, day, refreshKey]);

  const toggleHistory = async (orderId: string) => {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null);
      return;
    }
    setExpandedOrderId(orderId);
    if (!timelines[orderId]) {
      setTimelineLoading(orderId);
      const items = resolveCurrentAdministrations(await getAdministrationsForOrder(patientId, orderId));
      setTimelines((prev) => ({ ...prev, [orderId]: items.slice(0, 14) }));
      setTimelineLoading(null);
    }
  };

  // Orders that applied on the selected day, plus any administration that day
  // that doesn't belong to one of them (unlisted doses, backdated-order cases).
  // Administrations are append-only facts: they ALWAYS display on the day they
  // happened, even if their order's window was later changed around them.
  const dayOrders = useMemo(() => orders.filter((o) => orderAppliesOn(o, day)), [orders, day]);
  // Collapse amend chains so each dose shows its CURRENT value once (a correction
  // supersedes the original); the originals remain in dayAdmins for the chain.
  const dayAdminsCurrent = useMemo(() => resolveCurrentAdministrations(dayAdmins), [dayAdmins]);
  const consumedIds = new Set<string>();

  const matchFor = (order: MarOrder, slot: string): MarAdministration | undefined => {
    const m = dayAdminsCurrent.find(
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
      for (const a of dayAdminsCurrent) {
        if (a.orderId === (order.id || '') && a.scheduledTime === 'PRN' && !consumedIds.has(a.id || '')) {
          consumedIds.add(a.id || '');
          slotRows.push({ slot: 'PRN', admin: a });
        }
      }
    }
    return { order, slotRows };
  });

  const extras = dayAdminsCurrent.filter((a) => !consumedIds.has(a.id || ''));
  const isToday = day === today;

  const statusLabel = (s: string) => (s === 'given' ? 'Given' : s === 'held' ? 'Held' : 'Refused');

  // The documenting nurse may correct her own entry; an RN (clinical reviewer)
  // may correct any. The server re-checks this; the UI just hides the button.
  const isReviewer = documenter?.credential === 'RN';
  const canAmend = (a: MarAdministration): boolean =>
    !!documenter && !!a.id && (isReviewer || a.documentedBy === documenter.uid);

  const prevOf = (a: MarAdministration): MarAdministration | undefined =>
    a.amends ? dayAdmins.find((r) => r.id === a.amends) : undefined;

  const openAmend = (a: MarAdministration) => {
    setAmendFor(a.id || null);
    setAmendStatus(a.status);
    setAmendTime(a.status === 'given' ? a.actualTime || '' : '');
    setAmendReason(a.reason || '');
    setAmendOutcome(a.outcome || '');
    setAmendOutcomeOrig(a.outcome || '');
    setAmendNotified(a.prescriberNotified === true);
    setAmendNotifiedOrig(a.prescriberNotified === true);
    setAmendWhy('');
    setAmendError(null);
  };

  const saveAmend = async (a: MarAdministration) => {
    if (!a.id) return;
    if (!amendWhy.trim()) {
      setAmendError('A reason for the correction is required.');
      return;
    }
    setAmendBusy(true);
    setAmendError(null);
    try {
      const res = await authedFetch('/api/mar/amend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: a.id,
          status: amendStatus,
          actualTime: amendStatus === 'given' ? amendTime : '',
          reason: amendReason,
          // Send the outcome only when the amender actually CHANGED it in a
          // given-PRN correction; otherwise omit it so the server carries the
          // freshest stored value forward (and blanks it for non-given). PRN-ish
          // covers unscheduled one-off doses documented as PRN.
          ...(amendStatus === 'given' &&
          (a.scheduledTime === 'PRN' || a.scheduledTime === 'unscheduled') &&
          amendOutcome !== amendOutcomeOrig
            ? { outcome: amendOutcome }
            : {}),
          // Same only-when-changed pattern as outcome: the server carries the
          // stored attestation forward unless the amender actually flips it.
          ...((amendStatus === 'held' || amendStatus === 'refused') && amendNotified !== amendNotifiedOrig
            ? { prescriberNotified: amendNotified }
            : {}),
          amendmentReason: amendWhy.trim(),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setAmendError(data.error || 'Could not save the correction.');
        setAmendBusy(false);
        return;
      }
      setAmendFor(null);
      setAmendBusy(false);
      setTimelines({}); // drop cached history so it reloads with the correction
      setRefreshKey((k) => k + 1);
    } catch {
      setAmendError('Network error saving the correction.');
      setAmendBusy(false);
    }
  };

  // Shared renderer for a recorded dose's details (status pill, by-line, amended
  // marker, and the inline correction form). Used by the day rows and extras.
  const renderAdminDetails = (a: MarAdministration) => {
    const prev = prevOf(a);
    const showDoseReason =
      amendStatus === 'held' || amendStatus === 'refused' || (amendStatus === 'given' && a.scheduledTime === 'PRN');
    return (
      <>
        <span style={statusPill[a.status] || statusPill.given}>
          {statusLabel(a.status)}
          {a.status === 'given' && a.actualTime ? ` ${a.actualTime}` : ''}
          {a.initials ? ` · ${a.initials}` : ''}
        </span>
        {a.amends && (
          <span style={amendedTag} title={a.amendmentReason || ''}>
            Amended
          </span>
        )}
        <div style={byLine}>
          {a.status === 'given' ? `By ${givenByLabel(a)}` : a.reason ? `Reason: ${a.reason}` : ''}
          {a.status === 'given' && a.reason ? ` · for ${a.reason}` : ''}
          {a.administeredByType !== 'nurse' && a.documentedByName ? ` · documented by ${a.documentedByName}` : ''}
        </div>
        {/* Result line whenever a given dose HAS one (matches the grid + PDF);
            the pending nag stays scoped to true PRN slots. */}
        {a.status === 'given' && (a.outcome || '').trim() ? (
          <div style={outcomeLine}>
            Result: {a.outcome}
            {a.outcomeByName ? ` (recorded by ${a.outcomeByName})` : ''}
          </div>
        ) : a.status === 'given' && a.scheduledTime === 'PRN' ? (
          <span style={outcomePendingChip}>Result pending</span>
        ) : null}
        {prev && (
          <div style={amendedNote}>
            Corrected from &ldquo;{statusLabel(prev.status)}&rdquo;
            {a.documentedByName ? ` by ${a.documentedByName}` : ''}
            {a.amendmentReason ? ` — ${a.amendmentReason}` : ''}
          </div>
        )}
        {canAmend(a) && amendFor === null && (
          <button type="button" style={amendBtn} onClick={() => openAmend(a)}>
            Correct this entry
          </button>
        )}
        {amendFor === a.id && (
          <div style={amendBox}>
            <div style={amendTitle}>Correct this entry</div>
            <div style={amendStatusRow}>
              {(['given', 'held', 'refused'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setAmendStatus(s)}
                  style={amendStatus === s ? amendStatusActive[s] : amendStatusBtn}
                >
                  {statusLabel(s)}
                </button>
              ))}
            </div>
            {amendStatus === 'given' && (
              <label style={amendField}>
                <span style={amendFieldLabel}>Time given</span>
                <input type="time" value={amendTime} onChange={(e) => setAmendTime(e.target.value)} style={amendInput} />
              </label>
            )}
            {showDoseReason && (
              <label style={amendField}>
                <span style={amendFieldLabel}>{amendStatus === 'given' ? 'Reason given (PRN)' : 'Reason'}</span>
                <input
                  type="text"
                  value={amendReason}
                  onChange={(e) => setAmendReason(e.target.value)}
                  style={amendInput}
                  placeholder={
                    amendStatus === 'refused' ? 'Reason for refusal' : amendStatus === 'held' ? 'Reason held' : 'Why this PRN dose was given'
                  }
                />
              </label>
            )}
            {amendStatus === 'given' && (a.scheduledTime === 'PRN' || a.scheduledTime === 'unscheduled') && (
              <label style={amendField}>
                <span style={amendFieldLabel}>Outcome / result</span>
                <input
                  type="text"
                  value={amendOutcome}
                  onChange={(e) => setAmendOutcome(e.target.value)}
                  style={amendInput}
                  placeholder="e.g., pain decreased from 6/10 to 2/10 within 45 min"
                />
              </label>
            )}
            {(amendStatus === 'held' || amendStatus === 'refused') && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', margin: '6px 0' }}>
                <input
                  type="checkbox"
                  checked={amendNotified}
                  onChange={(e) => setAmendNotified(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span style={{ fontSize: 12, color: '#5c6b7a', lineHeight: 1.4 }}>
                  Prescriber has been notified{amendStatus === 'refused' ? ' of this refusal' : ' that this dose was not given'}.
                </span>
              </label>
            )}
            <label style={amendField}>
              <span style={amendFieldLabel}>Reason for this correction *</span>
              <input
                type="text"
                value={amendWhy}
                onChange={(e) => setAmendWhy(e.target.value)}
                style={amendInput}
                placeholder="e.g., marked given by mistake; the dose was actually held"
              />
            </label>
            {amendError && <div style={amendErr}>{amendError}</div>}
            <div style={amendActions}>
              <button type="button" style={amendCancel} onClick={() => setAmendFor(null)} disabled={amendBusy}>
                Cancel
              </button>
              <button type="button" style={amendSave} onClick={() => saveAmend(a)} disabled={amendBusy}>
                {amendBusy ? 'Saving…' : 'Save correction'}
              </button>
            </div>
          </div>
        )}
      </>
    );
  };

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
                <div style={subtitleStyle}>{patientName}{documenter ? '' : ' · read-only'}</div>
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
                        <div style={{ flex: 1, minWidth: 0 }}>{renderAdminDetails(admin)}</div>
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
                        {renderAdminDetails(a)}
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
const amendedTag: CSSProperties = { display: 'inline-block', marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#6b21a8', background: '#f3e8ff', border: '1px solid #e0c8f5', padding: '1px 7px', borderRadius: 999, verticalAlign: 'middle' };
const amendedNote: CSSProperties = { fontSize: 12, color: '#6b21a8', marginTop: 4, lineHeight: 1.4 };
const outcomeLine: CSSProperties = { fontSize: 12, color: '#2a7a2a', marginTop: 4, lineHeight: 1.4 };
const outcomePendingChip: CSSProperties = {
  display: 'inline-block',
  marginTop: 4,
  padding: '1px 8px',
  borderRadius: 999,
  background: '#fff7e6',
  border: '1px solid #f5d9a8',
  color: '#8a5a0d',
  fontSize: 11,
  fontWeight: 700,
};
const amendBtn: CSSProperties = { marginTop: 8, background: 'white', color: '#1a3a5c', border: '1px solid #c8def5', padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const amendBox: CSSProperties = { marginTop: 10, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 };
const amendTitle: CSSProperties = { fontSize: 13, fontWeight: 700, color: '#1f2937', marginBottom: 8 };
const amendStatusRow: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 };
const amendStatusBtn: CSSProperties = { padding: '6px 14px', borderRadius: 6, border: '1px solid #d0d7de', background: 'white', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const amendStatusActive: Record<'given' | 'held' | 'refused', CSSProperties> = {
  given: { ...amendStatusBtn, background: '#0e7c4a', color: 'white', border: '1px solid #0e7c4a' },
  held: { ...amendStatusBtn, background: '#b56a17', color: 'white', border: '1px solid #b56a17' },
  refused: { ...amendStatusBtn, background: '#c0392b', color: 'white', border: '1px solid #c0392b' },
};
const amendField: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 };
const amendFieldLabel: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#5c6b7a' };
const amendInput: CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' };
const amendErr: CSSProperties = { fontSize: 12.5, color: '#c0392b', marginBottom: 8 };
const amendActions: CSSProperties = { display: 'flex', gap: 8, justifyContent: 'flex-end' };
const amendCancel: CSSProperties = { background: 'white', color: '#374151', border: '1px solid #d0d7de', padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const amendSave: CSSProperties = { background: '#1a3a5c', color: 'white', border: '1px solid #1a3a5c', padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
