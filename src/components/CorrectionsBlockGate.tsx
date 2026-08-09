'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { AlertTriangle, Phone, ArrowRight, Ban } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth, useEffectiveUser } from './AuthProvider';
import { useSettings } from './SettingsProvider';
import { subscribeMyOpenClarifications, type OpenClarification } from '@/lib/clarifications';

function fmtDate(v: string): string {
  if (!v) return '';
  const p = v.split('-');
  return p.length === 3 ? `${p[1]}/${p[2]}/${p[0]}` : v;
}

/** Bare digits for a tel: URI; the display keeps the formatted string. */
function telHref(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  return digits ? `tel:+1${digits.slice(-10)}` : '';
}

/**
 * Hard stop on the progress-note form for a nurse with a BLOCKING correction
 * (or a manual admin block). Unlike ClarificationGate (portal-side, armed
 * while a flag awaits her reply), this one stays up until each blocked note is
 * actually AMENDED — a thread reply doesn't lift it. Each card routes her
 * straight into the amend flow for that note; the gate suppresses itself while
 * she is editing one of the blocked notes and on the submitted-note pages, and
 * disappears live (onSnapshot) the moment her last blocked note is amended.
 * The Firestore create rule enforces the same block server-side.
 */
export default function CorrectionsBlockGate() {
  const { loading } = useAuth();
  // Effective identity so an admin in "view as" can preview the nurse's gate.
  const { uid: effectiveUid, role: effectiveRole } = useEffectiveUser();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { settings } = useSettings();
  const [items, setItems] = useState<OpenClarification[]>([]);
  const [manualBlock, setManualBlock] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading || effectiveRole !== 'nurse' || !effectiveUid) {
      setItems([]);
      setManualBlock(false);
      setReady(true);
      return;
    }
    const unsubClar = subscribeMyOpenClarifications(effectiveUid, (next) => {
      setItems(next);
      setReady(true);
    });
    // Manual admin block lives on her own users doc (self-read is allowed).
    // Fails open on error — the Firestore create rule is the real enforcement.
    const unsubUser = onSnapshot(
      doc(db, 'users', effectiveUid),
      (snap) => setManualBlock((snap.data() || {}).manualNotesBlock === true),
      () => setManualBlock(false),
    );
    return () => {
      unsubClar();
      unsubUser();
    };
  }, [loading, effectiveRole, effectiveUid]);

  const blocking = useMemo(() => items.filter((i) => i.blocksNotes), [items]);

  // Let her work the fix: suppress while editing one of the BLOCKED notes,
  // while VIEWING a blocked note in the portal (/admin/submissions/<id> — she
  // needs to read the flag thread and hit Amend there), and on the
  // submitted-note confirmation pages. Everything else stays gated.
  const editingBlockedNote = useMemo(() => {
    const editId = searchParams?.get('edit') || '';
    return !!editId && blocking.some((b) => b.noteId === editId);
  }, [searchParams, blocking]);
  const viewingBlockedNote = useMemo(() => {
    const m = pathname?.match(/^\/admin\/submissions\/([^/]+)$/);
    return !!m && blocking.some((b) => b.noteId === m[1]);
  }, [pathname, blocking]);
  const onSubmittedPage = !!pathname && pathname.startsWith('/progress-note/submitted');

  // A MANUAL-only block (no blocking corrections) stops NEW notes but its
  // contract explicitly keeps the rest of her work available — amending
  // existing notes, replying to clarifications, charting MAR/TAR doses. So
  // the manual variant only overlays the new-documentation surfaces (the
  // dashboard and the blank note form); the create rule + submit gate remain
  // the enforcement everywhere. A corrections block keeps the full-portal
  // overlay: the fix itself is the only sanctioned work.
  const onNewNoteSurface =
    pathname === '/admin' ||
    (!!pathname &&
      pathname.startsWith('/progress-note') &&
      !onSubmittedPage &&
      !searchParams?.get('edit'));
  const manualOnly = blocking.length === 0 && manualBlock;

  if (
    effectiveRole !== 'nurse' ||
    !ready ||
    (blocking.length === 0 && !manualBlock) ||
    editingBlockedNote ||
    viewingBlockedNote ||
    onSubmittedPage ||
    (manualOnly && !onNewNoteSurface)
  ) {
    return null;
  }

  const reviewerName = settings.corrections.reviewerName;
  const reviewerPhone = settings.corrections.reviewerPhone;
  const tel = telHref(reviewerPhone);

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Corrections required">
      <div style={panelStyle}>
        <div style={headerStyle}>
          <Ban size={22} color="#b3261e" />
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#1a3a5c' }}>
              Documentation is paused — corrections required
            </div>
            <div style={{ fontSize: 13, color: '#5c6b7a', marginTop: 2 }}>
              {blocking.length > 0
                ? 'You can’t start or submit new progress notes until the note(s) below are corrected. Open each one, fix what the reviewer flagged, and save — the block lifts automatically as soon as your correction is saved.'
                : 'An administrator has paused your NEW-note documentation. You can still view and amend your existing notes and chart medications/treatments. Please contact the office.'}
            </div>
          </div>
        </div>

        {blocking.length > 0 && (
          <ol style={listStyle}>
            {blocking.map((it, idx) => (
              <li key={it.noteId} style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={numStyle}>{idx + 1}</span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#1a3a5c' }}>
                    {it.clientName || 'Client'}
                    {it.dateOfService ? ` · ${fmtDate(it.dateOfService)}` : ''}
                  </span>
                  <span style={correctionBadgeStyle}>
                    <AlertTriangle size={11} /> Must be corrected
                  </span>
                </div>
                <div style={questionStyle}>
                  <span style={{ fontWeight: 600 }}>
                    {it.flaggedByName ? `${it.flaggedByName} flagged:` : 'Reviewer flagged:'}
                  </span>{' '}
                  {it.latestReviewerMessage}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {/* Full reload (plain <a>) so the gate re-evaluates and steps
                      aside once the edit param matches this note. */}
                  <a href={`/progress-note?edit=${it.noteId}`} style={fixBtn}>
                    Fix this note <ArrowRight size={15} />
                  </a>
                </div>
              </li>
            ))}
          </ol>
        )}

        <div style={footerStyle}>
          {reviewerName || reviewerPhone ? (
            <div style={{ fontSize: 13, color: '#2c3e50', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Phone size={14} color="#0e7c4a" />
              <span>
                Questions about a correction? Call{' '}
                <strong>{reviewerName || 'the nursing supervisor'}</strong>
                {reviewerPhone ? (
                  <>
                    {' '}at{' '}
                    {tel ? (
                      <a href={tel} style={{ color: '#1a73c4', fontWeight: 700, textDecoration: 'none' }}>
                        {reviewerPhone}
                      </a>
                    ) : (
                      <strong>{reviewerPhone}</strong>
                    )}
                  </>
                ) : null}
                .
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#5c6b7a' }}>
              Questions? Contact the office.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' };
const panelStyle: React.CSSProperties = { background: 'white', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', width: '100%', maxWidth: 560, padding: 22 };
const headerStyle: React.CSSProperties = { display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 };
const listStyle: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' };
const cardStyle: React.CSSProperties = { border: '1px solid #e5e7eb', background: '#fafbfc', borderRadius: 8, padding: '12px 14px' };
const numStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: '#b3261e', color: 'white', fontSize: 11, fontWeight: 700, flexShrink: 0 };
const correctionBadgeStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fee2e2', color: '#b3261e', border: '1px solid #fca5a5', borderRadius: 999, padding: '1px 8px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 };
const questionStyle: React.CSSProperties = { fontSize: 13.5, color: '#1f2937', lineHeight: 1.5, margin: '8px 0 10px' };
const fixBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#b3261e', color: 'white', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, textDecoration: 'none', fontFamily: 'inherit' };
const footerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 18, paddingTop: 14, borderTop: '1px solid #f1f5f9' };
