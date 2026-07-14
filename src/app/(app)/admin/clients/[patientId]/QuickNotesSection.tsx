'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { StickyNote, Plus, ChevronDown, ChevronUp, ChevronRight, AlertTriangle, X } from 'lucide-react';
import {
  addQuickNote,
  getQuickNote,
  getQuickNotesForPatient,
  QUICK_NOTE_CATEGORIES,
  quickNoteCategoryLabel,
  type QuickNote,
  type QuickNoteCategory,
} from '@/lib/quickNotes';

/**
 * Quick notes card (client dashboard, Overview tab). "Quick" describes the
 * WRITING, not the reading (owner's call): the capture modal stays one-field
 * fast, but the card itself lists metadata-only rows — no note text on the
 * dashboard — and clicking a row opens the note in a full detail view, the
 * way progress notes open from Submissions. The open note is reflected in the
 * URL (?qn=<id>) so the concern bell can deep-link straight to a note. Notes
 * are immutable; corrections are follow-up notes (button in the detail view).
 */

const PREVIEW_COUNT = 5;

interface QuickNotesSectionProps {
  patientId: string;
  actor: { uid: string; name: string };
  onToast: (msg: string) => void;
}

export default function QuickNotesSection({ patientId, actor, onToast }: QuickNotesSectionProps) {
  const [notes, setNotes] = useState<QuickNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [openNote, setOpenNote] = useState<QuickNote | null>(null);
  const patientIdRef = useRef(patientId);
  patientIdRef.current = patientId;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qnParam = searchParams.get('qn');

  const setQnParam = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set('qn', id);
      else params.delete('qn');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const openDetail = useCallback(
    (n: QuickNote) => {
      setOpenNote(n);
      if (n.id && n.id !== qnParam) setQnParam(n.id);
    },
    [qnParam, setQnParam],
  );

  const closeDetail = useCallback(() => {
    setOpenNote(null);
    if (qnParam) setQnParam(null);
    // Re-arm the deep link: without this, re-clicking the SAME concern bell
    // notification later in the session would silently no-op (the effect's
    // one-shot guard would still hold the old id).
    deepLinkHandledRef.current = null;
  }, [qnParam, setQnParam]);

  // Deep link (?qn=<id>, e.g. from the concern bell): open that note once.
  // Resolved from the loaded list when possible, otherwise fetched directly
  // (a bell link can point past the list's fetch window).
  const deepLinkHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!qnParam || !loaded || deepLinkHandledRef.current === qnParam) return;
    deepLinkHandledRef.current = qnParam;
    const inList = notes.find((n) => n.id === qnParam);
    if (inList) {
      setOpenNote(inList);
      return;
    }
    void getQuickNote(qnParam, patientId).then((n) => {
      if (n && patientIdRef.current === patientId) setOpenNote(n);
    });
  }, [qnParam, loaded, notes, patientId]);

  const refresh = useCallback(async () => {
    try {
      const data = await getQuickNotesForPatient(patientId);
      if (patientIdRef.current === patientId) {
        setNotes(data);
        setLoadError(false);
        setLoaded(true);
      }
    } catch (err) {
      // A failed read must NOT render as the "nothing jotted down" empty
      // state — for a list that can carry concerns, "couldn't load" and
      // "none exist" are very different claims.
      console.error('Quick notes load failed:', err);
      if (patientIdRef.current === patientId) {
        setLoadError(true);
        setLoaded(true);
      }
    }
  }, [patientId]);

  useEffect(() => {
    setNotes([]);
    setLoaded(false);
    setLoadError(false);
    setShowAll(false);
    // Belt to the key={patientId} remount: never let a modal opened on one
    // client survive into another client's chart (notes are immutable, so a
    // wrong-chart save can't be undone).
    setModalOpen(false);
    setOpenNote(null);
    void refresh();
  }, [refresh]);

  const visible = showAll ? notes : notes.slice(0, PREVIEW_COUNT);

  return (
    <section style={cardStyle}>
      <div style={headerRowStyle}>
        <div style={titleStyle}>
          <StickyNote size={16} /> Quick notes
        </div>
        <button
          type="button"
          style={{ ...addBtnStyle, opacity: actor.uid ? 1 : 0.55 }}
          onClick={() => setModalOpen(true)}
          disabled={!actor.uid}
        >
          <Plus size={14} /> Add quick note
        </button>
      </div>

      {!loaded ? (
        <div style={emptyStyle}>Loading…</div>
      ) : loadError ? (
        <div style={errorRowStyle}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} /> Quick notes couldn&apos;t be loaded.
          <button type="button" style={retryBtnStyle} onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      ) : notes.length === 0 ? (
        <div style={emptyStyle}>
          Nothing jotted down yet. Quick notes are for the small-but-important stuff — a post-shift
          recollection, something the physician said, a concern worth flagging.
        </div>
      ) : (
        <>
          <ul style={listStyle}>
            {visible.map((n) => (
              <li key={n.id}>
                {/* Metadata only on the dashboard (owner's call) — the note
                    itself opens in the detail view. */}
                <button
                  type="button"
                  style={n.category === 'concern' ? { ...rowBtnStyle, ...concernRowStyle } : rowBtnStyle}
                  onClick={() => openDetail(n)}
                  aria-label={`Open ${quickNoteCategoryLabel(n.category)} note by ${n.authorName}`}
                >
                  <span style={n.category === 'concern' ? concernChipStyle : chipStyle}>
                    {n.category === 'concern' && <AlertTriangle size={10} style={{ marginRight: 3 }} />}
                    {quickNoteCategoryLabel(n.category)}
                  </span>
                  <span style={rowMetaStyle}>
                    {n.authorName} · {fmtCreatedAt(n.createdAt)}
                    {n.aboutDate ? ` · about ${fmtAboutDate(n.aboutDate)}` : ''}
                  </span>
                  <ChevronRight size={15} style={{ flexShrink: 0, color: '#8a949e' }} />
                </button>
              </li>
            ))}
          </ul>
          {notes.length > PREVIEW_COUNT && (
            <button type="button" style={toggleStyle} onClick={() => setShowAll((s) => !s)}>
              {showAll ? (
                <>
                  <ChevronUp size={14} /> Show fewer
                </>
              ) : (
                <>
                  <ChevronDown size={14} /> Show all ({notes.length})
                </>
              )}
            </button>
          )}
        </>
      )}

      {openNote && (
        <QuickNoteDetail
          note={openNote}
          onClose={closeDetail}
          onFollowUp={() => {
            closeDetail();
            setModalOpen(true);
          }}
        />
      )}

      {modalOpen && (
        <AddQuickNoteModal
          patientId={patientId}
          actor={actor}
          onClose={() => setModalOpen(false)}
          onSaved={(concern, alertOk) => {
            setModalOpen(false);
            onToast(
              concern
                ? alertOk
                  ? 'Concern noted — admins and supervisors have been alerted.'
                  : 'Concern noted. The staff alert could not be sent — mention it directly.'
                : 'Quick note saved.',
            );
            void refresh();
          }}
        />
      )}
    </section>
  );
}

function QuickNoteDetail({
  note,
  onClose,
  onFollowUp,
}: {
  note: QuickNote;
  onClose: () => void;
  onFollowUp: () => void;
}) {
  const concern = note.category === 'concern';
  return (
    <div
      style={backdropStyle}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={{ ...sheetStyle, maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={concern ? concernChipStyle : chipStyle}>
              {concern && <AlertTriangle size={10} style={{ marginRight: 3 }} />}
              {quickNoteCategoryLabel(note.category)}
            </span>
            <span style={sheetTitleStyle}>Quick note</span>
          </div>
          <button type="button" onClick={onClose} style={detailCloseBtnStyle} aria-label="Close note">
            <X size={16} />
          </button>
        </div>

        <div style={detailMetaGridStyle}>
          <div>
            <div style={detailMetaLabelStyle}>Written by</div>
            <div style={detailMetaValueStyle}>{note.authorName || '-'}</div>
          </div>
          <div>
            <div style={detailMetaLabelStyle}>Documented</div>
            <div style={detailMetaValueStyle}>{fmtCreatedAtFull(note.createdAt)}</div>
          </div>
          <div>
            <div style={detailMetaLabelStyle}>About</div>
            <div style={detailMetaValueStyle}>
              {note.aboutDate ? fmtAboutDate(note.aboutDate) : 'Not specified'}
            </div>
          </div>
        </div>

        <div style={detailTextStyle}>{note.text}</div>

        <div style={detailFootnoteStyle}>
          Quick notes are part of the record and can&apos;t be edited or deleted. To correct or
          expand on this note, add a follow-up note.
        </div>

        <div style={actionsStyle}>
          <button type="button" style={cancelBtnStyle} onClick={onClose}>
            Close
          </button>
          <button type="button" style={saveBtnStyle} onClick={onFollowUp}>
            Add follow-up note
          </button>
        </div>
      </div>
    </div>
  );
}

function AddQuickNoteModal({
  patientId,
  actor,
  onClose,
  onSaved,
}: {
  patientId: string;
  actor: { uid: string; name: string };
  onClose: () => void;
  onSaved: (concern: boolean, alertOk: boolean) => void;
}) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState<QuickNoteCategory | ''>('');
  const [aboutDate, setAboutDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    const chosen: QuickNoteCategory = category || 'other';
    try {
      const result = await addQuickNote({
        patientId,
        authorId: actor.uid,
        authorName: actor.name,
        text,
        category: chosen,
        aboutDate: aboutDate || undefined,
      });
      onSaved(chosen === 'concern', result.concernAlertOk);
    } catch (err) {
      console.error('Quick note save failed:', err);
      setError("The note couldn't be saved. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    // Close on mousedown that ORIGINATES on the backdrop — a text-selection
    // drag that starts in the textarea and releases outside the sheet fires
    // click on the backdrop and would silently destroy the typed note.
    <div
      style={backdropStyle}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div style={sheetStyle}>
        <div style={sheetTitleStyle}>Quick note</div>
        <div style={sheetHintStyle}>
          Jot it down — author and time are captured automatically. Notes can&apos;t be edited after
          saving; add a follow-up note to correct or expand.
        </div>

        {error && <div style={errBoxStyle}>{error}</div>}

        <div style={fieldStyle}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What do you want to note about this client?"
            rows={4}
            maxLength={4000}
            style={textareaStyle}
            disabled={busy}
          />
        </div>

        <div style={fieldStyle}>
          <span style={fieldLabelStyle}>Category (optional)</span>
          <div style={chipRowStyle}>
            {QUICK_NOTE_CATEGORIES.filter((c) => c.value !== 'other').map((c) => {
              const active = category === c.value;
              const concern = c.value === 'concern';
              return (
                <button
                  key={c.value}
                  type="button"
                  disabled={busy}
                  onClick={() => setCategory(active ? '' : c.value)}
                  style={{
                    ...chipBtnStyle,
                    ...(active ? (concern ? chipBtnConcernActiveStyle : chipBtnActiveStyle) : null),
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          {category === 'concern' && (
            <div style={concernHintStyle}>
              <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} /> Concerns ring the
              bell for every admin and supervisor so they can act on it.
            </div>
          )}
        </div>

        <div style={fieldStyle}>
          <span style={fieldLabelStyle}>This is about (optional date)</span>
          <input
            type="date"
            value={aboutDate}
            onChange={(e) => setAboutDate(e.target.value)}
            style={dateInputStyle}
            disabled={busy}
          />
        </div>

        <div style={actionsStyle}>
          <button type="button" style={cancelBtnStyle} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            style={{ ...saveBtnStyle, opacity: !text.trim() || busy ? 0.55 : 1 }}
            onClick={() => void save()}
            disabled={!text.trim() || busy}
          >
            {busy ? 'Saving…' : 'Save note'}
          </button>
        </div>
      </div>
    </div>
  );
}

function fmtCreatedAt(createdAt: unknown): string {
  const ts = createdAt as { toDate?: () => Date } | null;
  const d = ts?.toDate ? ts.toDate() : null;
  if (!d) return 'just now';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmtCreatedAtFull(createdAt: unknown): string {
  const ts = createdAt as { toDate?: () => Date } | null;
  const d = ts?.toDate ? ts.toDate() : null;
  if (!d) return 'Just now';
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmtAboutDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

const NAVY = '#1a3a5c';

const cardStyle: CSSProperties = { background: 'white', borderWidth: 1, borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: 12, padding: '16px 18px', marginTop: 16 };
const headerRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 };
const titleStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 15, color: NAVY };
const addBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: NAVY, color: 'white', border: 'none', padding: '7px 13px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const emptyStyle: CSSProperties = { padding: '16px 14px', color: '#7f8c8d', fontSize: 13, background: '#f8fafc', borderRadius: 8, lineHeight: 1.5 };
const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 };
const rowBtnStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', background: 'white', borderWidth: 1, borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' };
const concernRowStyle: CSSProperties = { background: '#fff8f7', borderColor: '#f0c8c4' };
const chipStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '1px 8px', borderRadius: 999, background: '#e8eef4', color: NAVY, fontSize: 10.5, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' };
const concernChipStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '1px 8px', borderRadius: 999, background: '#fdeaea', color: '#b3261e', fontSize: 10.5, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' };
const rowMetaStyle: CSSProperties = { flex: 1, minWidth: 0, fontSize: 12.5, color: '#5c6b7a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const detailCloseBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 6, cursor: 'pointer' };
const detailMetaGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, margin: '12px 0', padding: '10px 12px', background: '#f8fafc', borderRadius: 8 };
const detailMetaLabelStyle: CSSProperties = { fontSize: 10.5, fontWeight: 700, color: '#8a949e', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 };
const detailMetaValueStyle: CSSProperties = { fontSize: 13, color: '#2c3e50', fontWeight: 600 };
const detailTextStyle: CSSProperties = { fontSize: 14.5, color: '#1f2937', lineHeight: 1.65, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: '4px 2px 12px', maxHeight: '50vh', overflowY: 'auto' };
const detailFootnoteStyle: CSSProperties = { fontSize: 11.5, color: '#8a949e', lineHeight: 1.45, marginBottom: 12 };
const toggleStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: '#5c6b7a', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginTop: 10 };
const errorRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: '#fdeaea', color: '#b3261e', borderRadius: 8, fontSize: 13, fontWeight: 600 };
const retryBtnStyle: CSSProperties = { background: 'white', color: '#b3261e', border: '1px solid #e5b6b1', padding: '4px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' };

const backdropStyle: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 3200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 16px', overflowY: 'auto' };
const sheetStyle: CSSProperties = { width: '100%', maxWidth: 480, background: 'white', borderRadius: 12, padding: 18, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' };
const sheetTitleStyle: CSSProperties = { fontWeight: 700, fontSize: 17, color: '#1f2937', marginBottom: 6 };
const sheetHintStyle: CSSProperties = { fontSize: 12.5, color: '#7f8c8d', lineHeight: 1.5, marginBottom: 12 };
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12, minWidth: 0 };
const fieldLabelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#5c6b7a' };
const textareaStyle: CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', minHeight: 92, lineHeight: 1.5 };
const dateInputStyle: CSSProperties = { width: '100%', maxWidth: 200, padding: '9px 11px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', height: 38 };
const chipRowStyle: CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap' };
// All-longhand border (never the `border` shorthand): the active variants
// override borderColor, and React warns/misrenders when a longhand override
// is removed while a shorthand remains (same pitfall as VisitsCalendar).
const chipBtnStyle: CSSProperties = { background: '#f1f5f9', color: '#475569', borderWidth: 1, borderStyle: 'solid', borderColor: '#e2e8f0', padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const chipBtnActiveStyle: CSSProperties = { background: '#e8eef4', color: NAVY, borderColor: NAVY };
const chipBtnConcernActiveStyle: CSSProperties = { background: '#fdeaea', color: '#b3261e', borderColor: '#b3261e' };
const concernHintStyle: CSSProperties = { display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12, color: '#b3261e', marginTop: 6, lineHeight: 1.45 };
const errBoxStyle: CSSProperties = { background: '#fdeaea', color: '#b3261e', borderRadius: 6, padding: '8px 11px', fontSize: 13, marginBottom: 10 };
const actionsStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 };
const cancelBtnStyle: CSSProperties = { background: 'white', color: '#374151', border: '1px solid #d0d7de', padding: '9px 16px', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const saveBtnStyle: CSSProperties = { background: NAVY, color: 'white', border: 'none', padding: '9px 16px', borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
