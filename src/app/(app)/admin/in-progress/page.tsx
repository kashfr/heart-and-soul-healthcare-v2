'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { subscribeDrafts, type NoteDraft } from '@/lib/drafts';
import { findDuplicateSubmission } from '@/lib/submissions';
import { authedFetch } from '@/lib/authedFetch';
import {
  flattenDraft,
  getIncompleteRequired,
  NOTE_TAB_NAMES,
  type NoteIssue,
} from '@/lib/noteValidation';

interface Row {
  draft: NoteDraft;
  flat: Record<string, string>;
  issues: NoteIssue[];
  /** The already-submitted note this draft would duplicate (resolved only for
      drafts with a pending approval request, for the "view existing" link). */
  conflictNoteId: string | null;
}

// Keys we never want to surface in the full-note view (internal/plumbing or
// rendered specially). Everything else entered is shown with a humanized label.
const HIDDEN_FULL_KEYS = new Set(['patientId', 'submissionId', 'q61_signature']);

// Nicer labels for keys whose auto-humanized form reads poorly.
const FULL_LABEL_OVERRIDES: Record<string, string> = {
  q3_clientName: 'Client name',
  q4_dateofBirth: 'Date of birth',
  q5_ageYears: 'Age',
  q6_dateofService: 'Date of service',
  q10_primaryDiagnosis: 'Primary diagnosis',
  q200_addr_line1: 'Street address',
  q200_city: 'City',
  q200_state: 'State',
  q200_postal: 'ZIP code',
  q11_nurseName: 'Nurse / caregiver',
  q12_credential: 'Credential',
  q16_vitalsNotObtainedReason: 'Vitals not obtained — reason',
  q16_vitalsNotObtainedNote: 'Vitals not obtained — note',
  q16_temperature: 'Temperature',
  q16_temperatureRoute: 'Temperature route',
  q17_systolic: 'Systolic BP',
  q17_diastolic: 'Diastolic BP',
  q17_bpMethod: 'BP method',
  q17_bpSite: 'BP site',
  q18_pulse: 'Pulse',
  q18_pulseSite: 'Pulse site',
  q19_respiration: 'Respiration',
  q20_oxygenSaturation: 'O₂ saturation',
  q21_oxygenSource: 'Oxygen source',
};

function humanizeKey(key: string): string {
  if (FULL_LABEL_OVERRIDES[key]) return FULL_LABEL_OVERRIDES[key];
  return key
    .replace(/^q\d+_/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function relativeTime(d: Date | null): string {
  if (!d) return '—';
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  return `${day} day${day === 1 ? '' : 's'} ago`;
}

function bpDisplay(flat: Record<string, string>): string {
  const sys = (flat.q17_systolic || '').trim();
  const dia = (flat.q17_diastolic || '').trim();
  if (sys && dia) return `${sys}/${dia}`;
  // BP-specific reason first, then the section-level "unable to obtain
  // vitals" reason (which covers any vital left blank, BP included).
  const reason =
    (flat.q17_bpNotObtainedReason || '').trim() ||
    (flat.q16_vitalsNotObtainedReason || '').trim();
  if (reason) return `Not obtained — ${reason}`;
  return '';
}

export default function InProgressPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showFull, setShowFull] = useState<string | null>(null);
  // Approve/deny flow state, keyed by the draft's nurseId.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [denyForId, setDenyForId] = useState<string | null>(null);
  const [denyNote, setDenyNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Build display rows from raw drafts: flatten, compute missing-required
  // issues, and (for a pending duplicate request) resolve the conflicting note
  // so the approval panel can link to it.
  const buildRows = useCallback(async (drafts: NoteDraft[]): Promise<Row[]> => {
    return Promise.all(
      drafts.map(async (draft) => {
        const flat = flattenDraft(draft);
        let conflictNoteId: string | null = null;
        if (draft.dupRequest?.status === 'pending') {
          try {
            const match = await findDuplicateSubmission({
              nurseId: draft.nurseId,
              dateOfService: draft.dupRequest.dateOfService || draft.dateOfService,
              patientId: draft.dupRequest.patientId,
              clientName: draft.dupRequest.clientName || draft.clientName,
            });
            conflictNoteId = match?.id ?? null;
          } catch {
            conflictNoteId = null;
          }
        }
        return { draft, flat, issues: getIncompleteRequired(flat), conflictNoteId };
      })
    );
  }, []);

  const decide = useCallback(
    async (nurseId: string, decision: 'approve' | 'deny', note?: string) => {
      setBusyId(nurseId);
      setActionError(null);
      try {
        const res = await authedFetch('/api/admin/in-progress/dup-decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nurseId, decision, denyNote: note }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `Failed (HTTP ${res.status})`);
        }
        setDenyForId(null);
        setDenyNote('');
        // No manual reload: the live subscription below reflects the updated
        // draft (dupRequest cleared/decided) automatically.
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Action failed.');
      } finally {
        setBusyId(null);
      }
    },
    []
  );

  // Live subscription: rebuild rows on every draft change so the inspector
  // stays current with each nurse's autosaves (no manual refresh). A token
  // guards against out-of-order async completions — snapshots can fire faster
  // than the per-draft conflict lookups resolve.
  useEffect(() => {
    let active = true;
    let token = 0;
    const unsub = subscribeDrafts(
      (drafts) => {
        const myToken = ++token;
        setError(null);
        buildRows(drafts).then((built) => {
          if (active && myToken === token) {
            setRows(built);
            setLoading(false);
          }
        });
      },
      (e) => {
        if (!active) return;
        setError(e.message || 'Failed to load in-progress notes.');
        setLoading(false);
      }
    );
    return () => {
      active = false;
      unsub();
    };
  }, [buildRows]);

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1f2937', margin: 0 }}>
          In-Progress Notes
        </h1>
        <span style={liveIndicatorStyle} title="Updates automatically as nurses save their notes">
          <span style={liveDotStyle} /> Live
        </span>
      </div>
      <p style={{ color: '#6b7280', margin: '0 0 20px', fontSize: 14, maxWidth: 680 }}>
        Notes a nurse has started but not yet submitted. Read-only — use this to see what&apos;s
        still needed when a nurse runs into trouble submitting. Nothing here can be edited.
      </p>

      {loading && <div style={cardStyle}>Loading…</div>}
      {error && <div style={{ ...cardStyle, color: '#b91c1c' }}>{error}</div>}
      {!loading && !error && rows.length === 0 && (
        <div style={cardStyle}>No nurses have a note in progress right now.</div>
      )}

      {!loading &&
        !error &&
        rows.map(({ draft, flat, issues, conflictNoteId }) => {
          const id = draft.nurseId;
          const isOpen = expanded === id;
          const ready = issues.length === 0;
          const dupReq = draft.dupRequest;
          const pendingApproval = dupReq?.status === 'pending';
          return (
            <div key={id} style={cardStyle}>
              <button
                onClick={() => setExpanded(isOpen ? null : id)}
                style={rowHeaderStyle}
                aria-expanded={isOpen}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', color: '#6b7280' }}>
                  {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </span>
                <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: '#1f2937' }}>
                    {draft.clientName || '(no client name yet)'}
                  </div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    {draft.nurseName || 'Unknown nurse'} · DOS {draft.dateOfService || '—'} · on Tab{' '}
                    {draft.currentPage} ({NOTE_TAB_NAMES[draft.currentPage] ?? ''})
                  </div>
                </div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                    color: '#9ca3af',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Clock size={12} /> {relativeTime(draft.updatedAt)}
                </div>
                {pendingApproval && (
                  <span style={badgeApproval}>
                    <ShieldAlert size={13} /> Needs your approval
                  </span>
                )}
                <span style={ready ? badgeReady : badgeNeeds}>
                  {ready ? (
                    <>
                      <CheckCircle2 size={13} /> Ready
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={13} /> {issues.length} to fix
                    </>
                  )}
                </span>
              </button>

              {isOpen && (
                <div style={{ padding: '4px 16px 16px' }}>
                  {pendingApproval && dupReq && (
                    <div style={approvalPanel}>
                      <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <ShieldAlert size={16} /> Duplicate-note approval requested
                      </div>
                      <p style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.5 }}>
                        {draft.nurseName || 'This nurse'} is asking to submit a <strong>second</strong> note for{' '}
                        <strong>{dupReq.clientName}</strong> on <strong>{dupReq.dateOfService}</strong> — a client already
                        documented on that date.
                      </p>
                      <div style={{ fontSize: 13, marginBottom: 10 }}>
                        <span style={{ color: '#6b7280' }}>Reason given: </span>
                        {dupReq.reason ? dupReq.reason : <em style={{ color: '#9ca3af' }}>(none given)</em>}
                      </div>
                      {conflictNoteId && (
                        <a
                          href={`/admin/submissions/${conflictNoteId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 13, color: '#0e7c4a', fontWeight: 600 }}
                        >
                          View the existing note ↗
                        </a>
                      )}

                      {actionError && busyId === id && (
                        <div style={{ color: '#b91c1c', fontSize: 13, marginTop: 8 }}>{actionError}</div>
                      )}

                      {denyForId === id ? (
                        <div style={{ marginTop: 12 }}>
                          <textarea
                            value={denyNote}
                            onChange={(e) => setDenyNote(e.target.value)}
                            placeholder="Optional note back to the nurse (e.g., edit the existing note instead)."
                            rows={2}
                            disabled={busyId === id}
                            style={denyTextareaStyle}
                          />
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button
                              type="button"
                              onClick={() => decide(id, 'deny', denyNote.trim())}
                              disabled={busyId === id}
                              style={denyConfirmBtn}
                            >
                              {busyId === id ? 'Denying…' : 'Confirm deny'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setDenyForId(null); setDenyNote(''); }}
                              disabled={busyId === id}
                              style={ghostBtn}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                          <button
                            type="button"
                            onClick={() => decide(id, 'approve')}
                            disabled={busyId === id}
                            style={approveBtn}
                          >
                            {busyId === id ? 'Approving…' : 'Approve second note'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setDenyForId(id); setActionError(null); }}
                            disabled={busyId === id}
                            style={denyBtn}
                          >
                            Deny
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {ready ? (
                    <div style={readyPanel}>
                      <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span>
                        No required fields are missing. This note looks ready — the nurse just needs to
                        open it, go to the last tab (Summary &amp; Signature), and press{' '}
                        <strong>Submit</strong>.
                      </span>
                    </div>
                  ) : (
                    <div style={needsPanel}>
                      <div
                        style={{
                          fontWeight: 600,
                          marginBottom: 8,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <AlertTriangle size={16} /> {issues.length} required field
                        {issues.length === 1 ? '' : 's'} still needed before this note can be submitted:
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {issues.map((it) => (
                          <li key={it.key} style={{ marginBottom: 4 }}>
                            <strong>
                              Tab {it.tab} ({it.tabName}):
                            </strong>{' '}
                            {it.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div style={{ marginTop: 14 }}>
                    <div style={snapshotHeader}>Vitals &amp; key details entered</div>
                    <div style={snapshotGrid}>
                      <Detail label="Client" value={flat.q3_clientName} />
                      <Detail label="Date of birth" value={flat.q4_dateofBirth} />
                      <Detail label="Credential" value={flat.q12_credential} />
                      <Detail label="Date of service" value={flat.q6_dateofService} />
                      {(flat.q16_vitalsNotObtainedReason || '').trim() !== '' && (
                        <Detail
                          label="Vitals not obtained"
                          value={`${flat.q16_vitalsNotObtainedReason}${
                            (flat.q16_vitalsNotObtainedNote || '').trim() ? ` — ${flat.q16_vitalsNotObtainedNote}` : ''
                          }`}
                        />
                      )}
                      <Detail
                        label="Temperature"
                        value={
                          flat.q16_temperature
                            ? `${flat.q16_temperature}${flat.q16_temperatureRoute ? ` (${flat.q16_temperatureRoute})` : ''}`
                            : ''
                        }
                      />
                      <Detail label="Blood pressure" value={bpDisplay(flat)} />
                      <Detail label="Pulse" value={flat.q18_pulse} />
                      <Detail label="Respiration" value={flat.q19_respiration} />
                      <Detail label="O₂ saturation" value={flat.q20_oxygenSaturation} />
                      <Detail label="Signature" value={flat.q61_signature ? 'Signed' : ''} />
                    </div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <button
                      type="button"
                      onClick={() => setShowFull(showFull === id ? null : id)}
                      style={fullToggleBtn}
                    >
                      {showFull === id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      {showFull === id ? 'Hide full note' : 'Show full note (everything entered)'}
                    </button>
                    {showFull === id && (() => {
                      const entries = Object.entries(flat)
                        .filter(([k, v]) => !HIDDEN_FULL_KEYS.has(k) && String(v).trim() !== '')
                        .sort(([a], [b]) => humanizeKey(a).localeCompare(humanizeKey(b)));
                      const signed = String(flat.q61_signature || '').trim() !== '';
                      return (
                        <div style={{ marginTop: 10 }}>
                          {entries.length === 0 && !signed ? (
                            <div style={{ fontSize: 13, color: '#9ca3af' }}>Nothing entered yet.</div>
                          ) : (
                            <div style={fullGrid}>
                              {entries.map(([k, v]) => (
                                <Detail key={k} label={humanizeKey(k)} value={String(v)} />
                              ))}
                              {signed && <Detail label="Signature" value="Signed" />}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          color: '#9ca3af',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, color: value ? '#1f2937' : '#d1d5db' }}>{value || '—'}</div>
    </div>
  );
}

// --- styles ---

const cardStyle: CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  marginBottom: 10,
  fontSize: 14,
  color: '#374151',
  overflow: 'hidden',
};

const rowHeaderStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '14px 16px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
};

const liveIndicatorStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  fontWeight: 700,
  color: '#166534',
  background: '#e8f5e9',
  border: '1px solid #bbf7d0',
  borderRadius: 999,
  padding: '4px 10px',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

const liveDotStyle: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: '#22c55e',
  display: 'inline-block',
};

const badgeBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 12,
  fontWeight: 700,
  padding: '4px 10px',
  borderRadius: 999,
  whiteSpace: 'nowrap',
};

const badgeReady: CSSProperties = {
  ...badgeBase,
  background: '#dcfce7',
  color: '#166534',
};

const badgeNeeds: CSSProperties = {
  ...badgeBase,
  background: '#fef3c7',
  color: '#92400e',
};

const readyPanel: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  background: '#f0fdf4',
  border: '1px solid #bbf7d0',
  color: '#166534',
  borderRadius: 6,
  padding: '12px 14px',
  fontSize: 14,
};

const needsPanel: CSSProperties = {
  background: '#fffbeb',
  border: '1px solid #fde68a',
  color: '#92400e',
  borderRadius: 6,
  padding: '12px 14px',
  fontSize: 14,
};

const snapshotHeader: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: '#6b7280',
  marginBottom: 10,
  borderTop: '1px solid #f3f4f6',
  paddingTop: 12,
};

const snapshotGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: '12px 16px',
};

const fullGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
  gap: '10px 16px',
};

const badgeApproval: CSSProperties = {
  ...badgeBase,
  background: '#fef3c7',
  color: '#92400e',
  border: '1px solid #fcd34d',
};

const approvalPanel: CSSProperties = {
  background: '#fffbeb',
  border: '1px solid #fde68a',
  color: '#92400e',
  borderRadius: 8,
  padding: '14px 16px',
  marginBottom: 14,
};

const approveBtn: CSSProperties = {
  background: '#0e7c4a',
  color: 'white',
  border: 'none',
  padding: '8px 14px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const denyBtn: CSSProperties = {
  background: 'white',
  color: '#b3261e',
  border: '1px solid #f5c6c0',
  padding: '8px 14px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const denyConfirmBtn: CSSProperties = { ...denyBtn, background: '#fdecea' };

const ghostBtn: CSSProperties = {
  background: 'transparent',
  color: '#6b7280',
  border: '1px solid #d1d5db',
  padding: '8px 14px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const denyTextareaStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  resize: 'vertical',
  color: '#1f2937',
};

const fullToggleBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: 'transparent',
  border: 'none',
  color: '#0e7c4a',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
  fontFamily: 'inherit',
};
