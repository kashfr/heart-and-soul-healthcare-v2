'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { CheckCircle2, FileText, PenLine } from 'lucide-react';
import PdfPreviewModal from '@/components/PdfPreviewModal';
import { formatDateUS } from '@/lib/dateFormat';
import { getServicePlans, servicePlanPdfUrl, servicePlanReviewPdfUrl, type ServicePlanRecord } from '@/lib/servicePlans';
import { addDaysISO, lastReviewedISO, SERVICE_PLAN_MAX_DAYS } from '@/lib/servicePlanShared';
import ServicePlanDetails from './ServicePlanDetails';

const NAVY = '#1a3a5c';

interface Props {
  patientId: string;
  /** Supervisors and admins write and review plans; nurses on the care team read them. */
  canAuthor: boolean;
}

function todayAgencyISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/**
 * Client-dashboard tab: the current (newest) signed Service Plan in full, its
 * reviews, the 62-day due date, the earlier plans as a history, and the doors
 * to review (no changes) or revise (a new signed plan).
 */
export default function ServicePlanSection({ patientId, canAuthor }: Props) {
  const [plans, setPlans] = useState<ServicePlanRecord[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; url: string } | null>(null);
  const [showing, setShowing] = useState<string>('');

  // Keyed by patient on the dashboard, so a mount is always a fresh client.
  useEffect(() => {
    let cancelled = false;
    getServicePlans(patientId)
      .then((list) => { if (!cancelled) { setPlans(list); setShowing(list[0]?.id || ''); } })
      .catch((err) => { console.error('Service plans load failed:', err); if (!cancelled) setLoadError('Could not load the service plan.'); });
    return () => { cancelled = true; };
  }, [patientId]);

  const current = plans?.[0] || null;
  const shown = plans?.find((p) => p.id === showing) || current;
  const base = `/admin/clients/${patientId}/service-plan`;
  const lastISO = current ? lastReviewedISO(current) : '';
  const dueISO = lastISO ? addDaysISO(lastISO, SERVICE_PLAN_MAX_DAYS) : '';
  const overdue = !!dueISO && dueISO < todayAgencyISO();

  return (
    <div>
      <div style={headRow}>
        <div style={{ flex: '1 1 320px' }}>
          {current ? (
            <>
              <p style={sub}>
                Current plan signed {formatDateUS(current.signedDate)}{current.createdByName ? ` by ${current.createdByName}` : ''}
                {current.reviews.length > 0 ? `, last reviewed ${formatDateUS(lastISO)}` : ''}.
              </p>
              <p style={{ ...sub, marginTop: 2, color: overdue ? '#b3261e' : '#7f8c8d', fontWeight: overdue ? 700 : 400 }}>
                {overdue ? `Review overdue since ${formatDateUS(dueISO)}.` : `Next review due by ${formatDateUS(dueISO)}.`} Nursing service plans are reviewed at least every {SERVICE_PLAN_MAX_DAYS} days.
              </p>
            </>
          ) : (
            <p style={sub}>The service plan describes the services, frequency, goals and discharge plan for this client, signed by the supervisor.</p>
          )}
        </div>
        {canAuthor && plans !== undefined && !loadError && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {current && (
              <Link href={`${base}/review`} style={primaryLink}>
                <CheckCircle2 size={14} /> Review, no changes
              </Link>
            )}
            <Link href={`${base}/new`} style={current ? secondaryLink : primaryLink}>
              <PenLine size={14} /> {current ? 'Revise service plan' : 'Write service plan'}
            </Link>
          </div>
        )}
      </div>

      {loadError && <div style={errBox}>{loadError}</div>}
      {!loadError && plans === undefined && <div style={muted}>Loading...</div>}
      {!loadError && plans !== undefined && !current && (
        <div style={muted}>No service plan on file.{canAuthor ? ' Write one so the care team and a surveyor can see what services this client receives and why.' : ''}</div>
      )}

      {shown && (
        <>
          {plans && plans.length > 1 && (
            <div style={historyRow}>
              <span style={historyLabel}>Plans on file:</span>
              {plans.map((p, i) => (
                <button key={p.id} type="button" onClick={() => setShowing(p.id)} style={{ ...historyChip, ...(p.id === shown.id ? historyChipOn : null) }}>
                  {formatDateUS(p.signedDate)}{i === 0 ? ' (current)' : ''}
                </button>
              ))}
            </div>
          )}
          <div style={planCard}>
            <div style={planHead}>
              <div>
                <div style={planTitle}>Service Plan{shown.id !== current?.id ? ' (superseded)' : ''}</div>
                <div style={planMeta}>Signed {formatDateUS(shown.signedDate)} by {shown.supervisorName}{shown.supervisorCredentials ? `, ${shown.supervisorCredentials}` : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setPreview({ title: `Service Plan, signed ${formatDateUS(shown.signedDate)}`, url: servicePlanPdfUrl(shown.id) })} style={ghostBtn}>
                  <FileText size={13} /> View PDF
                </button>
                {canAuthor && shown.id !== current?.id && (
                  <Link href={`${base}/new?from=${encodeURIComponent(shown.id)}`} style={ghostLink}><PenLine size={13} /> Revise from this plan</Link>
                )}
              </div>
            </div>

            {shown.reviews.length > 0 && (
              <div style={reviewBox}>
                <div style={reviewTitle}>Reviews since signing</div>
                <ul style={reviewList}>
                  {[...shown.reviews].reverse().map((r) => (
                    <li key={r.id} style={reviewItem}>
                      <CheckCircle2 size={14} color="#1e5c1e" style={{ flexShrink: 0, marginTop: 2 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong>{formatDateUS(r.reviewedDate)}</strong>: reviewed by {r.reviewerName}{r.reviewerCredentials ? `, ${r.reviewerCredentials}` : ''}, no changes.
                        {r.note && <div style={{ color: '#5c6b7a', whiteSpace: 'pre-wrap' }}>{r.note}</div>}
                      </div>
                      <button type="button" style={linkBtn} onClick={() => setPreview({ title: `Service Plan Review, ${formatDateUS(r.reviewedDate)}`, url: servicePlanReviewPdfUrl(shown.id, r.id) })}>
                        View
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <ServicePlanDetails plan={shown} />
          </div>
        </>
      )}

      {preview && <PdfPreviewModal title={preview.title} url={preview.url} onClose={() => setPreview(null)} />}
    </div>
  );
}

const headRow: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 };
const sub: CSSProperties = { fontSize: 12.5, color: '#7f8c8d', margin: 0, lineHeight: 1.5 };
const primaryLink: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: NAVY, color: 'white', border: `1px solid ${NAVY}`, padding: '8px 13px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' };
const secondaryLink: CSSProperties = { ...primaryLink, background: 'white', color: NAVY };
const ghostBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #d0d7de', borderRadius: 6, padding: '6px 10px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: NAVY, fontFamily: 'inherit' };
const ghostLink: CSSProperties = { ...ghostBtn, textDecoration: 'none' };
const linkBtn: CSSProperties = { background: 'transparent', border: 'none', color: NAVY, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', padding: 0, flexShrink: 0 };
const errBox: CSSProperties = { background: '#fdeaea', color: '#b3261e', borderRadius: 6, padding: '8px 11px', fontSize: 13 };
const muted: CSSProperties = { fontSize: 13, color: '#5c6b7a' };
const historyRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 };
const historyLabel: CSSProperties = { fontSize: 12, fontWeight: 700, color: '#8a949e', textTransform: 'uppercase', letterSpacing: 0.4, marginRight: 4 };
const historyChip: CSSProperties = { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', padding: '5px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const historyChipOn: CSSProperties = { background: '#e8eef4', color: NAVY, borderColor: NAVY };
const planCard: CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 };
const planHead: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f1f3f5' };
const planTitle: CSSProperties = { fontSize: 15, fontWeight: 700, color: NAVY };
const planMeta: CSSProperties = { fontSize: 12.5, color: '#5c6b7a', marginTop: 2 };
const reviewBox: CSSProperties = { background: '#f3f9f3', border: '1px solid #d4e8d4', borderRadius: 8, padding: '10px 12px', marginBottom: 14 };
const reviewTitle: CSSProperties = { fontSize: 11.5, fontWeight: 700, color: '#1e5c1e', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 };
const reviewList: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 };
const reviewItem: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#2c3e50', lineHeight: 1.45 };
