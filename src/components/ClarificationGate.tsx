'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircleQuestion, AlertTriangle, ArrowRight, Eye } from 'lucide-react';
import { useAuth, useEffectiveUser } from './AuthProvider';
import { useViewAs } from './ImpersonationProvider';
import { subscribeMyOpenClarifications, type OpenClarification } from '@/lib/clarifications';

function fmtDate(v: string): string {
  if (!v) return '';
  const p = v.split('-');
  return p.length === 3 ? `${p[1]}/${p[2]}/${p[0]}` : v;
}

/**
 * Blocking task queue for a nurse with clarifications awaiting her reply.
 *
 * Mounts globally (AppShell). It does NOT let her reply inline — instead each
 * item routes her to the actual note (`/admin/submissions/<id>?clarify=1`) where
 * she reviews the chart, can edit, and replies via the clarification panel. The
 * gate suppresses itself on that note's page (so she can work on it) but blocks
 * every OTHER page until all items are replied to. Reviewers are never gated.
 */
export default function ClarificationGate() {
  const { loading } = useAuth();
  // Effective identity: the impersonated nurse when an admin is "viewing as",
  // otherwise the real signed-in user. Lets an admin preview the nurse gate.
  const { uid: effectiveUid, role: effectiveRole, isViewingAs } = useEffectiveUser();
  const { stopViewAs } = useViewAs();
  const pathname = usePathname();
  const [items, setItems] = useState<OpenClarification[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading || effectiveRole !== 'nurse' || !effectiveUid) {
      setItems([]);
      setReady(true);
      return;
    }
    const unsub = subscribeMyOpenClarifications(effectiveUid, (next) => {
      setItems(next);
      setReady(true);
    });
    return () => unsub();
  }, [loading, effectiveRole, effectiveUid]);

  // Everything still awaiting her reply, already in priority order from the lib.
  const pending = useMemo(() => items.filter((i) => i.awaitsNurse), [items]);

  // Suppress the gate on the note page she's been routed to, so she can review
  // and reply there. Path is /admin/submissions/<noteId>. We let her work on
  // ANY single note she's currently viewing — she still can't leave to other
  // pages because navigating away re-shows the gate.
  const onAPendingNotePage = useMemo(() => {
    const m = pathname?.match(/^\/admin\/submissions\/([^/]+)$/);
    const viewingId = m?.[1];
    return !!viewingId && pending.some((p) => p.noteId === viewingId);
  }, [pathname, pending]);

  if (effectiveRole !== 'nurse' || !ready || pending.length === 0 || onAPendingNotePage) return null;

  return (
    <GateQueue
      items={pending}
      isViewingAs={isViewingAs}
      onExitViewAs={() => { stopViewAs(); window.location.href = '/admin/users'; }}
    />
  );
}

function GateQueue({
  items,
  isViewingAs,
  onExitViewAs,
}: {
  items: OpenClarification[];
  isViewingAs: boolean;
  onExitViewAs: () => void;
}) {
  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Clarification requests">
      <div style={panelStyle}>
        {/* Admin escape hatch. When an admin is previewing this gate via
            "View as", the blocking overlay would otherwise trap them with no
            way out (a real nurse must reply; an admin just wants to look).
            This always-visible bar lives INSIDE the topmost layer so it can
            never be covered by the gate. */}
        {isViewingAs && (
          <div style={exitBarStyle}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Eye size={14} /> You&apos;re previewing this as an admin (read-only).
            </span>
            <button type="button" onClick={onExitViewAs} style={exitBtnStyle}>
              Exit view-as
            </button>
          </div>
        )}
        <div style={headerStyle}>
          <MessageCircleQuestion size={22} color="#b45309" />
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#1a3a5c' }}>
              {items.length === 1
                ? 'A note needs your clarification'
                : `${items.length} notes need your clarification`}
            </div>
            <div style={{ fontSize: 13, color: '#5c6b7a', marginTop: 2 }}>
              Open each note to review it and reply to the reviewer. You can&apos;t use the rest
              of the portal until you&apos;ve replied to all of them.
            </div>
          </div>
        </div>

        <ol style={listStyle}>
          {items.map((it, idx) => (
            <li key={it.noteId} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={numStyle}>{idx + 1}</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#1a3a5c' }}>
                  {it.clientName || 'Client'}{it.dateOfService ? ` · ${fmtDate(it.dateOfService)}` : ''}
                </span>
                {it.kind === 'correction' && (
                  <span style={correctionBadgeStyle}>
                    <AlertTriangle size={11} /> Correction needed
                  </span>
                )}
                {it.hasCriticalVitals && (
                  <span style={criticalBadge}>
                    <AlertTriangle size={11} /> Critical vitals
                  </span>
                )}
              </div>

              <div style={questionStyle}>
                <span style={{ fontWeight: 600 }}>
                  {it.flaggedByName
                    ? `${it.flaggedByName} ${it.kind === 'correction' ? 'flagged a correction:' : 'asks:'}`
                    : (it.kind === 'correction' ? 'Correction needed:' : 'Reviewer asks:')}
                </span>{' '}
                {it.latestReviewerMessage}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                {/* Full reload (plain <a>) so the gate re-evaluates against the new
                    path and steps aside on the destination note page. */}
                <a href={`/admin/submissions/${it.noteId}?clarify=1`} style={reviewBtn}>
                  Review note &amp; reply <ArrowRight size={15} />
                </a>
              </div>
            </li>
          ))}
        </ol>

        <div style={footerStyle}>
          <div style={{ fontSize: 12.5, color: '#b45309', fontWeight: 600 }}>
            {items.length} still need{items.length === 1 ? 's' : ''} a reply. There&apos;s no skip —
            please reply to continue.
          </div>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' };
const exitBarStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: '#7c2d12', color: '#fff', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, marginBottom: 16 };
const exitBtnStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.18)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 6, padding: '4px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' };
const panelStyle: React.CSSProperties = { background: 'white', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', width: '100%', maxWidth: 560, padding: 22 };
const headerStyle: React.CSSProperties = { display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 };
const listStyle: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' };
const cardStyle: React.CSSProperties = { border: '1px solid #e5e7eb', background: '#fafbfc', borderRadius: 8, padding: '12px 14px' };
const numStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: '#1a3a5c', color: 'white', fontSize: 11, fontWeight: 700, flexShrink: 0 };
const criticalBadge: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fef2f2', color: '#b3261e', border: '1px solid #fecaca', borderRadius: 999, padding: '1px 8px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 };
const correctionBadgeStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fee2e2', color: '#b3261e', border: '1px solid #fca5a5', borderRadius: 999, padding: '1px 8px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 };
const questionStyle: React.CSSProperties = { fontSize: 13.5, color: '#1f2937', lineHeight: 1.5, margin: '8px 0 10px' };
const reviewBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1a3a5c', color: 'white', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, textDecoration: 'none', fontFamily: 'inherit' };
const footerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 18, paddingTop: 14, borderTop: '1px solid #f1f5f9' };
