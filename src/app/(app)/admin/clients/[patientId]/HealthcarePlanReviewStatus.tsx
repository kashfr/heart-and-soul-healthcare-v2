'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { fetchHealthcarePlans, type HealthcarePlanListing } from '@/lib/healthcarePlans';
import { readerProgress, reviewDateUS } from '@/lib/healthcarePlanReview';

/**
 * Staff view on the Documents tab: which clinicians have reviewed the
 * client's current healthcare plans. A nurse reviews each plan from the
 * progress note (see docs/features/healthcare-plan-review.md); this table is
 * how the supervisor sees who is caught up and which plans someone is missing.
 *
 * `planKey` changes when a plan is added, archived, recategorized or has its
 * file replaced, so the table reloads against the new set.
 */
export default function HealthcarePlanReviewStatus({ patientId, planKey }: { patientId: string; planKey: string }) {
  const [listing, setListing] = useState<HealthcarePlanListing | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchHealthcarePlans(patientId)
      .then((l) => { if (!cancelled) { setListing(l); setError(''); } })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the review status.'); });
    return () => { cancelled = true; };
  }, [patientId, planKey]);

  if (error) return <p role="alert" style={{ ...wrap, color: '#b3261e' }}>{error}</p>;
  if (!listing || listing.plans.length === 0 || !listing.readers) return null;

  const { plans, readers } = listing;
  const planIds = plans.map((p) => p.documentId);
  const caughtUp = readers.filter((r) => readerProgress(r, planIds).done === planIds.length).length;

  return (
    <details style={wrap}>
      <summary style={summary}>
        Healthcare Plan Reviews
        <span style={count}>
          {readers.length === 0
            ? 'No one on the care team yet'
            : `${caughtUp} of ${readers.length} ${readers.length === 1 ? 'person has' : 'people have'} reviewed all ${planIds.length} ${planIds.length === 1 ? 'plan' : 'plans'}`}
        </span>
      </summary>
      <p style={hint}>
        Each person opens and acknowledges every plan once, from the Safety Checklist of a progress note. Replacing a plan&apos;s file asks everyone to review that plan again.
      </p>
      {readers.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Reviewed</th>
                <th style={th}>Last Review</th>
                <th style={th}>Still to Review</th>
              </tr>
            </thead>
            <tbody>
              {readers.map((r) => {
                const progress = readerProgress(r, planIds);
                const missing = plans.filter((p) => !r.reviewed[p.documentId]);
                const done = missing.length === 0;
                return (
                  <tr key={r.uid}>
                    <td style={td}>
                      {r.name || 'Unknown'}{r.credential ? `, ${r.credential}` : ''}
                      {!r.onCareTeam && <span style={muted}> (not on the care team)</span>}
                    </td>
                    <td style={{ ...td, fontWeight: 600, color: done ? '#0e7c4a' : '#9a5b00', whiteSpace: 'nowrap' }}>{progress.done} of {progress.total}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{reviewDateUS(progress.lastReviewedAt) || 'Never'}</td>
                    <td style={td}>{done ? 'None' : missing.map((p) => p.title).join('; ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

const wrap: CSSProperties = { border: '1px solid #dbe2ea', borderRadius: 10, padding: '10px 14px', margin: '0 0 12px', background: '#f8fafc', fontSize: 13.5 };
const summary: CSSProperties = { cursor: 'pointer', fontWeight: 700, color: '#1f2937' };
const count: CSSProperties = { fontWeight: 500, color: '#475569', marginLeft: 10 };
const hint: CSSProperties = { margin: '8px 0', color: '#64748b', lineHeight: 1.5 };
const table: CSSProperties = { width: '100%', borderCollapse: 'collapse', background: '#fff' };
const th: CSSProperties = { textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #cbd5e1', fontSize: 12, color: '#5c6b7a' };
const td: CSSProperties = { padding: '7px 10px', borderBottom: '1px solid #eef2f6', verticalAlign: 'top', color: '#1f2937' };
const muted: CSSProperties = { color: '#8a949e', fontWeight: 400 };
