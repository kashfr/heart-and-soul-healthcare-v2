'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { registerConfirmHost, type PendingConfirm } from '@/lib/confirmDialog';
import { btn, btnPrimary } from './buttons';

/**
 * Renders the questions asked through confirmAsync(). Mounted once, in the
 * root layout. Questions asked while one is open wait their turn. The dialog
 * uses divs only: /progress-note hides every <header> and <footer>.
 */
export default function ConfirmHost() {
  const [queue, setQueue] = useState<PendingConfirm[]>([]);
  const okRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const current = queue[0] ?? null;

  useEffect(() => registerConfirmHost((pending) => setQueue((q) => [...q, pending])), []);

  const answer = (ok: boolean) => {
    if (!current) return;
    current.resolve(ok);
    setQueue((q) => q.slice(1));
  };

  useEffect(() => {
    if (!current) {
      returnFocus.current?.focus?.();
      returnFocus.current = null;
      return;
    }
    if (!returnFocus.current) returnFocus.current = document.activeElement as HTMLElement | null;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        current.resolve(false);
        setQueue((q) => q.slice(1));
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [current]);

  if (!current) return null;
  return (
    <div style={backdrop}>
      <div role="alertdialog" aria-modal="true" aria-label="Please confirm" aria-describedby="confirm-host-message" style={sheet}>
        <div id="confirm-host-message" style={message}>{current.message}</div>
        <div style={actions}>
          <button type="button" className={btn} onClick={() => answer(false)}>Cancel</button>
          <button type="button" className={btnPrimary} ref={okRef} onClick={() => answer(true)}>OK</button>
        </div>
      </div>
    </div>
  );
}

const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 10000 };
const sheet: CSSProperties = { background: 'white', borderRadius: 12, padding: 22, width: '100%', maxWidth: 460, boxShadow: '0 20px 50px rgba(15, 23, 42, 0.25)' };
const message: CSSProperties = { fontSize: 15, lineHeight: 1.5, color: '#1e293b', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '60vh', overflowY: 'auto' };
const actions: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 };
