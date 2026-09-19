'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Megaphone, Check } from 'lucide-react';
import { useAuth, useEffectiveUser } from './AuthProvider';
import { subscribeActiveAnnouncements, acknowledgeAnnouncement } from '@/lib/announcements';
import { pendingAnnouncementsFor, type Announcement } from '@/lib/announcementShared';

/**
 * "What's new" modal. Shows each active announcement addressed to the
 * signed-in user's role that she has not yet clicked through, oldest first,
 * one at a time. There is no close-on-backdrop and no X: the only way past
 * it is the button, and that click is the read receipt the office sees.
 *
 * Mounted in the admin AppShell AND the progress-note wrapper, because a
 * nurse can work for weeks without opening /admin (see CorrectionsBlockGate).
 * Hidden while an admin is in "view as": the ack would be recorded under the
 * admin, not the nurse, so it must not be offered there.
 */
export default function AnnouncementGate() {
  const { loading, user } = useAuth();
  const { uid, role, isViewingAs } = useEffectiveUser();
  const [list, setList] = useState<Announcement[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Acked ids we already sent, so the modal advances even before the
  // snapshot catches up (and never re-shows one after a slow write).
  const [sent, setSent] = useState<string[]>([]);

  useEffect(() => {
    if (loading || !user) {
      setList([]);
      return;
    }
    // Fails closed to "nothing to show": an announcement is never worth
    // blocking a nurse on a permissions hiccup.
    return subscribeActiveAnnouncements(setList, () => setList([]));
  }, [loading, user]);

  const pending = useMemo(() => pendingAnnouncementsFor(list, uid, role).filter((a) => !sent.includes(a.id)), [list, uid, role, sent]);
  const current = pending[0];

  if (loading || !user || isViewingAs || !current) return null;

  const gotIt = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await acknowledgeAnnouncement(current.id);
      setSent((s) => [...s, current.id]);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not record that you read this. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="announcement-title">
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span style={iconWrap}><Megaphone size={20} /></span>
          <div>
            <div id="announcement-title" style={{ fontWeight: 800, fontSize: 19, color: '#1a3a5c', lineHeight: 1.25 }}>{current.title}</div>
            <div style={{ fontSize: 12.5, color: '#5c6b7a', marginTop: 3 }}>
              From {current.publishedByName || 'the office'}{pending.length > 1 ? ` · ${pending.length - 1} more after this` : ''}
            </div>
          </div>
        </div>

        <ol style={listStyle}>
          {current.items.map((it, i) => (
            <li key={i} style={itemStyle}>
              <span style={numStyle}>{i + 1}</span>
              <div style={{ fontSize: 14.5, color: '#1f2937', lineHeight: 1.5 }}>
                <strong style={{ color: '#1a3a5c' }}>{it.label}</strong> {it.text}
              </div>
            </li>
          ))}
        </ol>

        {current.footer && <div style={footerNoteStyle}>{current.footer}</div>}

        {error && <div role="alert" style={errorStyle}>{error}</div>}

        <div style={actionsStyle}>
          <button type="button" onClick={() => void gotIt()} disabled={busy} style={{ ...btnStyle, opacity: busy ? 0.7 : 1 }}>
            <Check size={16} /> {busy ? 'Saving…' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = { position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' };
const panelStyle: CSSProperties = { background: 'white', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', width: '100%', maxWidth: 560, padding: 22 };
const headerStyle: CSSProperties = { display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 };
const iconWrap: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, background: '#e6f4ec', color: '#0e7c4a', flexShrink: 0 };
const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 };
const itemStyle: CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start' };
const numStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: '#0e7c4a', color: 'white', fontSize: 11.5, fontWeight: 700, flexShrink: 0, marginTop: 1 };
const footerNoteStyle: CSSProperties = { marginTop: 16, padding: '10px 12px', background: '#fff7e6', border: '1px solid #f5d38a', borderRadius: 8, fontSize: 13.5, color: '#6b4a00', lineHeight: 1.45 };
const errorStyle: CSSProperties = { marginTop: 12, fontSize: 13, color: '#b3261e', fontWeight: 600 };
const actionsStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-end', marginTop: 18, paddingTop: 14, borderTop: '1px solid #f1f5f9' };
const btnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0e7c4a', color: 'white', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
