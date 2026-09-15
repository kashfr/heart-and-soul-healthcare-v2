'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Activity, Printer } from 'lucide-react';
import { formatDateUS } from '@/lib/dateFormat';
import { getSeizureEventsForPatient, type SeizureEvent } from '@/lib/seizures';
import { CLUSTER_THRESHOLD, PROLONGED_SEIZURE_SECONDS, formatDuration } from '@/lib/seizureShared';

const NAVY = '#1a3a5c';

interface Props {
  patientId: string;
  patientName: string;
  patientDob: string;
}

/**
 * Client-dashboard seizure log for clients flagged hasSeizureDisorder:
 * 30-day summary (count, longest, last event), cluster and prolonged-seizure
 * flags, the chronological event list, and a print view in the layout of
 * the agency's paper Seizure Log.
 */
export default function SeizureLogSection({ patientId, patientName, patientDob }: Props) {
  const [events, setEvents] = useState<SeizureEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    getSeizureEventsForPatient(patientId)
      .then((list) => { if (!cancelled) setEvents(list); })
      .catch((err) => { console.error('Seizure log load failed:', err); if (!cancelled) setError('Could not load the seizure log.'); });
    return () => { cancelled = true; };
  }, [patientId]);

  const todayISO = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const start30 = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const stats = useMemo(() => {
    const list = events || [];
    const recent = list.filter((e) => e.date >= start30 && e.date <= todayISO);
    const longest = recent.reduce<number | null>((m, e) => (e.durationSeconds !== null && (m === null || e.durationSeconds > m) ? e.durationSeconds : m), null);
    const byDate = new Map<string, number>();
    for (const e of recent) byDate.set(e.date, (byDate.get(e.date) || 0) + 1);
    const clusterDays = [...byDate.entries()].filter(([, n]) => n >= CLUSTER_THRESHOLD).map(([d]) => d);
    const prolonged = recent.filter((e) => (e.durationSeconds ?? 0) >= PROLONGED_SEIZURE_SECONDS).length;
    const rescue = recent.filter((e) => e.rescueMed).length;
    const last = list[0] || null;
    return { recentCount: recent.length, longest, clusterDays, prolonged, rescue, last };
  }, [events, start30, todayISO]);

  const print = () => {
    const list = [...(events || [])].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const block = (e: SeizureEvent) => `
      <div class="entry">
        <div class="row"><b>Seizure start time:</b> ${esc(e.startTime)} &nbsp;&nbsp;&nbsp; <b>Seizure end time:</b> ${esc(e.endTime || '')}${e.durationSeconds !== null ? ` &nbsp;(${esc(formatDuration(e.durationSeconds))})` : ''}</div>
        <div class="row"><b>Type:</b> ${esc(e.seizureType)} &nbsp;&nbsp;&nbsp; <b>Witnessed by:</b> ${esc(e.witnessedBy)}</div>
        ${e.observations ? `<div class="row"><b>Observed:</b> ${esc(e.observations)}</div>` : ''}
        <div class="row"><b>Interventions:</b> ${esc(e.interventions || '')}${e.rescueMed ? `; rescue medication ${esc(e.rescueMed)}${e.rescueMedTime ? ` at ${esc(e.rescueMedTime)}` : ''}` : ''}${e.response && e.response !== 'None needed' ? `; ${esc(e.response)}` : ''}</div>
        ${e.postState || e.physicianNotified ? `<div class="row">${e.postState ? `<b>After:</b> ${esc(e.postState)}${e.minutesToBaseline ? ` (${esc(e.minutesToBaseline)} min to baseline)` : ''}` : ''}${e.physicianNotified ? ` &nbsp;&nbsp;&nbsp; <b>Physician notified:</b> ${esc(e.physicianNotified)}${e.physicianNotifiedTime ? ` at ${esc(e.physicianNotifiedTime)}` : ''}` : ''}</div>` : ''}
        ${e.notes ? `<div class="row"><b>Notes:</b> ${esc(e.notes)}</div>` : ''}
        <div class="row sig"><b>Date:</b> ${esc(formatDateUS(e.date))} &nbsp;&nbsp;&nbsp; <b>Signature:</b> ${esc(e.documentedByName)}${e.documentedByCredential ? `, ${esc(e.documentedByCredential)}` : ''} (electronically signed)</div>
      </div>`;
    const html = `<!doctype html><html><head><title>Seizure Log - ${esc(patientName)}</title>
      <style>
        body{font-family:Calibri,Arial,sans-serif;font-size:12.5px;color:#111;margin:36px}
        h1{text-align:center;font-size:20px;margin:0}
        h2{text-align:center;font-size:14px;margin:2px 0 14px;text-decoration:underline}
        .hdr{margin-bottom:14px}
        .entry{border-top:1px solid #999;padding:10px 0 12px;page-break-inside:avoid}
        .row{margin:3px 0}
        .sig{margin-top:8px}
        @media print{@page{margin:0.6in}}
      </style></head><body>
      <h1>HEART AND SOUL HEALTHCARE</h1><h2>Seizure Log</h2>
      <div class="hdr"><b>Client Name:</b> ${esc(patientName)} &nbsp;&nbsp;&nbsp;&nbsp; <b>Date of Birth:</b> ${esc(formatDateUS(patientDob))}</div>
      ${list.length === 0 ? '<div class="entry">No seizures logged.</div>' : list.map(block).join('')}
      <script>window.onload=function(){window.print()}</script></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <section style={card}>
      <div style={head}>
        <div style={title}><Activity size={16} /> Seizure log</div>
        <button type="button" onClick={print} style={printBtn} disabled={!events}>
          <Printer size={14} /> Print log
        </button>
      </div>

      {error && <div style={errBox}>{error}</div>}
      {!error && events === null && <div style={muted}>Loading...</div>}

      {events && (
        <>
          <div style={statRow}>
            <Stat label="Last 30 days" value={String(stats.recentCount)} sub={stats.recentCount === 1 ? 'seizure' : 'seizures'} />
            <Stat label="Longest (30d)" value={stats.longest !== null ? formatDuration(stats.longest) : 'n/a'} />
            <Stat label="Rescue med (30d)" value={String(stats.rescue)} sub={stats.rescue === 1 ? 'dose' : 'doses'} />
            <Stat label="Last seizure" value={stats.last ? formatDateUS(stats.last.date) : 'none logged'} sub={stats.last ? stats.last.startTime : ''} />
          </div>

          {(stats.clusterDays.length > 0 || stats.prolonged > 0) && (
            <div style={warn}>
              {stats.clusterDays.length > 0 && (
                <div>Cluster: {CLUSTER_THRESHOLD}+ seizures in one day on {stats.clusterDays.map(formatDateUS).join(', ')}.</div>
              )}
              {stats.prolonged > 0 && (
                <div>{stats.prolonged} seizure{stats.prolonged === 1 ? '' : 's'} lasted 5 minutes or longer in the last 30 days.</div>
              )}
              <div style={{ fontWeight: 400, marginTop: 2 }}>Review with the RN supervisor and confirm the neurologist has been notified.</div>
            </div>
          )}

          {events.length === 0 ? (
            <div style={muted}>No seizures logged. Every progress note for this client attests either &quot;no seizure noted&quot; or logs each seizure.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={table}>
                <thead>
                  <tr>
                    {['Date', 'Time', 'Duration', 'Type', 'Interventions', 'Response', 'Documented by'].map((h) => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} style={(e.durationSeconds ?? 0) >= PROLONGED_SEIZURE_SECONDS ? { background: '#fdeaea' } : undefined}>
                      <td style={td}>{formatDateUS(e.date)}</td>
                      <td style={td}>{e.startTime}{e.endTime ? ` to ${e.endTime}` : ''}</td>
                      <td style={td}>{formatDuration(e.durationSeconds)}</td>
                      <td style={td}>{e.seizureType}</td>
                      <td style={td}>{[e.interventions, e.rescueMed ? `rescue: ${e.rescueMed}` : ''].filter(Boolean).join('; ')}</td>
                      <td style={td}>{e.response || ''}</td>
                      <td style={td}>{e.documentedByName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={stat}>
      <div style={statLabel}>{label}</div>
      <div style={statValue}>{value}</div>
      {sub ? <div style={statSub}>{sub}</div> : null}
    </div>
  );
}

const card: CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 18, marginBottom: 14 };
const head: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 };
const title: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: NAVY };
const printBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #d0d7de', borderRadius: 6, padding: '6px 10px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: NAVY };
const statRow: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 };
const stat: CSSProperties = { background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px' };
const statLabel: CSSProperties = { fontSize: 11, color: '#5c6b7a', textTransform: 'uppercase', letterSpacing: 0.4 };
const statValue: CSSProperties = { fontSize: 18, fontWeight: 700, color: NAVY, marginTop: 2 };
const statSub: CSSProperties = { fontSize: 11.5, color: '#5c6b7a' };
const warn: CSSProperties = { background: '#fdeaea', border: '1px solid #f3b8b8', borderRadius: 8, padding: '8px 11px', fontSize: 13, color: '#b3261e', fontWeight: 600, marginBottom: 12 };
const errBox: CSSProperties = { background: '#fdeaea', color: '#b3261e', borderRadius: 6, padding: '8px 11px', fontSize: 13 };
const muted: CSSProperties = { fontSize: 13, color: '#5c6b7a' };
const table: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const th: CSSProperties = { textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #e5e7eb', color: '#5c6b7a', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' };
const td: CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #eef1f4', verticalAlign: 'top' };
