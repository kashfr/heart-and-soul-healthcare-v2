'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { FileText, PenLine } from 'lucide-react';
import PdfPreviewModal from '@/components/PdfPreviewModal';
import { formatDateUS } from '@/lib/dateFormat';
import { getServicePlans, servicePlanPdfUrl, type ServicePlanRecord } from '@/lib/servicePlans';
import { serviceTypesLabel, specialDietLabel, usedGoals, yesNoLabel } from '@/lib/servicePlanShared';

const NAVY = '#1a3a5c';

interface Props {
  patientId: string;
  /** Supervisors and admins write plans; nurses on the care team read them. */
  canAuthor: boolean;
}

/**
 * Client-dashboard tab: the current (newest) signed Service Plan in full, the
 * earlier plans as a history, and the door to write or revise one.
 */
export default function ServicePlanSection({ patientId, canAuthor }: Props) {
  const [plans, setPlans] = useState<ServicePlanRecord[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ServicePlanRecord | null>(null);
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
  const newHref = `/admin/clients/${patientId}/service-plan/new`;

  return (
    <div>
      <div style={headRow}>
        <p style={sub}>
          {current
            ? `Current plan signed ${formatDateUS(current.signedDate)}${current.createdByName ? ` by ${current.createdByName}` : ''}. Every signed plan is kept; a revision files a new one.`
            : 'The service plan describes the services, frequency, goals and discharge plan for this client, signed by the supervisor.'}
        </p>
        {canAuthor && plans !== undefined && !loadError && (
          <Link href={newHref} style={primaryLink}>
            <PenLine size={14} /> {current ? 'Revise service plan' : 'Write service plan'}
          </Link>
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
                <button type="button" onClick={() => setPreview(shown)} style={ghostBtn}><FileText size={13} /> View PDF</button>
                {canAuthor && shown.id !== current?.id && (
                  <Link href={`${newHref}?from=${encodeURIComponent(shown.id)}`} style={ghostLink}><PenLine size={13} /> Revise from this plan</Link>
                )}
              </div>
            </div>
            <dl style={grid}>
              <Row label="Client">{shown.clientName}{shown.dob ? `, DOB ${formatDateUS(shown.dob)}` : ''}</Row>
              <Row label="Address">{shown.address}</Row>
              <Row label="Diagnosis">{shown.diagnosis}</Row>
              <Row label="Functional limitations"><Pre>{shown.functionalLimitations}</Pre></Row>
              <Row label="Services required">{serviceTypesLabel(shown.serviceTypes)}</Row>
              <Row label="Nutritional needs">{shown.nutritionalNeeds}</Row>
              <Row label="Allergies">{shown.allergies}</Row>
              <Row label="Times and frequency">{shown.expectedTimesFrequency}</Row>
              <Row label="Expected duration">{shown.expectedDuration}</Row>
              <Row label="Description of services"><Pre>{shown.descriptionOfServices}</Pre></Row>
              <Row label="Regular diet">{yesNoLabel(shown.regularDiet)}</Row>
              <Row label="Special diet">{specialDietLabel(shown.specialDiets, shown.specialDietOther) || 'None'}</Row>
              <Row label="Special treatments">{shown.specialTreatments || 'None'}</Row>
              <Row label="Special equipment">{shown.specialEquipment || 'None'}</Row>
              <Row label="Behaviors"><Pre>{shown.behaviors || 'None'}</Pre></Row>
              <Row label="Personal care">
                Tub bath: {yesNoLabel(shown.tubBath)} · Bed bath: {yesNoLabel(shown.bedBath)} · Applying lotion to back: {yesNoLabel(shown.lotionToBack)}
              </Row>
              <Row label="Goals and objectives">
                <table style={goalTable}>
                  <thead>
                    <tr><th style={th}>Goal</th><th style={th}>Objective</th></tr>
                  </thead>
                  <tbody>
                    {usedGoals(shown.goals).map((g, i) => (
                      <tr key={i}><td style={td}>{g.goal}</td><td style={td}>{g.objective}</td></tr>
                    ))}
                  </tbody>
                </table>
              </Row>
              <Row label="Medications"><Pre>{shown.medications}</Pre></Row>
              <Row label="Discharge plans"><Pre>{shown.dischargePlans}</Pre></Row>
            </dl>
          </div>
        </>
      )}

      {preview && (
        <PdfPreviewModal title={`Service Plan, signed ${formatDateUS(preview.signedDate)}`} url={servicePlanPdfUrl(preview.id)} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

function Row({ label: l, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt style={dt}>{l}</dt>
      <dd style={dd}>{children}</dd>
    </>
  );
}

function Pre({ children }: { children: ReactNode }) {
  return <span style={{ whiteSpace: 'pre-wrap' }}>{children}</span>;
}

const headRow: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 };
const sub: CSSProperties = { fontSize: 12.5, color: '#7f8c8d', margin: 0, lineHeight: 1.5, flex: '1 1 320px' };
const primaryLink: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: NAVY, color: 'white', padding: '8px 13px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' };
const ghostBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #d0d7de', borderRadius: 6, padding: '6px 10px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: NAVY, fontFamily: 'inherit' };
const ghostLink: CSSProperties = { ...ghostBtn, textDecoration: 'none' };
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
const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(120px, max-content) 1fr', columnGap: 14, rowGap: 9, margin: 0, fontSize: 13.5, color: '#2c3e50' };
const dt: CSSProperties = { fontSize: 11.5, color: '#5c6b7a', textTransform: 'uppercase', letterSpacing: 0.4, paddingTop: 2 };
const dd: CSSProperties = { margin: 0, minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.45 };
const goalTable: CSSProperties = { borderCollapse: 'collapse', width: '100%', fontSize: 13 };
const th: CSSProperties = { textAlign: 'left', border: '1px solid #d0d7de', background: '#f8fafc', padding: '5px 8px', fontSize: 12, color: '#5c6b7a' };
const td: CSSProperties = { border: '1px solid #d0d7de', padding: '5px 8px', verticalAlign: 'top', whiteSpace: 'pre-wrap', width: '50%' };
