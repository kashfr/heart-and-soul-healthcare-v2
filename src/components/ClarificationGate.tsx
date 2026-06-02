'use client';

import { useEffect, useState } from 'react';
import { MessageCircleQuestion, CheckCircle2 } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { authedFetch } from '@/lib/authedFetch';
import { subscribeMyOpenClarifications, type OpenClarification } from '@/lib/clarifications';

const SESSION_CLEARED_KEY = 'clarification-gate-cleared';

function fmtDate(v: string): string {
  if (!v) return '';
  const p = v.split('-');
  return p.length === 3 ? `${p[1]}/${p[2]}/${p[0]}` : v;
}

/**
 * Blocking interstitial for nurses with open clarification requests.
 *
 * Mounts globally (in AppShell) but only renders for a signed-in nurse who has
 * at least one OPEN clarification she hasn't yet responded to. She must type a
 * response to every one before the portal unlocks. Responding doesn't resolve
 * the flag (only a reviewer resolves) — but once she's responded to all, the
 * gate steps aside for the rest of the session so she isn't re-blocked while
 * the ball is in the reviewer's court. A fresh login re-checks.
 */
export default function ClarificationGate() {
  const { user, role, loading } = useAuth();
  const [items, setItems] = useState<OpenClarification[]>([]);
  const [ready, setReady] = useState(false);
  const [clearedThisSession, setClearedThisSession] = useState(false);

  // Per-session dismissal: once she clears the gate, don't re-block mid-session.
  useEffect(() => {
    try {
      setClearedThisSession(sessionStorage.getItem(SESSION_CLEARED_KEY) === '1');
    } catch {
      /* sessionStorage unavailable — treat as not cleared */
    }
  }, []);

  // Live subscription to her open clarifications (nurses only).
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

  // Gate is active only when there's at least one item still AWAITING a response.
  const awaiting = items.filter((i) => !i.hasResponse);
  const show =
    role === 'nurse' && ready && !clearedThisSession && awaiting.length > 0;

  if (!show) return null;

  return <GateOverlay items={items} onContinue={() => {
    try { sessionStorage.setItem(SESSION_CLEARED_KEY, '1'); } catch { /* ignore */ }
    setClearedThisSession(true);
  }} />;
}

function GateOverlay({
  items,
  onContinue,
}: {
  items: OpenClarification[];
  onContinue: () => void;
}) {
  const allResponded = items.every((i) => i.hasResponse);

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
              Please respond to each one below before continuing. Your response goes back to the
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
          <div style={{ fontSize: 12.5, color: allResponded ? '#166534' : '#b45309', fontWeight: 600 }}>
            {allResponded
              ? 'All responded. You can continue.'
              : `${items.filter((i) => !i.hasResponse).length} still need a response.`}
          </div>
          <button
            type="button"
            disabled={!allResponded}
            onClick={onContinue}
            style={{
              ...continueBtn,
              ...(allResponded ? {} : { opacity: 0.5, cursor: 'not-allowed' }),
            }}
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

  async function sendResponse() {
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
        throw new Error(data.error || 'Could not send your response.');
      }
      // The live subscription updates hasResponse → card flips to the responded state.
      setText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 700, fontSize: 14, color: '#1a3a5c' }}>
        {item.clientName || 'Client'}{item.dateOfService ? ` · ${fmtDate(item.dateOfService)}` : ''}
      </div>
      <div style={questionStyle}>
        <span style={{ fontWeight: 600 }}>
          {item.flaggedByName ? `${item.flaggedByName} asks:` : 'Reviewer asks:'}
        </span>{' '}
        {item.message}
      </div>

      {item.hasResponse ? (
        <div style={respondedStyle}>
          <CheckCircle2 size={15} color="#16a34a" />
          You&apos;ve responded. Thank you — the reviewer will follow up.
        </div>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Type your response to the reviewer…"
            style={textareaStyle}
          />
          {error && <div style={errStyle}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="button"
              disabled={busy || !text.trim()}
              onClick={sendResponse}
              style={{
                ...respondBtn,
                ...(busy || !text.trim() ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
              }}
            >
              {busy ? 'Sending…' : 'Send response'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  background: 'rgba(15, 23, 42, 0.55)',
  backdropFilter: 'blur(2px)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '40px 16px',
  overflowY: 'auto',
};
const panelStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: 12,
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  width: '100%',
  maxWidth: 560,
  padding: 22,
};
const headerStyle: React.CSSProperties = { display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 };
const listStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' };
const cardStyle: React.CSSProperties = { border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 8, padding: '12px 14px' };
const questionStyle: React.CSSProperties = { fontSize: 13.5, color: '#1f2937', lineHeight: 1.5, margin: '6px 0 10px' };
const textareaStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' };
const respondedStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#166534', fontWeight: 600 };
const errStyle: React.CSSProperties = { color: '#b3261e', fontSize: 12.5, marginTop: 6 };
const footerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 18, paddingTop: 14, borderTop: '1px solid #f1f5f9' };
const continueBtn: React.CSSProperties = { background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 6, padding: '9px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const respondBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
