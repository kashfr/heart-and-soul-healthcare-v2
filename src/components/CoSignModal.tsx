'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import SignatureCanvas, { type SignatureCanvasHandle } from './SignatureCanvas';
import { authedFetch } from '@/lib/authedFetch';
import type { SubmissionSummary } from '@/lib/submissions';

interface CoSignModalProps {
  /** Notes the RN is co-signing. One = per-note endpoint, many = batch endpoint. */
  notes: SubmissionSummary[];
  /** Called when the modal should close (cancel or after success toast). */
  onClose: () => void;
  /** Called with the list of note IDs that were successfully cosigned. */
  onSuccess: (cosignedIds: string[]) => void;
}

/**
 * Modal for an RN to drop a single signature that's applied to one or many
 * notes. Drawing the signature ONCE and submitting applies it to every note
 * in the batch; this matches the standard EHR co-sign UX and keeps month-end
 * review fast for the RN.
 *
 * Single-note POSTs to /api/admin/submissions/[id]/cosign; multi-note POSTs
 * to /api/admin/submissions/cosign-batch with the full id list.
 */
export default function CoSignModal({ notes, onClose, onSuccess }: CoSignModalProps) {
  const sigRef = useRef<SignatureCanvasHandle>(null);
  const [signature, setSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialFailures, setPartialFailures] = useState<
    { id: string; reason: string; message: string }[]
  >([]);

  const isBatch = notes.length > 1;

  const handleClear = () => {
    sigRef.current?.clear();
    setSignature('');
  };

  const handleSubmit = async () => {
    if (!signature) {
      setError('Please draw your signature before submitting.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setPartialFailures([]);

    try {
      if (isBatch) {
        const res = await authedFetch('/api/admin/submissions/cosign-batch', {
          method: 'POST',
          body: JSON.stringify({ noteIds: notes.map((n) => n.id), signature }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Co-sign failed (${res.status}).`);
        }
        const succeeded: string[] = data.succeeded || [];
        const failed = data.failed || [];
        if (succeeded.length > 0) onSuccess(succeeded);
        if (failed.length > 0) {
          setPartialFailures(failed);
          // Stay open so the RN can see what didn't sign. The successful ones
          // are already gone from the dashboard via the onSuccess refresh.
          setSubmitting(false);
          return;
        }
        onClose();
      } else {
        const noteId = notes[0].id;
        const res = await authedFetch(`/api/admin/submissions/${noteId}/cosign`, {
          method: 'POST',
          body: JSON.stringify({ signature }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Co-sign failed (${res.status}).`);
        }
        onSuccess([noteId]);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Co-sign failed. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div style={backdropStyle} onClick={submitting ? undefined : onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={titleStyle}>{isBatch ? `Co-sign ${notes.length} notes` : 'Co-sign this note'}</h2>
          <button
            onClick={onClose}
            disabled={submitting}
            style={closeBtnStyle}
            aria-label="Close"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div style={bodyStyle}>
          <p style={introStyle}>
            By signing below you confirm you&apos;ve reviewed{' '}
            {isBatch ? `these ${notes.length} progress notes` : 'this progress note'} and are
            attesting to compliance review as a Registered Nurse. Your signature is applied
            {isBatch ? ' to all selected notes' : ''} and cannot be undone.
          </p>

          <div style={noteListStyle}>
            {notes.map((n) => (
              <div key={n.id} style={noteRowStyle}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: '#1a3a5c' }}>{n.clientName || '—'}</div>
                  <div style={{ fontSize: 12, color: '#5c6b7a' }}>
                    {n.dateOfService || '—'} · {n.nurseName || '—'}{' '}
                    <span style={{ fontWeight: 600 }}>({n.credential || '—'})</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={labelStyle}>Your signature *</label>
            <div style={canvasFrameStyle}>
              <SignatureCanvas
                ref={sigRef}
                width={500}
                height={150}
                onChange={setSignature}
                disabled={submitting}
                className=""
              />
            </div>
            <button
              type="button"
              onClick={handleClear}
              disabled={submitting || !signature}
              style={clearBtnStyle}
            >
              Clear signature
            </button>
          </div>

          {error && <div style={errorBoxStyle}>{error}</div>}

          {partialFailures.length > 0 && (
            <div style={errorBoxStyle}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                {partialFailures.length} note{partialFailures.length === 1 ? '' : 's'} couldn&apos;t be signed:
              </div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {partialFailures.map((f) => (
                  <li key={f.id} style={{ fontSize: 13 }}>
                    {f.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div style={footerStyle}>
          <button onClick={onClose} disabled={submitting} style={secondaryBtnStyle} type="button">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !signature}
            style={{ ...primaryBtnStyle, opacity: submitting || !signature ? 0.6 : 1 }}
            type="button"
          >
            {submitting ? (
              'Signing…'
            ) : (
              <>
                <CheckCircle2 size={16} />
                {isBatch ? `Sign ${notes.length} notes` : 'Sign and submit'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- styles ---

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 20,
};

const modalStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: 12,
  width: '100%',
  maxWidth: 640,
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
};

const headerStyle: React.CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid #e5e7eb',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const titleStyle: React.CSSProperties = { margin: 0, fontSize: 18, color: '#1a3a5c' };

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: '#5c6b7a',
  padding: 4,
  borderRadius: 4,
};

const bodyStyle: React.CSSProperties = {
  padding: 20,
  overflowY: 'auto',
  flex: 1,
};

const introStyle: React.CSSProperties = {
  margin: '0 0 12px',
  color: '#2c3e50',
  fontSize: 14,
  lineHeight: 1.5,
};

const noteListStyle: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 8,
  maxHeight: 200,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const noteRowStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: '8px 10px',
  display: 'flex',
  alignItems: 'center',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#5c6b7a',
  marginBottom: 6,
};

const canvasFrameStyle: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  background: 'white',
  padding: 4,
  display: 'inline-block',
};

const clearBtnStyle: React.CSSProperties = {
  marginTop: 8,
  background: 'transparent',
  color: '#1a3a5c',
  border: 'none',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  textDecoration: 'underline',
  padding: 0,
};

const errorBoxStyle: React.CSSProperties = {
  marginTop: 12,
  background: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#991b1b',
  borderRadius: 6,
  padding: 10,
  fontSize: 13,
};

const footerStyle: React.CSSProperties = {
  padding: '12px 20px',
  borderTop: '1px solid #e5e7eb',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
};

const secondaryBtnStyle: React.CSSProperties = {
  background: 'white',
  color: '#1a3a5c',
  border: '1px solid #cbd5e1',
  padding: '10px 16px',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#27ae60',
  color: 'white',
  border: 'none',
  padding: '10px 16px',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};
