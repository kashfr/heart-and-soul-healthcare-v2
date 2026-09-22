'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, Copy, FileText, Pencil, Plus, Stethoscope, Trash2 } from 'lucide-react';
import { formatDateUS } from '@/lib/dateFormat';
import { withSelectChevron } from '@/lib/selectChevron';
import { getBillingRates, type BillingRate } from '@/lib/billingRates';
import { resolveRate } from '@/lib/billingRatesShared';
import type { DashboardNote } from '@/lib/clientDashboardShared';
import {
  addHoursAuthorization,
  deleteHoursAuthorization,
  getHoursAuthorizationsForPatient,
  updateHoursAuthorization,
  type HoursAuthorizationInput,
} from '@/lib/hoursAuthorizations';
import {
  HOURS_AUTH_EXPIRY_WARN_DAYS,
  UNITS_PER_HOUR,
  authForMonth,
  bucketLabel,
  bucketLabelLower,
  fmtDollars,
  fmtH,
  fmtQty,
  fmtUnits,
  hoursToDollars,
  hoursToUnits,
  findShiftOverlaps,
  hoursFindings,
  monthCap,
  monthCapSource,
  monthEndISO,
  monthLabel,
  monthStartISO,
  monthUsage,
  monthsBetween,
  rateLabel,
  splitShiftByDay,
  unitsUsage,
  type HoursAuthorization,
  type HoursBucket,
  type QtyView,
  type RateBasis,
} from '@/lib/shiftHours';

const NAVY = '#1a3a5c';

interface Props {
  patientId: string;
  patientName: string;
  /** Payer program id (patients.program); drives the rate lookup. */
  program: string;
  /** Active notes for the client (the dashboard already loads them). */
  notes: DashboardNote[];
  uid: string;
  todayISO: string;
}

interface DayRow {
  bucket: HoursBucket;
  dateISO: string;
  noteId: string;
  nurseName: string;
  /** Author credential at submit time; picks the rate row on GAPP. */
  credential: string;
  window: string;
  hours: number;
  /** True when this day's hours came from a shift whose date of service is another day. */
  spill: boolean;
}

/**
 * Owner-only "Hours" tab: authorized nursing hours (GAPP Letter of
 * Notification or Therap Service Authorization lines) against hours
 * documented on notes, month by month and day by day. Two buckets that are
 * never summed: shift hours (shift notes) and RN oversight hours (oversight
 * visit notes, time in to time out), each against its own line. Answers the
 * parent's "how many hours are left this month" and doubles as the billing
 * worksheet (shifts split at midnight, so each calendar day carries exactly
 * the hours worked on it).
 */
export default function HoursSection({ patientId, patientName, program, notes, uid, todayISO }: Props) {
  const [auths, setAuths] = useState<HoursAuthorization[] | null>(null);
  const [rates, setRates] = useState<BillingRate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(todayISO.slice(0, 7));
  const [editing, setEditing] = useState<HoursAuthorization | 'new' | null>(null);
  const [copied, setCopied] = useState(false);
  // Hours or 15-minute units for the worksheet, and, independently, dollars
  // at the line rate shown alongside.
  const [view, setView] = useState<QtyView>('hours');
  const [showDollars, setShowDollars] = useState(false);

  const reload = async () => {
    try {
      setAuths(await getHoursAuthorizationsForPatient(patientId));
    } catch (err) {
      console.error('Hours authorizations load failed:', err);
      setError('Could not load the hours authorizations.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    getBillingRates()
      .then((list) => { if (!cancelled) setRates(list); })
      .catch((err) => console.error('Billing rates load failed:', err));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getHoursAuthorizationsForPatient(patientId)
      .then((list) => { if (!cancelled) setAuths(list); })
      .catch((err) => {
        console.error('Hours authorizations load failed:', err);
        if (!cancelled) setError('Could not load the hours authorizations.');
      });
    return () => { cancelled = true; };
  }, [patientId]);

  const shiftNotes = useMemo(() => notes.filter((n) => n.noteType !== 'rn-oversight-visit'), [notes]);
  const oversightNotes = useMemo(() => notes.filter((n) => n.noteType === 'rn-oversight-visit'), [notes]);

  // Two shifts charting the same hour on this client: a double-staffed hour
  // or a typo, and a double bill either way. Shift notes only: an RN visiting
  // during an LPN shift is what a supervisory visit looks like.
  const overlaps = useMemo(() => findShiftOverlaps(shiftNotes), [shiftNotes]);
  const noteById = useMemo(() => new Map(shiftNotes.map((n) => [n.id, n])), [shiftNotes]);
  const overlapText = (noteId: string): string => {
    const hits = overlaps.get(noteId) ?? [];
    return hits
      .map((h) => {
        const o = noteById.get(h.otherId);
        const mins = h.minutes;
        const dur = mins % 60 === 0 ? `${mins / 60} h` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
        return `${dur} with ${o?.nurseName || 'another nurse'} (${o ? `${formatDateUS(o.dateISO)} ${o.shiftStart} to ${o.shiftEnd}` : '?'})`;
      })
      .join('; ');
  };

  // Every note cut at midnight, tagged with its bucket.
  const dayRows = useMemo<DayRow[]>(() => {
    const rows: DayRow[] = [];
    for (const n of notes) {
      const bucket: HoursBucket = n.noteType === 'rn-oversight-visit' ? 'oversight' : 'shift';
      const segs = splitShiftByDay(n);
      const endDate = n.shiftEndDate || (segs.length > 1 ? segs[segs.length - 1].dateISO : n.dateISO);
      const window =
        n.shiftStart && n.shiftEnd
          ? bucket === 'oversight' || endDate === n.dateISO
            ? `${formatDateUS(n.dateISO)} ${n.shiftStart} to ${n.shiftEnd}`
            : `${formatDateUS(n.dateISO)} ${n.shiftStart} to ${formatDateUS(endDate)} ${n.shiftEnd}`
          : `${formatDateUS(n.dateISO)} (${fmtH(parseFloat(n.totalHours) || 0)} h, no times)`;
      for (const seg of segs) {
        rows.push({ bucket, dateISO: seg.dateISO, noteId: n.id, nurseName: n.nurseName, credential: n.credential || '', window, hours: seg.hours, spill: seg.dateISO !== n.dateISO });
      }
    }
    return rows.sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.window.localeCompare(b.window));
  }, [notes]);

  const dayHours = useMemo(() => {
    const out = { shift: new Map<string, number>(), oversight: new Map<string, number>() };
    for (const r of dayRows) {
      const m = out[r.bucket];
      m.set(r.dateISO, Math.round(((m.get(r.dateISO) || 0) + r.hours) * 100) / 100);
    }
    return out;
  }, [dayRows]);

  const list = useMemo(() => auths ?? [], [auths]);
  const isCurrent = month === todayISO.slice(0, 7);
  const monthRows = dayRows.filter((r) => r.dateISO >= monthStartISO(month) && r.dateISO <= monthEndISO(month));
  const monthOverlapNotes = new Set(monthRows.filter((r) => r.bucket === 'shift' && overlaps.has(r.noteId)).map((r) => r.noteId));
  const findings = useMemo(() => hoursFindings(list, dayHours, todayISO), [list, dayHours, todayISO]);

  // Per-bucket month picture.
  const shiftAuth = authForMonth(list, month, 'shift');
  const shiftCap = shiftAuth ? monthCap(shiftAuth, month) : null;
  const shiftUsage = monthUsage(dayHours.shift, shiftCap, month, todayISO);
  const rnAuth = authForMonth(list, month, 'oversight');
  const rnCap = rnAuth ? monthCap(rnAuth, month) : null;
  const rnUsage = monthUsage(dayHours.oversight, rnCap, month, todayISO);
  const rnVisits = monthRows.filter((r) => r.bucket === 'oversight').length;
  // Rates come from the billing rate table by program + bucket + date. The
  // month figures use the rate in force on the 1st (a mid-month change is
  // priced per day on the worksheet).
  // The note author's credential picks a credential-specific row (GAPP pays
  // LPN and RN shifts differently); an "any nurse" row is the fallback.
  const rateOn = (bucket: HoursBucket, dateISO: string, credential = ''): number | null => resolveRate(rates, program, bucket, dateISO, credential);
  /** Distinct rates in force this month for a bucket ("$8.50 LPN / $10.25 RN"). */
  const monthRateLabel = (bucket: HoursBucket): string => {
    const seen = new Map<string, number>();
    for (const r of monthRows.filter((x) => x.bucket === bucket)) {
      const rate = rateOn(bucket, r.dateISO, r.credential);
      if (rate != null) seen.set(r.credential || 'any', rate);
    }
    if (seen.size === 0) {
      const base = rateOn(bucket, monthStartISO(month));
      return base == null ? '' : `${fmtDollars(base)}/unit`;
    }
    return Array.from(seen.entries()).map(([c, rate]) => `${fmtDollars(rate)}${seen.size > 1 || c !== 'any' ? ` ${c}` : ''}`).join(' / ') + '/unit';
  };
  const qty = (hours: number): string => fmtQty(hours, view);
  const money = (hours: number, bucket: HoursBucket, dateISO: string, credential = ''): string => {
    const d = hoursToDollars(hours, rateOn(bucket, dateISO, credential));
    return d == null ? '—' : fmtDollars(d);
  };
  /** Dollars for a set of worksheet rows, each at its own day + credential rate. */
  const rowsDollars = (list: DayRow[]): number | null => {
    if (list.length === 0) return 0;
    let sum = 0;
    for (const r of list) {
      const d = hoursToDollars(r.hours, rateOn(r.bucket, r.dateISO, r.credential));
      if (d == null) return null;
      sum += d;
    }
    return Math.round(sum * 100) / 100;
  };
  const monthDollars = (bucket: HoursBucket): number | null => rowsDollars(monthRows.filter((r) => r.bucket === bucket));
  const shiftDollars = monthDollars('shift');
  const rnDollars = monthDollars('oversight');
  const monthUnits = (bucket: HoursBucket): number => monthRows.filter((r) => r.bucket === bucket).reduce((a, r) => a + hoursToUnits(r.hours), 0);
  // Show the RN block for NOW/COMP-style clients (an oversight line on file)
  // or whenever a visit was documented; GAPP clients with neither stay simple.
  const hasOversight = list.some((a) => a.covers === 'oversight') || oversightNotes.length > 0;

  // Every month any authorization covers, per bucket, so the tables show the
  // whole story (past months final, current in progress, future at zero).
  const shiftMonths = useMemo(() => coveredMonths(list, 'shift'), [list]);
  const rnMonths = useMemo(() => coveredMonths(list, 'oversight'), [list]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  const answerText = (() => {
    const label = monthLabel(month);
    const parts: string[] = [];
    if (shiftCap == null) {
      parts.push(`As of ${formatDateUS(todayISO)}, ${patientName} has ${fmtH(shiftUsage.used)} documented nursing hours for ${label}. No authorized-hours figure is on file for that month.`);
    } else {
      const rem = shiftUsage.remaining ?? 0;
      parts.push(`As of ${formatDateUS(todayISO)}, ${patientName} has used ${fmtH(shiftUsage.used)} of ${fmtH(shiftCap)} authorized nursing hours for ${label}. ${rem >= 0 ? `${fmtH(rem)} hours remain.` : `That is ${fmtH(-rem)} hours over the authorization.`}`);
    }
    if (rnCap != null) {
      const rem = rnUsage.remaining ?? 0;
      parts.push(`RN oversight: ${fmtH(rnUsage.used)} of ${fmtH(rnCap)} hours used${rem >= 0 ? `, ${fmtH(rem)} remaining.` : ` (${fmtH(-rem)} over).`}`);
    }
    return parts.join(' ');
  })();

  const copyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(answerText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this text:', answerText);
    }
  };

  const remove = async (a: HoursAuthorization) => {
    if (!a.id) return;
    if (!window.confirm(`Delete the ${bucketLabelLower(a.covers)} line ${a.paNumber || '(no PA #)'} (${formatDateUS(a.from)} to ${formatDateUS(a.to)})? The hours history stays; only the cap is removed.`)) return;
    try {
      await deleteHoursAuthorization(a.id);
      await reload();
    } catch (err) {
      console.error('Delete authorization failed:', err);
      setError('Could not delete the authorization.');
    }
  };

  return (
    <div>
      {error && <div style={errBox}>{error}</div>}

      {/* Reminders: expiring / expired / nearly used up / no RN visit yet. */}
      {findings.map((f) => (
        <div key={f.message} style={f.severity === 'error' ? alertErr : f.severity === 'warn' ? alertWarn : alertInfo}>
          {f.severity === 'info' ? <Clock size={14} style={{ flexShrink: 0 }} /> : <AlertTriangle size={14} style={{ flexShrink: 0 }} />}
          <span>{f.message}</span>
        </div>
      ))}
      {monthOverlapNotes.size > 0 && (
        <div style={alertErr}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span>
            {monthLabel(month)}: {monthOverlapNotes.size} shift{monthOverlapNotes.size === 1 ? '' : 's'} overlap another nurse&apos;s shift on this client.
            Both are counted in the totals below; check the rows marked “overlaps” before billing.
          </span>
        </div>
      )}
      {auths && list.length === 0 && (
        <div style={alertInfo}>
          <FileText size={14} style={{ flexShrink: 0 }} />
          <span>No hours authorization on file for {patientName}. Add the Letter of Notification or Therap lines below and this tab will track hours used against them.</span>
        </div>
      )}

      {/* Month summary */}
      <section style={card}>
        <div style={head}>
          <div style={title}><Clock size={16} /> Hours for {monthLabel(month)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" onClick={() => shiftMonth(-1)} style={iconBtn} aria-label="Previous month"><ChevronLeft size={15} /></button>
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={input} aria-label="Month" />
            <button type="button" onClick={() => shiftMonth(1)} style={iconBtn} aria-label="Next month"><ChevronRight size={15} /></button>
            {!isCurrent && (
              <button type="button" onClick={() => setMonth(todayISO.slice(0, 7))} style={smallBtn}>This month</button>
            )}
          </div>
        </div>

        <BucketSummary
          bucket="shift"
          auth={shiftAuth}
          cap={shiftCap}
          usage={shiftUsage}
          isCurrent={isCurrent}
          month={month}
          countLabel={`${monthRows.filter((r) => r.bucket === 'shift').length} shift ${monthRows.filter((r) => r.bucket === 'shift').length === 1 ? 'day' : 'days'} documented`}
          dayHours={dayHours.shift}
          todayISO={todayISO}
        />
        {hasOversight && (
          <BucketSummary
            bucket="oversight"
            auth={rnAuth}
            cap={rnCap}
            usage={rnUsage}
            isCurrent={isCurrent}
            month={month}
            countLabel={`${rnVisits} RN ${rnVisits === 1 ? 'visit' : 'visits'} documented`}
            dayHours={dayHours.oversight}
            todayISO={todayISO}
          />
        )}

        {/* Billing line: the month's used hours as units and dollars. */}
        <div style={billingLine}>
          <span>
            <strong>Shift:</strong> {fmtH(shiftUsage.used)} h = {fmtUnits(monthUnits('shift'))} units
            {shiftDollars != null && monthRateLabel('shift')
              ? <> = <strong>{fmtDollars(shiftDollars)}</strong> at {monthRateLabel('shift')}</>
              : <span style={{ color: '#b45309' }}> · no billing rate for this program / nurse type (Settings → Billing rates)</span>}
          </span>
          {hasOversight && (
            <span style={{ color: '#1d4ed8' }}>
              <strong>RN oversight:</strong> {fmtH(rnUsage.used)} h = {fmtUnits(monthUnits('oversight'))} units
              {rnDollars != null && monthRateLabel('oversight')
                ? <> = <strong>{fmtDollars(rnDollars)}</strong> at {monthRateLabel('oversight')}</>
                : <span style={{ color: '#b45309' }}> · no billing rate for this program</span>}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <div style={{ ...muted, flex: 1, minWidth: 240 }}>{answerText}</div>
          <button type="button" onClick={copyAnswer} style={smallBtn} title="Copy a one-line answer for the parent">
            <Copy size={13} /> {copied ? 'Copied' : 'Copy answer'}
          </button>
          <Link
            href={`/admin/submissions?view=all&range=m&m=${month}&client=${encodeURIComponent(patientName)}`}
            style={{ ...smallBtn, textDecoration: 'none' }}
            title="Open these notes on the Shift Notes list"
          >
            Open in Shift Notes
          </Link>
        </div>
      </section>

      {/* Day by day (billing worksheet) */}
      <section style={card}>
        <div style={head}>
          <div style={title}>Day by day, {monthLabel(month)}</div>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <span style={segmented} role="group" aria-label="Show as">
              {(['hours', 'units'] as QtyView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  style={view === v ? segmentedActive : segmentedBtn}
                  title={v === 'units' ? '15-minute billing units (4 per hour)' : 'Hours'}
                >
                  {v === 'hours' ? 'Hours' : 'Units'}
                </button>
              ))}
            </span>
            <button
              type="button"
              onClick={() => setShowDollars((v) => !v)}
              style={showDollars ? dollarsActive : smallBtn}
              title="Show dollars alongside: units × the rate on this client's line"
              aria-pressed={showDollars}
            >
              $ {showDollars ? 'on' : 'off'}
            </button>
          </span>
        </div>
        <div style={{ ...muted, marginBottom: 10 }}>Shifts crossing midnight are split; a row marked “from prior day” is the tail of an overnight shift. Each day with more than one entry gets a day total. RN visits are listed but never added to shift hours.</div>
        {monthRows.length === 0 ? (
          <div style={muted}>Nothing documented for this month.</div>
        ) : (
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Nurse</th>
                <th style={th}>Shift / visit</th>
                <th style={{ ...th, textAlign: 'right' }}>{view === 'hours' ? 'Hours' : 'Units'}</th>
                {showDollars && <th style={{ ...th, textAlign: 'right', color: '#166534' }}>Amount</th>}
                <th style={{ ...th, textAlign: 'right' }} title="Running total of shift hours">Running</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let running = 0;
                let runningUnits = 0;
                const out: React.ReactNode[] = [];
                monthRows.forEach((r, i) => {
                  if (r.bucket === 'shift') {
                    running = Math.round((running + r.hours) * 100) / 100;
                    runningUnits += hoursToUnits(r.hours);
                  }
                  const firstOfDay = i === 0 || monthRows[i - 1].dateISO !== r.dateISO;
                  const lastOfDay = i === monthRows.length - 1 || monthRows[i + 1].dateISO !== r.dateISO;
                  const isRn = r.bucket === 'oversight';
                  out.push(
                    <tr
                      key={`${r.noteId}-${r.dateISO}`}
                      style={{
                        ...(firstOfDay && i > 0 ? { borderTop: '2px solid #e5e7eb' } : null),
                        ...(overlaps.has(r.noteId) ? { background: '#fff5f5' } : null),
                      }}
                    >
                      <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: firstOfDay ? 600 : 400, color: firstOfDay ? NAVY : '#94a3b8' }}>
                        {formatDateUS(r.dateISO)}
                        {firstOfDay && (dayHours.shift.get(r.dateISO) ?? 0) > 24 && (
                          <span style={overBadge} title="More than 24 shift hours documented on one calendar day: overlapping shifts">&gt;24h</span>
                        )}
                      </td>
                      <td style={td}>{r.nurseName || '—'}{r.credential && <span style={credTag}>{r.credential}</span>}</td>
                      <td style={td}>
                        {isRn && <span style={rnChip} title="RN oversight visit">RN visit</span>}
                        <Link href={`/admin/submissions/${r.noteId}`} style={{ color: NAVY }}>{r.window}</Link>
                        {r.spill && <span style={spillBadge}>from prior day</span>}
                        {overlaps.has(r.noteId) && (
                          <span style={overBadge} title={`Overlaps ${overlapText(r.noteId)}`}>overlaps</span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: isRn ? '#1d4ed8' : undefined }}>{qty(r.hours)}</td>
                      {showDollars && (
                        <td
                          style={{ ...td, textAlign: 'right', color: '#166534', fontVariantNumeric: 'tabular-nums' }}
                          title={(() => { const rate = rateOn(r.bucket, r.dateISO, r.credential); return rate == null ? `No billing rate for this program${r.credential ? ` (${r.credential})` : ''}` : `${fmtUnits(hoursToUnits(r.hours))} units × ${fmtDollars(rate)}${r.credential ? ` (${r.credential} rate)` : ''}`; })()}
                        >
                          {money(r.hours, r.bucket, r.dateISO, r.credential)}
                        </td>
                      )}
                      <td style={{ ...td, textAlign: 'right', color: '#5c6b7a', fontVariantNumeric: 'tabular-nums' }}>{isRn ? '' : view === 'units' ? fmtUnits(runningUnits) : fmtH(running)}</td>
                    </tr>,
                  );
                  // Day total when a calendar day has more than one entry
                  // (Sarah's overnight tail + Jamie's day shift = 15 on the 14th).
                  if (lastOfDay) {
                    const dayRowsHere = monthRows.filter((x) => x.dateISO === r.dateISO);
                    const dayShift = dayRowsHere.filter((x) => x.bucket === 'shift');
                    const dayRn = dayRowsHere.filter((x) => x.bucket === 'oversight');
                    if (dayRowsHere.length > 1) {
                      const shiftSum = Math.round(dayShift.reduce((a, x) => a + x.hours, 0) * 100) / 100;
                      const rnSum = Math.round(dayRn.reduce((a, x) => a + x.hours, 0) * 100) / 100;
                      out.push(
                        <tr key={`total-${r.dateISO}`} style={dayTotalRow}>
                          <td style={{ ...td, fontWeight: 700, color: NAVY, whiteSpace: 'nowrap' }}>{formatDateUS(r.dateISO)} total</td>
                          <td style={{ ...td, color: '#5c6b7a' }} colSpan={2}>
                            {dayShift.length > 0 && `${dayShift.length} shift ${dayShift.length === 1 ? 'entry' : 'entries'}`}
                            {dayShift.length > 0 && dayRn.length > 0 && ' · '}
                            {dayRn.length > 0 && <span style={{ color: '#1d4ed8' }}>{dayRn.length} RN {dayRn.length === 1 ? 'visit' : 'visits'} ({qty(rnSum)}{showDollars ? `, ${(() => { const d = rowsDollars(dayRn); return d == null ? '—' : fmtDollars(d); })()}` : ''})</span>}
                          </td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: NAVY, fontVariantNumeric: 'tabular-nums' }}>{dayShift.length > 0 ? qty(shiftSum) : ''}</td>
                          {showDollars && <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#166534', fontVariantNumeric: 'tabular-nums' }}>{dayShift.length > 0 ? (() => { const d = rowsDollars(dayShift); return d == null ? '—' : fmtDollars(d); })() : ''}</td>}
                          <td style={td} />
                        </tr>,
                      );
                    }
                  }
                });
                return out;
              })()}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...td, fontWeight: 700 }} colSpan={3}>Shift {view === 'hours' ? 'hours' : 'units'}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{view === 'units' ? fmtUnits(monthUnits('shift')) : fmtH(shiftUsage.used)}</td>
                {showDollars && <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#166534' }}>{shiftDollars == null ? '—' : fmtDollars(shiftDollars)}</td>}
                <td style={td} />
              </tr>
              {(hasOversight || rnUsage.used > 0) && (
                <tr>
                  <td style={{ ...td, fontWeight: 700, color: '#1d4ed8' }} colSpan={3}>RN oversight {view === 'hours' ? 'hours' : 'units'}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>{view === 'units' ? fmtUnits(monthUnits('oversight')) : fmtH(rnUsage.used)}</td>
                  {showDollars && <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#166534' }}>{rnDollars == null ? '—' : fmtDollars(rnDollars)}</td>}
                  <td style={td} />
                </tr>
              )}
            </tfoot>
          </table>
        )}
      </section>

      {/* Month by month across the authorization window(s), per bucket */}
      {shiftMonths.length > 0 && (
        <MonthTable title="Month by month: shift hours" bucket="shift" months={shiftMonths} list={list} dayHours={dayHours.shift} month={month} todayISO={todayISO} onPick={setMonth} />
      )}
      {rnMonths.length > 0 && (
        <MonthTable title="Month by month: RN oversight" bucket="oversight" months={rnMonths} list={list} dayHours={dayHours.oversight} month={month} todayISO={todayISO} onPick={setMonth} />
      )}

      {/* Authorizations on file */}
      <section style={card}>
        <div style={head}>
          <div style={title}><FileText size={16} /> Hours authorizations</div>
          {editing === null && (
            <button type="button" onClick={() => setEditing('new')} style={primaryBtn}><Plus size={14} /> Add authorization</button>
          )}
        </div>
        <div style={{ ...muted, marginBottom: 12 }}>
          GAPP: transcribe the Letter of Notification (hours per week; type each month&apos;s block hours where they differ).
          NOW/COMP: one line per Therap Service Authorization, LPN hours daily for shift hours and RN hours monthly for oversight,
          with the Total Units (15-minute units) so the annual ceiling is tracked too. Only you can see this.
        </div>

        {editing !== null && (
          <AuthorizationForm
            patientId={patientId}
            uid={uid}
            existing={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={async () => { setEditing(null); await reload(); }}
          />
        )}

        {auths === null && !error && <div style={muted}>Loading…</div>}
        {list.map((a) => {
          const months = monthsBetween(a.from, a.to);
          const daysLeft = Math.round((Date.parse(`${a.to}T00:00:00Z`) - Date.parse(`${todayISO}T00:00:00Z`)) / 86400000);
          const status = daysLeft < 0 ? 'Expired' : a.from > todayISO ? 'Upcoming' : daysLeft <= HOURS_AUTH_EXPIRY_WARN_DAYS ? `Ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : 'Active';
          const units = unitsUsage(a, dayHours[a.covers], todayISO);
          return (
            <div key={a.id} style={authCard}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 700, color: NAVY, fontSize: 14 }}>
                    <span style={a.covers === 'oversight' ? rnChip : shiftChip}>{bucketLabel(a.covers)}</span>
                    PA {a.paNumber || '—'}{a.serviceCode ? ` · ${a.serviceCode}` : ''} · {a.kind === 'unskilled' ? 'Unskilled' : 'Skilled'}
                    <span style={daysLeft < 0 ? expiredBadge : a.from > todayISO ? nowBadge : daysLeft <= HOURS_AUTH_EXPIRY_WARN_DAYS ? warnBadge : okBadge}>{status}</span>
                  </div>
                  <div style={muted}>
                    {formatDateUS(a.from)} to {formatDateUS(a.to)}
                    {a.rateHours != null && ` · ${fmtH(a.rateHours)} hours per ${a.rateBasis}`}
                    {a.totalUnits != null && ` · ${fmtUnits(a.totalUnits)} units (${fmtH(a.totalUnits / UNITS_PER_HOUR)} h)`}
                    {a.note && ` · ${a.note}`}
                  </div>
                  {units && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 12.5, color: '#334155' }}>
                        Annual units: <strong>{fmtUnits(units.usedUnits)}</strong> of {fmtUnits(units.totalUnits)} used ({Math.round(units.pct * 100)}%), {fmtUnits(Math.max(0, units.remainingUnits))} left
                        {a.from > todayISO
                          ? <span style={{ color: '#5c6b7a' }}> · starts {formatDateUS(a.from)}</span>
                          : units.runsOutOn
                            ? <span style={{ color: '#b3261e' }}> · on pace to run out {formatDateUS(units.runsOutOn)}</span>
                            : <span style={{ color: '#5c6b7a' }}> · on pace for {fmtUnits(units.projectedUnits)} by {formatDateUS(a.to)}</span>}
                      </div>
                      <div style={{ ...barTrack, height: 6, marginTop: 4, maxWidth: 420 }}>
                        <div style={{ ...barFill, width: `${Math.min(100, Math.round(units.pct * 100))}%`, background: units.remainingUnits < 0 ? '#b3261e' : units.pct >= 0.9 ? '#b45309' : NAVY }} />
                      </div>
                    </div>
                  )}
                </div>
                {editing === null && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => setEditing(a)} style={iconBtn} aria-label="Edit"><Pencil size={14} /></button>
                    <button type="button" onClick={() => remove(a)} style={{ ...iconBtn, color: '#b3261e' }} aria-label="Delete"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
              <div style={monthChips}>
                {months.map((ym) => {
                  const c = monthCap(a, ym);
                  const src = monthCapSource(a, ym);
                  return (
                    <span key={ym} style={{ ...chip, ...(src === 'override' ? chipOverride : null) }} title={src === 'override' ? 'Block hours from the letter' : `${rateLabel(a)} default`}>
                      {monthLabel(ym).replace(/(\w{3})\w* (\d{4})/, '$1 $2')}: <strong>{c == null ? '—' : fmtH(c)}</strong>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function coveredMonths(list: HoursAuthorization[], bucket: HoursBucket): string[] {
  const set = new Set<string>();
  for (const a of list) if (a.covers === bucket) for (const ym of monthsBetween(a.from, a.to)) set.add(ym);
  return Array.from(set).sort();
}

function BucketSummary({ bucket, auth, cap, usage, isCurrent, month, countLabel, dayHours, todayISO }: {
  bucket: HoursBucket;
  auth: HoursAuthorization | null;
  cap: number | null;
  usage: ReturnType<typeof monthUsage>;
  isCurrent: boolean;
  month: string;
  countLabel: string;
  dayHours: Map<string, number>;
  todayISO: string;
}) {
  const isRn = bucket === 'oversight';
  const pct = usage.pct == null ? 0 : Math.min(1, usage.pct);
  const barColor = usage.remaining != null && usage.remaining < 0 ? '#b3261e' : pct >= 0.9 ? '#b45309' : isRn ? '#1d4ed8' : '#27ae60';
  const units = auth ? unitsUsage(auth, dayHours, todayISO) : null;
  return (
    <div style={{ marginTop: isRn ? 14 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {isRn ? <Stethoscope size={14} color="#1d4ed8" /> : <Clock size={14} color={NAVY} />}
        <span style={{ fontSize: 12.5, fontWeight: 700, color: isRn ? '#1d4ed8' : NAVY, textTransform: 'uppercase', letterSpacing: 0.4 }}>{bucketLabel(bucket)}</span>
      </div>
      <div style={statRow}>
        <div style={stat}>
          <div style={statLabel}>Authorized</div>
          <div style={statValue}>{cap == null ? '—' : fmtH(cap)}</div>
          <div style={statSub}>
            {auth && cap != null
              ? monthCapSource(auth, month) === 'override'
                ? `From the letter (PA ${auth.paNumber || '—'})`
                : `${rateLabel(auth)} (PA ${auth.paNumber || '—'})`
              : auth
                ? 'Line has no rate for this month'
                : `No ${bucketLabelLower(bucket)} line covers this month`}
          </div>
        </div>
        <div style={stat}>
          <div style={statLabel}>Used</div>
          <div style={statValue}>{fmtH(usage.used)}</div>
          <div style={statSub}>{countLabel}</div>
        </div>
        <div style={stat}>
          <div style={statLabel}>Remaining</div>
          <div style={{ ...statValue, color: usage.remaining != null && usage.remaining < 0 ? '#b3261e' : NAVY }}>
            {usage.remaining == null ? '—' : usage.remaining < 0 ? `${fmtH(-usage.remaining)} over` : fmtH(usage.remaining)}
          </div>
          <div style={statSub}>{usage.pct == null ? '' : `${Math.round(usage.pct * 100)}% used`}</div>
        </div>
        {isRn ? (
          <div style={stat}>
            <div style={statLabel}>Annual units</div>
            <div style={statValue}>{units ? fmtUnits(units.usedUnits) : '—'}</div>
            <div style={statSub}>{units ? `of ${fmtUnits(units.totalUnits)} (${fmtUnits(Math.max(0, units.remainingUnits))} left)` : 'No unit total on the line'}</div>
          </div>
        ) : (
          <div style={stat}>
            <div style={statLabel}>{isCurrent ? 'Pace' : 'Average'}</div>
            <div style={statValue}>{fmtH(usage.perDay)}<span style={{ fontSize: 12, fontWeight: 500, color: '#5c6b7a' }}> hrs/day</span></div>
            <div style={statSub}>
              {isCurrent && usage.projected != null
                ? usage.runsOutOn
                  ? `Runs out ${formatDateUS(usage.runsOutOn)} at this pace`
                  : cap != null
                    ? `On track for ${fmtH(usage.projected)} of ${fmtH(cap)} by month end`
                    : `On track for ${fmtH(usage.projected)} by month end`
                : units
                  ? `Annual units: ${fmtUnits(units.usedUnits)} of ${fmtUnits(units.totalUnits)}`
                  : ''}
            </div>
          </div>
        )}
      </div>
      {cap != null && (
        <div style={barTrack} title={`${fmtH(usage.used)} of ${fmtH(cap)} hours`}>
          <div style={{ ...barFill, width: `${Math.round(pct * 100)}%`, background: barColor }} />
        </div>
      )}
    </div>
  );
}

function MonthTable({ title: heading, bucket, months, list, dayHours, month, todayISO, onPick }: {
  title: string;
  bucket: HoursBucket;
  months: string[];
  list: HoursAuthorization[];
  dayHours: Map<string, number>;
  month: string;
  todayISO: string;
  onPick: (ym: string) => void;
}) {
  return (
    <section style={card}>
      <div style={head}>
        <div style={title}>{heading}</div>
      </div>
      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Month</th>
            <th style={{ ...th, textAlign: 'right' }}>Authorized</th>
            <th style={{ ...th, textAlign: 'right' }}>Used</th>
            <th style={{ ...th, textAlign: 'right' }}>Remaining</th>
            <th style={th}>Source</th>
          </tr>
        </thead>
        <tbody>
          {months.map((ym) => {
            const a = authForMonth(list, ym, bucket);
            const c = a ? monthCap(a, ym) : null;
            const u = monthUsage(dayHours, c, ym, todayISO);
            const over = u.remaining != null && u.remaining < 0;
            return (
              <tr key={ym} style={ym === month ? { background: '#f0f7ff' } : undefined}>
                <td style={td}>
                  <button type="button" onClick={() => onPick(ym)} style={linkBtn}>{monthLabel(ym)}</button>
                  {ym === todayISO.slice(0, 7) && <span style={nowBadge}>current</span>}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>{c == null ? '—' : fmtH(c)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{fmtH(u.used)}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: over ? '#b3261e' : NAVY }}>
                  {u.remaining == null ? '—' : over ? `${fmtH(-u.remaining)} over` : fmtH(u.remaining)}
                </td>
                <td style={{ ...td, color: '#5c6b7a' }}>
                  {a ? (monthCapSource(a, ym) === 'override' ? 'Letter' : monthCapSource(a, ym) === 'rate' ? `${rateLabel(a)} default` : '—') : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ---------------------------------------------------------------------------

interface FormProps {
  patientId: string;
  uid: string;
  existing: HoursAuthorization | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}

function AuthorizationForm({ patientId, uid, existing, onCancel, onSaved }: FormProps) {
  const [covers, setCovers] = useState<HoursBucket>(existing?.covers ?? 'shift');
  const [paNumber, setPaNumber] = useState(existing?.paNumber ?? '');
  const [serviceCode, setServiceCode] = useState(existing?.serviceCode ?? '');
  const [kind, setKind] = useState<'skilled' | 'unskilled'>(existing?.kind ?? 'skilled');
  const [rateBasis, setRateBasis] = useState<RateBasis>(existing?.rateBasis ?? 'week');
  const [rate, setRate] = useState(existing?.rateHours != null ? String(existing.rateHours) : '');
  const [totalUnits, setTotalUnits] = useState(existing?.totalUnits != null ? String(existing.totalUnits) : '');
  const [from, setFrom] = useState(existing?.from ?? '');
  const [to, setTo] = useState(existing?.to ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [overrides, setOverrides] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const [k, v] of Object.entries(existing?.monthOverrides ?? {})) o[k] = String(v);
    return o;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<'paNumber' | 'from' | 'to' | 'rate' | 'units' | null>(null);

  const rateNum = rate.trim() === '' ? null : Number(rate);
  const unitsNum = totalUnits.trim() === '' ? null : Number(totalUnits);
  const validDates = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
  const months = validDates ? monthsBetween(from, to) : [];
  const preview: HoursAuthorization = {
    patientId,
    paNumber,
    kind,
    covers,
    rateBasis,
    rateHours: rateNum != null && Number.isFinite(rateNum) ? rateNum : null,
    from,
    to,
    monthOverrides: {},
    totalUnits: null,
  };
  // Sanity hint: Therap's Total Units should equal rate x days (or months) x 4.
  const impliedHours = unitsNum != null && Number.isFinite(unitsNum) ? unitsNum / UNITS_PER_HOUR : null;

  const submit = async () => {
    setErr(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) { setFieldErr('from'); setErr('Enter the effective date.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) { setFieldErr('to'); setErr('Enter the end date.'); return; }
    if (from > to) { setFieldErr('to'); setErr('The end date is before the effective date.'); return; }
    if (rateNum != null && (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 744)) { setFieldErr('rate'); setErr('Hours must be a number between 0 and 744.'); return; }
    if (unitsNum != null && (!Number.isFinite(unitsNum) || unitsNum < 0)) { setFieldErr('units'); setErr('Total units must be a positive number.'); return; }
    const monthOverrides: Record<string, number> = {};
    for (const ym of months) {
      const raw = (overrides[ym] ?? '').trim();
      if (raw === '') continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 744) { setErr(`${monthLabel(ym)}: enter a number of hours (0 to 744) or leave it blank for the default.`); return; }
      monthOverrides[ym] = n;
    }
    if (rateNum == null && Object.keys(monthOverrides).length === 0) { setFieldErr('rate'); setErr('Enter the hours rate from the authorization, or the block hours for at least one month.'); return; }
    setFieldErr(null);
    const input: HoursAuthorizationInput = {
      patientId,
      paNumber: paNumber.trim(),
      kind,
      covers,
      rateBasis,
      rateHours: rateNum,
      from,
      to,
      monthOverrides,
      totalUnits: unitsNum,
      serviceCode: serviceCode.trim(),
      note: note.trim(),
    };
    setSaving(true);
    try {
      if (existing?.id) await updateHoursAuthorization(existing.id, input, uid);
      else await addHoursAuthorization(input, uid);
      await onSaved();
    } catch (e) {
      console.error('Save authorization failed:', e);
      setErr('Could not save the authorization. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const errStyle = (k: typeof fieldErr): CSSProperties | undefined => (fieldErr === k ? { borderColor: '#b3261e', boxShadow: '0 0 0 2px rgba(179,38,30,0.15)' } : undefined);

  return (
    <div style={formCard}>
      <div style={{ fontWeight: 700, color: NAVY, marginBottom: 10 }}>{existing ? 'Edit authorization' : 'New authorization'}</div>
      <div style={formGrid}>
        <label style={field}>
          <span style={label}>Covers</span>
          <select value={covers} onChange={(e) => setCovers(e.target.value as HoursBucket)} style={select}>
            <option value="shift">Shift hours (LPN / HHA / CNA shift notes)</option>
            <option value="oversight">RN oversight visits</option>
          </select>
        </label>
        <label style={field}>
          <span style={label}>PA #</span>
          <input value={paNumber} onChange={(e) => setPaNumber(e.target.value)} style={{ ...input, ...errStyle('paNumber') }} placeholder="126040902312" />
        </label>
        <label style={field}>
          <span style={label}>Service code</span>
          <input value={serviceCode} onChange={(e) => setServiceCode(e.target.value)} style={input} placeholder="NL1, NR1 (Therap) or blank" />
        </label>
        <label style={field}>
          <span style={label}>Type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as 'skilled' | 'unskilled')} style={select}>
            <option value="skilled">Skilled nursing</option>
            <option value="unskilled">Unskilled</option>
          </select>
        </label>
        <label style={field}>
          <span style={label}>Hours</span>
          <input type="number" min={0} max={744} step="0.25" value={rate} onChange={(e) => setRate(e.target.value)} style={{ ...input, ...errStyle('rate') }} placeholder="21" />
        </label>
        <label style={field}>
          <span style={label}>Per</span>
          <select value={rateBasis} onChange={(e) => setRateBasis(e.target.value as RateBasis)} style={select}>
            <option value="week">Week (GAPP letter)</option>
            <option value="day">Day (Therap LPN line)</option>
            <option value="month">Month (Therap RN line)</option>
          </select>
        </label>
        <label style={field}>
          <span style={label}>Effective</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...input, ...errStyle('from') }} />
        </label>
        <label style={field}>
          <span style={label}>Until</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} style={{ ...input, ...errStyle('to') }} />
        </label>
        <label style={field}>
          <span style={label} title="Therap Total Units for the whole window; 4 units = 1 hour">Total units</span>
          <input type="number" min={0} step="1" value={totalUnits} onChange={(e) => setTotalUnits(e.target.value)} style={{ ...input, ...errStyle('units') }} placeholder="5840 (Therap) or blank" />
        </label>
        <label style={{ ...field, gridColumn: '1 / -1' }}>
          <span style={label}>Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} style={input} placeholder="Letter signed 07/04/2026; determination 06/10/2026" />
        </label>
      </div>
      {impliedHours != null && (
        <div style={{ ...muted, marginTop: 6 }}>{fmtUnits(unitsNum as number)} units = {fmtH(impliedHours)} hours over the window (4 units per hour).</div>
      )}

      {months.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={label}>Hours by month</div>
          <div style={{ ...muted, marginBottom: 8 }}>
            Blank uses the default shown in grey ({rateBasis === 'week' ? 'hours per week × days in month ÷ 7' : rateBasis === 'day' ? 'hours per day × days in month' : 'the monthly figure'}).
            Type a month&apos;s number from the letter&apos;s Block Hours table to override it.
          </div>
          <div style={monthGrid}>
            {months.map((ym) => {
              const def = monthCap(preview, ym);
              return (
                <label key={ym} style={monthCell}>
                  <span style={{ fontSize: 12, color: '#5c6b7a' }}>{monthLabel(ym)}</span>
                  <input
                    type="number"
                    min={0}
                    max={744}
                    step="0.25"
                    value={overrides[ym] ?? ''}
                    placeholder={def == null ? '—' : String(def)}
                    onChange={(e) => setOverrides((o) => ({ ...o, [ym]: e.target.value }))}
                    style={{ ...input, ...(overrides[ym] ? { fontWeight: 700, color: NAVY } : null) }}
                    aria-label={`${monthLabel(ym)} hours`}
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}

      {err && <div style={{ ...errBox, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" onClick={submit} disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : existing ? 'Save changes' : 'Add authorization'}</button>
        <button type="button" onClick={onCancel} disabled={saving} style={smallBtn}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const card: CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 18, marginBottom: 14 };
const head: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 };
const title: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: NAVY };
const muted: CSSProperties = { fontSize: 13, color: '#5c6b7a', lineHeight: 1.45 };
const errBox: CSSProperties = { background: '#fdeaea', color: '#b3261e', borderRadius: 6, padding: '8px 11px', fontSize: 13, marginBottom: 12 };
const alertBase: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '9px 12px', fontSize: 13, fontWeight: 600, marginBottom: 10 };
const alertErr: CSSProperties = { ...alertBase, background: '#fdeaea', border: '1px solid #f3b8b8', color: '#b3261e' };
const alertWarn: CSSProperties = { ...alertBase, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412' };
const alertInfo: CSSProperties = { ...alertBase, background: '#eef4fb', border: '1px solid #c8def5', color: NAVY, fontWeight: 500 };
const statRow: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 };
const stat: CSSProperties = { background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px' };
const statLabel: CSSProperties = { fontSize: 11, color: '#5c6b7a', textTransform: 'uppercase', letterSpacing: 0.4 };
const statValue: CSSProperties = { fontSize: 20, fontWeight: 700, color: NAVY, marginTop: 2, fontVariantNumeric: 'tabular-nums' };
const statSub: CSSProperties = { fontSize: 11.5, color: '#5c6b7a', marginTop: 2 };
const barTrack: CSSProperties = { height: 10, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' };
const barFill: CSSProperties = { height: '100%', borderRadius: 999, transition: 'width 200ms' };
const table: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const th: CSSProperties = { textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #e5e7eb', color: '#5c6b7a', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' };
const td: CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #eef1f4', verticalAlign: 'top' };
const input: CSSProperties = { padding: '7px 10px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', color: '#2c3e50', background: 'white', width: '100%', boxSizing: 'border-box' };
const select: CSSProperties = withSelectChevron(input);
const iconBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'white', border: '1px solid #d0d7de', borderRadius: 6, padding: 6, cursor: 'pointer', color: NAVY };
const smallBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #d0d7de', borderRadius: 6, padding: '6px 10px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: NAVY, fontFamily: 'inherit' };
const primaryBtn: CSSProperties = { ...smallBtn, background: NAVY, color: 'white', borderColor: NAVY };
const linkBtn: CSSProperties = { background: 'none', border: 'none', padding: 0, color: NAVY, fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' };
const badgeBase: CSSProperties = { display: 'inline-block', marginLeft: 8, padding: '1px 7px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, verticalAlign: 'middle' };
const okBadge: CSSProperties = { ...badgeBase, background: '#e9f6f2', color: '#14544a', border: '1px solid #b9e3d8' };
const warnBadge: CSSProperties = { ...badgeBase, background: '#fff7ed', color: '#9a3412', border: '1px solid #fed7aa' };
const expiredBadge: CSSProperties = { ...badgeBase, background: '#fdeaea', color: '#b3261e', border: '1px solid #f3b8b8' };
const nowBadge: CSSProperties = { ...badgeBase, background: '#eef4fb', color: NAVY, border: '1px solid #c8def5' };
const spillBadge: CSSProperties = { ...badgeBase, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', textTransform: 'none', letterSpacing: 0, fontWeight: 600 };
const overBadge: CSSProperties = { ...badgeBase, background: '#fdeaea', color: '#b3261e', border: '1px solid #f3b8b8', textTransform: 'none', letterSpacing: 0 };
/** Blue = RN oversight, everywhere the two buckets sit side by side. */
const rnChip: CSSProperties = { ...badgeBase, marginLeft: 0, marginRight: 8, background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe' };
const shiftChip: CSSProperties = { ...badgeBase, marginLeft: 0, marginRight: 8, background: '#e9f6f2', color: '#14544a', border: '1px solid #b9e3d8' };
const authCard: CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', marginBottom: 10 };
const monthChips: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 };
const chip: CSSProperties = { fontSize: 12, padding: '3px 8px', borderRadius: 6, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#334155' };
const chipOverride: CSSProperties = { background: '#eef4fb', border: '1px solid #c8def5', color: NAVY };
const formCard: CSSProperties = { border: '1px solid #c8def5', background: '#f8fbff', borderRadius: 10, padding: 14, marginBottom: 14 };
const formGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 };
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 };
const label: CSSProperties = { fontSize: 11.5, fontWeight: 700, color: '#5c6b7a', textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' };
const billingLine: CSSProperties = { display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#334155' };
const dayTotalRow: CSSProperties = { background: '#f0f7ff' };
const credTag: CSSProperties = { display: 'inline-block', marginLeft: 6, padding: '0 5px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', verticalAlign: 'middle' };
const segmented: CSSProperties = { display: 'inline-flex', border: '1px solid #c8def5', borderRadius: 6, overflow: 'hidden', background: 'white' };
const segmentedBtn: CSSProperties = { background: 'white', color: NAVY, border: 'none', padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const segmentedActive: CSSProperties = { ...segmentedBtn, background: NAVY, color: 'white' };
const dollarsActive: CSSProperties = { ...smallBtn, background: '#166534', color: 'white', border: '1px solid #166534' };
const monthGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 };
const monthCell: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 };
