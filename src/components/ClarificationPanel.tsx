'use client';

import { useState } from 'react';
import { MessageCircleQuestion, CheckCircle2 } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import { clarificationMessages, type NoteClarification } from '@/lib/submissions';
import type { Role } from '@/lib/auth';

type TS = { toDate?: () => Date } | Date | null | undefined;
function fmt(ts: TS): string {
  if (!ts) return '';
  const d = ts instanceof Date ? ts : ts.toDate?.();
  return d ? d.toLocaleString() : '';
}

interface Props {
  noteId: string;
  clarification: NoteClarification | null | undefined;
  viewerRole: Role | null;
  viewerCredential?: string;
  viewerUid?: string;
  authorId?: string;
  onChanged: () => void;
}

export default function ClarificationPanel({
  noteId,
  clarification,
  viewerRole,
  viewerCredential,
  viewerUid,
  authorId,
  onChanged,
}: Props) {
  const canReview =
    viewerRole === 'admin' || viewerRole === 'supervisor' || viewerCredential === 'RN';
  const isAuthor = !!viewerUid && !!authorId && viewerUid === authorId;

  const [mode, setMode] = useState<null | 'flag' | 'respond' | 'resolve'>(null);
  // Which kind of flag the reviewer is starting (only relevant in 'flag' mode).
  const [flagKind, setFlagKind] = useState<'clarification' | 'correction'>('clarification');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpen = clarification?.status === 'open';
  const isResolved = clarification?.status === 'resolved';
  const isCorrection = clarification?.kind === 'correction';

  // Nobody to show anything to: no thread and the viewer can't start one.
  if (!clarification && !canReview) return null;

  async function submit(action: 'flag' | 'respond' | 'resolve') {
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/admin/submissions/${noteId}/clarification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, text: text.trim(), ...(action === 'flag' ? { kind: flagKind } : {}) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Request failed.');
      }
      setText('');
      setMode(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={wrapStyle} className="no-print">
      <div style={headerStyle}>
        <MessageCircleQuestion size={16} color={isOpen ? (isCorrection ? '#b3261e' : '#b45309') : '#5c6b7a'} />
        <strong style={{ fontSize: 14, color: '#2c3e50' }}>
          {clarification ? (isCorrection ? 'Correction needed' : 'Clarification') : 'Clarification / Correction'}
        </strong>
        {isOpen && <span style={isCorrection ? correctionBadge : openBadge}>Open</span>}
        {isResolved && <span style={resolvedBadge}>Resolved</span>}
      </div>

      <div style={{ padding: '0 14px 14px' }}>
        {/* No thread yet — reviewer can start one of two kinds. */}
        {!clarification && canReview && mode !== 'flag' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              style={secondaryBtn}
              onClick={() => { setFlagKind('clarification'); setMode('flag'); }}
            >
              Flag for clarification
            </button>
            <button
              type="button"
              style={correctionBtn}
              onClick={() => { setFlagKind('correction'); setMode('flag'); }}
            >
              Flag a correction
            </button>
          </div>
        )}
        {/* Open or resolved thread: show the full conversation. */}
        {clarification && (
          <div style={threadStyle}>
            {clarificationMessages(clarification).map((m, i) => {
              const fromNurse = m.byRole === 'nurse';
              return (
                <div
                  key={i}
                  style={bubbleStyle(
                    fromNurse ? '#eff6ff' : (isOpen ? '#fffbeb' : '#f8fafc'),
                    fromNurse ? '#bfdbfe' : (isOpen ? '#fde68a' : '#e2e8f0'),
                  )}
                >
                  <div style={metaStyle}>
                    {m.byName || (fromNurse ? 'Author' : 'Reviewer')} · {m.byRole} · {fmt(m.at)}
                  </div>
                  <div style={msgStyle}>{m.text}</div>
                </div>
              );
            })}

            {isResolved && (
              <div style={{ ...metaStyle, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <CheckCircle2 size={13} color="#16a34a" />
                Resolved by {clarification.resolvedByName || 'reviewer'} · {fmt(clarification.resolvedAt)}
                {clarification.resolutionNote ? ` — ${clarification.resolutionNote}` : ''}
              </div>
            )}
          </div>
        )}

        {/* Action row for an OPEN thread. */}
        {isOpen && mode === null && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {(isAuthor || canReview) && (
              <button type="button" style={secondaryBtn} onClick={() => setMode('respond')}>
                {clarificationMessages(clarification).length > 1 ? 'Add a reply' : 'Respond'}
              </button>
            )}
            {canReview && (
              <button type="button" style={primaryBtn} onClick={() => setMode('resolve')}>
                Mark resolved
              </button>
            )}
          </div>
        )}

        {/* Composer (flag / respond / resolve all share it). */}
        {mode && (
          <div style={{ marginTop: 10 }}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              rows={3}
              placeholder={
                mode === 'flag'
                  ? (flagKind === 'correction'
                      ? 'What needs to be corrected? (e.g. the date of service should be 5/24, not 6/4)'
                      : 'What would you like the author to clarify? (a question, not a change request)')
                  : mode === 'respond'
                    ? 'Add your reply…'
                    : 'Optional note on how this was resolved…'
              }
              style={textareaStyle}
            />
            {error && <div style={errStyle}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                style={ghostBtn}
                onClick={() => {
                  setMode(null);
                  setText('');
                  setError(null);
                }}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                style={{
                  ...primaryBtn,
                  ...(busy || (mode !== 'resolve' && !text.trim())
                    ? { opacity: 0.5, cursor: 'not-allowed' }
                    : {}),
                }}
                disabled={busy || (mode !== 'resolve' && !text.trim())}
                onClick={() => submit(mode)}
              >
                {busy
                  ? 'Saving…'
                  : mode === 'flag'
                    ? (flagKind === 'correction' ? 'Send correction' : 'Send flag')
                    : mode === 'respond'
                      ? 'Send response'
                      : 'Resolve'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const wrapStyle: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, background: 'white', marginTop: 20 };
const headerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px' };
const openBadge: React.CSSProperties = { background: '#fef3c7', color: '#92400e', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, padding: '1px 8px', borderRadius: 999 };
const correctionBadge: React.CSSProperties = { background: '#fee2e2', color: '#b3261e', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, padding: '1px 8px', borderRadius: 999 };
const resolvedBadge: React.CSSProperties = { background: '#dcfce7', color: '#166534', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, padding: '1px 8px', borderRadius: 999 };
const threadStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const bubbleStyle = (bg: string, border: string): React.CSSProperties => ({ background: bg, border: `1px solid ${border}`, borderRadius: 6, padding: '8px 10px' });
const metaStyle: React.CSSProperties = { fontSize: 11, color: '#64748b' };
const msgStyle: React.CSSProperties = { fontSize: 13.5, color: '#1f2937', lineHeight: 1.5, marginTop: 3, whiteSpace: 'pre-wrap' };
const textareaStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' };
const errStyle: React.CSSProperties = { color: '#b3261e', fontSize: 12.5, marginTop: 6 };
const primaryBtn: React.CSSProperties = { background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const secondaryBtn: React.CSSProperties = { background: 'white', color: '#1a3a5c', border: '1px solid #1a3a5c', borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const correctionBtn: React.CSSProperties = { background: '#b3261e', color: 'white', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const ghostBtn: React.CSSProperties = { background: 'transparent', color: '#5c6b7a', border: '1px solid #cbd5e1', borderRadius: 6, padding: '7px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };
