'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { listDrafts, type NoteDraft } from '@/lib/drafts';
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
  const reason = (flat.q17_bpNotObtainedReason || '').trim();
  if (reason) return `Not obtained — ${reason}`;
  return '';
}

export default function InProgressPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const drafts = await listDrafts();
      setRows(
        drafts.map((draft) => {
          const flat = flattenDraft(draft);
          return { draft, flat, issues: getIncompleteRequired(flat) };
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load in-progress notes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1f2937', margin: 0 }}>
          In-Progress Notes
        </h1>
        <button onClick={load} disabled={loading} title="Refresh" style={refreshBtnStyle}>
          <RefreshCw size={15} /> Refresh
        </button>
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
        rows.map(({ draft, flat, issues }) => {
          const id = draft.nurseId;
          const isOpen = expanded === id;
          const ready = issues.length === 0;
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
                      <Detail label="Temperature" value={flat.q16_temperature} />
                      <Detail label="Blood pressure" value={bpDisplay(flat)} />
                      <Detail label="Pulse" value={flat.q18_pulse} />
                      <Detail label="Respiration" value={flat.q19_respiration} />
                      <Detail label="O₂ saturation" value={flat.q20_oxygenSaturation} />
                      <Detail label="Signature" value={flat.q61_signature ? 'Signed' : ''} />
                    </div>
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

const refreshBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
  background: 'white',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  padding: '6px 12px',
  cursor: 'pointer',
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
