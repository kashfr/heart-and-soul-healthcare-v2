import React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from '@react-pdf/renderer';

/**
 * Raw form data stored on a progress-note document. Every field is a string
 * because that's how react-hook-form + Firestore stored them. Unknown / future
 * fields are tolerated — `hasValue` skips empty ones and sections only render
 * when at least one of their keys has real content.
 */
export type ProgressNoteFormData = Record<string, string | undefined>;

export interface ProgressNotePDFProps {
  data: ProgressNoteFormData;
}

// Legacy export kept so any lingering imports don't break.
export type ProgressNoteData = ProgressNotePDFProps;

const NAVY = '#1a3a5c';
const LIGHT_BLUE = '#e8eef4';
const GREEN = '#2e7d32';
const RED = '#c62828';
const GRAY_TEXT = '#444';
const LIGHT_GRAY = '#e0e0e0';

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a1a1a',
    padding: 36,
    backgroundColor: '#ffffff',
  },
  header: {
    textAlign: 'center',
    borderBottomWidth: 3,
    borderBottomColor: NAVY,
    borderBottomStyle: 'solid',
    paddingBottom: 10,
    marginBottom: 14,
  },
  companyName: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    letterSpacing: 0.5,
  },
  companyTagline: {
    fontSize: 9,
    color: '#666',
    marginBottom: 6,
  },
  formTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  formDate: {
    fontSize: 9,
    color: '#555',
    marginTop: 3,
  },
  alertBanner: {
    backgroundColor: '#fff3f0',
    borderWidth: 1,
    borderColor: '#ef9a9a',
    borderLeftWidth: 3,
    borderLeftColor: RED,
    borderRadius: 2,
    padding: 6,
    marginBottom: 10,
  },
  alertBannerTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#b71c1c',
    marginBottom: 3,
  },
  alertBannerSub: {
    fontSize: 8,
    color: '#777',
    fontStyle: 'italic',
    marginBottom: 2,
  },
  alertBannerItem: {
    fontSize: 9,
    color: RED,
  },
  section: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 2,
    marginBottom: 10,
  },
  sectionHeader: {
    backgroundColor: LIGHT_BLUE,
    padding: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  sectionHeaderText: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionBody: {
    padding: 6,
    paddingHorizontal: 8,
  },
  fieldRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: LIGHT_GRAY,
    borderBottomStyle: 'dotted',
  },
  fieldLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: GRAY_TEXT,
    textTransform: 'uppercase',
    width: 110,
    marginRight: 4,
  },
  fieldValue: {
    fontSize: 10,
    color: '#1a1a1a',
    flex: 1,
  },
  textBlock: {
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: LIGHT_GRAY,
    borderBottomStyle: 'dotted',
  },
  textBlockLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: GRAY_TEXT,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  textBlockValue: {
    fontSize: 10,
    color: '#1a1a1a',
    lineHeight: 1.4,
  },
  fieldGrid: {
    flexDirection: 'row',
  },
  fieldGridItem: {
    flex: 1,
  },
  vitalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  vitalCell: {
    width: '33.33%',
    padding: 5,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: '#eee',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  vitalCellAlert: {
    width: '33.33%',
    padding: 5,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: '#eee',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff3f0',
  },
  vitalLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: '#666',
    textTransform: 'uppercase',
  },
  vitalValue: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
    marginTop: 1,
  },
  vitalValueAlert: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: RED,
    marginTop: 1,
  },
  systemSubsection: {
    borderBottomWidth: 1,
    borderBottomColor: LIGHT_GRAY,
    borderBottomStyle: 'dotted',
    paddingBottom: 3,
    marginBottom: 3,
  },
  systemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  systemLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: GRAY_TEXT,
    textTransform: 'uppercase',
  },
  statusWNL: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: GREEN,
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 2,
    marginLeft: 10,
  },
  statusAbnormal: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: RED,
    backgroundColor: '#ffebee',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 2,
    marginLeft: 10,
  },
  systemFieldRow: {
    flexDirection: 'row',
    paddingVertical: 1,
    paddingLeft: 12,
  },
  systemFieldLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: GRAY_TEXT,
    textTransform: 'uppercase',
    width: 120,
    marginRight: 4,
  },
  systemFieldValue: {
    fontSize: 9,
    color: '#1a1a1a',
    flex: 1,
  },
  subBlockLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: GRAY_TEXT,
    textTransform: 'uppercase',
    marginTop: 4,
    marginBottom: 2,
  },
  signatureGrid: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 6,
  },
  signatureLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: GRAY_TEXT,
    textTransform: 'uppercase',
    marginTop: 4,
    marginBottom: 2,
  },
  footer: {
    textAlign: 'center',
    fontSize: 8,
    color: '#999',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    paddingTop: 6,
    marginTop: 14,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 20,
    right: 36,
    fontSize: 8,
    color: '#999',
  },
});

// --- Helpers ---

function hasValue(v: string | undefined): boolean {
  if (!v) return false;
  const t = v.trim();
  return t !== '' && t !== '--' && t !== '-';
}

function fmtDate(v: string | undefined): string {
  if (!v) return '';
  const parts = v.split('-');
  if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
  return v;
}

function anyHasValue(data: ProgressNoteFormData, keys: string[]): boolean {
  return keys.some((k) => hasValue(data[k]));
}

function parseNumeric(val: string | undefined): number {
  if (!val) return NaN;
  return parseFloat(val.replace(/[^0-9.]/g, ''));
}

interface VitalRanges {
  temperature: { low: number; high: number };
  systolic: { low: number; high: number };
  diastolic: { low: number; high: number };
  pulse: { low: number; high: number };
  respiration: { low: number; high: number };
  oxygenSaturation: { low: number; high: number };
  bloodGlucose: { low: number; high: number };
}

// Adult default ranges. For a full age-specific implementation we'd need to
// port lib/vitalRanges.ts into the PDF module; for now we use adult defaults,
// which matches the banner guidance already on the detail page.
const DEFAULT_RANGES: VitalRanges = {
  temperature: { low: 97.0, high: 99.5 },
  systolic: { low: 90, high: 140 },
  diastolic: { low: 60, high: 90 },
  pulse: { low: 60, high: 100 },
  respiration: { low: 12, high: 20 },
  oxygenSaturation: { low: 95, high: 100 },
  bloodGlucose: { low: 70, high: 180 },
};

function checkVitals(data: ProgressNoteFormData) {
  const ranges = DEFAULT_RANGES;
  const alerts: string[] = [];
  const temp = parseNumeric(data.q16_temperature);
  const tempAbnormal = !isNaN(temp) && (temp < ranges.temperature.low || temp > ranges.temperature.high);
  if (tempAbnormal) alerts.push(`Temperature: ${data.q16_temperature}\u00b0F (${temp < ranges.temperature.low ? 'LOW' : 'HIGH'})`);

  const bpParts = (data.q17_bloodPressure || '').split('/');
  const sys = bpParts.length === 2 ? parseFloat(bpParts[0]) : NaN;
  const dia = bpParts.length === 2 ? parseFloat(bpParts[1]) : NaN;
  const bpAbnormal = (!isNaN(sys) && (sys < ranges.systolic.low || sys > ranges.systolic.high))
    || (!isNaN(dia) && (dia < ranges.diastolic.low || dia > ranges.diastolic.high));
  if (bpAbnormal) alerts.push(`Blood Pressure: ${data.q17_bloodPressure} mmHg`);

  const pulse = parseNumeric(data.q18_pulse);
  const pulseAbnormal = !isNaN(pulse) && (pulse < ranges.pulse.low || pulse > ranges.pulse.high);
  if (pulseAbnormal) alerts.push(`Pulse: ${data.q18_pulse} bpm (${pulse < ranges.pulse.low ? 'LOW' : 'HIGH'})`);

  const resp = parseNumeric(data.q19_respiration);
  const respAbnormal = !isNaN(resp) && (resp < ranges.respiration.low || resp > ranges.respiration.high);
  if (respAbnormal) alerts.push(`Respirations: ${data.q19_respiration}/min (${resp < ranges.respiration.low ? 'LOW' : 'HIGH'})`);

  const spo2 = parseNumeric(data.q20_oxygenSaturation);
  const spo2Abnormal = !isNaN(spo2) && (spo2 < ranges.oxygenSaturation.low || spo2 > ranges.oxygenSaturation.high);
  if (spo2Abnormal) alerts.push(`SpO2: ${data.q20_oxygenSaturation}% (LOW)`);

  const bg = parseNumeric(data.q21_bloodGlucose);
  const bgAbnormal = !isNaN(bg) && hasValue(data.q21_bloodGlucose) && (bg < ranges.bloodGlucose.low || bg > ranges.bloodGlucose.high);
  if (bgAbnormal) alerts.push(`Blood Glucose: ${data.q21_bloodGlucose} mg/dL (${bg < ranges.bloodGlucose.low ? 'LOW' : 'HIGH'})`);

  return {
    alerts,
    cells: [
      { label: 'Temperature', value: data.q16_temperature || '--', abnormal: tempAbnormal },
      { label: 'Blood Pressure', value: data.q17_bloodPressure || '--', abnormal: bpAbnormal },
      { label: 'Pulse', value: data.q18_pulse || '--', abnormal: pulseAbnormal },
      { label: 'Respirations', value: data.q19_respiration || '--', abnormal: respAbnormal },
      { label: 'SpO2', value: data.q20_oxygenSaturation || '--', abnormal: spo2Abnormal },
      { label: 'Blood Glucose', value: data.q21_bloodGlucose || '--', abnormal: bgAbnormal },
    ],
  };
}

// --- Reusable components ---

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section} wrap={false}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionHeaderText}>{title}</Text>
      </View>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

function SectionBreakable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionHeaderText}>{title}</Text>
      </View>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <View style={s.fieldRow}>
      <Text style={s.fieldLabel}>{label}:</Text>
      <Text style={s.fieldValue}>{hasValue(value) ? value : '--'}</Text>
    </View>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <View style={s.fieldGrid}>{children}</View>;
}

function FieldCol({ children }: { children: React.ReactNode }) {
  return <View style={s.fieldGridItem}>{children}</View>;
}

function TextBlock({ label, value }: { label: string; value: string | undefined }) {
  return (
    <View style={s.textBlock}>
      <Text style={s.textBlockLabel}>{label}:</Text>
      <Text style={s.textBlockValue}>{hasValue(value) ? value : '--'}</Text>
    </View>
  );
}

function SystemField({ label, value }: { label: string; value: string | undefined }) {
  if (!hasValue(value)) return null;
  return (
    <View style={s.systemFieldRow}>
      <Text style={s.systemFieldLabel}>{label}:</Text>
      <Text style={s.systemFieldValue}>{value}</Text>
    </View>
  );
}

// --- System assessments config (mirrors detail page) ---

interface SystemConfig {
  name: string;
  statusKey: string;
  fields: { label: string; key: string }[];
}

const SYSTEM_ASSESSMENTS: SystemConfig[] = [
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
    name: 'Skin / Integumentary',
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

// --- Main document ---

export default function ProgressNotePDF({ data }: ProgressNotePDFProps) {
  const credential = data.q12_credential || '';
  const isLpnRn = /^(LPN|RN)$/i.test(credential);

  const address = [data.q200_addr_line1, data.q200_city, data.q200_state, data.q200_postal]
    .filter((p) => hasValue(p))
    .join(', ');

  const { alerts: abnormalVitals, cells: vitalCells } = checkVitals(data);

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <View style={s.header} fixed>
          <Text style={s.companyName}>Heart and Soul Healthcare</Text>
          <Text style={s.companyTagline}>Compassionate Care, Professional Excellence</Text>
          <Text style={s.formTitle}>Home Health Progress Note</Text>
          <Text style={s.formDate}>
            Form Date: {fmtDate(data.q6_dateofService) || data.q6_dateofService || ''}
          </Text>
        </View>

        {abnormalVitals.length > 0 && (
          <View style={s.alertBanner} wrap={false}>
            <Text style={s.alertBannerTitle}>ABNORMAL VITAL SIGNS DETECTED</Text>
            {abnormalVitals.map((a, i) => (
              <Text key={i} style={s.alertBannerItem}>• {a}</Text>
            ))}
          </View>
        )}

        {/* 1. Client Information */}
        {anyHasValue(data, ['q3_clientName', 'q4_dateofBirth', 'q5_ageYears', 'q10_primaryDiagnosis', 'q200_addr_line1']) && (
          <Section title="Client Information">
            <FieldRow>
              <FieldCol><Field label="Client Name" value={data.q3_clientName} /></FieldCol>
              <FieldCol><Field label="Date of Birth" value={fmtDate(data.q4_dateofBirth)} /></FieldCol>
            </FieldRow>
            <FieldRow>
              <FieldCol><Field label="Age" value={data.q5_ageYears} /></FieldCol>
              <FieldCol><Field label="Primary Diagnosis" value={data.q10_primaryDiagnosis} /></FieldCol>
            </FieldRow>
            {hasValue(address) && <Field label="Address" value={address} />}
          </Section>
        )}

        {/* 2. Shift Information */}
        {anyHasValue(data, ['q6_dateofService', 'q7_shiftStart', 'q62_shiftEndTime', 'q9_totalHours']) && (
          <Section title="Shift Information">
            <FieldRow>
              <FieldCol><Field label="Date of Service" value={fmtDate(data.q6_dateofService)} /></FieldCol>
              <FieldCol><Field label="Start Time" value={data.q7_shiftStart} /></FieldCol>
              <FieldCol><Field label="End Time" value={data.q62_shiftEndTime} /></FieldCol>
            </FieldRow>
            {hasValue(data.q9_totalHours) && <Field label="Total Hours" value={data.q9_totalHours} />}
          </Section>
        )}

        {/* 3. Nurse / Caregiver */}
        {anyHasValue(data, ['q11_nurseName', 'q12_credential']) && (
          <Section title="Nurse / Caregiver">
            <FieldRow>
              <FieldCol><Field label="Name" value={data.q11_nurseName} /></FieldCol>
              <FieldCol><Field label="Credential" value={data.q12_credential} /></FieldCol>
            </FieldRow>
          </Section>
        )}

        {/* 4. Client Status */}
        {anyHasValue(data, [
          'q13_alertnessLevel', 'q13_orientationLevel', 'q14_behavior',
          'q14_orientationBehaviorNotes', 'q15_generalAppearance', 'q15_appearance',
          'q15_skinColor', 'q15_skinIntegrity', 'q15_appearanceNotes',
        ]) && (
          <Section title="Client Status">
            <FieldRow>
              {hasValue(data.q13_alertnessLevel) && <FieldCol><Field label="Alertness Level" value={data.q13_alertnessLevel} /></FieldCol>}
              {hasValue(data.q13_orientationLevel) && <FieldCol><Field label="Orientation" value={data.q13_orientationLevel} /></FieldCol>}
            </FieldRow>
            {hasValue(data.q14_behavior) && <Field label="Behavior" value={data.q14_behavior} />}
            {hasValue(data.q14_orientationBehaviorNotes) && (
              <TextBlock label="Orientation & Behavior Notes" value={data.q14_orientationBehaviorNotes} />
            )}
            <FieldRow>
              {hasValue(data.q15_generalAppearance) && <FieldCol><Field label="General Appearance" value={data.q15_generalAppearance} /></FieldCol>}
              {hasValue(data.q15_appearance) && <FieldCol><Field label="Appearance" value={data.q15_appearance} /></FieldCol>}
            </FieldRow>
            <FieldRow>
              {hasValue(data.q15_skinColor) && <FieldCol><Field label="Skin Color" value={data.q15_skinColor} /></FieldCol>}
              {hasValue(data.q15_skinIntegrity) && <FieldCol><Field label="Skin Integrity" value={data.q15_skinIntegrity} /></FieldCol>}
            </FieldRow>
            {hasValue(data.q15_appearanceNotes) && <TextBlock label="Appearance Notes" value={data.q15_appearanceNotes} />}
          </Section>
        )}

        {/* 5. Vital Signs */}
        {anyHasValue(data, [
          'q16_temperature', 'q17_bloodPressure', 'q18_pulse', 'q19_respiration',
          'q20_oxygenSaturation', 'q21_bloodGlucose', 'q21_oxygenSource', 'q22_additionalObservations',
        ]) && (
          <View style={s.section} wrap={false}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionHeaderText}>Vital Signs</Text>
            </View>
            <View style={s.vitalsGrid}>
              {vitalCells.map((v) => (
                <View key={v.label} style={v.abnormal ? s.vitalCellAlert : s.vitalCell}>
                  <Text style={s.vitalLabel}>{v.label}</Text>
                  <Text style={v.abnormal ? s.vitalValueAlert : s.vitalValue}>{v.value}</Text>
                </View>
              ))}
              {hasValue(data.q21_oxygenSource) && (
                <View style={s.vitalCell}>
                  <Text style={s.vitalLabel}>Oxygen Source</Text>
                  <Text style={s.vitalValue}>{data.q21_oxygenSource}</Text>
                </View>
              )}
            </View>
            {hasValue(data.q22_additionalObservations) && (
              <View style={s.sectionBody}>
                <TextBlock label="Additional Observations" value={data.q22_additionalObservations} />
              </View>
            )}
          </View>
        )}

        {/* 6. Observations */}
        {anyHasValue(data, [
          'q23_activityLevel', 'q24_scaleUsed', 'q24_painScore', 'q24_verbalComplaints',
          'q24_nonverbalCues', 'q25_painLocation', 'q26_painDescription', 'q26_painNotes',
        ]) && (
          <Section title="Observations">
            {hasValue(data.q23_activityLevel) && <TextBlock label="Activity Level" value={data.q23_activityLevel} />}
            <FieldRow>
              {hasValue(data.q24_scaleUsed) && <FieldCol><Field label="Pain Scale Used" value={data.q24_scaleUsed} /></FieldCol>}
              {hasValue(data.q24_painScore) && <FieldCol><Field label="Pain Score" value={data.q24_painScore} /></FieldCol>}
            </FieldRow>
            {hasValue(data.q24_verbalComplaints) && <TextBlock label="Verbal Complaints" value={data.q24_verbalComplaints} />}
            {hasValue(data.q24_nonverbalCues) && <TextBlock label="Non-verbal Cues" value={data.q24_nonverbalCues} />}
            {hasValue(data.q25_painLocation) && <Field label="Pain Location" value={data.q25_painLocation} />}
            {hasValue(data.q26_painDescription) && <TextBlock label="Pain Description" value={data.q26_painDescription} />}
            {hasValue(data.q26_painNotes) && <TextBlock label="Pain Notes" value={data.q26_painNotes} />}
          </Section>
        )}

        {/* 7. Safety Checklist */}
        {anyHasValue(data, ['q27_safetyChecklist', 'q27_safetyOther', 'q27_fallsInjuries', 'q27_allSystemsWNL', 'q27_safetyNotes']) && (
          <Section title="Safety Checklist">
            {hasValue(data.q27_safetyChecklist) && <TextBlock label="Checklist Items" value={data.q27_safetyChecklist} />}
            {hasValue(data.q27_safetyOther) && <TextBlock label="Other" value={data.q27_safetyOther} />}
            {hasValue(data.q27_fallsInjuries) && <TextBlock label="Falls / Injuries" value={data.q27_fallsInjuries} />}
            {hasValue(data.q27_allSystemsWNL) && <Field label="All Systems WNL" value={data.q27_allSystemsWNL} />}
            {hasValue(data.q27_safetyNotes) && <TextBlock label="Safety Notes" value={data.q27_safetyNotes} />}
          </Section>
        )}

        {/* 8. System Assessments (LPN/RN only) */}
        {isLpnRn && SYSTEM_ASSESSMENTS.some((sys) => anyHasValue(data, [sys.statusKey, ...sys.fields.map((f) => f.key)])) && (
          <SectionBreakable title="System Assessments">
            {SYSTEM_ASSESSMENTS.map((sys) => {
              const allKeys = [sys.statusKey, ...sys.fields.map((f) => f.key)];
              if (!anyHasValue(data, allKeys)) return null;
              const status = data[sys.statusKey] || '';
              const isWnl = /wn?l/i.test(status) || status.toLowerCase() === 'wnl';
              const isAbnormal = hasValue(status) && !isWnl;
              return (
                <View key={sys.name} style={s.systemSubsection} wrap={false}>
                  <View style={s.systemHeaderRow}>
                    <Text style={s.systemLabel}>{sys.name}</Text>
                    {hasValue(status) && (
                      <Text style={isAbnormal ? s.statusAbnormal : s.statusWNL}>{status}</Text>
                    )}
                  </View>
                  {sys.fields.map((f) => (
                    <SystemField key={f.key} label={f.label} value={data[f.key]} />
                  ))}
                </View>
              );
            })}
          </SectionBreakable>
        )}

        {/* 9. Personal Care / ADLs */}
        {anyHasValue(data, ['q38_personalCare', 'q38_personalCareNotes']) && (
          <Section title="Personal Care / ADLs">
            {hasValue(data.q38_personalCare) && <TextBlock label="Personal Care" value={data.q38_personalCare} />}
            {hasValue(data.q38_personalCareNotes) && <TextBlock label="Notes" value={data.q38_personalCareNotes} />}
          </Section>
        )}

        {/* 10. Nutrition & Hydration */}
        {anyHasValue(data, [
          'q38_breakfastPct', 'q38_lunchPct', 'q38_dinnerPct',
          'q38_fluidsEncouraged', 'q38_aspirationConcerns', 'q38_nutritionNotes',
        ]) && (
          <Section title="Nutrition & Hydration">
            <FieldRow>
              {hasValue(data.q38_breakfastPct) && <FieldCol><Field label="Breakfast %" value={data.q38_breakfastPct} /></FieldCol>}
              {hasValue(data.q38_lunchPct) && <FieldCol><Field label="Lunch %" value={data.q38_lunchPct} /></FieldCol>}
              {hasValue(data.q38_dinnerPct) && <FieldCol><Field label="Dinner %" value={data.q38_dinnerPct} /></FieldCol>}
            </FieldRow>
            {hasValue(data.q38_fluidsEncouraged) && <Field label="Fluids Encouraged" value={data.q38_fluidsEncouraged} />}
            {hasValue(data.q38_aspirationConcerns) && <TextBlock label="Aspiration Concerns" value={data.q38_aspirationConcerns} />}
            {hasValue(data.q38_nutritionNotes) && <TextBlock label="Notes" value={data.q38_nutritionNotes} />}
          </Section>
        )}

        {/* 11. Housekeeping */}
        {hasValue(data.q38_housekeeping) && (
          <Section title="Housekeeping">
            <TextBlock label="Items" value={data.q38_housekeeping} />
          </Section>
        )}

        {/* 12. Abuse / Neglect Screening */}
        {anyHasValue(data, ['q38_abuseScreening', 'q38_abuseNotes']) && (
          <Section title="Abuse / Neglect Screening">
            {hasValue(data.q38_abuseScreening) && <Field label="Screening Performed" value={data.q38_abuseScreening} />}
            {hasValue(data.q38_abuseNotes) && <TextBlock label="Notes" value={data.q38_abuseNotes} />}
          </Section>
        )}

        {/* 13. Skilled Nursing Interventions (LPN/RN only) */}
        {isLpnRn && anyHasValue(data, ['q38_interventions', 'q39_interventionDetails', 'q40_skillJustification']) && (
          <SectionBreakable title="Skilled Nursing Interventions">
            {hasValue(data.q38_interventions) && <TextBlock label="Interventions" value={data.q38_interventions} />}
            {hasValue(data.q39_interventionDetails) && <TextBlock label="Details" value={data.q39_interventionDetails} />}
            {hasValue(data.q40_skillJustification) && <TextBlock label="Justification" value={data.q40_skillJustification} />}
          </SectionBreakable>
        )}

        {/* 14. Medications (LPN/RN only) */}
        {isLpnRn && anyHasValue(data, [
          'q43_scheduledMeds', 'q43_prnMeds', 'q43_medTolerance', 'q43_reactionMed',
          'q43_reactionTime', 'q43_reactionType', 'q43_reactionDescription',
          'q43_reactionPhysNotified', 'q43_reactionPhysTime', 'q43_safetyMeasures',
          'q43_interventionTime', 'q43_eventInterventionDetails', 'q43_postEventMonitoring',
        ]) && (
          <SectionBreakable title="Medications">
            {hasValue(data.q43_scheduledMeds) && <TextBlock label="Scheduled" value={data.q43_scheduledMeds} />}
            {hasValue(data.q43_prnMeds) && <TextBlock label="PRN" value={data.q43_prnMeds} />}
            {hasValue(data.q43_medTolerance) && <TextBlock label="Tolerance" value={data.q43_medTolerance} />}
            {anyHasValue(data, ['q43_reactionMed', 'q43_reactionTime', 'q43_reactionType', 'q43_reactionDescription', 'q43_reactionPhysNotified', 'q43_reactionPhysTime']) && (
              <View>
                <Text style={s.subBlockLabel}>Adverse Reaction:</Text>
                <FieldRow>
                  {hasValue(data.q43_reactionMed) && <FieldCol><Field label="Medication" value={data.q43_reactionMed} /></FieldCol>}
                  {hasValue(data.q43_reactionTime) && <FieldCol><Field label="Time" value={data.q43_reactionTime} /></FieldCol>}
                  {hasValue(data.q43_reactionType) && <FieldCol><Field label="Type" value={data.q43_reactionType} /></FieldCol>}
                </FieldRow>
                {hasValue(data.q43_reactionDescription) && <TextBlock label="Description" value={data.q43_reactionDescription} />}
                <FieldRow>
                  {hasValue(data.q43_reactionPhysNotified) && <FieldCol><Field label="Physician Notified" value={data.q43_reactionPhysNotified} /></FieldCol>}
                  {hasValue(data.q43_reactionPhysTime) && <FieldCol><Field label="Notification Time" value={data.q43_reactionPhysTime} /></FieldCol>}
                </FieldRow>
              </View>
            )}
            {hasValue(data.q43_safetyMeasures) && <TextBlock label="Safety Measures" value={data.q43_safetyMeasures} />}
            {hasValue(data.q43_interventionTime) && <Field label="Intervention Time" value={data.q43_interventionTime} />}
            {hasValue(data.q43_eventInterventionDetails) && <TextBlock label="Event Details" value={data.q43_eventInterventionDetails} />}
            {hasValue(data.q43_postEventMonitoring) && <TextBlock label="Post-Event" value={data.q43_postEventMonitoring} />}
          </SectionBreakable>
        )}

        {/* 15. Education */}
        {anyHasValue(data, [
          'q41_educationProvided', 'q41_educationTopics', 'q41_educationRecipients',
          'q41_educationMethod', 'q41_teachback', 'q41_educationNotes',
        ]) && (
          <Section title="Education">
            {hasValue(data.q41_educationProvided) && <Field label="Education Provided" value={data.q41_educationProvided} />}
            {hasValue(data.q41_educationTopics) && <TextBlock label="Topics" value={data.q41_educationTopics} />}
            {hasValue(data.q41_educationRecipients) && <Field label="Recipients" value={data.q41_educationRecipients} />}
            {hasValue(data.q41_educationMethod) && <Field label="Method" value={data.q41_educationMethod} />}
            {hasValue(data.q41_teachback) && <Field label="Teach-back" value={data.q41_teachback} />}
            {hasValue(data.q41_educationNotes) && <TextBlock label="Notes" value={data.q41_educationNotes} />}
          </Section>
        )}

        {/* 16. Goals of Care (LPN/RN only) */}
        {isLpnRn && anyHasValue(data, [
          'q41_goalsDiscussed', 'q41_goal1Description', 'q41_goal1Progress', 'q41_goal1Notes',
          'q41_goal2Description', 'q41_goal2Progress', 'q41_goal2Notes',
          'q41_goal3Description', 'q41_goal3Progress', 'q41_goal3Notes',
          'q41_overallCarePlan', 'q41_goalsNotes',
        ]) && (
          <SectionBreakable title="Goals of Care">
            {hasValue(data.q41_goalsDiscussed) && <Field label="Goals Discussed" value={data.q41_goalsDiscussed} />}
            {[1, 2, 3].map((n) => {
              const desc = data[`q41_goal${n}Description`];
              const progress = data[`q41_goal${n}Progress`];
              const notes = data[`q41_goal${n}Notes`];
              if (!hasValue(desc) && !hasValue(progress) && !hasValue(notes)) return null;
              return (
                <View key={n}>
                  <Text style={s.subBlockLabel}>Goal {n}:</Text>
                  {hasValue(desc) && <Field label="Description" value={desc} />}
                  {hasValue(progress) && <Field label="Progress" value={progress} />}
                  {hasValue(notes) && <TextBlock label="Notes" value={notes} />}
                </View>
              );
            })}
            {hasValue(data.q41_overallCarePlan) && <TextBlock label="Overall Status" value={data.q41_overallCarePlan} />}
            {hasValue(data.q41_goalsNotes) && <TextBlock label="Notes" value={data.q41_goalsNotes} />}
          </SectionBreakable>
        )}

        {/* 17. Communication */}
        {hasValue(data.q51_communication) && (
          <Section title="Communication">
            <TextBlock label="Summary" value={data.q51_communication} />
          </Section>
        )}

        {/* 18. Physician Notification (LPN/RN only) */}
        {isLpnRn && anyHasValue(data, [
          'q52_physicianNotify', 'q54_notificationTime', 'q53_physicianName',
          'q52_notifyMethod', 'q52_infoReported', 'q55_physicianOrders',
        ]) && (
          <SectionBreakable title="Physician Notification">
            <FieldRow>
              {hasValue(data.q52_physicianNotify) && <FieldCol><Field label="Notified" value={data.q52_physicianNotify} /></FieldCol>}
              {hasValue(data.q54_notificationTime) && <FieldCol><Field label="Time" value={data.q54_notificationTime} /></FieldCol>}
            </FieldRow>
            <FieldRow>
              {hasValue(data.q53_physicianName) && <FieldCol><Field label="Name" value={data.q53_physicianName} /></FieldCol>}
              {hasValue(data.q52_notifyMethod) && <FieldCol><Field label="Method" value={data.q52_notifyMethod} /></FieldCol>}
            </FieldRow>
            {hasValue(data.q52_infoReported) && <TextBlock label="Info Reported" value={data.q52_infoReported} />}
            {hasValue(data.q55_physicianOrders) && <TextBlock label="Response" value={data.q55_physicianOrders} />}
          </SectionBreakable>
        )}

        {/* 19. Family / Guardian Notification */}
        {anyHasValue(data, [
          'q52_familyNotified', 'q52_familyTime', 'q52_familyContactName',
          'q52_familyRelationship', 'q52_familyMethod', 'q52_familyFollowup',
          'q52_familyFollowupTime', 'q52_familyNotes',
        ]) && (
          <SectionBreakable title="Family / Guardian Notification">
            <FieldRow>
              {hasValue(data.q52_familyNotified) && <FieldCol><Field label="Notified" value={data.q52_familyNotified} /></FieldCol>}
              {hasValue(data.q52_familyTime) && <FieldCol><Field label="Time" value={data.q52_familyTime} /></FieldCol>}
            </FieldRow>
            <FieldRow>
              {hasValue(data.q52_familyContactName) && <FieldCol><Field label="Contact" value={data.q52_familyContactName} /></FieldCol>}
              {hasValue(data.q52_familyRelationship) && <FieldCol><Field label="Relationship" value={data.q52_familyRelationship} /></FieldCol>}
            </FieldRow>
            {hasValue(data.q52_familyMethod) && <Field label="Method" value={data.q52_familyMethod} />}
            <FieldRow>
              {hasValue(data.q52_familyFollowup) && <FieldCol><Field label="Follow-up" value={data.q52_familyFollowup} /></FieldCol>}
              {hasValue(data.q52_familyFollowupTime) && <FieldCol><Field label="Follow-up Time" value={data.q52_familyFollowupTime} /></FieldCol>}
            </FieldRow>
            {hasValue(data.q52_familyNotes) && <TextBlock label="Notes" value={data.q52_familyNotes} />}
          </SectionBreakable>
        )}

        {/* 20. Agency Supervisor Notification */}
        {anyHasValue(data, [
          'q52_supervisorNotified', 'q52_supervisorTime', 'q52_supervisorName',
          'q52_supervisorResponse', 'q52_incidentReportCompleted',
        ]) && (
          <SectionBreakable title="Agency Supervisor Notification">
            <FieldRow>
              {hasValue(data.q52_supervisorNotified) && <FieldCol><Field label="Notified" value={data.q52_supervisorNotified} /></FieldCol>}
              {hasValue(data.q52_supervisorTime) && <FieldCol><Field label="Time" value={data.q52_supervisorTime} /></FieldCol>}
            </FieldRow>
            {hasValue(data.q52_supervisorName) && <Field label="Name" value={data.q52_supervisorName} />}
            {hasValue(data.q52_supervisorResponse) && <TextBlock label="Response" value={data.q52_supervisorResponse} />}
            {hasValue(data.q52_incidentReportCompleted) && <Field label="Incident Report" value={data.q52_incidentReportCompleted} />}
          </SectionBreakable>
        )}

        {/* 21. Incidents */}
        {anyHasValue(data, ['q56_incidents', 'q57_incidentDetails']) && (
          <Section title="Incidents">
            {hasValue(data.q56_incidents) && <Field label="Type" value={data.q56_incidents} />}
            {hasValue(data.q57_incidentDetails) && <TextBlock label="Details" value={data.q57_incidentDetails} />}
          </Section>
        )}

        {/* 22. End-of-Shift Handoff */}
        {anyHasValue(data, [
          'q60_oncomingCaregiver', 'q60_handoffTime', 'q60_verbalReport',
          'q60_conditionAtEnd', 'q60_endOfShiftNotes',
        ]) && (
          <SectionBreakable title="End-of-Shift Handoff">
            <FieldRow>
              {hasValue(data.q60_oncomingCaregiver) && <FieldCol><Field label="Oncoming Caregiver" value={data.q60_oncomingCaregiver} /></FieldCol>}
              {hasValue(data.q60_handoffTime) && <FieldCol><Field label="Handoff Time" value={data.q60_handoffTime} /></FieldCol>}
            </FieldRow>
            {hasValue(data.q60_verbalReport) && <Field label="Verbal Report" value={data.q60_verbalReport} />}
            {hasValue(data.q60_conditionAtEnd) && <TextBlock label="Condition at End" value={data.q60_conditionAtEnd} />}
            {hasValue(data.q60_endOfShiftNotes) && <TextBlock label="Notes" value={data.q60_endOfShiftNotes} />}
          </SectionBreakable>
        )}

        {/* 23. Follow-Up */}
        {anyHasValue(data, ['q58_followup', 'q59_followupDetails', 'q60_nextShiftPlan']) && (
          <Section title="Follow-Up">
            {hasValue(data.q58_followup) && <TextBlock label="Care / Referrals" value={data.q58_followup} />}
            {hasValue(data.q59_followupDetails) && <TextBlock label="Details" value={data.q59_followupDetails} />}
            {hasValue(data.q60_nextShiftPlan) && <TextBlock label="Next Shift Plan" value={data.q60_nextShiftPlan} />}
          </Section>
        )}

        {/* 24. Clinical Summary */}
        {anyHasValue(data, ['q63_clinicalSummary', 'q64_carePlanStatus']) && (
          <Section title="Clinical Summary">
            {hasValue(data.q63_clinicalSummary) && (
              <Text style={s.textBlockValue}>{data.q63_clinicalSummary}</Text>
            )}
            {hasValue(data.q64_carePlanStatus) && <TextBlock label="Care Plan Status" value={data.q64_carePlanStatus} />}
          </Section>
        )}

        {/* 25. Signature */}
        <Section title="Signature">
          <View style={s.signatureGrid}>
            <View style={{ flex: 1 }}>
              <Field label="Printed Name" value={data.q11_nurseName} />
              <Field label="Credential" value={data.q12_credential} />
              <Field label="Date Signed" value={fmtDate(data.q62_shiftEndDate)} />
            </View>
            <View style={{ flex: 1 }}>
              {hasValue(data.q61_signature) ? (
                <View>
                  <Text style={s.signatureLabel}>Signature:</Text>
                  <Image src={data.q61_signature as string} style={{ width: 200, height: 75, marginTop: 4 }} />
                </View>
              ) : (
                <View style={{ marginTop: 30, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#333', width: 250 }}>
                  <Text style={s.signatureLabel}>Signature</Text>
                </View>
              )}
            </View>
          </View>
        </Section>

        {/* 26. Additional Notes */}
        {hasValue(data.q66_additionalNotes) && (
          <Section title="Additional Notes">
            <Text style={s.textBlockValue}>{data.q66_additionalNotes}</Text>
          </Section>
        )}

        <View style={s.footer} fixed>
          <Text>
            Confidential · Heart and Soul Healthcare · This document contains
            protected health information (PHI)
          </Text>
        </View>

        <Text
          style={s.pageNumber}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
