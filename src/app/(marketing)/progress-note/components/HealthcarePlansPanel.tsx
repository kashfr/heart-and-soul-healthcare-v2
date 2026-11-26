'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormPageProps } from '../types';
import { btn, btnPrimary, btnSm } from '@/components/buttons';
import { acknowledgeHealthcarePlan, fetchHealthcarePlans, openHealthcarePlan } from '@/lib/healthcarePlans';
import { buildHcpReviewMeta, pendingPlans, reviewDateUS, type HealthcarePlanStatus } from '@/lib/healthcarePlanReview';
import { formatDateUS } from '@/lib/dateFormat';

/**
 * The client's healthcare plans, shown in the Safety Checklist of a NEW
 * progress note beside "Care plan reviewed at start of shift". Each plan is
 * opened and then acknowledged once; the receipt is kept on the server, so
 * on later shifts the nurse sees them already reviewed and is asked again
 * only for a plan that was added or replaced.
 *
 * Writes the hcpReviewMeta snapshot the submit gate, PDF and admin view read.
 * Renders nothing when the client has no plans on file. (No <header> or
 * <footer> here: the progress-note layout hides those elements.)
 */
export default function HealthcarePlansPanel({ patientId, setValue }: { patientId: string; setValue: FormPageProps['setValue'] }) {
  const [plans, setPlans] = useState<HealthcarePlanStatus[]>([]);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!patientId) {
      setPlans([]);
      setLoadError('');
      setValue('hcpReviewMeta', '');
      return;
    }
    fetchHealthcarePlans(patientId)
      .then((listing) => {
        if (cancelled) return;
        setPlans(listing.plans);
        setLoadError('');
        setValue('hcpReviewMeta', buildHcpReviewMeta(listing.plans));
      })
      .catch((err) => {
        if (cancelled) return;
        setPlans([]);
        setValue('hcpReviewMeta', '');
        setLoadError(err instanceof Error ? err.message : 'Could not load the healthcare plans.');
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, reloadKey, setValue]);

  const patch = useCallback(
    (documentId: string, update: Partial<HealthcarePlanStatus>) => {
      setPlans((current) => {
        const next = current.map((p) => (p.documentId === documentId ? { ...p, ...update } : p));
        setValue('hcpReviewMeta', buildHcpReviewMeta(next));
        return next;
      });
    },
    [setValue],
  );

  const open = async (plan: HealthcarePlanStatus) => {
    setErrors((e) => ({ ...e, [plan.documentId]: '' }));
    try {
      await openHealthcarePlan(plan);
      if (!plan.openedAt) patch(plan.documentId, { openedAt: new Date().toISOString() });
    } catch (err) {
      setErrors((e) => ({ ...e, [plan.documentId]: err instanceof Error ? err.message : 'Could not open the plan.' }));
    }
  };

  const acknowledge = async (plan: HealthcarePlanStatus) => {
    setBusyId(plan.documentId);
    setErrors((e) => ({ ...e, [plan.documentId]: '' }));
    try {
      const reviewedAt = await acknowledgeHealthcarePlan(plan.documentId);
      patch(plan.documentId, { reviewedAt: reviewedAt || new Date().toISOString(), previousReviewedAt: '' });
    } catch (err) {
      setErrors((e) => ({ ...e, [plan.documentId]: err instanceof Error ? err.message : 'Could not save your review.' }));
    } finally {
      setBusyId('');
    }
  };

  if (loadError) {
    return (
      <div id="hcpPanel" role="alert" style={{ ...box, borderColor: '#e0b4b4', background: '#fff8f8' }}>
        <div style={heading}>Healthcare Plans</div>
        <p style={{ ...intro, color: '#b3261e' }}>{loadError}</p>
        <button type="button" className={`${btn} ${btnSm}`} onClick={() => setReloadKey((k) => k + 1)}>Try Again</button>
      </div>
    );
  }
  if (plans.length === 0) return null;

  const pending = pendingPlans(plans);
  const allDone = pending.length === 0;
  const lastReviewed = plans.map((p) => p.reviewedAt).sort().at(-1) || '';

  return (
    <div id="hcpPanel" style={{ ...box, ...(allDone ? null : { borderColor: '#e2b34a', background: '#fffaf0' }) }}>
      <div style={heading}>Healthcare Plans</div>
      <p style={intro} role="status">
        {allDone
          ? `You have reviewed all ${plans.length} of this client's healthcare plans (most recently ${reviewDateUS(lastReviewed)}). Open any plan to read it again.`
          : `${pending.length} of ${plans.length} healthcare ${plans.length === 1 ? 'plan' : 'plans'} still ${pending.length === 1 ? 'needs' : 'need'} your review. Open each one, read it, then mark it as read. You only do this once per plan, and again when a plan is updated. This note cannot be submitted until every plan is reviewed.`}
      </p>
      <ul style={list}>
        {plans.map((p) => {
          const done = !!p.reviewedAt;
          return (
            <li key={p.documentId} id={`hcpPlan_${p.documentId}`} style={row}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={planTitle}>{p.title}</div>
                <div style={planMeta}>
                  {p.docDate ? `Plan dated ${formatDateUS(p.docDate)}` : 'Undated plan'}
                  {' · '}
                  {done ? (
                    <span style={{ color: '#0e7c4a', fontWeight: 600 }}>Reviewed {reviewDateUS(p.reviewedAt)}</span>
                  ) : p.previousReviewedAt ? (
                    <span style={{ color: '#9a5b00', fontWeight: 600 }}>Updated since your review on {reviewDateUS(p.previousReviewedAt)}</span>
                  ) : (
                    <span style={{ color: '#9a5b00', fontWeight: 600 }}>Not reviewed yet</span>
                  )}
                </div>
                {errors[p.documentId] && <div role="alert" style={{ color: '#b3261e', fontSize: 13, marginTop: 4 }}>{errors[p.documentId]}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className={`${btn} ${btnSm}`} onClick={() => void open(p)}>Open Plan</button>
                {!done && (
                  <button
                    type="button"
                    className={`${btnPrimary} ${btnSm}`}
                    disabled={!p.openedAt || busyId === p.documentId}
                    title={p.openedAt ? undefined : 'Open the plan first'}
                    onClick={() => void acknowledge(p)}
                  >
                    {busyId === p.documentId ? 'Saving…' : 'I Have Read This Plan'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const box: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 10, padding: '12px 14px', margin: '0 0 12px', background: '#f8fafc' };
const heading: React.CSSProperties = { fontWeight: 700, fontSize: '0.95rem', color: '#1f2937', marginBottom: 4 };
const intro: React.CSSProperties = { margin: '0 0 8px', fontSize: '0.88rem', lineHeight: 1.5, color: '#475569' };
const list: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' };
const planTitle: React.CSSProperties = { fontWeight: 600, fontSize: '0.9rem', color: '#1f2937', overflowWrap: 'anywhere' };
const planMeta: React.CSSProperties = { fontSize: '0.8rem', color: '#64748b', marginTop: 2 };
