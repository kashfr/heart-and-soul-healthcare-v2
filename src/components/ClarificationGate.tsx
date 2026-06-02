'use client';

import { useEffect, useMemo, useState } from 'react';
import { MessageCircleQuestion, CheckCircle2 } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { authedFetch } from '@/lib/authedFetch';
import { subscribeMyOpenClarifications, type OpenClarification } from '@/lib/clarifications';
import type { ClarificationMessage } from '@/lib/submissions';

const SESSION_CLEARED_KEY = 'clarification-gate-cleared';

function fmtDate(v: string): string {
  if (!v) return '';
  const p = v.split('-');
  return p.length === 3 ? `${p[1]}/${p[2]}/${p[0]}` : v;
}

/**
 * A per-message "signature" of what the nurse has already cleared this session,
 * keyed by noteId → latest message timestamp she dismissed. If a NEWER reviewer
 * message arrives (higher latestAt), the signature no longer matches and the
 * gate re-arms. Stored in sessionStorage so it resets on a fresh login.
 */
function readClearedMap(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_CLEARED_KEY) || '{}');
  } catch {
    return {};
  }
}
function writeClearedMap(map: Record<string, number>) {
  try {
    sessionStorage.setItem(SESSION_CLEARED_KEY, JSON.stringify(map));
  } catch {
    /* sessionStorage unavailable — gate just won't persist dismissal */
  }
}

/**
 * Blocking interstitial for nurses with a clarification awaiting their reply.
 *
 * Mounts globally (AppShell) but renders only for a signed-in nurse who has at
 * least one OPEN clarification whose latest message is from a REVIEWER (she owes
 * a reply). She must reply to each before the portal unlocks. Replying doesn't
 * resolve the flag (a reviewer resolves) — once she's replied to all, a
 * per-session, per-message dismissal lets her through, but a NEW reviewer
 * message re-arms the gate on her next navigation/login.
 */
export default function ClarificationGate() {
  const { user, role, loading } = useAuth();
  const [items, setItems] = useState<OpenClarification[]>([]);
  const [ready, setReady] = useState(false);
  const [cleared, setCleared] = useState<Record<string, number>>({});

  useEffect(() => {
    setCleared(readClearedMap());
  }, []);

  useEffect(() => {
    if (loading || role !== 'nurse' || !user) {
      setItems([]);
      setReady(true);
      return;
    }
    const unsub = subscribeMyOpenClarifications(user.uid, (next) => {
      setItems(next);
      setReady(true);
    });
    return () => unsub();
  }, [loading, role, user]);

  // Items that still need her: awaiting a reply AND not dismissed at their
  // current latest-message timestamp.
  const pending = useMemo(
    () => items.filter((it) => it.awaitsNurse && cleared[it.noteId] !== it.latestAt),
    [items, cleared],
  );

  if (role !== 'nurse' || !ready || pending.length === 0) return null;

  return (
    <GateOverlay
      items={pending}
      onContinue={() => {
        // Mark every currently-pending item cleared at its latest timestamp.
        const next = { ...cleared };
        for (const it of pending) next[it.noteId] = it.latestAt;
        writeClearedMap(next);
        setCleared(next);
      }}
    />
  );
}

function GateOverlay({
  items,
  onContinue,
}: {
  items: OpenClarification[];
  onContinue: () => void;
}) {
  // She has handled an item once its last message is no longer a reviewer's
  // (i.e. she just replied → awaitsNurse flips false on the next snapshot).
  const allReplied = items.every((i) => !i.awaitsNurse);

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Clarification requests">
      <div style={panelStyle}>
        <div style={headerStyle}>
          <MessageCircleQuestion size={22} color="#b45309" />
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#1a3a5c' }}>
              {items.length === 1
                ? 'A note needs your clarification'
                : `${items.length} notes need your clarification`}
            </div>
            <div style={{ fontSize: 13, color: '#5c6b7a', marginTop: 2 }}>
              Please reply to each one below before continuing. Your reply goes back to the
              reviewer who asked.
            </div>
          </div>
        </div>

        <div style={listStyle}>
          {items.map((it) => (
            <GateCard key={it.noteId} item={it} />
          ))}
        </div>

        <div style={footerStyle}>
          <div style={{ fontSize: 12.5, color: allReplied ? '#166534' : '#b45309', fontWeight: 600 }}>
            {allReplied
              ? 'All replied. You can continue.'
              : `${items.filter((i) => i.awaitsNurse).length} still need a reply.`}
          </div>
          <button
            type="button"
            disabled={!allReplied}
            onClick={onContinue}
            style={{ ...continueBtn, ...(allReplied ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }}
          >
            Continue to portal
          </button>
        </div>
      </div>
    </div>
  );
}

function GateCard({ item }: { item: OpenClarification }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendReply() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/admin/submissions/${item.noteId}/clarification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'respond', text: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not send your reply.');
      }
      setText('');
      // The live subscription updates awaitsNurse → card flips to the replied state.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 700, fontSize: 14, color: '#1a3a5c', marginBottom: 8 }}>
        {item.clientName || 'Client'}{item.dateOfService ? ` · ${fmtDate(item.dateOfService)}` : ''}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {item.thread.map((m, i) => (
          <MessageBubble key={i} m={m} />
        ))}
      </div>

      {item.awaitsNurse ? (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Type your reply to the reviewer…"
            style={textareaStyle}
          />
          {error && <div style={errStyle}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="button"
              disabled={busy || !text.trim()}
              onClick={sendReply}
              style={{ ...replyBtn, ...(busy || !text.trim() ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
            >
              {busy ? 'Sending…' : 'Send reply'}
            </button>
          </div>
        </div>
      ) : (
        <div style={repliedStyle}>
          <CheckCircle2 size={15} color="#16a34a" />
          You&apos;ve replied. Thank you — the reviewer will follow up.
        </div>
      )}
    </div>
  );
}

function MessageBubble({ m }: { m: ClarificationMessage }) {
  const fromNurse = m.byRole === 'nurse';
  const bg = fromNurse ? '#eff6ff' : '#fffbeb';
  const border = fromNurse ? '#bfdbfe' : '#fde68a';
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 6, padding: '7px 10px' }}>
      <div style={{ fontSize: 11, color: '#64748b' }}>
        {m.byName || (fromNurse ? 'You' : 'Reviewer')} · {m.byRole}
      </div>
      <div style={{ fontSize: 13.5, color: '#1f2937', lineHeight: 1.45, marginTop: 2, whiteSpace: 'pre-wrap' }}>
        {m.text}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' };
const panelStyle: React.CSSProperties = { background: 'white', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', width: '100%', maxWidth: 560, padding: 22 };
const headerStyle: React.CSSProperties = { display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 };
const listStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' };
const cardStyle: React.CSSProperties = { border: '1px solid #e5e7eb', background: '#fafbfc', borderRadius: 8, padding: '12px 14px' };
const textareaStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' };
const repliedStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#166534', fontWeight: 600, marginTop: 10 };
const errStyle: React.CSSProperties = { color: '#b3261e', fontSize: 12.5, marginTop: 6 };
const footerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 18, paddingTop: 14, borderTop: '1px solid #f1f5f9' };
const continueBtn: React.CSSProperties = { background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 6, padding: '9px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const replyBtn: React.CSSProperties = { background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
