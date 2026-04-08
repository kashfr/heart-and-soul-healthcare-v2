'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getSubmission,
  deleteSubmission,
  toProgressNoteData,
  type ProgressNoteFormData,
} from '@/lib/submissions';
import type { ProgressNoteData } from '@/lib/pdf/ProgressNotePDF';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function SubmissionDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [formData, setFormData] = useState<ProgressNoteFormData | null>(null);
  const [noteData, setNoteData] = useState<ProgressNoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getSubmission(id);
        if (!data) {
          setNotFound(true);
          return;
        }
        setFormData(data);
        setNoteData(toProgressNoteData(data));
      } catch (error) {
        console.error('Failed to load submission:', error);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this progress note? This cannot be undone.'
    );
    if (!confirmed) return;
    try {
      await deleteSubmission(id);
      router.push('/progress-note/submissions');
    } catch (error) {
      console.error('Failed to delete submission:', error);
      alert('Failed to delete submission. Please try again.');
    }
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={wrapStyle}>
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p>Loading submission...</p>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !noteData || !formData) {
    return (
      <div style={containerStyle}>
        <div style={wrapStyle}>
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p style={{ fontSize: 18, fontWeight: 600, color: '#c62828' }}>
              Submission not found
            </p>
            <Link href="/progress-note/submissions" style={backLinkStyle}>
              &larr; Back to Submissions
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const d = noteData;

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        {/* Actions bar - hidden on print */}
        <div style={actionsBarStyle} className="no-print">
          <Link href="/progress-note/submissions" style={backLinkStyle}>
            &larr; Back to Submissions
          </Link>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href={`/progress-note?edit=${id}`} style={editBtnStyle}>
              Edit
            </Link>
            <button onClick={handlePrint} style={primaryBtnStyle}>
              Print / Save as PDF
            </button>
            <button onClick={handleDelete} style={dangerBtnStyle}>
              Delete
            </button>
          </div>
        </div>

        {/* Header */}
        <div style={headerStyle}>
          <h1 style={companyNameStyle}>Heart and Soul Healthcare</h1>
          <p style={taglineStyle}>Compassionate Care, Professional Excellence</p>
          <h2 style={formTitleStyle}>HOME HEALTH PROGRESS NOTE</h2>
          <p style={formDateStyle}>Form Date: {d.shift.dateOfService}</p>
        </div>

        {/* Client Information */}
        <Section title="Client Information">
          <FieldRow>
            <Field label="Client Name" value={d.client.name} />
            <Field label="Date of Birth" value={d.client.dob} />
          </FieldRow>
          <FieldRow>
            <Field label="Age" value={String(d.client.age)} />
            <Field label="Primary Diagnosis" value={d.client.diagnosis} />
          </FieldRow>
          <Field label="Address" value={d.client.address} />
        </Section>

        {/* Shift Information */}
        <Section title="Shift Information">
          <FieldRow>
            <Field label="Date of Service" value={d.shift.dateOfService} />
            <Field label="Start Time" value={d.shift.startTime} />
            <Field label="End Time" value={d.shift.endTime} />
          </FieldRow>
          <Field label="Total Hours" value={d.shift.totalHours} />
        </Section>

        {/* Nurse / Caregiver */}
        <Section title="Nurse / Caregiver">
          <FieldRow>
            <Field label="Name" value={d.nurse.name} />
            <Field label="Credential" value={d.nurse.credential} />
          </FieldRow>
        </Section>

        {/* Client Status */}
        <Section title="Client Status & Orientation">
          <FieldRow>
            <Field label="Alertness" value={d.status.alertness} />
            <Field label="Appearance" value={d.status.appearance} />
          </FieldRow>
          <Field label="Orientation" value={d.status.orientation} />
        </Section>

        {/* Vital Signs */}
        <Section title="Vital Signs">
          <div style={vitalsGridStyle}>
            <VitalCard label="Temperature" value={d.vitals.temp} />
            <VitalCard label="Blood Pressure" value={d.vitals.bp} />
            <VitalCard label="Pulse" value={d.vitals.pulse} />
            <VitalCard label="Respirations" value={d.vitals.resp} />
            <VitalCard label="SpO2" value={d.vitals.spo2} />
            <VitalCard label="Blood Glucose" value={d.vitals.bloodGlucose} />
          </div>
        </Section>

        {/* Observations */}
        <Section title="Observations">
          <TextBlock label="Activity Level" value={d.observations.activity} />
          <TextBlock label="Pain Assessment" value={d.observations.pain} />
          {formData.q22_additionalObservations && (
            <TextBlock label="Additional Observations" value={formData.q22_additionalObservations} />
          )}
        </Section>

        {/* System Assessments */}
        <Section title="System Assessments">
          <div style={systemTableStyle}>
            <div style={systemHeaderRowStyle}>
              <div style={systemColSystemStyle}><strong>SYSTEM</strong></div>
              <div style={systemColStatusStyle}><strong>STATUS</strong></div>
              <div style={systemColNotesStyle}><strong>NOTES</strong></div>
            </div>
            {d.systems.map((sys, i) => (
              <div
                key={sys.system}
                style={{
                  ...systemRowStyle,
                  backgroundColor: i % 2 === 1 ? '#f9fafb' : 'transparent',
                }}
              >
                <div style={systemColSystemStyle}>
                  <strong style={{ color: '#444', textTransform: 'uppercase', fontSize: 12 }}>
                    {sys.system}
                  </strong>
                </div>
                <div style={systemColStatusStyle}>
                  <span
                    style={{
                      color: sys.status === 'WNL' ? '#2e7d32' : '#c62828',
                      fontWeight: 700,
                      ...(sys.status !== 'WNL'
                        ? { background: '#ffebee', padding: '2px 6px', borderRadius: 3 }
                        : {}),
                    }}
                  >
                    {sys.status}
                  </span>
                </div>
                <div style={systemColNotesStyle}>
                  {sys.notes || '--'}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Skilled Nursing Interventions */}
        <Section title="Skilled Nursing Interventions">
          <TextBlock label="Interventions Performed" value={d.interventions.performed} />
          <TextBlock label="Detailed Description" value={formData.q39_interventionDetails} />
          <TextBlock label="Justification for Skilled Care" value={d.interventions.justification} />
          <TextBlock label="Education Provided" value={d.interventions.education} />
          <TextBlock label="Patient Response" value={d.interventions.patientResponse} />
        </Section>

        {/* Medications & Treatments */}
        <Section title="Medications & Treatments">
          <TextBlock label="Medications Administered" value={d.medications.given} />
          <TextBlock label="Compliance" value={d.medications.compliance} />
          <TextBlock label="Side Effects" value={d.medications.sideEffects} />
          <TextBlock label="Treatments Performed" value={d.medications.treatments} />
          <TextBlock label="Equipment / DME" value={d.medications.equipment} />
          {formData.q48_equipmentIssues && (
            <TextBlock label="Equipment Issues" value={formData.q48_equipmentIssues} />
          )}
          {formData.q49_homeEnvironment && (
            <TextBlock label="Home Environment" value={formData.q49_homeEnvironment} />
          )}
          {formData.q50_caregiverObs && (
            <TextBlock label="Caregiver Observations" value={formData.q50_caregiverObs} />
          )}
        </Section>

        {/* Communication */}
        <Section title="Communication">
          <TextBlock label="Physician Notification" value={d.communication.physicianNotified} />
          <TextBlock label="Incidents / Unusual Occurrences" value={d.communication.incidents} />
          <TextBlock label="Follow-Up" value={d.communication.followUp} />
          <TextBlock label="Next Shift Plan" value={d.communication.nextShiftPlan} />
        </Section>

        {/* Clinical Summary */}
        <Section title="Clinical Summary">
          <p style={{ margin: 0, lineHeight: 1.6 }}>{d.signature.clinicalSummary}</p>
          {formData.q64_carePlanStatus && (
            <TextBlock label="Care Plan Status" value={formData.q64_carePlanStatus} />
          )}
          {formData.q66_additionalNotes && (
            <TextBlock label="Additional Notes" value={formData.q66_additionalNotes} />
          )}
        </Section>

        {/* Signature */}
        <Section title="Signature">
          <FieldRow>
            <Field label="Printed Name" value={d.signature.printedName} />
            <Field label="Credential" value={d.signature.credential} />
            <Field label="Date Signed" value={d.signature.dateSigned} />
          </FieldRow>
          {d.signature.signatureImage && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#444', textTransform: 'uppercase' as const, marginBottom: '4px' }}>
                SIGNATURE:
              </div>
              <img
                src={d.signature.signatureImage}
                alt="Nurse signature"
                style={{ maxWidth: '300px', height: 'auto', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>
          )}
        </Section>

        {/* Footer */}
        <div style={footerStyle}>
          <p style={{ margin: 0 }}>
            Confidential - Heart and Soul Healthcare | This document contains protected health information (PHI)
          </p>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-section { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}

// --- Sub-components ---

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={sectionStyle} className="print-section">
      <div style={sectionHeaderStyle}>
        <strong style={sectionTitleStyle}>{title}</strong>
      </div>
      <div style={sectionBodyStyle}>{children}</div>
    </div>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div style={fieldRowStyle}>{children}</div>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={fieldStyle}>
      <span style={fieldLabelStyle}>{label}:</span>
      <span>{value || '--'}</span>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={textBlockStyle}>
      <div style={textBlockLabelStyle}>{label}:</div>
      <div>{value || '--'}</div>
    </div>
  );
}

function VitalCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={vitalCardStyle}>
      <div style={vitalLabelStyle}>{label}</div>
      <div style={vitalValueStyle}>{value || '--'}</div>
    </div>
  );
}

// --- Inline styles ---

const NAVY = '#1a3a5c';
const LIGHT_BLUE = '#e8eef4';

const containerStyle: React.CSSProperties = {
  maxWidth: 900,
  margin: '0 auto',
  padding: 20,
};

const wrapStyle: React.CSSProperties = {
  background: 'white',
  padding: 30,
  borderRadius: 8,
  boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
};

const actionsBarStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 20,
  paddingBottom: 16,
  borderBottom: '1px solid #e0e0e0',
};

const backLinkStyle: React.CSSProperties = {
  color: '#27ae60',
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: 14,
};

const primaryBtnStyle: React.CSSProperties = {
  background: '#27ae60',
  color: 'white',
  border: 'none',
  padding: '8px 20px',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
};

const secondaryBtnStyle: React.CSSProperties = {
  background: '#34495e',
  color: 'white',
  border: 'none',
  padding: '8px 20px',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
};

const editBtnStyle: React.CSSProperties = {
  display: 'inline-block',
  background: '#34495e',
  color: 'white',
  border: 'none',
  padding: '8px 20px',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
  textDecoration: 'none',
};

const dangerBtnStyle: React.CSSProperties = {
  background: '#f5f5f5',
  color: '#c44',
  border: '1px solid #ddd',
  padding: '8px 20px',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
};

const headerStyle: React.CSSProperties = {
  textAlign: 'center',
  borderBottom: `3px solid ${NAVY}`,
  paddingBottom: 12,
  marginBottom: 20,
};

const companyNameStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: NAVY,
  marginBottom: 2,
  marginTop: 0,
};

const taglineStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#666',
  margin: '0 0 10px 0',
};

const formTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: NAVY,
  letterSpacing: 1,
  margin: 0,
};

const formDateStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#555',
  marginTop: 4,
  marginBottom: 0,
};

const sectionStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  borderRadius: 4,
  marginBottom: 16,
  overflow: 'hidden',
};

const sectionHeaderStyle: React.CSSProperties = {
  background: LIGHT_BLUE,
  padding: '6px 12px',
  borderBottom: '1px solid #ccc',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13,
  color: NAVY,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const sectionBodyStyle: React.CSSProperties = {
  padding: '10px 12px',
};

const fieldRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  flexWrap: 'wrap',
};

const fieldStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 180,
  padding: '4px 0',
  borderBottom: '1px dotted #e0e0e0',
  fontSize: 14,
};

const fieldLabelStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 11,
  color: '#444',
  textTransform: 'uppercase',
  marginRight: 6,
};

const textBlockStyle: React.CSSProperties = {
  padding: '6px 0',
  borderBottom: '1px dotted #e0e0e0',
  fontSize: 14,
  lineHeight: 1.5,
};

const textBlockLabelStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 11,
  color: '#444',
  textTransform: 'uppercase',
  marginBottom: 2,
};

const vitalsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 0,
};

const vitalCardStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRight: '1px solid #eee',
  borderBottom: '1px solid #eee',
};

const vitalLabelStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 10,
  color: '#666',
  textTransform: 'uppercase',
};

const vitalValueStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: '#1a1a1a',
  marginTop: 2,
};

const systemTableStyle: React.CSSProperties = {
  width: '100%',
};

const systemHeaderRowStyle: React.CSSProperties = {
  display: 'flex',
  padding: '6px 0',
  borderBottom: '1px solid #ccc',
  fontSize: 12,
  color: '#444',
};

const systemRowStyle: React.CSSProperties = {
  display: 'flex',
  padding: '6px 0',
  borderBottom: '1px dotted #e0e0e0',
  fontSize: 13,
  alignItems: 'flex-start',
};

const systemColSystemStyle: React.CSSProperties = {
  width: 150,
  flexShrink: 0,
};

const systemColStatusStyle: React.CSSProperties = {
  width: 100,
  flexShrink: 0,
};

const systemColNotesStyle: React.CSSProperties = {
  flex: 1,
};

const footerStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize: 11,
  color: '#999',
  borderTop: '1px solid #ddd',
  paddingTop: 10,
  marginTop: 20,
};
