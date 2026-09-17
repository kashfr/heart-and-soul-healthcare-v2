'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeftRight, Check, ClipboardList } from 'lucide-react';
import { acknowledgeHandoff, subscribePendingHandoffs, type Handoff } from '@/lib/handoffs';
import { formatDateUS } from '@/lib/dateFormat';
import { FieldError, FIELD_ERROR_STYLE } from '@/lib/formEscort';

/**
 * The nurse's handoff inbox: every post from a colleague that she has not
 * yet acknowledged, live. Rendered on the portal dashboard (so it is the
 * first thing she sees after signing in) and on /admin/handoffs. One tap on
 * "Acknowledge" is the read receipt — it stamps her name and the server
 * time on the post and removes it from this list for good.
 */
export default function HandoffInbox({
  uid,
  readOnly = false,
  highlightId,
  compact = false,
  onCountChange,
}: {
  uid: string;
  /** View-as sessions preview but must not acknowledge on the nurse's behalf. */
  readOnly?: boolean;
  /** ?h= deep link from the bell: that post is outlined. */
  highlightId?: string | null;
  compact?: boolean;
  onCountChange?: (n: number) => void;
}) {
  const [items, setItems] = useState<Handoff[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** The row whose acknowledgment failed, so the message sits on that card. */
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!uid) return;
    return subscribePendingHandoffs(uid, (list, err) => {
      setLoadError(!!err);
      setItems(list);
      onCountChange?.(list.length);
    });
    // onCountChange is a fresh closure each render; the subscription is keyed to uid only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => {
    if (!highlightId || !items) return;
    const el = document.getElementById(`handoff-${highlightId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightId, items]);

  const ack = async (h: Handoff) => {
    if (!h.id || readOnly || busyId) return;
    setBusyId(h.id);
    setRowError(null);
    try {
      await acknowledgeHandoff(h.id, uid);
    } catch (err) {
      console.error('Handoff acknowledge failed:', err);
      setRowError({ id: h.id, message: "The acknowledgment couldn't be saved. Check your connection and try again." });
      document.getElementById(`handoff-${h.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } finally {
      setBusyId(null);
    }
  };

  if (!uid) return null;
  if (items === null) return <div style={mutedStyle}>Loading handoffs…</div>;
  if (loadError) {
    return (
      <div style={errBoxStyle}>
        <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
        Your handoffs couldn&apos;t be loaded. Check your connection, or ask the office if this keeps happening.
      </div>
    );
  }
  if (items.length === 0) {
    return compact ? null : (
      <div style={emptyStyle}>
        <Check size={16} /> You&apos;re caught up. New handoffs from other nurses on your clients will show up here.
      </div>
    );
  }

  return (
    <div>
      <ul style={listStyle}>
        {items.map((h) => {
          const hot = h.id === highlightId;
          const failed = rowError && rowError.id === h.id ? rowError.message : '';
          return (
            <li key={h.id} id={`handoff-${h.id}`} style={{ ...cardStyle, ...(h.urgent ? urgentCardStyle : null), ...(hot ? hotStyle : null), ...(failed ? FIELD_ERROR_STYLE : null) }}>
              <div style={cardHeadStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                  {h.urgent && (
                    <span style={urgentChipStyle}>
                      <AlertTriangle size={11} /> Urgent
                    </span>
                  )}
                  <Link href={`/admin/clients/${h.patientId}`} style={clientLinkStyle}>
                    {h.patientName || 'Client'}
                  </Link>
                  <span style={metaStyle}>
                    from {h.authorName}
                    {h.authorCredential ? `, ${h.authorCredential}` : ''} · {fmtWhen(h.createdAt)}
                    {h.shiftDate ? ` · shift ${formatDateUS(h.shiftDate)}` : ''}
                  </span>
                </div>
                {h.source === 'note' && h.sourceNoteId && (
                  <Link href={`/admin/submissions/${h.sourceNoteId}`} style={noteLinkStyle} title="Open the progress note this came from">
                    <ClipboardList size={12} /> From note
                  </Link>
                )}
              </div>
              <div style={textStyle}>{h.text}</div>
              {failed && <FieldError message={failed} />}
              <div style={cardFootStyle}>
                {readOnly ? (
                  <span style={mutedStyle}>Acknowledgment is the nurse&apos;s own action.</span>
                ) : (
                  <button
                    type="button"
                    style={{ ...ackBtnStyle, opacity: busyId === h.id ? 0.6 : 1 }}
                    disabled={busyId === h.id}
                    onClick={() => void ack(h)}
                  >
                    <Check size={14} /> {busyId === h.id ? 'Saving…' : 'Acknowledge'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function HandoffInboxTitle({ count }: { count: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <ArrowLeftRight size={16} /> Handoffs waiting for you
      {count > 0 && <span style={countChipStyle}>{count}</span>}
    </span>
  );
}

export function fmtWhen(createdAt: unknown): string {
  const ts = createdAt as { toDate?: () => Date } | null;
  const d = ts?.toDate ? ts.toDate() : null;
  if (!d) return 'just now';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
}

const NAVY = '#1a3a5c';
const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 };
const cardStyle: CSSProperties = { background: 'white', borderWidth: 1, borderStyle: 'solid', borderColor: '#dbe3ec', borderLeftWidth: 4, borderLeftColor: NAVY, borderRadius: 10, padding: '12px 14px' };
const urgentCardStyle: CSSProperties = { borderLeftColor: '#b3261e', background: '#fffafa' };
const hotStyle: CSSProperties = { boxShadow: '0 0 0 3px rgba(26,58,92,0.25)' };
const cardHeadStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 6 };
const clientLinkStyle: CSSProperties = { fontWeight: 700, color: NAVY, textDecoration: 'none', fontSize: 14 };
const metaStyle: CSSProperties = { fontSize: 12.5, color: '#5c6b7a' };
const noteLinkStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: '#5c6b7a', textDecoration: 'none', background: '#f1f5f9', padding: '3px 8px', borderRadius: 999 };
const textStyle: CSSProperties = { fontSize: 14, color: '#1f2937', lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' };
const cardFootStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-end', marginTop: 10 };
const ackBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#27ae60', color: 'white', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const urgentChipStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 8px', borderRadius: 999, background: '#fdeaea', color: '#b3261e', fontSize: 10.5, fontWeight: 700 };
const countChipStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: '#b3261e', color: 'white', fontSize: 11.5, fontWeight: 700 };
const mutedStyle: CSSProperties = { fontSize: 12.5, color: '#7f8c8d' };
const emptyStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '14px 14px', color: '#5c6b7a', fontSize: 13, background: '#f8fafc', borderRadius: 8, lineHeight: 1.5 };
const errBoxStyle: CSSProperties = { background: '#fdeaea', color: '#b3261e', borderRadius: 6, padding: '8px 11px', fontSize: 13, marginBottom: 10 };
