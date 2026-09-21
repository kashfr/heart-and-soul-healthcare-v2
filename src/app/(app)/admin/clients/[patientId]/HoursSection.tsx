'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, Copy, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatDateUS } from '@/lib/dateFormat';
import { withSelectChevron } from '@/lib/selectChevron';
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
  authForMonth,
  fmtH,
  hoursFindings,
  monthCap,
  monthCapSource,
  monthEndISO,
  monthLabel,
  monthStartISO,
  monthUsage,
  monthsBetween,
  splitShiftByDay,
  type HoursAuthorization,
} from '@/lib/shiftHours';

const NAVY = '#1a3a5c';

interface Props {
  patientId: string;
  patientName: string;
  /** Active notes for the client (the dashboard already loads them). */
  notes: DashboardNote[];
  uid: string;
  todayISO: string;
}

interface DayRow {
  dateISO: string;
  noteId: string;
  nurseName: string;
  window: string;
  hours: number;
  /** True when this day's hours came from a shift whose date of service is another day. */
  spill: boolean;
}

/**
 * Owner-only "Hours" tab: authorized nursing hours (from the payer's Letter
 * of Notification) against hours documented on shift notes, month by month
 * and day by day. Answers the parent's "how many hours are left this month"
 * and doubles as the billing worksheet (shifts split at midnight, so each
 * calendar day carries exactly the hours worked on it).
 */
export default function HoursSection({ patientId, patientName, notes, uid, todayISO }: Props) {
  const [auths, setAuths] = useState<HoursAuthorization[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(todayISO.slice(0, 7));
  const [editing, setEditing] = useState<HoursAuthorization | 'new' | null>(null);
  const [copied, setCopied] = useState(false);

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
    getHoursAuthorizationsForPatient(patientId)
      .then((list) => { if (!cancelled) setAuths(list); })
      .catch((err) => {
        console.error('Hours authorizations load failed:', err);
        if (!cancelled) setError('Could not load the hours authorizations.');
      });
    return () => { cancelled = true; };
  }, [patientId]);

  // Shift notes only (oversight visits are not shift work), cut at midnight.
  const dayRows = useMemo<DayRow[]>(() => {
    const rows: DayRow[] = [];
    for (const n of notes) {
      if (n.noteType === 'rn-oversight-visit') continue;
      const segs = splitShiftByDay(n);
      const endDate = n.shiftEndDate || (segs.length > 1 ? segs[segs.length - 1].dateISO : n.dateISO);
      const window =
        n.shiftStart && n.shiftEnd
          ? `${formatDateUS(n.dateISO)} ${n.shiftStart} to ${formatDateUS(endDate)} ${n.shiftEnd}`
          : `${formatDateUS(n.dateISO)} (${fmtH(parseFloat(n.totalHours) || 0)} h, no times)`;
      for (const seg of segs) {
        rows.push({ dateISO: seg.dateISO, noteId: n.id, nurseName: n.nurseName, window, hours: seg.hours, spill: seg.dateISO !== n.dateISO });
      }
    }
    return rows.sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.window.localeCompare(b.window));
  }, [notes]);

  const dayHours = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of dayRows) m.set(r.dateISO, Math.round(((m.get(r.dateISO) || 0) + r.hours) * 100) / 100);
    return m;
  }, [dayRows]);

  const list = useMemo(() => auths ?? [], [auths]);
  const auth = authForMonth(list, month);
  const cap = auth ? monthCap(auth, month) : null;
  const usage = monthUsage(dayHours, cap, month, todayISO);
  const isCurrent = month === todayISO.slice(0, 7);
  const monthRows = dayRows.filter((r) => r.dateISO >= monthStartISO(month) && r.dateISO <= monthEndISO(month));
  const findings = useMemo(() => hoursFindings(list, dayHours, todayISO), [list, dayHours, todayISO]);

  // Every month any authorization covers, so the table shows the whole story
  // (past months final, the current one in progress, future ones at zero).
  const coveredMonths = useMemo(() => {
    const set = new Set<string>();
    for (const a of list) for (const ym of monthsBetween(a.from, a.to)) set.add(ym);
    return Array.from(set).sort();
  }, [list]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  const answerText = (() => {
    const label = monthLabel(month);
    if (cap == null) return `As of ${formatDateUS(todayISO)}, ${patientName} has ${fmtH(usage.used)} documented nursing hours for ${label}. No authorized-hours figure is on file for that month.`;
    const rem = usage.remaining ?? 0;
    return `As of ${formatDateUS(todayISO)}, ${patientName} has used ${fmtH(usage.used)} of ${fmtH(cap)} authorized nursing hours for ${label}. ${rem >= 0 ? `${fmtH(rem)} hours remain.` : `That is ${fmtH(-rem)} hours over the authorization.`}`;
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
    if (!window.confirm(`Delete authorization ${a.paNumber || '(no PA #)'} (${formatDateUS(a.from)} to ${formatDateUS(a.to)})? The hours history stays; only the cap is removed.`)) return;
    try {
      await deleteHoursAuthorization(a.id);
      await reload();
    } catch (err) {
      console.error('Delete authorization failed:', err);
      setError('Could not delete the authorization.');
    }
  };

  const pct = usage.pct == null ? 0 : Math.min(1, usage.pct);
  const barColor = usage.remaining != null && usage.remaining < 0 ? '#b3261e' : pct >= 0.9 ? '#b45309' : '#27ae60';

  return (
    <div>
      {error && <div style={errBox}>{error}</div>}

      {/* Reminders: expiring / expired / nearly used up. */}
      {findings.map((f) => (
        <div key={f.message} style={f.severity === 'error' ? alertErr : alertWarn}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span>{f.message}</span>
        </div>
      ))}
      {auths && list.length === 0 && (
        <div style={alertInfo}>
          <FileText size={14} style={{ flexShrink: 0 }} />
          <span>No hours authorization on file for {patientName}. Add the Letter of Notification below and this tab will track hours used against it.</span>
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

        <div style={statRow}>
          <div style={stat}>
            <div style={statLabel}>Authorized</div>
            <div style={statValue}>{cap == null ? '—' : fmtH(cap)}</div>
            <div style={statSub}>
              {auth && cap != null
                ? monthCapSource(auth, month) === 'override'
                  ? `From the letter (PA ${auth.paNumber || '—'})`
                  : `${fmtH(auth.hoursPerWeek ?? 0)}/week default (PA ${auth.paNumber || '—'})`
                : auth
                  ? 'Authorization has no rate for this month'
                  : 'No authorization covers this month'}
            </div>
          </div>
          <div style={stat}>
            <div style={statLabel}>Used</div>
            <div style={statValue}>{fmtH(usage.used)}</div>
            <div style={statSub}>{monthRows.length} shift {monthRows.length === 1 ? 'day' : 'days'} documented</div>
          </div>
          <div style={stat}>
            <div style={statLabel}>Remaining</div>
            <div style={{ ...statValue, color: usage.remaining != null && usage.remaining < 0 ? '#b3261e' : NAVY }}>
              {usage.remaining == null ? '—' : usage.remaining < 0 ? `${fmtH(-usage.remaining)} over` : fmtH(usage.remaining)}
            </div>
            <div style={statSub}>{usage.pct == null ? '' : `${Math.round(usage.pct * 100)}% used`}</div>
          </div>
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
                : ''}
            </div>
          </div>
        </div>

        {cap != null && (
          <div style={barTrack} title={`${fmtH(usage.used)} of ${fmtH(cap)} hours`}>
            <div style={{ ...barFill, width: `${Math.round(pct * 100)}%`, background: barColor }} />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <div style={{ ...muted, flex: 1, minWidth: 240 }}>{answerText}</div>
          <button type="button" onClick={copyAnswer} style={smallBtn} title="Copy a one-line answer for the parent">
            <Copy size={13} /> {copied ? 'Copied' : 'Copy answer'}
          </button>
          <Link
            href={`/admin/submissions?view=all&range=m&m=${month}&q=${encodeURIComponent(patientName)}`}
            style={{ ...smallBtn, textDecoration: 'none' }}
            title="Open these shift notes on the Shift Notes list"
          >
            Open in Shift Notes
          </Link>
        </div>
      </section>

      {/* Day by day (billing worksheet) */}
      <section style={card}>
        <div style={head}>
          <div style={title}>Day by day, {monthLabel(month)}</div>
          <div style={muted}>Shifts crossing midnight are split; a row marked “from prior day” is the tail of an overnight shift.</div>
        </div>
        {monthRows.length === 0 ? (
          <div style={muted}>No shift notes documented for this month.</div>
        ) : (
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Nurse</th>
                <th style={th}>Shift</th>
                <th style={{ ...th, textAlign: 'right' }}>Hours</th>
                <th style={{ ...th, textAlign: 'right' }}>Running</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let running = 0;
                return monthRows.map((r, i) => {
                  running = Math.round((running + r.hours) * 100) / 100;
                  const firstOfDay = i === 0 || monthRows[i - 1].dateISO !== r.dateISO;
                  return (
                    <tr key={`${r.noteId}-${r.dateISO}`} style={firstOfDay && i > 0 ? { borderTop: '2px solid #e5e7eb' } : undefined}>
                      <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: firstOfDay ? 600 : 400, color: firstOfDay ? NAVY : '#94a3b8' }}>
                        {formatDateUS(r.dateISO)}
                        {firstOfDay && (dayHours.get(r.dateISO) ?? 0) > 24 && (
                          <span style={overBadge} title="More than 24 hours documented on one calendar day: overlapping shifts">&gt;24h</span>
                        )}
                      </td>
                      <td style={td}>{r.nurseName || '—'}</td>
                      <td style={td}>
                        <Link href={`/admin/submissions/${r.noteId}`} style={{ color: NAVY }}>{r.window}</Link>
                        {r.spill && <span style={spillBadge}>from prior day</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtH(r.hours)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#5c6b7a', fontVariantNumeric: 'tabular-nums' }}>{fmtH(running)}</td>
                    </tr>
                  );
                });
              })()}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...td, fontWeight: 700 }} colSpan={3}>Total</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtH(usage.used)}</td>
                <td style={td} />
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      {/* Month by month across the authorization window(s) */}
      {coveredMonths.length > 0 && (
        <section style={card}>
          <div style={head}>
            <div style={title}>Month by month</div>
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
              {coveredMonths.map((ym) => {
                const a = authForMonth(list, ym);
                const c = a ? monthCap(a, ym) : null;
                const u = monthUsage(dayHours, c, ym, todayISO);
                const over = u.remaining != null && u.remaining < 0;
                return (
                  <tr key={ym} style={ym === month ? { background: '#f0f7ff' } : undefined}>
                    <td style={td}>
                      <button type="button" onClick={() => setMonth(ym)} style={linkBtn}>{monthLabel(ym)}</button>
                      {ym === todayISO.slice(0, 7) && <span style={nowBadge}>current</span>}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{c == null ? '—' : fmtH(c)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtH(u.used)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: over ? '#b3261e' : NAVY }}>
                      {u.remaining == null ? '—' : over ? `${fmtH(-u.remaining)} over` : fmtH(u.remaining)}
                    </td>
                    <td style={{ ...td, color: '#5c6b7a' }}>
                      {a ? (monthCapSource(a, ym) === 'override' ? 'Letter' : monthCapSource(a, ym) === 'weekly' ? `${fmtH(a.hoursPerWeek ?? 0)}/wk default` : '—') : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
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
          Transcribe the Letter of Notification: the weekly rate fills every month by default (weekly × days in month ÷ 7);
          type the month&apos;s block hours from the letter wherever they differ. Only you can see this.
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
          return (
            <div key={a.id} style={authCard}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 700, color: NAVY, fontSize: 14 }}>
                    PA {a.paNumber || '—'} · {a.kind === 'unskilled' ? 'Unskilled' : 'Skilled'} nursing
                    <span style={daysLeft < 0 ? expiredBadge : a.from > todayISO ? nowBadge : daysLeft <= HOURS_AUTH_EXPIRY_WARN_DAYS ? warnBadge : okBadge}>{status}</span>
                  </div>
                  <div style={muted}>
                    {formatDateUS(a.from)} to {formatDateUS(a.to)}
                    {a.hoursPerWeek != null && ` · ${fmtH(a.hoursPerWeek)} hours/week`}
                    {a.note && ` · ${a.note}`}
                  </div>
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
                    <span key={ym} style={{ ...chip, ...(src === 'override' ? chipOverride : null) }} title={src === 'override' ? 'Block hours from the letter' : 'Weekly default'}>
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

interface FormProps {
  patientId: string;
  uid: string;
  existing: HoursAuthorization | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}

function AuthorizationForm({ patientId, uid, existing, onCancel, onSaved }: FormProps) {
  const [paNumber, setPaNumber] = useState(existing?.paNumber ?? '');
  const [kind, setKind] = useState<'skilled' | 'unskilled'>(existing?.kind ?? 'skilled');
  const [weekly, setWeekly] = useState(existing?.hoursPerWeek != null ? String(existing.hoursPerWeek) : '');
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
  const [fieldErr, setFieldErr] = useState<'paNumber' | 'from' | 'to' | 'weekly' | null>(null);

  const weeklyNum = weekly.trim() === '' ? null : Number(weekly);
  const validDates = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
  const months = validDates ? monthsBetween(from, to) : [];
  const preview: HoursAuthorization = {
    patientId,
    paNumber,
    kind,
    hoursPerWeek: weeklyNum != null && Number.isFinite(weeklyNum) ? weeklyNum : null,
    from,
    to,
    monthOverrides: {},
  };

  const submit = async () => {
    setErr(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) { setFieldErr('from'); setErr('Enter the effective date.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) { setFieldErr('to'); setErr('Enter the end date.'); return; }
    if (from > to) { setFieldErr('to'); setErr('The end date is before the effective date.'); return; }
    if (weeklyNum != null && (!Number.isFinite(weeklyNum) || weeklyNum < 0 || weeklyNum > 168)) { setFieldErr('weekly'); setErr('Hours per week must be between 0 and 168.'); return; }
    const monthOverrides: Record<string, number> = {};
    for (const ym of months) {
      const raw = (overrides[ym] ?? '').trim();
      if (raw === '') continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 744) { setErr(`${monthLabel(ym)}: enter a number of hours (0 to 744) or leave it blank for the default.`); return; }
      monthOverrides[ym] = n;
    }
    if (weeklyNum == null && Object.keys(monthOverrides).length === 0) { setFieldErr('weekly'); setErr('Enter the hours per week from the letter, or the block hours for at least one month.'); return; }
    setFieldErr(null);
    const input: HoursAuthorizationInput = {
      patientId,
      paNumber: paNumber.trim(),
      kind,
      hoursPerWeek: weeklyNum,
      from,
      to,
      monthOverrides,
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
          <span style={label}>PA #</span>
          <input value={paNumber} onChange={(e) => setPaNumber(e.target.value)} style={{ ...input, ...errStyle('paNumber') }} placeholder="126040902312" />
        </label>
        <label style={field}>
          <span style={label}>Type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as 'skilled' | 'unskilled')} style={select}>
            <option value="skilled">Skilled nursing</option>
            <option value="unskilled">Unskilled</option>
          </select>
        </label>
        <label style={field}>
          <span style={label}>Hours per week (from the letter)</span>
          <input type="number" min={0} max={168} step="0.25" value={weekly} onChange={(e) => setWeekly(e.target.value)} style={{ ...input, ...errStyle('weekly') }} placeholder="21" />
        </label>
        <label style={field}>
          <span style={label}>Effective</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...input, ...errStyle('from') }} />
        </label>
        <label style={field}>
          <span style={label}>Until</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} style={{ ...input, ...errStyle('to') }} />
        </label>
        <label style={{ ...field, gridColumn: '1 / -1' }}>
          <span style={label}>Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} style={input} placeholder="Letter signed 07/04/2026; determination 06/10/2026" />
        </label>
      </div>

      {months.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={label}>Block hours by month</div>
          <div style={{ ...muted, marginBottom: 8 }}>
            Blank uses the weekly default shown in grey. Type the month&apos;s number from the letter&apos;s Block Hours table to override it.
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
                    aria-label={`${monthLabel(ym)} block hours`}
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
const authCard: CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', marginBottom: 10 };
const monthChips: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 };
const chip: CSSProperties = { fontSize: 12, padding: '3px 8px', borderRadius: 6, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#334155' };
const chipOverride: CSSProperties = { background: '#eef4fb', border: '1px solid #c8def5', color: NAVY };
const formCard: CSSProperties = { border: '1px solid #c8def5', background: '#f8fbff', borderRadius: 10, padding: 14, marginBottom: 14 };
const formGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 };
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const label: CSSProperties = { fontSize: 11.5, fontWeight: 700, color: '#5c6b7a', textTransform: 'uppercase', letterSpacing: 0.3 };
const monthGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 };
const monthCell: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 };
