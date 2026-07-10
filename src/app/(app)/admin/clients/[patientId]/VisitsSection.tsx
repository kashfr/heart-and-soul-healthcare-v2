'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { CalendarClock, CalendarPlus, Check, History, Undo2, X } from 'lucide-react';
import {
  addVisit,
  getActiveSupervisors,
  notifyVisitAssignee,
  setVisitStatus,
  type AssigneeOption,
  type PatientVisit,
  type VisitActor,
  type VisitType,
} from '@/lib/patientVisits';
import { overdueVisits, recentResolvedVisits, scheduledBeyond, upcomingVisits } from '@/lib/clientDashboardShared';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function fmtTime(hhmm?: string): string {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

interface Props {
  patientId: string;
  visits: PatientVisit[];
  isStaff: boolean; // schedule maintenance is admin + supervisor only
  actor: VisitActor;
  careTeam: Array<{ uid: string; name: string; credential: string }>;
  onChanged: () => void;
  onToast: (msg: string) => void;
}

/**
 * Upcoming visits (phase 4). Staff maintain the schedule (add / complete /
 * cancel); the whole care team sees the next visits and anything overdue. A
 * scheduled visit whose date passed without being completed is flagged rather
 * than hidden — a silent hole in the schedule is how supervision lapses.
 */
export default function VisitsSection({ patientId, visits, isStaff, actor, careTeam, onChanged, onToast }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const today = todayISO();

  const upcoming = useMemo(() => upcomingVisits(visits, today, 5), [visits, today]);
  const moreScheduled = useMemo(() => scheduledBeyond(visits, today, 5), [visits, today]);
  const overdue = useMemo(() => overdueVisits(visits, today), [visits, today]);
  const resolved = useMemo(() => recentResolvedVisits(visits, 5), [visits]);

  const mark = async (v: PatientVisit, status: 'completed' | 'cancelled' | 'scheduled') => {
    if (!v.id) return;
    setBusyId(v.id);
    try {
      await setVisitStatus(v.id, status, actor);
      const base =
        status === 'completed' ? 'Visit marked completed.' : status === 'cancelled' ? 'Visit cancelled.' : 'Visit restored.';
      // Cancelling or restoring an assigned visit notifies the assignee
      // (text + email, PHI-free). Completion doesn't — she was there.
      if (status !== 'completed' && v.nurseId) {
        const n = await notifyVisitAssignee(v.id, status === 'cancelled' ? 'cancelled' : 'restored');
        onToast(
          n.smsOk || n.emailOk
            ? `${base} ${v.nurseName || 'The assignee'} was notified${n.smsOk && n.emailOk ? ' by text and email' : n.smsOk ? ' by text' : ' by email'}.`
            : n.skipped
              ? base
              : `${base} The notification could not be sent — let ${v.nurseName || 'the assignee'} know directly.`,
        );
      } else {
        onToast(base);
      }
      onChanged();
    } catch {
      onToast('Could not update the visit. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const renderVisit = (v: PatientVisit, isOverdue: boolean) => (
    <li key={v.id} style={{ ...rowStyle, ...(isOverdue ? overdueRowStyle : null) }}>
      <div style={dateBadgeStyle(isOverdue)}>
        <span style={{ fontSize: 11, fontWeight: 700 }}>{fmtDate(v.date)}</span>
        {v.startTime && <span style={{ fontSize: 10.5 }}>{fmtTime(v.startTime)}</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={v.type === 'supervisory' ? supChipStyle : shiftChipStyle}>
            {v.type === 'supervisory' ? 'Supervisory visit' : 'Shift'}
          </span>
          {v.nurseName && <span style={{ fontSize: 13, color: '#2c3e50', fontWeight: 600 }}>{v.nurseName}</span>}
          {isOverdue && <span style={overdueChipStyle}>Past date, not completed</span>}
        </div>
        {v.notes && <div style={notesStyle}>{v.notes}</div>}
      </div>
      {isStaff && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button type="button" onClick={() => mark(v, 'completed')} disabled={busyId === v.id} style={actionBtnStyle} title="Mark completed">
            <Check size={13} /> Done
          </button>
          <button type="button" onClick={() => mark(v, 'cancelled')} disabled={busyId === v.id} style={actionBtnStyle} title="Cancel this visit">
            <X size={13} /> Cancel
          </button>
        </div>
      )}
    </li>
  );

  return (
    <div>
      <div style={toolbarStyle}>
        <span style={hintStyle}>
          {isStaff
            ? 'Schedule shift and supervisory visits; mark them completed as they happen.'
            : 'Your scheduled visits for this client. The office maintains the schedule.'}
        </span>
        {isStaff && (
          <button type="button" onClick={() => setAddOpen(true)} style={addBtnStyle}>
            <CalendarPlus size={15} /> Add visit
          </button>
        )}
      </div>

      {overdue.length > 0 && (
        <>
          <div style={groupLabelStyle}>Needs attention</div>
          <ul style={listStyle}>{overdue.map((v) => renderVisit(v, true))}</ul>
        </>
      )}

      {upcoming.length === 0 ? (
        <div style={emptyStyle}>
          <CalendarClock size={16} style={{ marginBottom: 4 }} />
          <div>No upcoming visits scheduled{isStaff ? ' — add the next shift or supervisory visit.' : '.'}</div>
        </div>
      ) : (
        <>
          {overdue.length > 0 && <div style={groupLabelStyle}>Upcoming</div>}
          <ul style={listStyle}>{upcoming.map((v) => renderVisit(v, false))}</ul>
          {moreScheduled > 0 && (
            <div style={moreLineStyle}>
              …and {moreScheduled} more scheduled visit{moreScheduled === 1 ? '' : 's'} after these.
            </div>
          )}
        </>
      )}

      {/* Recently completed/cancelled — visible history so a mis-clicked Done or
          Cancel never silently vanishes; staff can restore it to the schedule. */}
      {resolved.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={() => setShowHistory((s) => !s)} style={historyToggleStyle}>
            <History size={13} /> {showHistory ? 'Hide' : 'Show'} recent history ({resolved.length})
          </button>
          {showHistory && (
            <ul style={{ ...listStyle, marginTop: 8 }}>
              {resolved.map((v) => (
                <li key={v.id} style={{ ...rowStyle, opacity: 0.75 }}>
                  <div style={dateBadgeStyle(false)}>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>{fmtDate(v.date)}</span>
                    {v.startTime && <span style={{ fontSize: 10.5 }}>{fmtTime(v.startTime)}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={v.type === 'supervisory' ? supChipStyle : shiftChipStyle}>
                        {v.type === 'supervisory' ? 'Supervisory visit' : 'Shift'}
                      </span>
                      <span style={v.status === 'completed' ? doneChipStyle : cancelledChipStyle}>
                        {v.status === 'completed' ? 'Completed' : 'Cancelled'}
                      </span>
                      {v.nurseName && <span style={{ fontSize: 13, color: '#2c3e50', fontWeight: 600 }}>{v.nurseName}</span>}
                    </div>
                  </div>
                  {isStaff && (
                    <button
                      type="button"
                      onClick={() => mark(v, 'scheduled')}
                      disabled={busyId === v.id}
                      style={actionBtnStyle}
                      title="Put this visit back on the schedule"
                    >
                      <Undo2 size={13} /> Restore
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {addOpen && (
        <AddVisitModal
          patientId={patientId}
          actor={actor}
          careTeam={careTeam}
          onClose={() => setAddOpen(false)}
          onAdded={async ({ visitId, assigneeUid, assigneeName }) => {
            onChanged();
            if (!assigneeUid) {
              onToast('Visit scheduled.');
              return;
            }
            // Assigned to a portal account: text + email them (PHI-free).
            const n = await notifyVisitAssignee(visitId, 'assigned');
            onToast(
              n.smsOk || n.emailOk
                ? `Visit scheduled — ${assigneeName} was notified${n.smsOk && n.emailOk ? ' by text and email' : n.smsOk ? ' by text' : ' by email'}.`
                : n.skipped
                  ? 'Visit scheduled.'
                  : `Visit scheduled, but the notification could not be sent — let ${assigneeName} know directly.`,
            );
          }}
        />
      )}
    </div>
  );
}

function AddVisitModal({
  patientId,
  actor,
  careTeam,
  onClose,
  onAdded,
}: {
  patientId: string;
  actor: VisitActor;
  careTeam: Array<{ uid: string; name: string; credential: string }>;
  onClose: () => void;
  onAdded: (added: { visitId: string; assigneeUid: string; assigneeName: string }) => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [startTime, setStartTime] = useState('');
  const [type, setType] = useState<VisitType>('shift');
  const [nurseUid, setNurseUid] = useState('');
  const [nurseFree, setNurseFree] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A supervisory visit is performed by an RN supervisor, not the client's
  // case nurse — so the assignee pool swaps with the visit type. Supervisors
  // load once per modal open (staff-only view, matching the users read rule).
  const [supervisors, setSupervisors] = useState<AssigneeOption[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    getActiveSupervisors().then((s) => {
      if (!cancelled) setSupervisors(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const supervisory = type === 'supervisory';
  const assignPool: AssigneeOption[] = supervisory ? (supervisors ?? []) : careTeam;

  const save = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Pick the visit date.');
      return;
    }
    setBusy(true);
    setError(null);
    const pick = assignPool.find((m) => m.uid === nurseUid);
    try {
      const visitId = await addVisit(
        {
          patientId,
          date,
          startTime,
          type,
          nurseId: pick?.uid || '',
          nurseName: pick ? `${pick.name}${pick.credential ? `, ${pick.credential}` : ''}` : nurseFree.trim(),
          notes,
        },
        actor,
      );
      onAdded({ visitId, assigneeUid: pick?.uid || '', assigneeName: pick?.name || '' });
      onClose();
    } catch {
      setError('Could not schedule the visit. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div style={backdropStyle} role="dialog" aria-modal="true" aria-label="Schedule a visit">
      <div style={sheetStyle}>
        <div style={sheetTitleStyle}>Schedule a visit</div>

        <div style={grid2Style}>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Date *</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          </label>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Start time</span>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inputStyle} />
          </label>
        </div>

        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>Visit type</span>
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value as VisitType);
              // The pools don't overlap (case nurses vs supervisors), so a
              // selection can't survive a type switch.
              setNurseUid('');
            }}
            style={inputStyle}
          >
            <option value="shift">Shift (regular nursing visit)</option>
            <option value="supervisory">Supervisory visit (RN supervision)</option>
          </select>
        </label>

        <div style={grid2Style}>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>{supervisory ? 'Supervisor (RN)' : 'Nurse (care team)'}</span>
            <select value={nurseUid} onChange={(e) => setNurseUid(e.target.value)} style={inputStyle}>
              <option value="">
                {supervisory && supervisors === null ? 'Loading supervisors…' : 'Not assigned yet…'}
              </option>
              {assignPool.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.name}
                  {m.credential ? `, ${m.credential}` : ''}
                </option>
              ))}
            </select>
          </label>
          {!nurseUid && (
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Or type a name</span>
              <input
                type="text"
                value={nurseFree}
                onChange={(e) => setNurseFree(e.target.value)}
                style={inputStyle}
                placeholder={supervisory ? 'e.g., contracted RN not in the portal' : 'e.g., new hire not on the team yet'}
              />
              {nurseFree.trim() !== '' && (
                <span style={{ fontSize: 12, color: '#8a6d1a', marginTop: 4 }}>
                  Typed-in assignees don&apos;t get text/email notifications (no portal account) — reach out to them directly.
                </span>
              )}
            </label>
          )}
        </div>

        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>Notes</span>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} style={inputStyle} placeholder="Optional (e.g., bring supplies, family meeting)" />
        </label>

        {error && <div style={errBoxStyle}>{error}</div>}

        <div style={actionsStyle}>
          <button type="button" style={cancelBtnStyle} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" style={saveBtnStyle} onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Schedule visit'}
          </button>
        </div>
      </div>
    </div>
  );
}

const NAVY = '#1a3a5c';
const toolbarStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 };
const hintStyle: CSSProperties = { fontSize: 12.5, color: '#7f8c8d', flex: 1, minWidth: 200 };
const addBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: NAVY, color: 'white', border: 'none', padding: '7px 13px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const groupLabelStyle: CSSProperties = { fontSize: 11.5, fontWeight: 700, color: '#8a949e', textTransform: 'uppercase', letterSpacing: 0.4, margin: '10px 0 6px' };
const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 };
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 10 };
const overdueRowStyle: CSSProperties = { background: '#fff7e6', borderColor: '#f5d9a8' };
const supChipStyle: CSSProperties = { display: 'inline-block', padding: '1px 8px', borderRadius: 999, background: '#e0e7ff', color: '#3730a3', fontSize: 10.5, fontWeight: 700 };
const shiftChipStyle: CSSProperties = { display: 'inline-block', padding: '1px 8px', borderRadius: 999, background: '#e8eef4', color: NAVY, fontSize: 10.5, fontWeight: 700 };
const overdueChipStyle: CSSProperties = { display: 'inline-block', padding: '1px 8px', borderRadius: 999, background: '#fdeaea', color: '#b3261e', fontSize: 10.5, fontWeight: 700 };
const notesStyle: CSSProperties = { fontSize: 12.5, color: '#7f8c8d', marginTop: 3 };
const moreLineStyle: CSSProperties = { fontSize: 12, color: '#8a949e', marginTop: 8, paddingLeft: 4 };
const historyToggleStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: '#5c6b7a', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 };
const doneChipStyle: CSSProperties = { display: 'inline-block', padding: '1px 8px', borderRadius: 999, background: '#e8f4e8', color: '#1e5c1e', fontSize: 10.5, fontWeight: 700 };
const cancelledChipStyle: CSSProperties = { display: 'inline-block', padding: '1px 8px', borderRadius: 999, background: '#f1f5f9', color: '#64748b', fontSize: 10.5, fontWeight: 700 };
const actionBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'white', color: '#2c3e50', border: '1px solid #d0d7de', padding: '6px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' };
const emptyStyle: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 14px', color: '#7f8c8d', fontSize: 13, textAlign: 'center', background: '#f8fafc', borderRadius: 8 };
const backdropStyle: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 3200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 16px', overflowY: 'auto' };
const sheetStyle: CSSProperties = { width: '100%', maxWidth: 480, background: 'white', borderRadius: 12, padding: 18, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' };
const sheetTitleStyle: CSSProperties = { fontWeight: 700, fontSize: 17, color: '#1f2937', marginBottom: 12 };
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12, minWidth: 0 };
const fieldLabelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#5c6b7a' };
const inputStyle: CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', height: 38 };
const grid2Style: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 };
const errBoxStyle: CSSProperties = { background: '#fdeaea', color: '#b3261e', borderRadius: 6, padding: '8px 11px', fontSize: 13, marginBottom: 10 };
const actionsStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 };
const cancelBtnStyle: CSSProperties = { background: 'white', color: '#374151', border: '1px solid #d0d7de', padding: '9px 16px', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const saveBtnStyle: CSSProperties = { background: NAVY, color: 'white', border: `1px solid ${NAVY}`, padding: '9px 16px', borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };

function dateBadgeStyle(isOverdue: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 74,
    padding: '6px 8px',
    borderRadius: 8,
    background: isOverdue ? '#fdeaea' : '#e8eef4',
    color: isOverdue ? '#b3261e' : NAVY,
    flexShrink: 0,
  };
}
