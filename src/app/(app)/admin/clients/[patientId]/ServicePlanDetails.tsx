'use client';

import type { CSSProperties, ReactNode } from 'react';
import { formatDateUS } from '@/lib/dateFormat';
import { developedWithLabel, serviceTypesLabel, specialDietLabel, usedGoals, yesNoLabel, type ServicePlanRecord } from '@/lib/servicePlanShared';

/** The plan's content, read-only: shared by the Service plan tab and the review page. */
export default function ServicePlanDetails({ plan }: { plan: ServicePlanRecord }) {
  const developed = developedWithLabel(plan.developedWith, plan.developedWithNotes);
  return (
    <dl style={grid}>
      <Row label="Client">{plan.clientName}{plan.dob ? `, DOB ${formatDateUS(plan.dob)}` : ''}</Row>
      <Row label="Address">{plan.address}</Row>
      <Row label="Diagnosis">{plan.diagnosis}</Row>
      <Row label="Functional limitations"><Pre>{plan.functionalLimitations}</Pre></Row>
      <Row label="Services required">{serviceTypesLabel(plan.serviceTypes)}</Row>
      <Row label="Nutritional needs">{plan.nutritionalNeeds}</Row>
      <Row label="Allergies">{plan.allergies}</Row>
      <Row label="Times and frequency">{plan.expectedTimesFrequency}</Row>
      <Row label="Expected duration">{plan.expectedDuration}</Row>
      <Row label="Description of services"><Pre>{plan.descriptionOfServices}</Pre></Row>
      <Row label="Regular diet">{yesNoLabel(plan.regularDiet)}</Row>
      <Row label="Special diet">{specialDietLabel(plan.specialDiets, plan.specialDietOther) || 'None'}</Row>
      <Row label="Special treatments">{plan.specialTreatments || 'None'}</Row>
      <Row label="Special equipment">{plan.specialEquipment || 'None'}</Row>
      <Row label="Behaviors"><Pre>{plan.behaviors || 'None'}</Pre></Row>
      <Row label="Personal care">
        Tub bath: {yesNoLabel(plan.tubBath)} · Bed bath: {yesNoLabel(plan.bedBath)} · Applying lotion to back: {yesNoLabel(plan.lotionToBack)}
      </Row>
      <Row label="Goals and objectives">
        <table style={goalTable}>
          <thead>
            <tr><th style={th}>Goal</th><th style={th}>Objective</th></tr>
          </thead>
          <tbody>
            {usedGoals(plan.goals).map((g, i) => (
              <tr key={i}><td style={td}>{g.goal}</td><td style={td}>{g.objective}</td></tr>
            ))}
          </tbody>
        </table>
      </Row>
      <Row label="Medications"><Pre>{plan.medications}</Pre></Row>
      <Row label="Discharge plans"><Pre>{plan.dischargePlans}</Pre></Row>
      {developed && <Row label="Developed with">{developed}</Row>}
      {plan.caregiverSignature && (
        <Row label="Caregiver signature">{plan.caregiverName}{plan.caregiverRelationship ? ` (${plan.caregiverRelationship})` : ''}, signed {formatDateUS(plan.signedDate)}</Row>
      )}
    </dl>
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

const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(120px, max-content) 1fr', columnGap: 14, rowGap: 9, margin: 0, fontSize: 13.5, color: '#2c3e50' };
const dt: CSSProperties = { fontSize: 11.5, color: '#5c6b7a', textTransform: 'uppercase', letterSpacing: 0.4, paddingTop: 2 };
const dd: CSSProperties = { margin: 0, minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.45 };
const goalTable: CSSProperties = { borderCollapse: 'collapse', width: '100%', fontSize: 13 };
const th: CSSProperties = { textAlign: 'left', border: '1px solid #d0d7de', background: '#f8fafc', padding: '5px 8px', fontSize: 12, color: '#5c6b7a' };
const td: CSSProperties = { border: '1px solid #d0d7de', padding: '5px 8px', verticalAlign: 'top', whiteSpace: 'pre-wrap', width: '50%' };
