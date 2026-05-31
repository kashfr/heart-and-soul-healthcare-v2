'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { authedFetch } from '@/lib/authedFetch';

/**
 * Admin-only maintenance page for cleaning up legacy progressNotes whose
 * typed patient name/DOB doesn't exactly match any roster entry. Powers
 * Phase 1 of the care-team feature — every note that gets a patientId
 * here becomes visible to other nurses on that patient's care team once
 * Phase 3 ships.
 */

interface Candidate {
  patientId: string;
  patientName: string;
  patientDob: string;
  score: number;
  reason: string;
}

interface QueueItem {
  noteId: string;
  typedName: string;
  typedDob: string;
  nurseName: string;
  dateOfService: string;
  candidates: Candidate[];
}

interface BackfillSummary {
  notesScanned: number;
  notesLinked: number;
  notesAlreadyLinked: number;
  notesUnlinked: number;
  patientsBackfilled: number;
  ranBy: string;
}

interface AgeChange {
  noteId: string;
  clientName: string;
  dob: string;
  dateOfService: string;
  oldAge: string;
  newAge: string;
}

interface AgeFixResult {
  ranBy: string;
  applied: boolean;
  notesScanned: number;
  changeCount: number;
  changes: AgeChange[];
  skippedNoDob: number;
  skippedNoService: number;
  skippedBadDate: number;
}

interface DuplicateGroup {
  clientName: string;
  nurseName: string;
  dateOfService: string;
  notes: { id: string; submittedAt: number | null; patientId: string | null }[];
}

interface DuplicateAuditResult {
  notesScanned: number;
  duplicateSets: number;
  duplicateNotes: number;
  groups: DuplicateGroup[];
}

const wrapStyle: React.CSSProperties = {
  padding: 24,
  maxWidth: 960,
  margin: '0 auto',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
  marginBottom: 16,
};

const titleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: '#1a3a5c',
  margin: 0,
};

const subStyle: React.CSSProperties = {
  color: '#5c6b7a',
  fontSize: 14,
  marginTop: 4,
  lineHeight: 1.5,
};

const primaryBtn: React.CSSProperties = {
  background: '#0e7c4a',
  color: 'white',
  border: 'none',
  padding: '10px 18px',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};

const cardStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid #dfe5ec',
  borderRadius: 8,
  padding: 16,
  marginBottom: 12,
};

const noteHeaderStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  alignItems: 'baseline',
  marginBottom: 12,
};

const typedTagStyle: React.CSSProperties = {
  background: '#f5f7fa',
  border: '1px solid #e5eaf0',
  padding: '4px 8px',
  borderRadius: 4,
  fontSize: 13,
  color: '#2c3e50',
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
};

const candidateRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 0',
  borderTop: '1px solid #eef2f7',
};

const linkBtnStyle: React.CSSProperties = {
  background: '#0e7c4a',
  color: 'white',
  border: 'none',
  padding: '6px 12px',
  borderRadius: 4,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const skipBtnStyle: React.CSSProperties = {
  background: 'white',
  color: '#5c6b7a',
  border: '1px solid #dfe5ec',
  padding: '6px 12px',
  borderRadius: 4,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const summaryStyle: React.CSSProperties = {
  background: '#f0f7ff',
  border: '1px solid #c8def5',
  borderRadius: 6,
  padding: 12,
  marginBottom: 16,
  fontSize: 13,
  color: '#1a3a5c',
};

const reasonChipStyle: React.CSSProperties = {
  background: '#fff4e5',
  color: '#a35400',
  fontSize: 11,
  padding: '2px 6px',
  borderRadius: 3,
  fontWeight: 600,
};

function formatDate(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[1]}/${parts[2]}/${parts[0]}`;
}

export default function LinkNotesPage() {
  const { profile } = useAuth();
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningBackfill, setRunningBackfill] = useState(false);
  const [summary, setSummary] = useState<BackfillSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [ageBusy, setAgeBusy] = useState<null | 'preview' | 'apply'>(null);
  const [ageResult, setAgeResult] = useState<AgeFixResult | null>(null);
  const [ageError, setAgeError] = useState<string | null>(null);
  const [dupBusy, setDupBusy] = useState(false);
  const [dupResult, setDupResult] = useState<DuplicateAuditResult | null>(null);
  const [dupError, setDupError] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch('/api/admin/maintenance/link-candidates');
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Failed to load (HTTP ${res.status})`);
      }
      const data = await res.json();
      setQueue(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.');
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const runBackfill = async () => {
    setRunningBackfill(true);
    setError(null);
    setSummary(null);
    try {
      const res = await authedFetch('/api/admin/maintenance/backfill', { method: 'POST' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Backfill failed (HTTP ${res.status})`);
      }
      const data = (await res.json()) as BackfillSummary;
      setSummary(data);
      await fetchQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backfill failed.');
    } finally {
      setRunningBackfill(false);
    }
  };

  const runAgeFix = async (apply: boolean) => {
    setAgeBusy(apply ? 'apply' : 'preview');
    setAgeError(null);
    if (!apply) setAgeResult(null);
    try {
      const res = await authedFetch('/api/admin/maintenance/fix-ages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Age fix failed (HTTP ${res.status})`);
      }
      setAgeResult((await res.json()) as AgeFixResult);
    } catch (err) {
      setAgeError(err instanceof Error ? err.message : 'Age fix failed.');
    } finally {
      setAgeBusy(null);
    }
  };

  const runDuplicateAudit = async () => {
    setDupBusy(true);
    setDupError(null);
    try {
      const res = await authedFetch('/api/admin/maintenance/duplicate-notes');
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Scan failed (HTTP ${res.status})`);
      }
      setDupResult((await res.json()) as DuplicateAuditResult);
    } catch (err) {
      setDupError(err instanceof Error ? err.message : 'Scan failed.');
    } finally {
      setDupBusy(false);
    }
  };

  const linkOrSkip = async (noteId: string, patientId: string | null) => {
    setProcessingIds((prev) => {
      const next = new Set(prev);
      next.add(noteId);
      return next;
    });
    setError(null);
    try {
      const res = await authedFetch('/api/admin/maintenance/link-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId, patientId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Save failed (HTTP ${res.status})`);
      }
      // Optimistically remove the resolved item from the queue.
      setQueue((prev) => (prev || []).filter((it) => it.noteId !== noteId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(noteId);
        return next;
      });
    }
  };

  // Gate: admin-only. Supervisors get bounced to their dashboard rather
  // than seeing an empty page.
  if (profile && profile.role !== 'admin') {
    return (
      <div style={wrapStyle}>
        <h1 style={titleStyle}>Maintenance</h1>
        <p style={subStyle}>
          This page is admin-only.{' '}
          <Link href="/admin" style={{ color: '#0e7c4a' }}>
            Back to dashboard
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      <div style={headerStyle}>
        <div>
          <h1 style={titleStyle}>Link unmatched progress notes</h1>
          <p style={subStyle}>
            Notes whose typed patient name or DOB doesn&apos;t exactly match the roster.
            <strong> Linking a note overwrites its client name and DOB with the roster&apos;s canonical
            values</strong> (the original typed values are preserved in the note&apos;s edit history for
            audit). This fixes downstream billing issues and makes the note visible to other nurses
            on that patient&apos;s care team.
          </p>
        </div>
        <button
          type="button"
          onClick={runBackfill}
          disabled={runningBackfill}
          style={{ ...primaryBtn, opacity: runningBackfill ? 0.6 : 1, cursor: runningBackfill ? 'wait' : 'pointer' }}
        >
          {runningBackfill ? 'Running…' : 'Run backfill'}
        </button>
      </div>

      {summary && (
        <div style={summaryStyle}>
          <strong>Backfill complete.</strong>{' '}
          Scanned {summary.notesScanned} notes ·{' '}
          <strong>{summary.notesLinked}</strong> auto-linked ·{' '}
          {summary.notesAlreadyLinked} already linked ·{' '}
          {summary.notesUnlinked} still need review ·{' '}
          {summary.patientsBackfilled} patient care teams updated.
        </div>
      )}

      {/* Fix client ages — recompute stale q5_ageYears from DOB + date of
          service. Preview is a dry run; Apply writes. */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <strong style={{ color: '#1a3a5c', fontSize: 15 }}>Fix client ages</strong>
            <p style={{ ...subStyle, marginTop: 4 }}>
              Recomputes each note&apos;s stored age from its date of birth as-of the date of service.
              Fixes notes whose age went stale after a DOB correction. <strong>Preview</strong> shows
              what would change without writing; <strong>Apply</strong> writes the fixes.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => runAgeFix(false)}
              disabled={ageBusy !== null}
              style={{ ...skipBtnStyle, padding: '10px 16px', fontSize: 14, opacity: ageBusy ? 0.6 : 1 }}
            >
              {ageBusy === 'preview' ? 'Previewing…' : 'Preview'}
            </button>
            <button
              type="button"
              onClick={() => runAgeFix(true)}
              disabled={ageBusy !== null || !ageResult || ageResult.changeCount === 0}
              title={!ageResult ? 'Run Preview first' : ageResult.changeCount === 0 ? 'Nothing to fix' : undefined}
              style={{ ...primaryBtn, opacity: ageBusy !== null || !ageResult || ageResult.changeCount === 0 ? 0.5 : 1 }}
            >
              {ageBusy === 'apply' ? 'Applying…' : 'Apply fixes'}
            </button>
          </div>
        </div>

        {ageError && (
          <div style={{ background: '#fff3f0', border: '1px solid #ef9a9a', color: '#b71c1c', padding: 10, borderRadius: 6, marginTop: 12, fontSize: 13 }}>
            {ageError}
          </div>
        )}

        {ageResult && (
          <div style={{ marginTop: 12 }}>
            <div style={{ ...summaryStyle, marginBottom: ageResult.changeCount > 0 ? 10 : 0 }}>
              {ageResult.applied ? <strong>Applied. </strong> : <strong>Preview (no changes written). </strong>}
              Scanned {ageResult.notesScanned} notes ·{' '}
              <strong>{ageResult.changeCount}</strong>{' '}
              {ageResult.applied ? 'corrected' : 'would change'}
              {(ageResult.skippedNoService > 0 || ageResult.skippedNoDob > 0 || ageResult.skippedBadDate > 0) && (
                <> · skipped {ageResult.skippedNoDob} without DOB, {ageResult.skippedNoService} without date of service, {ageResult.skippedBadDate} with an unparseable date</>
              )}
              .
              {!ageResult.applied && ageResult.changeCount > 0 && <> Click <strong>Apply fixes</strong> to write them.</>}
            </div>
            {ageResult.changeCount > 0 && (
              <div style={{ border: '1px solid #eef2f7', borderRadius: 6, overflow: 'hidden' }}>
                {ageResult.changes.map((c, i) => (
                  <div
                    key={c.noteId}
                    style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline', padding: '8px 12px', background: i % 2 ? '#fafbfc' : 'white', fontSize: 13 }}
                  >
                    <Link href={`/admin/submissions/${c.noteId}`} target="_blank" style={{ color: '#0e7c4a', fontWeight: 600 }}>
                      {c.clientName || '(no name)'} ↗
                    </Link>
                    <span style={{ color: '#5c6b7a' }}>
                      DOB {formatDate(c.dob)} · service {formatDate(c.dateOfService)}
                    </span>
                    <span style={{ marginLeft: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                      <span style={{ color: '#b71c1c' }}>{c.oldAge}</span>
                      {' → '}
                      <span style={{ color: '#0e7c4a', fontWeight: 700 }}>{c.newAge}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Find duplicate notes — read-only audit of already-submitted notes
          that duplicate each other (same nurse + date of service + patient).
          Lists them so the admin can archive the extras; changes nothing. */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <strong style={{ color: '#1a3a5c', fontSize: 15 }}>Find duplicate notes</strong>
            <p style={{ ...subStyle, marginTop: 4 }}>
              Scans existing notes for more than one active note by the same nurse for the same client
              on the same date of service. <strong>Read-only</strong> — open a note to archive the extra
              one. (The submit-time hard stop prevents new duplicates; this finds ones submitted before.)
            </p>
          </div>
          <button
            type="button"
            onClick={runDuplicateAudit}
            disabled={dupBusy}
            style={{ ...primaryBtn, opacity: dupBusy ? 0.6 : 1, cursor: dupBusy ? 'wait' : 'pointer' }}
          >
            {dupBusy ? 'Scanning…' : 'Scan for duplicates'}
          </button>
        </div>

        {dupError && (
          <div style={{ background: '#fff3f0', border: '1px solid #ef9a9a', color: '#b71c1c', padding: 10, borderRadius: 6, marginTop: 12, fontSize: 13 }}>
            {dupError}
          </div>
        )}

        {dupResult && (
          <div style={{ marginTop: 12 }}>
            <div style={{ ...summaryStyle, marginBottom: dupResult.duplicateSets > 0 ? 10 : 0 }}>
              Scanned {dupResult.notesScanned} notes ·{' '}
              <strong>{dupResult.duplicateSets}</strong> duplicate set{dupResult.duplicateSets === 1 ? '' : 's'}
              {dupResult.duplicateSets > 0 && <> ({dupResult.duplicateNotes} notes total)</>}.
              {dupResult.duplicateSets === 0 && ' No duplicate notes found.'}
            </div>
            {dupResult.groups.map((g, gi) => (
              <div key={gi} style={{ border: '1px solid #eef2f7', borderRadius: 6, marginBottom: 10, overflow: 'hidden' }}>
                <div style={{ background: '#fff8ec', borderBottom: '1px solid #f0d9a8', padding: '8px 12px', fontSize: 13 }}>
                  <strong style={{ color: '#1a3a5c' }}>{g.clientName || '(no name)'}</strong> on{' '}
                  <strong>{formatDate(g.dateOfService)}</strong>
                  <span style={{ color: '#5c6b7a' }}> · {g.nurseName || 'Unknown nurse'} · {g.notes.length} notes</span>
                </div>
                {g.notes.map((n, ni) => (
                  <div
                    key={n.id}
                    style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline', padding: '8px 12px', background: ni % 2 ? '#fafbfc' : 'white', fontSize: 13 }}
                  >
                    <Link href={`/admin/submissions/${n.id}`} target="_blank" style={{ color: '#0e7c4a', fontWeight: 600 }}>
                      Open note ↗
                    </Link>
                    <span style={{ color: '#5c6b7a' }}>
                      {n.submittedAt ? `Submitted ${new Date(n.submittedAt).toLocaleString()}` : 'Submit time unknown'}
                    </span>
                    {ni === 0 && <span style={{ marginLeft: 'auto', ...reasonChipStyle, background: '#e8f4e8', color: '#166534' }}>most recent</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div
          style={{
            background: '#fff3f0',
            border: '1px solid #ef9a9a',
            color: '#b71c1c',
            padding: 12,
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p style={subStyle}>Loading…</p>
      ) : (queue?.length ?? 0) === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#5c6b7a' }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            Nothing to review. Click <strong>Run backfill</strong> to scan for new
            unlinked notes, or all notes are either linked or already reviewed.
          </p>
        </div>
      ) : (
        queue!.map((item) => (
          <div key={item.noteId} style={cardStyle}>
            <div style={noteHeaderStyle}>
              <span style={{ fontWeight: 600, color: '#2c3e50' }}>
                {formatDate(item.dateOfService) || '—'}
              </span>
              <span style={{ color: '#5c6b7a', fontSize: 13 }}>
                by {item.nurseName || 'Unknown nurse'}
              </span>
              <Link
                href={`/admin/submissions/${item.noteId}`}
                target="_blank"
                style={{ color: '#0e7c4a', fontSize: 13, marginLeft: 'auto' }}
              >
                Open note ↗
              </Link>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <span style={typedTagStyle}>Typed name: {item.typedName || '(blank)'}</span>
              <span style={typedTagStyle}>DOB: {formatDate(item.typedDob) || '(blank)'}</span>
            </div>
            <div style={{ marginTop: 4 }}>
              {item.candidates.map((c) => {
                const isProcessing = processingIds.has(item.noteId);
                return (
                  <div key={c.patientId} style={candidateRowStyle}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#1a3a5c' }}>
                        {c.patientName}{' '}
                        <span style={{ fontWeight: 400, color: '#5c6b7a', fontSize: 13 }}>
                          (DOB {formatDate(c.patientDob)})
                        </span>
                      </div>
                      <div style={{ marginTop: 2 }}>
                        <span style={reasonChipStyle}>{c.reason}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => linkOrSkip(item.noteId, c.patientId)}
                      disabled={isProcessing}
                      style={{ ...linkBtnStyle, opacity: isProcessing ? 0.6 : 1 }}
                    >
                      Link
                    </button>
                  </div>
                );
              })}
              <div style={{ ...candidateRowStyle, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => linkOrSkip(item.noteId, null)}
                  disabled={processingIds.has(item.noteId)}
                  style={{ ...skipBtnStyle, opacity: processingIds.has(item.noteId) ? 0.6 : 1 }}
                >
                  Skip — none of the above
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
