'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getSubmission,
  deleteSubmission,
  type ProgressNoteFormData,
} from '@/lib/submissions';
import { getVitalRanges, getAgeGroupLabel } from '@/lib/vitalRanges';
import { useAuth } from '@/components/AuthProvider';
import RevisionHistory from '@/components/RevisionHistory';

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Convert YYYY-MM-DD to MM/DD/YYYY */
function fmtDate(v: string | undefined): string {
  if (!v) return '';
  const parts = v.split('-');
  if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
  return v;
}

/** Return true if value is non-empty and not just dashes */
function hasValue(v: string | undefined): boolean {
  if (!v) return false;
  const trimmed = v.trim();
  return trimmed !== '' && trimmed !== '--' && trimmed !== '-';
}

export default function SubmissionDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { user, role, loading: authLoading } = useAuth();
  const isNurse = role === 'nurse';
  const [formData, setFormData] = useState<ProgressNoteFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    const load = async () => {
      try {
        const data = await getSubmission(id);
        if (!data) {
          setNotFound(true);
          return;
        }
        // Nurses can only view their own notes. The Firestore rules enforce
        // this, but we also check client-side to render a clean 'not found'
        // page instead of a permission error if a nurse visits a bad URL.
        if (isNurse && user) {
          const nurseId = (data as unknown as Record<string, string>).nurseId;
          if (nurseId !== user.uid) {
            setNotFound(true);
            return;
          }
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
  }, [authLoading, id, isNurse, user]);

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
      router.push('/admin/submissions');
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

  if (notFound || !formData) {
    return (
      <div style={containerStyle}>
        <div style={wrapStyle}>
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p style={{ fontSize: 18, fontWeight: 600, color: '#c62828' }}>
              Submission not found
            </p>
            <Link href="/admin/submissions" style={backLinkStyle}>
              &larr; Back to Submissions
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Cast to dynamic record so we can access all fields including ones not in the interface
  const data = formData as unknown as Record<string, string>;

  const credential = data.q12_credential || '';
  const isLpnRn = /^(LPN|RN)$/i.test(credential);

  // Age-based vital signs range checking
  const ageStr = data.q5_ageYears || '';
  const patientDob = data.q4_dateofBirth || '';
  const vitalRanges = getVitalRanges(ageStr, patientDob);
  const ageGroupLabel = getAgeGroupLabel(ageStr, patientDob);

  const abnormalVitals: string[] = [];
  const parseNum = (v: string) => parseFloat((v || '').replace(/[^0-9.]/g, ''));

  if (data.q16_temperature) {
    const v = parseNum(data.q16_temperature);
    if (!isNaN(v) && (v < vitalRanges.temperature.low || v > vitalRanges.temperature.high))
      abnormalVitals.push(`Temperature: ${data.q16_temperature}°F (${v < vitalRanges.temperature.low ? 'LOW' : 'HIGH'})`);
  }
  if (data.q17_bloodPressure) {
    const parts = data.q17_bloodPressure.split('/');
    if (parts.length === 2) {
      const sys = parseFloat(parts[0]), dia = parseFloat(parts[1]);
      if (!isNaN(sys) && (sys < vitalRanges.systolic.low || sys > vitalRanges.systolic.high))
        abnormalVitals.push(`Systolic BP: ${sys} mmHg (${sys < vitalRanges.systolic.low ? 'LOW' : 'HIGH'})`);
      if (!isNaN(dia) && (dia < vitalRanges.diastolic.low || dia > vitalRanges.diastolic.high))
        abnormalVitals.push(`Diastolic BP: ${dia} mmHg (${dia < vitalRanges.diastolic.low ? 'LOW' : 'HIGH'})`);
    }
  }
  if (data.q18_pulse) {
    const v = parseNum(data.q18_pulse);
    if (!isNaN(v) && (v < vitalRanges.pulse.low || v > vitalRanges.pulse.high))
      abnormalVitals.push(`Pulse: ${data.q18_pulse} bpm (${v < vitalRanges.pulse.low ? 'LOW' : 'HIGH'})`);
  }
  if (data.q19_respiration) {
    const v = parseNum(data.q19_respiration);
    if (!isNaN(v) && (v < vitalRanges.respiration.low || v > vitalRanges.respiration.high))
      abnormalVitals.push(`Respirations: ${data.q19_respiration}/min (${v < vitalRanges.respiration.low ? 'LOW' : 'HIGH'})`);
  }
  if (data.q20_oxygenSaturation) {
    const v = parseNum(data.q20_oxygenSaturation);
    if (!isNaN(v) && (v < vitalRanges.oxygenSaturation.low || v > vitalRanges.oxygenSaturation.high))
      abnormalVitals.push(`SpO2: ${data.q20_oxygenSaturation}% (LOW)`);
  }
  if (data.q21_bloodGlucose) {
    const v = parseNum(data.q21_bloodGlucose);
    if (!isNaN(v) && (v < vitalRanges.bloodGlucose.low || v > vitalRanges.bloodGlucose.high))
      abnormalVitals.push(`Blood Glucose: ${data.q21_bloodGlucose} mg/dL (${v < vitalRanges.bloodGlucose.low ? 'LOW' : 'HIGH'})`);
  }

  // Build address string
  const addressParts = [
    data.q200_addr_line1,
    data.q200_city,
    data.q200_state,
    data.q200_postal,
  ].filter(Boolean);
  const address = addressParts.join(', ');

  // Helper: check if any field in a list has data
  const anyHasValue = (keys: string[]) => keys.some((k) => hasValue(data[k]));

  // System assessment configuration
  const systemAssessments = [
    {
      name: 'Neurological',
      statusKey: 'q30_neuroStatus',
      fields: [
        { label: 'Baseline', key: 'q30_neuroBaseline' },
        { label: 'Seizure Event', key: 'q30_seizureEvent' },
        { label: 'Seizure Onset', key: 'q30_seizureOnset' },
        { label: 'Seizure End', key: 'q30_seizureEnd' },
        { label: 'Seizure Duration', key: 'q30_seizureDuration' },
        { label: 'Seizure Description', key: 'q30_seizureDescription' },
        { label: 'Post-Ictal', key: 'q30_postIctal' },
        { label: 'Notes', key: 'q30_neuroNotes' },
      ],
    },
    {
      name: 'Cardiovascular',
      statusKey: 'q31_cardioStatus',
      fields: [
        { label: 'Heart Rhythm', key: 'q31_heartRhythm' },
        { label: 'Peripheral Pulses', key: 'q31_peripheralPulses' },
        { label: 'Edema', key: 'q31_edema' },
        { label: 'Capillary Refill', key: 'q31_capillaryRefill' },
        { label: 'Notes', key: 'q31_cardioNotes' },
      ],
    },
    {
      name: 'Respiratory',
      statusKey: 'q32_respStatus',
      fields: [
        { label: 'Breath Sounds', key: 'q32_breathSounds' },
        { label: 'Work of Breathing', key: 'q32_workOfBreathing' },
        { label: 'Cough', key: 'q32_cough' },
        { label: 'Supplemental O2', key: 'q32_supplementalO2' },
        { label: 'Notes', key: 'q32_respNotes' },
      ],
    },
    {
      name: 'Gastrointestinal',
      statusKey: 'q33_giStatus',
      fields: [
        { label: 'Abdomen', key: 'q33_abdomen' },
        { label: 'Bowel Sounds', key: 'q33_bowelSounds' },
        { label: 'BM This Shift', key: 'q33_bmThisShift' },
        { label: 'Stool Character', key: 'q33_stoolCharacter' },
        { label: 'Nausea/Vomiting', key: 'q33_nauseaVomiting' },
        { label: 'G-Tube Present', key: 'q33_gtubePresent' },
        { label: 'G-Tube Site Appearance', key: 'q33_gtubeSiteAppearance' },
        { label: 'G-Tube Site Notes', key: 'q33_gtubeSiteNotes' },
        { label: 'Notes', key: 'q33_giNotes' },
      ],
    },
    {
      name: 'Genitourinary',
      statusKey: 'q34_guStatus',
      fields: [
        { label: 'Urinary Output', key: 'q34_urinaryOutput' },
        { label: 'Urine Character', key: 'q34_urineCharacter' },
        { label: 'Catheter Present', key: 'q34_catheterPresent' },
        { label: 'Urinary Complaints', key: 'q34_urinaryComplaints' },
        { label: 'Catheter Care Provided', key: 'q34_catheterCareProvided' },
        { label: 'Catheter Care', key: 'q34_catheterCare' },
        { label: 'Notes', key: 'q34_guNotes' },
      ],
    },
    {
      name: 'Reproductive',
      statusKey: 'q35_reproStatus',
      fields: [
        { label: 'Discharge', key: 'q35_discharge' },
        { label: 'Menstrual Cycle', key: 'q35_menstrualCycle' },
        { label: 'Notes', key: 'q35_reproNotes' },
      ],
    },
    {
      name: 'Skin/Integumentary',
      statusKey: 'q36_skinStatus',
      fields: [
        { label: 'Skin Color/Tone', key: 'q36_skinColorTone' },
        { label: 'Skin Temp', key: 'q36_skinTemp' },
        { label: 'Turgor', key: 'q36_turgor' },
        { label: 'Wound/Breakdown', key: 'q36_woundBreakdown' },
        { label: 'Notes', key: 'q36_skinNotes' },
      ],
    },
    {
      name: 'Behavioral',
      statusKey: 'q37_behaveStatus',
      fields: [
        { label: 'Mood/Affect', key: 'q37_moodAffect' },
        { label: 'Behavior Concerns', key: 'q37_behaviorConcerns' },
        { label: 'De-escalation', key: 'q37_deescalation' },
        { label: 'Notes', key: 'q37_behaveNotes' },
      ],
    },
    {
      name: 'Endocrine',
      statusKey: 'q38_endocrineStatus',
      fields: [
        { label: 'Pre-Meal BG', key: 'q38_preMealBG' },
        { label: 'Post-Meal BG', key: 'q38_postMealBG' },
        { label: 'BG Time', key: 'q38_bgTime' },
        { label: 'BG In Range', key: 'q38_bgInRange' },
        { label: 'Insulin Administered', key: 'q38_insulinAdmin' },
        { label: 'Insulin Type', key: 'q38_insulinType' },
        { label: 'Insulin Dose', key: 'q38_insulinDose' },
        { label: 'Insulin Route', key: 'q38_insulinRoute' },
        { label: 'Insulin Time', key: 'q38_insulinTime' },
        { label: 'Oral Diabetes Med', key: 'q38_oralDiabetesMed' },
        { label: 'Diabetes Symptoms', key: 'q38_diabetesSymptoms' },
        { label: 'Foot Inspection', key: 'q38_footInspection' },
        { label: 'Foot Findings', key: 'q38_footFindings' },
        { label: 'Notes', key: 'q38_endocrineNotes' },
      ],
    },
  ];

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        {/* Actions bar - hidden on print */}
        <div style={actionsBarStyle} className="no-print">
          <Link href="/admin/submissions" style={backLinkStyle}>
            &larr; Back to Submissions
          </Link>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href={`/progress-note?edit=${id}`} style={editBtnStyle}>
              Edit
            </Link>
            <button onClick={handlePrint} style={primaryBtnStyle}>
              Print / Save as PDF
            </button>
            {!isNurse && (
              <button onClick={handleDelete} style={dangerBtnStyle}>
                Delete
              </button>
            )}
          </div>
        </div>

        {/* Header */}
        <div style={headerStyle}>
          <h1 style={companyNameStyle}>Heart and Soul Healthcare</h1>
          <p style={taglineStyle}>Compassionate Care, Professional Excellence</p>
          <h2 style={formTitleStyle}>HOME HEALTH PROGRESS NOTE</h2>
          <p style={formDateStyle}>Form Date: {fmtDate(data.q6_dateofService) || data.q6_dateofService}</p>
        </div>

        {/* Abnormal Vital Signs Alert Banner */}
        {abnormalVitals.length > 0 && (
          <div className="print-section" style={{
            background: '#fff3f0',
            border: '1px solid #ef9a9a',
            borderLeft: '4px solid #c62828',
            borderRadius: '4px',
            padding: '12px 16px',
            marginBottom: '16px',
          }}>
            <div style={{ fontWeight: 700, fontSize: '14px', color: '#b71c1c', marginBottom: '6px' }}>
              ⚠ ABNORMAL VITAL SIGNS DETECTED
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px', fontStyle: 'italic' }}>
              Ranges based on age group: {ageGroupLabel}
            </div>
            {abnormalVitals.map((alert, i) => (
              <div key={i} style={{ fontSize: '13px', color: '#c62828', padding: '2px 0' }}>
                • {alert}
              </div>
            ))}
          </div>
        )}

        {/* 1. CLIENT INFORMATION */}
        <ConditionalSection
          title="Client Information"
          keys={['q3_clientName', 'q4_dateofBirth', 'q5_ageYears', 'q10_primaryDiagnosis', 'q200_addr_line1']}
          data={data}
        >
          <FieldRow>
            <Field label="Client Name" value={data.q3_clientName} />
            <Field label="Date of Birth" value={fmtDate(data.q4_dateofBirth)} />
          </FieldRow>
          <FieldRow>
            <Field label="Age" value={data.q5_ageYears} />
            <Field label="Primary Diagnosis" value={data.q10_primaryDiagnosis} />
          </FieldRow>
          {hasValue(address) && <Field label="Address" value={address} />}
        </ConditionalSection>

        {/* 2. SHIFT INFORMATION */}
        <ConditionalSection
          title="Shift Information"
          keys={['q6_dateofService', 'q7_shiftStart', 'q62_shiftEndTime', 'q9_totalHours']}
          data={data}
        >
          <FieldRow>
            <Field label="Date of Service" value={fmtDate(data.q6_dateofService)} />
            <Field label="Start Time" value={data.q7_shiftStart} />
            <Field label="End Time" value={data.q62_shiftEndTime} />
          </FieldRow>
          {hasValue(data.q9_totalHours) && <Field label="Total Hours" value={data.q9_totalHours} />}
        </ConditionalSection>

        {/* 3. NURSE / CAREGIVER */}
        <ConditionalSection
          title="Nurse / Caregiver"
          keys={['q11_nurseName', 'q12_credential']}
          data={data}
        >
          <FieldRow>
            <Field label="Name" value={data.q11_nurseName} />
            <Field label="Credential" value={data.q12_credential} />
          </FieldRow>
        </ConditionalSection>

        {/* 4. CLIENT STATUS */}
        <ConditionalSection
          title="Client Status"
          keys={[
            'q13_alertnessLevel', 'q13_orientationLevel', 'q14_behavior',
            'q14_orientationBehaviorNotes', 'q15_generalAppearance', 'q15_appearance',
            'q15_skinColor', 'q15_skinIntegrity', 'q15_appearanceNotes',
          ]}
          data={data}
        >
          <FieldRow>
            {hasValue(data.q13_alertnessLevel) && <Field label="Alertness Level" value={data.q13_alertnessLevel} />}
            {hasValue(data.q13_orientationLevel) && <Field label="Orientation" value={data.q13_orientationLevel} />}
          </FieldRow>
          {hasValue(data.q14_behavior) && <Field label="Behavior" value={data.q14_behavior} />}
          {hasValue(data.q14_orientationBehaviorNotes) && (
            <TextBlock label="Orientation & Behavior Notes" value={data.q14_orientationBehaviorNotes} />
          )}
          <FieldRow>
            {hasValue(data.q15_generalAppearance) && <Field label="General Appearance" value={data.q15_generalAppearance} />}
            {hasValue(data.q15_appearance) && <Field label="Appearance" value={data.q15_appearance} />}
          </FieldRow>
          <FieldRow>
            {hasValue(data.q15_skinColor) && <Field label="Skin Color" value={data.q15_skinColor} />}
            {hasValue(data.q15_skinIntegrity) && <Field label="Skin Integrity" value={data.q15_skinIntegrity} />}
          </FieldRow>
          {hasValue(data.q15_appearanceNotes) && (
            <TextBlock label="Appearance Notes" value={data.q15_appearanceNotes} />
          )}
        </ConditionalSection>

        {/* 5. VITAL SIGNS */}
        <ConditionalSection
          title="Vital Signs"
          keys={[
            'q16_temperature', 'q17_bloodPressure', 'q18_pulse', 'q19_respiration',
            'q20_oxygenSaturation', 'q21_bloodGlucose', 'q21_oxygenSource', 'q22_additionalObservations',
          ]}
          data={data}
        >
          <div style={vitalsGridStyle}>
            <VitalCard label="Temperature" value={data.q16_temperature} />
            <VitalCard label="Blood Pressure" value={data.q17_bloodPressure} />
            <VitalCard label="Pulse" value={data.q18_pulse} />
            <VitalCard label="Respirations" value={data.q19_respiration} />
            <VitalCard label="SpO2" value={data.q20_oxygenSaturation} />
            <VitalCard label="Blood Glucose" value={data.q21_bloodGlucose} />
            {hasValue(data.q21_oxygenSource) && <VitalCard label="Oxygen Source" value={data.q21_oxygenSource} />}
          </div>
          {hasValue(data.q22_additionalObservations) && (
            <div style={{ padding: '8px 0' }}>
              <TextBlock label="Additional Observations" value={data.q22_additionalObservations} />
            </div>
          )}
        </ConditionalSection>

        {/* 6. OBSERVATIONS */}
        <ConditionalSection
          title="Observations"
          keys={[
            'q23_activityLevel', 'q24_scaleUsed', 'q24_painScore', 'q24_verbalComplaints',
            'q24_nonverbalCues', 'q25_painLocation', 'q26_painDescription', 'q26_painNotes',
          ]}
          data={data}
        >
          {hasValue(data.q23_activityLevel) && <TextBlock label="Activity Level" value={data.q23_activityLevel} />}
          <FieldRow>
            {hasValue(data.q24_scaleUsed) && <Field label="Pain Scale Used" value={data.q24_scaleUsed} />}
            {hasValue(data.q24_painScore) && <Field label="Pain Score" value={data.q24_painScore} />}
          </FieldRow>
          {hasValue(data.q24_verbalComplaints) && <TextBlock label="Verbal Complaints" value={data.q24_verbalComplaints} />}
          {hasValue(data.q24_nonverbalCues) && <TextBlock label="Non-verbal Cues" value={data.q24_nonverbalCues} />}
          {hasValue(data.q25_painLocation) && <Field label="Pain Location" value={data.q25_painLocation} />}
          {hasValue(data.q26_painDescription) && <TextBlock label="Pain Description" value={data.q26_painDescription} />}
          {hasValue(data.q26_painNotes) && <TextBlock label="Pain Notes" value={data.q26_painNotes} />}
        </ConditionalSection>

        {/* 7. SAFETY CHECKLIST */}
        <ConditionalSection
          title="Safety Checklist"
          keys={['q27_safetyChecklist', 'q27_safetyOther', 'q27_fallsInjuries', 'q27_allSystemsWNL', 'q27_safetyNotes']}
          data={data}
        >
          {hasValue(data.q27_safetyChecklist) && <TextBlock label="Checklist Items" value={data.q27_safetyChecklist} />}
          {hasValue(data.q27_safetyOther) && <TextBlock label="Other" value={data.q27_safetyOther} />}
          {hasValue(data.q27_fallsInjuries) && <TextBlock label="Falls/Injuries" value={data.q27_fallsInjuries} />}
          {hasValue(data.q27_allSystemsWNL) && <Field label="All Systems WNL" value={data.q27_allSystemsWNL} />}
          {hasValue(data.q27_safetyNotes) && <TextBlock label="Safety Notes" value={data.q27_safetyNotes} />}
        </ConditionalSection>

        {/* 8. SYSTEM ASSESSMENTS (LPN/RN only) */}
        {isLpnRn && anyHasValue(systemAssessments.flatMap((s) => [s.statusKey, ...s.fields.map((f) => f.key)])) && (
          <Section title="System Assessments">
            {systemAssessments.map((sys) => {
              const allKeys = [sys.statusKey, ...sys.fields.map((f) => f.key)];
              if (!anyHasValue(allKeys)) return null;
              const status = data[sys.statusKey] || '';
              const isWnl = /wn?l/i.test(status) || status.toLowerCase() === 'wnl';
              const isAbnormal = hasValue(status) && !isWnl;
              return (
                <div key={sys.name} style={systemSubsectionStyle}>
                  <div style={systemSubsectionHeaderStyle}>
                    <strong style={{ color: '#444', textTransform: 'uppercase' as const, fontSize: 12 }}>
                      {sys.name}
                    </strong>
                    {hasValue(status) && (
                      <span
                        style={{
                          marginLeft: 12,
                          color: isAbnormal ? '#c62828' : '#2e7d32',
                          fontWeight: 700,
                          fontSize: 12,
                          ...(isAbnormal
                            ? { background: '#ffebee', padding: '2px 8px', borderRadius: 3 }
                            : { background: '#e8f5e9', padding: '2px 8px', borderRadius: 3 }),
                        }}
                      >
                        {status}
                      </span>
                    )}
                  </div>
                  <div style={{ padding: '4px 0 8px 12px' }}>
                    {sys.fields.map((f) =>
                      hasValue(data[f.key]) ? (
                        <div key={f.key} style={{ padding: '2px 0', fontSize: 14 }}>
                          <span style={fieldLabelStyle}>{f.label}:</span> {data[f.key]}
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              );
            })}
          </Section>
        )}

        {/* 9. PERSONAL CARE / ADLs */}
        <ConditionalSection
          title="Personal Care / ADLs"
          keys={['q38_personalCare', 'q38_personalCareNotes']}
          data={data}
        >
          {hasValue(data.q38_personalCare) && <TextBlock label="Personal Care" value={data.q38_personalCare} />}
          {hasValue(data.q38_personalCareNotes) && <TextBlock label="Notes" value={data.q38_personalCareNotes} />}
        </ConditionalSection>

        {/* 10. NUTRITION & HYDRATION */}
        <ConditionalSection
          title="Nutrition & Hydration"
          keys={[
            'q38_breakfastPct', 'q38_lunchPct', 'q38_dinnerPct',
            'q38_fluidsEncouraged', 'q38_aspirationConcerns', 'q38_nutritionNotes',
          ]}
          data={data}
        >
          <FieldRow>
            {hasValue(data.q38_breakfastPct) && <Field label="Breakfast %" value={data.q38_breakfastPct} />}
            {hasValue(data.q38_lunchPct) && <Field label="Lunch %" value={data.q38_lunchPct} />}
            {hasValue(data.q38_dinnerPct) && <Field label="Dinner %" value={data.q38_dinnerPct} />}
          </FieldRow>
          {hasValue(data.q38_fluidsEncouraged) && <Field label="Fluids Encouraged" value={data.q38_fluidsEncouraged} />}
          {hasValue(data.q38_aspirationConcerns) && <TextBlock label="Aspiration Concerns" value={data.q38_aspirationConcerns} />}
          {hasValue(data.q38_nutritionNotes) && <TextBlock label="Notes" value={data.q38_nutritionNotes} />}
        </ConditionalSection>

        {/* 11. HOUSEKEEPING */}
        <ConditionalSection
          title="Housekeeping"
          keys={['q38_housekeeping']}
          data={data}
        >
          {hasValue(data.q38_housekeeping) && <TextBlock label="Items" value={data.q38_housekeeping} />}
        </ConditionalSection>

        {/* 12. ABUSE/NEGLECT SCREENING */}
        <ConditionalSection
          title="Abuse/Neglect Screening"
          keys={['q38_abuseScreening', 'q38_abuseNotes']}
          data={data}
        >
          {hasValue(data.q38_abuseScreening) && <Field label="Screening Performed" value={data.q38_abuseScreening} />}
          {hasValue(data.q38_abuseNotes) && <TextBlock label="Notes" value={data.q38_abuseNotes} />}
        </ConditionalSection>

        {/* 13. SKILLED NURSING INTERVENTIONS (LPN/RN only) */}
        {isLpnRn && anyHasValue(['q38_interventions', 'q39_interventionDetails', 'q40_skillJustification']) && (
          <Section title="Skilled Nursing Interventions">
            {hasValue(data.q38_interventions) && <TextBlock label="Interventions" value={data.q38_interventions} />}
            {hasValue(data.q39_interventionDetails) && <TextBlock label="Details" value={data.q39_interventionDetails} />}
            {hasValue(data.q40_skillJustification) && <TextBlock label="Justification" value={data.q40_skillJustification} />}
          </Section>
        )}

        {/* 14. MEDICATIONS (LPN/RN only) */}
        {isLpnRn && anyHasValue([
          'q43_scheduledMeds', 'q43_prnMeds', 'q43_medTolerance', 'q43_reactionMed',
          'q43_reactionTime', 'q43_reactionType', 'q43_reactionDescription',
          'q43_reactionPhysNotified', 'q43_reactionPhysTime', 'q43_safetyMeasures',
          'q43_interventionTime', 'q43_eventInterventionDetails', 'q43_postEventMonitoring',
        ]) && (
          <Section title="Medications">
            {hasValue(data.q43_scheduledMeds) && <TextBlock label="Scheduled" value={data.q43_scheduledMeds} />}
            {hasValue(data.q43_prnMeds) && <TextBlock label="PRN" value={data.q43_prnMeds} />}
            {hasValue(data.q43_medTolerance) && <TextBlock label="Tolerance" value={data.q43_medTolerance} />}
            {anyHasValue(['q43_reactionMed', 'q43_reactionTime', 'q43_reactionType', 'q43_reactionDescription', 'q43_reactionPhysNotified', 'q43_reactionPhysTime']) && (
              <div style={{ marginTop: 8 }}>
                <div style={textBlockLabelStyle}>Adverse Reaction:</div>
                <FieldRow>
                  {hasValue(data.q43_reactionMed) && <Field label="Medication" value={data.q43_reactionMed} />}
                  {hasValue(data.q43_reactionTime) && <Field label="Time" value={data.q43_reactionTime} />}
                  {hasValue(data.q43_reactionType) && <Field label="Type" value={data.q43_reactionType} />}
                </FieldRow>
                {hasValue(data.q43_reactionDescription) && <TextBlock label="Description" value={data.q43_reactionDescription} />}
                <FieldRow>
                  {hasValue(data.q43_reactionPhysNotified) && <Field label="Physician Notified" value={data.q43_reactionPhysNotified} />}
                  {hasValue(data.q43_reactionPhysTime) && <Field label="Notification Time" value={data.q43_reactionPhysTime} />}
                </FieldRow>
              </div>
            )}
            {hasValue(data.q43_safetyMeasures) && <TextBlock label="Safety Measures" value={data.q43_safetyMeasures} />}
            {hasValue(data.q43_interventionTime) && <Field label="Intervention Time" value={data.q43_interventionTime} />}
            {hasValue(data.q43_eventInterventionDetails) && <TextBlock label="Event Details" value={data.q43_eventInterventionDetails} />}
            {hasValue(data.q43_postEventMonitoring) && <TextBlock label="Post-Event" value={data.q43_postEventMonitoring} />}
          </Section>
        )}

        {/* 15. EDUCATION */}
        <ConditionalSection
          title="Education"
          keys={[
            'q41_educationProvided', 'q41_educationTopics', 'q41_educationRecipients',
            'q41_educationMethod', 'q41_teachback', 'q41_educationNotes',
          ]}
          data={data}
        >
          {hasValue(data.q41_educationProvided) && <Field label="Education Provided" value={data.q41_educationProvided} />}
          {hasValue(data.q41_educationTopics) && <TextBlock label="Topics" value={data.q41_educationTopics} />}
          {hasValue(data.q41_educationRecipients) && <Field label="Recipients" value={data.q41_educationRecipients} />}
          {hasValue(data.q41_educationMethod) && <Field label="Method" value={data.q41_educationMethod} />}
          {hasValue(data.q41_teachback) && <Field label="Teach-back" value={data.q41_teachback} />}
          {hasValue(data.q41_educationNotes) && <TextBlock label="Notes" value={data.q41_educationNotes} />}
        </ConditionalSection>

        {/* 16. GOALS OF CARE (LPN/RN only) */}
        {isLpnRn && anyHasValue([
          'q41_goalsDiscussed', 'q41_goal1Description', 'q41_goal1Progress', 'q41_goal1Notes',
          'q41_goal2Description', 'q41_goal2Progress', 'q41_goal2Notes',
          'q41_goal3Description', 'q41_goal3Progress', 'q41_goal3Notes',
          'q41_overallCarePlan', 'q41_goalsNotes',
        ]) && (
          <Section title="Goals of Care">
            {hasValue(data.q41_goalsDiscussed) && <Field label="Goals Discussed" value={data.q41_goalsDiscussed} />}
            {[1, 2, 3].map((n) => {
              const desc = data[`q41_goal${n}Description`];
              const progress = data[`q41_goal${n}Progress`];
              const notes = data[`q41_goal${n}Notes`];
              if (!hasValue(desc) && !hasValue(progress) && !hasValue(notes)) return null;
              return (
                <div key={n} style={{ marginTop: 8 }}>
                  <div style={{ ...textBlockLabelStyle, fontSize: 12 }}>Goal {n}:</div>
                  {hasValue(desc) && <Field label="Description" value={desc} />}
                  {hasValue(progress) && <Field label="Progress" value={progress} />}
                  {hasValue(notes) && <TextBlock label="Notes" value={notes} />}
                </div>
              );
            })}
            {hasValue(data.q41_overallCarePlan) && <TextBlock label="Overall Status" value={data.q41_overallCarePlan} />}
            {hasValue(data.q41_goalsNotes) && <TextBlock label="Notes" value={data.q41_goalsNotes} />}
          </Section>
        )}

        {/* 17. COMMUNICATION */}
        <ConditionalSection
          title="Communication"
          keys={['q51_communication']}
          data={data}
        >
          {hasValue(data.q51_communication) && <TextBlock label="Summary" value={data.q51_communication} />}
        </ConditionalSection>

        {/* 18. PHYSICIAN NOTIFICATION (LPN/RN only) */}
        {isLpnRn && anyHasValue([
          'q52_physicianNotify', 'q54_notificationTime', 'q53_physicianName',
          'q52_notifyMethod', 'q52_infoReported', 'q55_physicianOrders',
        ]) && (
          <Section title="Physician Notification">
            <FieldRow>
              {hasValue(data.q52_physicianNotify) && <Field label="Notified" value={data.q52_physicianNotify} />}
              {hasValue(data.q54_notificationTime) && <Field label="Time" value={data.q54_notificationTime} />}
            </FieldRow>
            <FieldRow>
              {hasValue(data.q53_physicianName) && <Field label="Name" value={data.q53_physicianName} />}
              {hasValue(data.q52_notifyMethod) && <Field label="Method" value={data.q52_notifyMethod} />}
            </FieldRow>
            {hasValue(data.q52_infoReported) && <TextBlock label="Info Reported" value={data.q52_infoReported} />}
            {hasValue(data.q55_physicianOrders) && <TextBlock label="Response" value={data.q55_physicianOrders} />}
          </Section>
        )}

        {/* 19. FAMILY/GUARDIAN NOTIFICATION */}
        <ConditionalSection
          title="Family/Guardian Notification"
          keys={[
            'q52_familyNotified', 'q52_familyTime', 'q52_familyContactName',
            'q52_familyRelationship', 'q52_familyMethod', 'q52_familyFollowup',
            'q52_familyFollowupTime', 'q52_familyNotes',
          ]}
          data={data}
        >
          <FieldRow>
            {hasValue(data.q52_familyNotified) && <Field label="Notified" value={data.q52_familyNotified} />}
            {hasValue(data.q52_familyTime) && <Field label="Time" value={data.q52_familyTime} />}
          </FieldRow>
          <FieldRow>
            {hasValue(data.q52_familyContactName) && <Field label="Contact" value={data.q52_familyContactName} />}
            {hasValue(data.q52_familyRelationship) && <Field label="Relationship" value={data.q52_familyRelationship} />}
          </FieldRow>
          {hasValue(data.q52_familyMethod) && <Field label="Method" value={data.q52_familyMethod} />}
          <FieldRow>
            {hasValue(data.q52_familyFollowup) && <Field label="Follow-up" value={data.q52_familyFollowup} />}
            {hasValue(data.q52_familyFollowupTime) && <Field label="Follow-up Time" value={data.q52_familyFollowupTime} />}
          </FieldRow>
          {hasValue(data.q52_familyNotes) && <TextBlock label="Notes" value={data.q52_familyNotes} />}
        </ConditionalSection>

        {/* 20. AGENCY SUPERVISOR NOTIFICATION */}
        <ConditionalSection
          title="Agency Supervisor Notification"
          keys={[
            'q52_supervisorNotified', 'q52_supervisorTime', 'q52_supervisorName',
            'q52_supervisorResponse', 'q52_incidentReportCompleted',
          ]}
          data={data}
        >
          <FieldRow>
            {hasValue(data.q52_supervisorNotified) && <Field label="Notified" value={data.q52_supervisorNotified} />}
            {hasValue(data.q52_supervisorTime) && <Field label="Time" value={data.q52_supervisorTime} />}
          </FieldRow>
          {hasValue(data.q52_supervisorName) && <Field label="Name" value={data.q52_supervisorName} />}
          {hasValue(data.q52_supervisorResponse) && <TextBlock label="Response" value={data.q52_supervisorResponse} />}
          {hasValue(data.q52_incidentReportCompleted) && <Field label="Incident Report" value={data.q52_incidentReportCompleted} />}
        </ConditionalSection>

        {/* 21. INCIDENTS */}
        <ConditionalSection
          title="Incidents"
          keys={['q56_incidents', 'q57_incidentDetails']}
          data={data}
        >
          {hasValue(data.q56_incidents) && <Field label="Type" value={data.q56_incidents} />}
          {hasValue(data.q57_incidentDetails) && <TextBlock label="Details" value={data.q57_incidentDetails} />}
        </ConditionalSection>

        {/* 22. END-OF-SHIFT HANDOFF */}
        <ConditionalSection
          title="End-of-Shift Handoff"
          keys={[
            'q60_oncomingCaregiver', 'q60_handoffTime', 'q60_verbalReport',
            'q60_conditionAtEnd', 'q60_endOfShiftNotes',
          ]}
          data={data}
        >
          <FieldRow>
            {hasValue(data.q60_oncomingCaregiver) && <Field label="Oncoming Caregiver" value={data.q60_oncomingCaregiver} />}
            {hasValue(data.q60_handoffTime) && <Field label="Handoff Time" value={data.q60_handoffTime} />}
          </FieldRow>
          {hasValue(data.q60_verbalReport) && <Field label="Verbal Report" value={data.q60_verbalReport} />}
          {hasValue(data.q60_conditionAtEnd) && <TextBlock label="Condition at End" value={data.q60_conditionAtEnd} />}
          {hasValue(data.q60_endOfShiftNotes) && <TextBlock label="Notes" value={data.q60_endOfShiftNotes} />}
        </ConditionalSection>

        {/* 23. FOLLOW-UP */}
        <ConditionalSection
          title="Follow-Up"
          keys={['q58_followup', 'q59_followupDetails', 'q60_nextShiftPlan']}
          data={data}
        >
          {hasValue(data.q58_followup) && <TextBlock label="Care/Referrals" value={data.q58_followup} />}
          {hasValue(data.q59_followupDetails) && <TextBlock label="Details" value={data.q59_followupDetails} />}
          {hasValue(data.q60_nextShiftPlan) && <TextBlock label="Next Shift Plan" value={data.q60_nextShiftPlan} />}
        </ConditionalSection>

        {/* 24. CLINICAL SUMMARY */}
        <ConditionalSection
          title="Clinical Summary"
          keys={['q63_clinicalSummary', 'q64_carePlanStatus']}
          data={data}
        >
          {hasValue(data.q63_clinicalSummary) && (
            <p style={{ margin: 0, lineHeight: 1.6 }}>{data.q63_clinicalSummary}</p>
          )}
          {hasValue(data.q64_carePlanStatus) && <TextBlock label="Care Plan Status" value={data.q64_carePlanStatus} />}
        </ConditionalSection>

        {/* 25. SIGNATURE */}
        <Section title="Signature">
          <FieldRow>
            <Field label="Printed Name" value={data.q11_nurseName} />
            <Field label="Credential" value={data.q12_credential} />
            <Field label="Date Signed" value={fmtDate(data.q62_shiftEndDate)} />
          </FieldRow>
          {hasValue(data.q61_signature) && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#444', textTransform: 'uppercase' as const, marginBottom: '4px' }}>
                SIGNATURE:
              </div>
              <img
                src={data.q61_signature}
                alt="Nurse signature"
                style={{ maxWidth: '300px', height: 'auto', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>
          )}
        </Section>

        {/* 26. ADDITIONAL NOTES */}
        <ConditionalSection
          title="Additional Notes"
          keys={['q66_additionalNotes']}
          data={data}
        >
          {hasValue(data.q66_additionalNotes) && (
            <p style={{ margin: 0, lineHeight: 1.6 }}>{data.q66_additionalNotes}</p>
          )}
        </ConditionalSection>

        {/* Footer */}
        <div style={footerStyle}>
          <p style={{ margin: 0 }}>
            Confidential - Heart and Soul Healthcare | This document contains protected health information (PHI)
          </p>
        </div>

        {/* Revision history — staff only (rules deny read for nurses) */}
        {!isNurse && <RevisionHistory submissionId={id} />}
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

/** Section that only renders if at least one of the given keys has data */
function ConditionalSection({
  title,
  keys,
  data,
  children,
}: {
  title: string;
  keys: string[];
  data: Record<string, string>;
  children: React.ReactNode;
}) {
  const show = keys.some((k) => hasValue(data[k]));
  if (!show) return null;
  return <Section title={title}>{children}</Section>;
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

const systemSubsectionStyle: React.CSSProperties = {
  borderBottom: '1px dotted #e0e0e0',
  paddingBottom: 4,
  marginBottom: 4,
};

const systemSubsectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '6px 0',
};

const footerStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize: 11,
  color: '#999',
  borderTop: '1px solid #ddd',
  paddingTop: 10,
  marginTop: 20,
};
