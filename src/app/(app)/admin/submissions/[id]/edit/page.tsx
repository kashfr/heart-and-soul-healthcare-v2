'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getSubmission,
  updateSubmission,
  type ProgressNoteFormData,
} from '@/lib/submissions';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditSubmissionPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [formData, setFormData] = useState<ProgressNoteFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
      } catch (error) {
        console.error('Failed to load submission:', error);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleChange = (field: keyof ProgressNoteFormData, value: string) => {
    setFormData((prev) => (prev ? { ...prev, [field]: value } : prev));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!formData) return;
    setSaving(true);
    try {
      const { submittedAt, status, ...updateData } = formData;
      await updateSubmission(id, updateData);
      setSaved(true);
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
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

  if (notFound || !formData) {
    return (
      <div style={containerStyle}>
        <div style={wrapStyle}>
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p style={{ fontSize: 18, fontWeight: 600, color: '#c62828' }}>
              Submission not found
            </p>
            <Link href="/admin/submissions" style={linkStyle}>
              &larr; Back to Submissions
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        {/* Actions bar */}
        <div style={actionsBarStyle}>
          <Link href={`/admin/submissions/${id}`} style={linkStyle}>
            &larr; Back to Detail View
          </Link>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {saved && (
              <span style={{ color: '#27ae60', fontWeight: 600, fontSize: 14 }}>
                Changes saved successfully
              </span>
            )}
            <Link href={`/admin/submissions/${id}`} style={cancelBtnStyle}>
              Cancel
            </Link>
            <button onClick={handleSave} disabled={saving} style={saveBtnStyle}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Header */}
        <div style={headerStyle}>
          <h1 style={titleStyle}>Edit Progress Note</h1>
          <p style={subtitleStyle}>Update fields as needed, then save your changes.</p>
        </div>

        {/* Client Information */}
        <Section title="Client Information">
          <FieldRow>
            <EditField label="Client Name" field="q3_clientName" value={formData.q3_clientName} onChange={handleChange} />
            <EditField label="Date of Birth" field="q4_dateofBirth" value={formData.q4_dateofBirth} onChange={handleChange} type="date" />
          </FieldRow>
          <FieldRow>
            <EditField label="Age" field="q5_ageYears" value={formData.q5_ageYears} onChange={handleChange} />
            <EditField label="Primary Diagnosis" field="q10_primaryDiagnosis" value={formData.q10_primaryDiagnosis} onChange={handleChange} />
          </FieldRow>
          <FieldRow>
            <EditField label="Address Line 1" field="q200_addr_line1" value={formData.q200_addr_line1} onChange={handleChange} />
            <EditField label="City" field="q200_city" value={formData.q200_city} onChange={handleChange} />
          </FieldRow>
          <FieldRow>
            <EditField label="State" field="q200_state" value={formData.q200_state} onChange={handleChange} />
            <EditField label="Postal Code" field="q200_postal" value={formData.q200_postal} onChange={handleChange} />
          </FieldRow>
        </Section>

        {/* Shift Information */}
        <Section title="Shift Information">
          <FieldRow>
            <EditField label="Date of Service" field="q6_dateofService" value={formData.q6_dateofService} onChange={handleChange} type="date" />
            <EditField label="Start Time" field="q7_shiftStart" value={formData.q7_shiftStart} onChange={handleChange} type="time" />
          </FieldRow>
          <FieldRow>
            <EditField label="End Time" field="q8_shiftEnd" value={formData.q8_shiftEnd} onChange={handleChange} type="time" />
            <EditField label="Total Hours" field="q9_totalHours" value={formData.q9_totalHours} onChange={handleChange} />
          </FieldRow>
        </Section>

        {/* Nurse / Caregiver */}
        <Section title="Nurse / Caregiver">
          <FieldRow>
            <EditField label="Nurse Name" field="q11_nurseName" value={formData.q11_nurseName} onChange={handleChange} />
            <EditField label="Credential" field="q12_credential" value={formData.q12_credential} onChange={handleChange} />
          </FieldRow>
        </Section>

        {/* Client Status */}
        <Section title="Client Status">
          <FieldRow>
            <EditField label="Alertness / Orientation Level" field="q13_orientationLevel" value={formData.q13_orientationLevel} onChange={handleChange} />
            <EditField label="Behavior" field="q14_behavior" value={formData.q14_behavior} onChange={handleChange} />
          </FieldRow>
          <EditField label="Appearance" field="q15_appearance" value={formData.q15_appearance} onChange={handleChange} />
        </Section>

        {/* Vital Signs */}
        <Section title="Vital Signs">
          <FieldRow>
            <EditField label="Temperature" field="q16_temperature" value={formData.q16_temperature} onChange={handleChange} />
            <EditField label="Blood Pressure" field="q17_bloodPressure" value={formData.q17_bloodPressure} onChange={handleChange} />
            <EditField label="Pulse" field="q18_pulse" value={formData.q18_pulse} onChange={handleChange} />
          </FieldRow>
          <FieldRow>
            <EditField label="Respirations" field="q19_respiration" value={formData.q19_respiration} onChange={handleChange} />
            <EditField label="SpO2" field="q20_oxygenSaturation" value={formData.q20_oxygenSaturation} onChange={handleChange} />
            <EditField label="Blood Glucose" field="q21_bloodGlucose" value={formData.q21_bloodGlucose} onChange={handleChange} />
          </FieldRow>
        </Section>

        {/* Observations */}
        <Section title="Observations">
          <EditField label="Activity Level" field="q23_activityLevel" value={formData.q23_activityLevel} onChange={handleChange} />
          <FieldRow>
            <EditField label="Pain Level (0-10)" field="q24_painLevel" value={formData.q24_painLevel} onChange={handleChange} />
            <EditField label="Pain Location" field="q25_painLocation" value={formData.q25_painLocation} onChange={handleChange} />
          </FieldRow>
          <EditArea label="Pain Description" field="q26_painDescription" value={formData.q26_painDescription} onChange={handleChange} />
          <EditArea label="Additional Observations" field="q22_additionalObservations" value={formData.q22_additionalObservations} onChange={handleChange} />
        </Section>

        {/* Clinical Summary */}
        <Section title="Clinical Summary">
          <EditArea label="Clinical Summary" field="q63_clinicalSummary" value={formData.q63_clinicalSummary} onChange={handleChange} rows={4} />
          <EditField label="Care Plan Status" field="q64_carePlanStatus" value={formData.q64_carePlanStatus} onChange={handleChange} />
        </Section>

        {/* Additional Notes */}
        <Section title="Additional Notes">
          <EditArea label="Additional Notes" field="q66_additionalNotes" value={formData.q66_additionalNotes} onChange={handleChange} rows={4} />
        </Section>

        {/* Bottom save bar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid #e0e0e0' }}>
          {saved && (
            <span style={{ color: '#27ae60', fontWeight: 600, fontSize: 14, alignSelf: 'center' }}>
              Changes saved successfully
            </span>
          )}
          <Link href={`/admin/submissions/${id}`} style={cancelBtnStyle}>
            Cancel
          </Link>
          <button onClick={handleSave} disabled={saving} style={saveBtnStyle}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={sectionStyle}>
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

function EditField({
  label,
  field,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  field: keyof ProgressNoteFormData;
  value: string;
  onChange: (field: keyof ProgressNoteFormData, value: string) => void;
  type?: string;
}) {
  return (
    <div style={editFieldWrapStyle}>
      <label style={editLabelStyle}>{label}</label>
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(field, e.target.value)}
        style={editInputStyle}
      />
    </div>
  );
}

function EditArea({
  label,
  field,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  field: keyof ProgressNoteFormData;
  value: string;
  onChange: (field: keyof ProgressNoteFormData, value: string) => void;
  rows?: number;
}) {
  return (
    <div style={editFieldWrapStyle}>
      <label style={editLabelStyle}>{label}</label>
      <textarea
        value={value || ''}
        onChange={(e) => onChange(field, e.target.value)}
        rows={rows}
        style={editTextareaStyle}
      />
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

const linkStyle: React.CSSProperties = {
  color: '#27ae60',
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: 14,
};

const headerStyle: React.CSSProperties = {
  textAlign: 'center',
  borderBottom: `3px solid ${NAVY}`,
  paddingBottom: 12,
  marginBottom: 20,
};

const titleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: NAVY,
  marginBottom: 4,
  marginTop: 0,
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#7f8c8d',
  margin: 0,
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
  padding: '12px',
};

const fieldRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  flexWrap: 'wrap',
};

const editFieldWrapStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 200,
  marginBottom: 12,
};

const editLabelStyle: React.CSSProperties = {
  display: 'block',
  fontWeight: 700,
  fontSize: 12,
  color: '#444',
  textTransform: 'uppercase',
  marginBottom: 4,
  letterSpacing: 0.3,
};

const editInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #ccc',
  borderRadius: 4,
  fontSize: 14,
  color: '#333',
  boxSizing: 'border-box',
};

const editTextareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #ccc',
  borderRadius: 4,
  fontSize: 14,
  color: '#333',
  boxSizing: 'border-box',
  resize: 'vertical',
  fontFamily: 'inherit',
};

const saveBtnStyle: React.CSSProperties = {
  background: '#27ae60',
  color: 'white',
  border: 'none',
  padding: '8px 24px',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
};

const cancelBtnStyle: React.CSSProperties = {
  display: 'inline-block',
  background: '#f5f5f5',
  color: '#333',
  border: '1px solid #ccc',
  padding: '8px 20px',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
  textDecoration: 'none',
  textAlign: 'center',
};
