'use client';

import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import {
  HIGH_ACUITY_PROMPT_ACCEPT,
  HIGH_ACUITY_PROMPT_KEEP,
  HIGH_ACUITY_PROMPT_TITLE,
  highAcuityPromptParagraphs,
} from '@/lib/diagnosisCatalog';

/**
 * Shown when a family with trach or vent needs answers No to a nurse in the
 * home. That care is high acuity and GAPP requires a skilled nurse, so the No
 * is usually a misunderstanding: explain, and offer a one-tap way back. The
 * No itself is still refused by the staff stop if the family keeps it. Same
 * copy as the GAPP site's prompt (shared through the mirrored catalog).
 */
export default function HighAcuityNursePrompt({
  needs,
  subject,
  onAccept,
  onKeep,
}: {
  needs: string[];
  subject: string;
  onAccept: () => void;
  onKeep: () => void;
}) {
  const acceptRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    acceptRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onKeep();
    } else if (e.key === 'Tab') {
      // Two buttons: keep focus inside the dialog.
      e.preventDefault();
      (document.activeElement === acceptRef.current ? keepRef : acceptRef).current?.focus();
    }
  };

  return (
    <div style={backdrop} onClick={onKeep}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="high-acuity-title"
        aria-describedby="high-acuity-body"
        style={dialog}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h3 id="high-acuity-title" style={title}>
          {HIGH_ACUITY_PROMPT_TITLE}
        </h3>
        <div id="high-acuity-body" style={body}>
          {highAcuityPromptParagraphs(needs, subject).map((p) => (
            <p key={p} style={{ margin: '0 0 12px' }}>
              {p}
            </p>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <button ref={acceptRef} type="button" className="btn btn-gold btn-lg" style={{ width: '100%' }} onClick={onAccept}>
            {HIGH_ACUITY_PROMPT_ACCEPT}
          </button>
          <button ref={keepRef} type="button" className="btn btn-secondary btn-lg" style={{ width: '100%' }} onClick={onKeep}>
            {HIGH_ACUITY_PROMPT_KEEP}
          </button>
        </div>
      </div>
    </div>
  );
}

const backdrop: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: 'rgba(17, 24, 39, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const dialog: CSSProperties = {
  background: 'white',
  borderRadius: 16,
  padding: 24,
  width: '100%',
  maxWidth: 460,
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
};

const title: CSSProperties = { margin: '0 0 12px', fontSize: 20, lineHeight: 1.3, color: '#111827' };
const body: CSSProperties = { fontSize: 15, lineHeight: 1.6, color: '#374151' };
