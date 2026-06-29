'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, Pill, ChevronRight, Check, Inbox } from 'lucide-react';
import { getPatients, type Patient } from '@/lib/patients';
import { subscribePendingReviews, type MarChangeRequest } from '@/lib/mar';
import { authedFetch } from '@/lib/authedFetch';

function formatDOB(dob: string): string {
  if (!dob) return '';
  const d = new Date(dob + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function requestSummary(r: MarChangeRequest): string {
  if ((r.type === 'add' || r.type === 'change') && r.proposedMed) {
    const p = r.proposedMed;
    const sched = p.isPRN ? 'PRN' : (p.scheduledTimes || []).join(', ');
    const forWhat = p.isPRN && p.indication ? ` · for ${p.indication}` : '';
    return `${p.medName} ${p.dose}${p.units ? ` ${p.units}` : ''} · ${p.route}${sched ? ` · ${sched}` : ''}${forWhat}`;
  }
  if (r.type === 'discontinue') return r.targetMedName || 'medication';
  return '';
}

export default function RecordsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [requests, setRequests] = useState<MarChangeRequest[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setPatients(await getPatients());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Live queue of applied medication changes awaiting RN review. Acknowledged
  // ones drop out of the snapshot automatically once reviewStatus flips.
  useEffect(() => {
    const unsub = subscribePendingReviews(setRequests);
    return () => unsub();
  }, []);

  const handleReview = async (req: MarChangeRequest) => {
    if (!req.id) return;
    setActingId(req.id);
    try {
      const res = await authedFetch(`/api/admin/records/change-requests/${req.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setToast(data.error || 'Action failed.');
      } else {
        setToast('Marked reviewed.');
      }
    } catch {
      setToast('Action failed.');
    } finally {
      setActingId(null);
      setTimeout(() => setToast(null), 2600);
    }
  };

  // Only clients flagged "Requires MAR" appear here; not the whole roster.
  const marClients = useMemo(() => patients.filter((p) => p.requiresMar), [patients]);

  const filtered = useMemo(() => {
    if (!query.trim()) return marClients;
    const q = query.toLowerCase();
    return marClients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.diagnosis?.toLowerCase().includes(q) ||
        (p.mrn || '').includes(query.trim()),
    );
  }, [marClients, query]);

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <div style={{ marginBottom: 16 }}>
          <Link href="/admin" style={backLinkStyle}>
            <ArrowLeft size={14} /> Back to dashboard
          </Link>
        </div>

        <header style={headerStyle}>
          <div>
            <h1 style={titleStyle}>Records (MAR)</h1>
            <p style={subtitleStyle}>
              Build and manage Medication Administration Records. Clients appear here once they&apos;re marked
              {' '}
              <strong>Requires MAR</strong> on the{' '}
              <Link href="/admin/patients" style={inlineLinkStyle}>Patients</Link> screen.
            </p>
          </div>
        </header>

        {requests.length > 0 && (
          <section style={queueStyle}>
            <div style={queueHeaderStyle}>
              <Inbox size={16} /> Medication changes to review ({requests.length})
            </div>
            {requests.map((r) => (
              <div key={r.id} style={requestCardStyle}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={r.type === 'discontinue' ? dcBadgeStyle : r.type === 'change' ? changeBadgeStyle : addBadgeStyle}>
                      {r.type === 'add' ? 'Add' : r.type === 'change' ? 'Change' : 'Discontinue'}
                    </span>
                    <span style={{ fontWeight: 700, color: '#2c3e50' }}>{r.patientName}</span>
                    <span style={{ color: '#5c6b7a' }}>· {requestSummary(r)}</span>
                  </div>
                  <div style={requestMetaStyle}>
                    By {r.performedByName}
                    {r.performedByCredential ? ` (${r.performedByCredential})` : ''}
                    {r.doseRecorded ? ' · a dose was recorded on the note' : ''}
                  </div>
                  {r.reason && <div style={requestReasonStyle}>&ldquo;{r.reason}&rdquo;</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button type="button" onClick={() => handleReview(r)} disabled={actingId === r.id} style={approveBtnStyle}>
                    <Check size={14} /> Reviewed
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        <div style={toolbarStyle}>
          <div style={searchWrapStyle}>
            <Search size={16} color="#7f8c8d" />
            <input
              type="text"
              placeholder="Search MAR clients by name, diagnosis, or record #"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={searchInputStyle}
            />
          </div>
        </div>

        {loading ? (
          <div style={emptyStyle}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={emptyStyle}>
            {marClients.length === 0 ? (
              <>
                No clients require a MAR yet. Open the{' '}
                <Link href="/admin/patients" style={inlineLinkStyle}>Patients</Link> screen, edit a client, and
                check &ldquo;This client requires a MAR.&rdquo;
              </>
            ) : (
              'No MAR clients match that search.'
            )}
          </div>
        ) : (
          <div style={listStyle}>
            {filtered.map((p) => (
              <Link key={p.id} href={`/admin/records/${p.id}`} style={rowLinkStyle}>
                <div style={rowIconStyle}>
                  <Pill size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: '#2c3e50' }}>{p.name}</div>
                  <div style={rowMetaStyle}>
                    {formatDOB(p.dob)}
                    {p.diagnosis ? ` · ${p.diagnosis}` : ''}
                    {p.mrn ? ` · #${p.mrn}` : ''}
                  </div>
                </div>
                <ChevronRight size={18} color="#9aa6b2" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {toast && <div style={toastStyle}>{toast}</div>}
    </div>
  );
}

const containerStyle: React.CSSProperties = { minHeight: '70vh', background: '#f5f7fa', padding: '32px 20px' };
const wrapStyle: React.CSSProperties = { maxWidth: 1100, margin: '0 auto' };
const backLinkStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, color: '#27ae60', textDecoration: 'none', fontSize: 13, fontWeight: 600 };
const headerStyle: React.CSSProperties = { marginBottom: 20 };
const titleStyle: React.CSSProperties = { fontSize: 26, color: '#2c3e50', margin: 0 };
const subtitleStyle: React.CSSProperties = { fontSize: 13, color: '#7f8c8d', margin: '6px 0 0', maxWidth: 700, lineHeight: 1.5 };
const inlineLinkStyle: React.CSSProperties = { color: '#1a73c4', textDecoration: 'none', fontWeight: 600 };
const toolbarStyle: React.CSSProperties = { display: 'flex', gap: 10, marginBottom: 14 };
const searchWrapStyle: React.CSSProperties = { flex: 1, background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center' };
const searchInputStyle: React.CSSProperties = { flex: 1, border: 'none', outline: 'none', fontSize: 14, background: 'transparent', fontFamily: 'inherit' };
const emptyStyle: React.CSSProperties = { textAlign: 'center', padding: '48px 20px', background: 'white', borderRadius: 10, color: '#7f8c8d', fontSize: 14, border: '1px solid #e5e7eb', lineHeight: 1.6 };
const listStyle: React.CSSProperties = { background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden' };
const rowLinkStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: '1px solid #f1f3f5', textDecoration: 'none', color: 'inherit' };
const rowIconStyle: React.CSSProperties = { width: 38, height: 38, borderRadius: 8, background: '#eef5ff', color: '#1a3a5c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const rowMetaStyle: React.CSSProperties = { fontSize: 12.5, color: '#7f8c8d', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const queueStyle: React.CSSProperties = { background: 'white', border: '1px solid #fde68a', borderRadius: 10, padding: 14, marginBottom: 16 };
const queueHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 10 };
const requestCardStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderTop: '1px solid #f1f3f5', flexWrap: 'wrap' };
const requestMetaStyle: React.CSSProperties = { fontSize: 12.5, color: '#7f8c8d', marginTop: 4 };
const requestReasonStyle: React.CSSProperties = { fontSize: 13, color: '#5c6b7a', marginTop: 4, fontStyle: 'italic' };
const addBadgeStyle: React.CSSProperties = { background: '#e8f4e8', color: '#2a7a2a', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, letterSpacing: 0.4, textTransform: 'uppercase' };
const dcBadgeStyle: React.CSSProperties = { background: '#fdeaea', color: '#c0392b', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, letterSpacing: 0.4, textTransform: 'uppercase' };
const changeBadgeStyle: React.CSSProperties = { background: '#eef4fb', color: '#1a3a5c', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, letterSpacing: 0.4, textTransform: 'uppercase' };
const approveBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, background: '#27ae60', color: 'white', border: 'none', padding: '8px 12px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const toastStyle: React.CSSProperties = { position: 'fixed', bottom: 20, right: 20, background: '#2c3e50', color: 'white', padding: '10px 16px', borderRadius: 8, fontSize: 13, boxShadow: '0 8px 20px rgba(0,0,0,0.2)', zIndex: 1100 };
