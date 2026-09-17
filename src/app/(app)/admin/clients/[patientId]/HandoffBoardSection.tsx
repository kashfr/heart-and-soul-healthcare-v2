'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { AlertTriangle, ArrowLeftRight, Check, Clock, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { acknowledgeHandoff, getHandoffsForPatient, postHandoff, type Handoff } from '@/lib/handoffs';
import { HANDOFF_TEXT_MAX, isAcknowledgedBy, isPendingFor, summarizeAcks } from '@/lib/handoffShared';
import { fmtWhen } from '@/components/HandoffInbox';
import { formatDateUS } from '@/lib/dateFormat';
import { escortToField, FieldError, FIELD_ERROR_STYLE } from '@/lib/formEscort';

/**
 * The client's handoff board (dashboard Overview). Unlike quick notes, the
 * message text is shown right on the board: a handoff exists to be read at
 * a glance by the next nurse. Each post shows who has acknowledged it and
 * who still owes an acknowledgment; a recipient can acknowledge from here
 * as well as from her inbox. Posting goes through /api/handoffs so the
 * recipient list is computed server-side from the care team.
 */

const PREVIEW_COUNT = 5;

export default function HandoffBoardSection({
  patientId,
  actor,
  canPost,
  onToast,
}: {
  patientId: string;
  actor: { uid: string; name: string };
  canPost: boolean;
  onToast: (msg: string) => void;
}) {
  const [items, setItems] = useState<Handoff[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // The parent keys this component by patientId, so a client change is a
  // full remount (no open modal or stale list can survive into another
  // chart). The cancelled flag only guards a slow response after unmount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getHandoffsForPatient(patientId);
        if (cancelled) return;
        setItems(data);
        setLoadError(false);
        setLoaded(true);
      } catch (err) {
        console.error('Handoff board load failed:', err);
        if (cancelled) return;
        setLoadError(true);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId, reloadKey]);

  const refresh = useCallback(async () => {
    setReloadKey((k) => k + 1);
  }, []);

  const ack = async (h: Handoff) => {
    if (!h.id || !actor.uid || busyId) return;
    setBusyId(h.id);
    try {
      await acknowledgeHandoff(h.id, actor.uid);
      onToast('Handoff acknowledged.');
      await refresh();
    } catch (err) {
      console.error('Handoff acknowledge failed:', err);
      onToast("The acknowledgment couldn't be saved. Try again.");
    } finally {
      setBusyId(null);
    }
  };

  const visible = showAll ? items : items.slice(0, PREVIEW_COUNT);

  return (
    <section style={cardStyle}>
      <div style={headerRowStyle}>
        <div style={titleStyle}>
          <ArrowLeftRight size={16} /> Handoffs
        </div>
        {canPost && (
          <button type="button" style={addBtnStyle} onClick={() => setModalOpen(true)} disabled={!actor.uid}>
            <Plus size={14} /> Post handoff
          </button>
        )}
      </div>

      {!loaded ? (
        <div style={emptyStyle}>Loading…</div>
      ) : loadError ? (
        <div style={errorRowStyle}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} /> Handoffs couldn&apos;t be loaded.
          <button type="button" style={retryBtnStyle} onClick={() => void refresh()}>Retry</button>
        </div>
      ) : items.length === 0 ? (
        <div style={emptyStyle}>
          No handoffs yet. Post one before you leave so the next nurse knows what to watch for. The
          next-shift plan on every progress note is posted here automatically.
        </div>
      ) : (
        <>
          <ul style={listStyle}>
            {visible.map((h) => {
              const s = summarizeAcks(h);
              const mine = isPendingFor(h, actor.uid);
              return (
                <li key={h.id} style={{ ...rowStyle, ...(h.urgent ? urgentRowStyle : null), ...(mine ? mineRowStyle : null) }}>
                  <div style={rowHeadStyle}>
                    {h.urgent && <span style={urgentChipStyle}><AlertTriangle size={11} /> Urgent</span>}
                    <span style={authorStyle}>{h.authorName}{h.authorCredential ? `, ${h.authorCredential}` : ''}</span>
                    <span style={metaStyle}>
                      {fmtWhen(h.createdAt)}
                      {h.shiftDate ? ` · shift ${formatDateUS(h.shiftDate)}` : ''}
                      {h.source === 'note' ? ' · from progress note' : ''}
                    </span>
                  </div>
                  <div style={textStyle}>{h.text}</div>
                  <div style={ackRowStyle}>
                    {s.total === 0 ? (
                      <span style={mutedStyle}>No other nurse was on the care team when this was posted.</span>
                    ) : (
                      h.recipientIds.map((rid) => {
                        const acked = isAcknowledgedBy(h, rid);
                        return (
                          <span key={rid} style={acked ? personAckedStyle : personPendingStyle} title={acked ? `Acknowledged ${fmtWhen(h.acks[rid])}` : 'Not yet acknowledged'}>
                            {acked ? <Check size={10} /> : <Clock size={10} />} {h.recipientNames[rid] || 'Nurse'}
                          </span>
                        );
                      })
                    )}
                    {mine && (
                      <button type="button" style={{ ...ackBtnStyle, opacity: busyId === h.id ? 0.6 : 1 }} disabled={busyId === h.id} onClick={() => void ack(h)}>
                        <Check size={13} /> {busyId === h.id ? 'Saving…' : 'Acknowledge'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {items.length > PREVIEW_COUNT && (
            <button type="button" style={toggleStyle} onClick={() => setShowAll((s) => !s)}>
              {showAll ? <><ChevronUp size={14} /> Show fewer</> : <><ChevronDown size={14} /> Show all ({items.length})</>}
            </button>
          )}
        </>
      )}

      {modalOpen && (
        <PostHandoffModal
          patientId={patientId}
          onClose={() => setModalOpen(false)}
          onSaved={(recipients, sms, urgent) => {
            setModalOpen(false);
            onToast(
              recipients === 0
                ? 'Handoff posted. No other nurse is on this care team yet, so no one was notified.'
                : urgent
                  ? `Urgent handoff posted. ${recipients} nurse${recipients === 1 ? '' : 's'} notified${sms > 0 ? `, ${sms} by text` : ''}.`
                  : `Handoff posted. ${recipients} nurse${recipients === 1 ? '' : 's'} notified.`,
            );
            void refresh();
          }}
        />
      )}
    </section>
  );
}

function PostHandoffModal({
  patientId,
  onClose,
  onSaved,
}: {
  patientId: string;
  onClose: () => void;
  onSaved: (recipients: number, sms: number, urgent: boolean) => void;
}) {
  const [text, setText] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [textError, setTextError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const save = async () => {
    if (busy) return;
    if (!text.trim()) {
      setTextError('Write the handoff before posting.');
      escortToField('handoff-post-text');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await postHandoff({ patientId, text, urgent, source: 'board' });
      onSaved(r.recipients, r.sms, urgent);
    } catch (err) {
      console.error('Handoff post failed:', err);
      setError(err instanceof Error && err.message ? err.message : "The handoff couldn't be posted. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <div
      style={backdropStyle}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div style={sheetStyle}>
        <div style={sheetTitleStyle}>Post a handoff</div>
        <div style={sheetHintStyle}>
          Goes to every other nurse on this client&apos;s care team. Each of them acknowledges it when
          they read it. Handoffs can&apos;t be edited after posting; post a follow-up to correct one.
        </div>

        {error && <div style={errBoxStyle}>{error}</div>}

        <div style={fieldStyle} id="handoff-post-text">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (textError) setTextError('');
            }}
            placeholder="What does the next nurse need to know?"
            rows={5}
            maxLength={HANDOFF_TEXT_MAX}
            style={{ ...textareaStyle, ...(textError ? FIELD_ERROR_STYLE : null) }}
            disabled={busy}
            aria-invalid={!!textError}
          />
          <FieldError message={textError} />
        </div>

        <label style={urgentRowLabelStyle}>
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} disabled={busy} />
          <span>
            <strong>Urgent.</strong> Also sends each nurse a text message (no client details in the text) asking
            them to sign in.
          </span>
        </label>

        <div style={actionsStyle}>
          <button type="button" style={cancelBtnStyle} onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="button"
            style={{ ...saveBtnStyle, opacity: busy ? 0.55 : 1 }}
            onClick={() => void save()}
            disabled={busy}
          >
            {busy ? 'Posting…' : 'Post handoff'}
          </button>
        </div>
      </div>
    </div>
  );
}

const NAVY = '#1a3a5c';
const cardStyle: CSSProperties = { background: 'white', borderWidth: 1, borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: 12, padding: '16px 18px', marginTop: 16 };
const headerRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 };
const titleStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 15, color: NAVY };
const addBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: NAVY, color: 'white', border: 'none', padding: '7px 13px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const emptyStyle: CSSProperties = { padding: '16px 14px', color: '#7f8c8d', fontSize: 13, background: '#f8fafc', borderRadius: 8, lineHeight: 1.5 };
const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 };
const rowStyle: CSSProperties = { background: 'white', borderWidth: 1, borderStyle: 'solid', borderColor: '#e5e7eb', borderLeftWidth: 4, borderLeftColor: '#cbd5e1', borderRadius: 10, padding: '10px 12px' };
const urgentRowStyle: CSSProperties = { borderLeftColor: '#b3261e', background: '#fffafa' };
const mineRowStyle: CSSProperties = { borderLeftColor: NAVY, background: '#f6f9fc' };
const rowHeadStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 };
const authorStyle: CSSProperties = { fontWeight: 700, fontSize: 13, color: '#2c3e50' };
const metaStyle: CSSProperties = { fontSize: 12, color: '#5c6b7a' };
const textStyle: CSSProperties = { fontSize: 13.5, color: '#1f2937', lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' };
const ackRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 };
const ackBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, background: '#27ae60', color: 'white', border: 'none', padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' };
const urgentChipStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 8px', borderRadius: 999, background: '#fdeaea', color: '#b3261e', fontSize: 10.5, fontWeight: 700 };
const personAckedStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: '#e6f6ec', color: '#1e7a44', fontSize: 11.5, fontWeight: 600 };
const personPendingStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: '#fff4e0', color: '#9a5b00', fontSize: 11.5, fontWeight: 600 };
const mutedStyle: CSSProperties = { fontSize: 12, color: '#7f8c8d' };
const toggleStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: '#5c6b7a', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginTop: 10 };
const errorRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: '#fdeaea', color: '#b3261e', borderRadius: 8, fontSize: 13, fontWeight: 600 };
const retryBtnStyle: CSSProperties = { background: 'white', color: '#b3261e', border: '1px solid #e5b6b1', padding: '4px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' };
const backdropStyle: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 3200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 16px', overflowY: 'auto' };
const sheetStyle: CSSProperties = { width: '100%', maxWidth: 500, background: 'white', borderRadius: 12, padding: 18, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' };
const sheetTitleStyle: CSSProperties = { fontWeight: 700, fontSize: 17, color: '#1f2937', marginBottom: 6 };
const sheetHintStyle: CSSProperties = { fontSize: 12.5, color: '#7f8c8d', lineHeight: 1.5, marginBottom: 12 };
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12, minWidth: 0 };
const textareaStyle: CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', minHeight: 110, lineHeight: 1.5 };
const urgentRowLabelStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: '#5c6b7a', lineHeight: 1.45, marginBottom: 14, cursor: 'pointer' };
const errBoxStyle: CSSProperties = { background: '#fdeaea', color: '#b3261e', borderRadius: 6, padding: '8px 11px', fontSize: 13, marginBottom: 10 };
const actionsStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 };
const cancelBtnStyle: CSSProperties = { background: 'white', color: '#374151', border: '1px solid #d0d7de', padding: '9px 16px', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const saveBtnStyle: CSSProperties = { background: NAVY, color: 'white', border: 'none', padding: '9px 16px', borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
