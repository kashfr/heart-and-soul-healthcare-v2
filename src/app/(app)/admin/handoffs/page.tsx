'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeftRight, Check, Clock, RefreshCw } from 'lucide-react';
import { useAuth, useEffectiveUser } from '@/components/AuthProvider';
import HandoffInbox, { HandoffInboxTitle, fmtWhen } from '@/components/HandoffInbox';
import { getMyHandoffs, getRecentHandoffs, type Handoff } from '@/lib/handoffs';
import { isAcknowledgedBy, summarizeAcks } from '@/lib/handoffShared';
import { formatDateUS } from '@/lib/dateFormat';

/**
 * /admin/handoffs
 * Nurse: the inbox (live, unacknowledged) plus everything she has already
 * acknowledged, for reference. Staff: every recent handoff across clients
 * with who has and hasn't acknowledged — the supervisor's "did the message
 * land" view.
 */
export default function HandoffsPage() {
  return (
    <Suspense fallback={null}>
      <HandoffsPageInner />
    </Suspense>
  );
}

function HandoffsPageInner() {
  const { user } = useAuth();
  const { uid: effectiveUid, role, isViewingAs } = useEffectiveUser();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('h');
  const isNurse = role === 'nurse';
  const uid = isNurse ? effectiveUid || '' : user?.uid || '';

  // Handoffs are clinical communication; the VA role has no business need
  // (rules deny the reads anyway).
  if (role === 'va') return null;

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <header style={headerStyle}>
          <div>
            <p style={kickerStyle}>Cross communication</p>
            <h1 style={titleStyle}>Handoffs</h1>
            <p style={subtitleStyle}>
              {isNurse
                ? 'Messages from the other nurses on your clients. Acknowledge each one after you read it; that is your read receipt.'
                : 'Every handoff posted between nurses, with who has and has not acknowledged it. Post one from a client\'s dashboard.'}
            </p>
          </div>
        </header>

        {isNurse ? (
          <NurseView uid={uid} readOnly={isViewingAs} highlightId={highlightId} />
        ) : (
          <StaffView highlightId={highlightId} />
        )}
      </div>
    </div>
  );
}

function NurseView({ uid, readOnly, highlightId }: { uid: string; readOnly: boolean; highlightId: string | null }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [history, setHistory] = useState<Handoff[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const loadHistory = useCallback(() => setReloadKey((k) => k + 1), []);

  // Reloads on demand (Retry) and whenever the pending count changes: an
  // acknowledgment moves a post from the inbox into this list.
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await getMyHandoffs(uid);
        if (cancelled) return;
        setHistory(list.filter((h) => isAcknowledgedBy(h, uid)));
        setHistoryError(false);
      } catch (err) {
        console.error('Handoff history load failed:', err);
        if (cancelled) return;
        setHistoryError(true);
        setHistory([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, reloadKey, pendingCount]);

  return (
    <>
      <section style={cardStyle}>
        <div style={sectionTitleStyle}>
          <HandoffInboxTitle count={pendingCount} />
        </div>
        <HandoffInbox uid={uid} readOnly={readOnly} highlightId={highlightId} onCountChange={setPendingCount} />
      </section>

      <section style={cardStyle}>
        <div style={sectionTitleStyle}>
          <Check size={16} /> Acknowledged
        </div>
        {history === null ? (
          <div style={mutedStyle}>Loading…</div>
        ) : historyError ? (
          <div style={errRowStyle}>
            <AlertTriangle size={14} /> Your acknowledged handoffs couldn&apos;t be loaded.
            <button type="button" style={retryBtnStyle} onClick={loadHistory}>Retry</button>
          </div>
        ) : history.length === 0 ? (
          <div style={mutedStyle}>Nothing acknowledged yet.</div>
        ) : (
          <ul style={listStyle}>
            {history.map((h) => (
              <li key={h.id} id={`handoff-${h.id}`} style={{ ...rowStyle, ...(h.id === highlightId ? hotStyle : null) }}>
                <div style={rowHeadStyle}>
                  {h.urgent && <span style={urgentChipStyle}><AlertTriangle size={11} /> Urgent</span>}
                  <Link href={`/admin/clients/${h.patientId}`} style={clientLinkStyle}>{h.patientName || 'Client'}</Link>
                  <span style={metaStyle}>
                    from {h.authorName} · {fmtWhen(h.createdAt)}{h.shiftDate ? ` · shift ${formatDateUS(h.shiftDate)}` : ''}
                  </span>
                  <span style={ackedChipStyle}><Check size={11} /> Acknowledged {fmtWhen(h.acks[uid])}</span>
                </div>
                <div style={textStyle}>{h.text}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function StaffView({ highlightId }: { highlightId: string | null }) {
  const [items, setItems] = useState<Handoff[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open'>('open');
  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getRecentHandoffs(150);
        if (cancelled) return;
        setItems(list);
        setError(false);
      } catch (err) {
        console.error('Handoffs load failed:', err);
        if (cancelled) return;
        setError(true);
        setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!highlightId || !items) return;
    document.getElementById(`handoff-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightId, items]);

  const visible = useMemo(() => {
    if (!items) return [];
    if (filter === 'all') return items;
    return items.filter((h) => h.pendingIds.length > 0 || h.id === highlightId);
  }, [items, filter, highlightId]);

  const openCount = items ? items.filter((h) => h.pendingIds.length > 0).length : 0;

  return (
    <section style={cardStyle}>
      <div style={{ ...sectionTitleStyle, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <ArrowLeftRight size={16} /> Recent handoffs
          {openCount > 0 && <span style={countChipStyle} title="Posts still waiting on at least one nurse">{openCount} open</span>}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <button type="button" style={filter === 'open' ? filterActiveStyle : filterBtnStyle} onClick={() => setFilter('open')}>Awaiting acknowledgment</button>
          <button type="button" style={filter === 'all' ? filterActiveStyle : filterBtnStyle} onClick={() => setFilter('all')}>All</button>
          <button type="button" style={filterBtnStyle} onClick={load} title="Refresh"><RefreshCw size={13} /></button>
        </span>
      </div>

      {items === null ? (
        <div style={mutedStyle}>Loading…</div>
      ) : error ? (
        <div style={errRowStyle}>
          <AlertTriangle size={14} /> Handoffs couldn&apos;t be loaded.
          <button type="button" style={retryBtnStyle} onClick={load}>Retry</button>
        </div>
      ) : visible.length === 0 ? (
        <div style={mutedStyle}>
          {filter === 'open' ? 'Every handoff has been acknowledged.' : 'No handoffs have been posted yet.'}
        </div>
      ) : (
        <ul style={listStyle}>
          {visible.map((h) => {
            const s = summarizeAcks(h);
            return (
              <li key={h.id} id={`handoff-${h.id}`} style={{ ...rowStyle, ...(h.urgent ? urgentRowStyle : null), ...(h.id === highlightId ? hotStyle : null) }}>
                <div style={rowHeadStyle}>
                  {h.urgent && <span style={urgentChipStyle}><AlertTriangle size={11} /> Urgent</span>}
                  <Link href={`/admin/clients/${h.patientId}`} style={clientLinkStyle}>{h.patientName || 'Client'}</Link>
                  <span style={metaStyle}>
                    from {h.authorName}{h.authorCredential ? `, ${h.authorCredential}` : ''} · {fmtWhen(h.createdAt)}
                    {h.shiftDate ? ` · shift ${formatDateUS(h.shiftDate)}` : ''}
                    {h.source === 'note' && h.sourceNoteId ? (
                      <> · <Link href={`/admin/submissions/${h.sourceNoteId}`} style={{ color: '#1a3a5c' }}>from note</Link></>
                    ) : null}
                  </span>
                </div>
                <div style={textStyle}>{h.text}</div>
                <div style={ackRowStyle}>
                  {s.total === 0 ? (
                    <span style={mutedStyle}>No other nurse was on the care team when this was posted.</span>
                  ) : (
                    <>
                      <span style={s.pendingNames.length ? pendingChipStyle : ackedChipStyle}>
                        {s.pendingNames.length ? <Clock size={11} /> : <Check size={11} />}
                        {s.acknowledged} of {s.total} acknowledged
                      </span>
                      {h.recipientIds.map((rid) => {
                        const acked = isAcknowledgedBy(h, rid);
                        return (
                          <span key={rid} style={acked ? personAckedStyle : personPendingStyle} title={acked ? `Acknowledged ${fmtWhen(h.acks[rid])}` : 'Not yet acknowledged'}>
                            {acked ? <Check size={10} /> : <Clock size={10} />} {h.recipientNames[rid] || 'Nurse'}
                            {acked ? ` · ${fmtWhen(h.acks[rid])}` : ''}
                          </span>
                        );
                      })}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const NAVY = '#1a3a5c';
const containerStyle: CSSProperties = { minHeight: '70vh', background: '#f5f7fa', padding: '32px 20px' };
const wrapStyle: CSSProperties = { maxWidth: 1000, margin: '0 auto' };
const headerStyle: CSSProperties = { marginBottom: 20 };
const kickerStyle: CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#27ae60', margin: 0 };
const titleStyle: CSSProperties = { fontSize: 30, color: '#2c3e50', margin: '4px 0 0' };
const subtitleStyle: CSSProperties = { color: '#7f8c8d', fontSize: 14.5, marginTop: 6, lineHeight: 1.5, maxWidth: 720 };
const cardStyle: CSSProperties = { background: 'white', borderWidth: 1, borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: 12, padding: '16px 18px', marginBottom: 16 };
const sectionTitleStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 12 };
const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 };
const rowStyle: CSSProperties = { background: 'white', borderWidth: 1, borderStyle: 'solid', borderColor: '#e5e7eb', borderLeftWidth: 4, borderLeftColor: '#cbd5e1', borderRadius: 10, padding: '12px 14px' };
const urgentRowStyle: CSSProperties = { borderLeftColor: '#b3261e', background: '#fffafa' };
const hotStyle: CSSProperties = { boxShadow: '0 0 0 3px rgba(26,58,92,0.25)' };
const rowHeadStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 };
const clientLinkStyle: CSSProperties = { fontWeight: 700, color: NAVY, textDecoration: 'none', fontSize: 14 };
const metaStyle: CSSProperties = { fontSize: 12.5, color: '#5c6b7a' };
const textStyle: CSSProperties = { fontSize: 14, color: '#1f2937', lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' };
const ackRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10 };
const urgentChipStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 8px', borderRadius: 999, background: '#fdeaea', color: '#b3261e', fontSize: 10.5, fontWeight: 700 };
const ackedChipStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 999, background: '#e6f6ec', color: '#1e7a44', fontSize: 11.5, fontWeight: 700 };
const pendingChipStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 999, background: '#fff4e0', color: '#9a5b00', fontSize: 11.5, fontWeight: 700 };
const personAckedStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: '#f1f5f9', color: '#1e7a44', fontSize: 11.5, fontWeight: 600 };
const personPendingStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: '#f1f5f9', color: '#9a5b00', fontSize: 11.5, fontWeight: 600 };
const countChipStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '1px 8px', borderRadius: 999, background: '#fff4e0', color: '#9a5b00', fontSize: 11.5, fontWeight: 700 };
const filterBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f1f5f9', color: '#475569', borderWidth: 1, borderStyle: 'solid', borderColor: '#e2e8f0', padding: '5px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const filterActiveStyle: CSSProperties = { ...filterBtnStyle, background: '#e8eef4', color: NAVY, borderColor: NAVY };
const mutedStyle: CSSProperties = { fontSize: 13, color: '#7f8c8d' };
const errRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: '#fdeaea', color: '#b3261e', borderRadius: 8, fontSize: 13, fontWeight: 600 };
const retryBtnStyle: CSSProperties = { background: 'white', color: '#b3261e', border: '1px solid #e5b6b1', padding: '4px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' };
