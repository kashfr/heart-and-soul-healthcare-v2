import React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from '@react-pdf/renderer';

export interface ProgressNoteData {
  client: {
    name: string;
    dob: string;
    age: number;
    diagnosis: string;
    address: string;
  };
  shift: {
    dateOfService: string;
    startTime: string;
    endTime: string;
    totalHours: string;
  };
  nurse: {
    name: string;
    credential: string;
  };
  status: {
    alertness: string;
    orientation: string;
    appearance: string;
  };
  vitals: {
    temp: string;
    bp: string;
    pulse: string;
    resp: string;
    spo2: string;
    bloodGlucose: string;
  };
  observations: {
    activity: string;
    pain: string;
  };
  systems: Array<{
    system: string;
    status: string;
    notes: string;
  }>;
  interventions: {
    performed: string;
    justification: string;
    education: string;
    patientResponse: string;
  };
  medications: {
    given: string;
    compliance: string;
    sideEffects: string;
    treatments: string;
    equipment: string;
  };
  communication: {
    physicianNotified: string;
    incidents: string;
    followUp: string;
    nextShiftPlan: string;
  };
  signature: {
    printedName: string;
    credential: string;
    dateSigned: string;
    clinicalSummary: string;
  };
}

const NAVY = '#1a3a5c';
const LIGHT_BLUE = '#e8eef4';
const GREEN = '#2e7d32';
const RED = '#c62828';
const GRAY_TEXT = '#444';
const LIGHT_GRAY = '#e0e0e0';
const ALT_ROW = '#f9fafb';

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: '#1a1a1a',
    padding: 36, // 0.5in
    backgroundColor: '#ffffff',
  },
  // Header
  header: {
    textAlign: 'center',
    borderBottomWidth: 3,
    borderBottomColor: NAVY,
    borderBottomStyle: 'solid',
    paddingBottom: 10,
    marginBottom: 16,
  },
  companyName: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  companyTagline: {
    fontSize: 10,
    color: '#666',
    marginBottom: 8,
  },
  formTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  formDate: {
    fontSize: 10,
    color: '#555',
    marginTop: 4,
  },
  // Alert banner
  alertBanner: {
    backgroundColor: '#ffebee',
    borderWidth: 1,
    borderColor: '#ef9a9a',
    borderRadius: 3,
    padding: 6,
    marginBottom: 12,
  },
  alertBannerText: {
    fontSize: 11,
    color: '#b71c1c',
    fontFamily: 'Helvetica-Bold',
  },
  // Sections
  section: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 3,
    marginBottom: 12,
  },
  sectionHeader: {
    backgroundColor: LIGHT_BLUE,
    padding: 5,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  sectionHeaderText: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionBody: {
    padding: 8,
    paddingHorizontal: 10,
  },
  // Field pairs
  fieldRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: LIGHT_GRAY,
    borderBottomStyle: 'dotted',
  },
  fieldLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: GRAY_TEXT,
    textTransform: 'uppercase',
    width: 110,
    marginRight: 4,
  },
  fieldValue: {
    fontSize: 11,
    color: '#1a1a1a',
    flex: 1,
  },
  fieldValueAlert: {
    fontSize: 11,
    color: RED,
    fontFamily: 'Helvetica-Bold',
    flex: 1,
  },
  // Two-column grid
  twoCol: {
    flexDirection: 'row',
  },
  twoColItem: {
    flex: 1,
  },
  // Three-column grid
  threeCol: {
    flexDirection: 'row',
  },
  threeColItem: {
    flex: 1,
  },
  // Vitals grid
  vitalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  vitalCell: {
    width: '33.33%',
    padding: 6,
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: '#eee',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  vitalCellAlert: {
    width: '33.33%',
    padding: 6,
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: '#eee',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff3f0',
  },
  vitalLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: '#666',
    textTransform: 'uppercase',
  },
  vitalValue: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
    marginTop: 2,
  },
  vitalValueAlert: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: RED,
    marginTop: 2,
  },
  // Text blocks
  textBlock: {
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: LIGHT_GRAY,
    borderBottomStyle: 'dotted',
  },
  textBlockLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: GRAY_TEXT,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  textBlockValue: {
    fontSize: 11,
    color: '#1a1a1a',
  },
  // System assessments table
  systemHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  systemHeaderText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    color: GRAY_TEXT,
  },
  systemRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: LIGHT_GRAY,
    borderBottomStyle: 'dotted',
    alignItems: 'flex-start',
  },
  systemRowAlt: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: LIGHT_GRAY,
    borderBottomStyle: 'dotted',
    alignItems: 'flex-start',
    backgroundColor: ALT_ROW,
  },
  systemColSystem: {
    width: 130,
  },
  systemColStatus: {
    width: 80,
  },
  systemColNotes: {
    flex: 1,
  },
  systemLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    color: GRAY_TEXT,
    textTransform: 'uppercase',
  },
  statusWNL: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: GREEN,
  },
  statusAbnormal: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: RED,
  },
  statusAbnormalBadge: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: RED,
    backgroundColor: '#ffebee',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
  },
  systemNotes: {
    fontSize: 11,
    color: '#1a1a1a',
  },
  // Signature
  signatureGrid: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 8,
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    width: 250,
    marginTop: 30,
    paddingTop: 4,
  },
  signatureLabel: {
    fontSize: 10,
    color: '#666',
  },
  // Footer
  footer: {
    textAlign: 'center',
    fontSize: 9,
    color: '#999',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    paddingTop: 8,
    marginTop: 16,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 20,
    right: 36,
    fontSize: 9,
    color: '#999',
  },
});

function FieldPair({
  label,
  value,
  alert,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <View style={s.fieldRow}>
      <Text style={s.fieldLabel}>{label}:</Text>
      <Text style={alert ? s.fieldValueAlert : s.fieldValue}>{value}</Text>
    </View>
  );
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.textBlock}>
      <Text style={s.textBlockLabel}>{label}:</Text>
      <Text style={s.textBlockValue}>{value}</Text>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section} wrap={false}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionHeaderText}>{title}</Text>
      </View>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

function SectionBreakable({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionHeaderText}>{title}</Text>
      </View>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

// Normal vital sign ranges
const VITAL_RANGES = {
  temp: { low: 97.0, high: 99.5 },
  systolic: { low: 90, high: 140 },
  diastolic: { low: 60, high: 90 },
  pulse: { low: 60, high: 100 },
  resp: { low: 12, high: 20 },
  spo2: { low: 95, high: 100 },
  bloodGlucose: { low: 70, high: 180 },
};

function parseNumeric(val: string): number {
  return parseFloat(val.replace(/[^0-9.]/g, ''));
}

interface VitalCheck {
  label: string;
  value: string;
  isAbnormal: boolean;
}

function checkVitals(vitals: ProgressNoteData['vitals']): { checks: VitalCheck[]; abnormalVitals: string[] } {
  const abnormalVitals: string[] = [];

  const tempVal = parseNumeric(vitals.temp);
  const tempAbnormal = !isNaN(tempVal) && (tempVal < VITAL_RANGES.temp.low || tempVal > VITAL_RANGES.temp.high);
  if (tempAbnormal) abnormalVitals.push(`Temperature: ${vitals.temp} (${tempVal < VITAL_RANGES.temp.low ? 'LOW' : 'HIGH'})`);

  // Parse BP
  const bpParts = vitals.bp.split('/');
  const sysVal = bpParts.length === 2 ? parseFloat(bpParts[0]) : NaN;
  const diaVal = bpParts.length === 2 ? parseFloat(bpParts[1]) : NaN;
  const bpAbnormal = (!isNaN(sysVal) && (sysVal < VITAL_RANGES.systolic.low || sysVal > VITAL_RANGES.systolic.high)) ||
    (!isNaN(diaVal) && (diaVal < VITAL_RANGES.diastolic.low || diaVal > VITAL_RANGES.diastolic.high));
  if (bpAbnormal) abnormalVitals.push(`Blood Pressure: ${vitals.bp} mmHg`);

  const pulseVal = parseNumeric(vitals.pulse);
  const pulseAbnormal = !isNaN(pulseVal) && (pulseVal < VITAL_RANGES.pulse.low || pulseVal > VITAL_RANGES.pulse.high);
  if (pulseAbnormal) abnormalVitals.push(`Pulse: ${vitals.pulse} (${pulseVal < VITAL_RANGES.pulse.low ? 'LOW' : 'HIGH'})`);

  const respVal = parseNumeric(vitals.resp);
  const respAbnormal = !isNaN(respVal) && (respVal < VITAL_RANGES.resp.low || respVal > VITAL_RANGES.resp.high);
  if (respAbnormal) abnormalVitals.push(`Respirations: ${vitals.resp} (${respVal < VITAL_RANGES.resp.low ? 'LOW' : 'HIGH'})`);

  const spo2Val = parseNumeric(vitals.spo2);
  const spo2Abnormal = !isNaN(spo2Val) && (spo2Val < VITAL_RANGES.spo2.low || spo2Val > VITAL_RANGES.spo2.high);
  if (spo2Abnormal) abnormalVitals.push(`SpO2: ${vitals.spo2} (LOW)`);

  const bgVal = parseNumeric(vitals.bloodGlucose);
  const bgAbnormal = !isNaN(bgVal) && vitals.bloodGlucose.trim() !== '' && (bgVal < VITAL_RANGES.bloodGlucose.low || bgVal > VITAL_RANGES.bloodGlucose.high);
  if (bgAbnormal) abnormalVitals.push(`Blood Glucose: ${vitals.bloodGlucose} (${bgVal < VITAL_RANGES.bloodGlucose.low ? 'LOW' : 'HIGH'})`);

  const checks: VitalCheck[] = [
    { label: 'Temperature', value: vitals.temp, isAbnormal: tempAbnormal },
    { label: 'Blood Pressure', value: vitals.bp, isAbnormal: bpAbnormal },
    { label: 'Pulse', value: vitals.pulse, isAbnormal: pulseAbnormal },
    { label: 'Respirations', value: vitals.resp, isAbnormal: respAbnormal },
    { label: 'SpO2', value: vitals.spo2, isAbnormal: spo2Abnormal },
    { label: 'Blood Glucose', value: vitals.bloodGlucose, isAbnormal: bgAbnormal },
  ];

  return { checks, abnormalVitals };
}

function hasAbnormalSystems(data: ProgressNoteData): boolean {
  return data.systems.some((sys) => sys.status === 'ABNORMAL');
}

function isPhysicianNotified(data: ProgressNoteData): boolean {
  return data.communication.physicianNotified
    .toLowerCase()
    .startsWith('yes');
}

export default function ProgressNotePDF({ data }: { data: ProgressNoteData }) {
  const showPhysicianAlert = isPhysicianNotified(data);
  const hasAbnormal = hasAbnormalSystems(data);
  const { checks: vitalChecks, abnormalVitals } = checkVitals(data.vitals);
  const hasAbnormalVitals = abnormalVitals.length > 0;

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.companyName}>Heart and Soul Home Health</Text>
          <Text style={s.companyTagline}>
            Compassionate Care, Professional Excellence
          </Text>
          <Text style={s.formTitle}>Skilled Nursing Progress Note</Text>
          <Text style={s.formDate}>
            Form Date: {data.shift.dateOfService}
          </Text>
        </View>

        {/* Alert Banners */}
        {showPhysicianAlert && (
          <View style={s.alertBanner}>
            <Text style={s.alertBannerText}>
              PHYSICIAN NOTIFIED — See Communication section for details. New
              orders received.
            </Text>
          </View>
        )}
        {hasAbnormalVitals && (
          <View style={s.alertBanner}>
            <Text style={s.alertBannerText}>
              ABNORMAL VITAL SIGNS — {abnormalVitals.join(' | ')}
            </Text>
          </View>
        )}

        {/* Client Information */}
        <Section title="Client Information">
          <View style={s.twoCol}>
            <View style={s.twoColItem}>
              <FieldPair label="Client Name" value={data.client.name} />
            </View>
            <View style={s.twoColItem}>
              <FieldPair label="Date of Birth" value={data.client.dob} />
            </View>
          </View>
          <View style={s.twoCol}>
            <View style={s.twoColItem}>
              <FieldPair label="Age" value={String(data.client.age)} />
            </View>
            <View style={s.twoColItem}>
              <FieldPair
                label="Primary Diagnosis"
                value={data.client.diagnosis}
              />
            </View>
          </View>
          <FieldPair label="Address" value={data.client.address} />
        </Section>

        {/* Shift Information */}
        <Section title="Shift Information">
          <View style={s.threeCol}>
            <View style={s.threeColItem}>
              <FieldPair
                label="Date of Service"
                value={data.shift.dateOfService}
              />
            </View>
            <View style={s.threeColItem}>
              <FieldPair label="Start Time" value={data.shift.startTime} />
            </View>
            <View style={s.threeColItem}>
              <FieldPair label="End Time" value={data.shift.endTime} />
            </View>
          </View>
          <FieldPair label="Total Hours" value={data.shift.totalHours} />
        </Section>

        {/* Nurse / Caregiver */}
        <Section title="Nurse / Caregiver">
          <View style={s.twoCol}>
            <View style={s.twoColItem}>
              <FieldPair label="Name" value={data.nurse.name} />
            </View>
            <View style={s.twoColItem}>
              <FieldPair label="Credential" value={data.nurse.credential} />
            </View>
          </View>
        </Section>

        {/* Client Status & Orientation */}
        <Section title="Client Status & Orientation">
          <View style={s.twoCol}>
            <View style={s.twoColItem}>
              <FieldPair
                label="Alertness"
                value={data.status.alertness}
                alert={hasAbnormal}
              />
            </View>
            <View style={s.twoColItem}>
              <FieldPair
                label="Appearance"
                value={data.status.appearance}
                alert={hasAbnormal}
              />
            </View>
          </View>
          <FieldPair
            label="Orientation"
            value={data.status.orientation}
            alert={hasAbnormal}
          />
        </Section>

        {/* Vital Signs */}
        <View style={s.section} wrap={false}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionHeaderText}>Vital Signs</Text>
          </View>
          <View style={s.vitalsGrid}>
            {vitalChecks.map((v) => (
              <View
                key={v.label}
                style={v.isAbnormal ? s.vitalCellAlert : s.vitalCell}
              >
                <Text style={s.vitalLabel}>{v.label}</Text>
                <Text style={v.isAbnormal ? s.vitalValueAlert : s.vitalValue}>
                  {v.value}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Observations */}
        <Section title="Observations">
          <TextBlock label="Activity Level" value={data.observations.activity} />
          <TextBlock label="Pain Assessment" value={data.observations.pain} />
        </Section>

        {/* System Assessments */}
        <SectionBreakable title="System Assessments">
          {/* Table header */}
          <View style={s.systemHeaderRow}>
            <View style={s.systemColSystem}>
              <Text style={s.systemHeaderText}>SYSTEM</Text>
            </View>
            <View style={s.systemColStatus}>
              <Text style={s.systemHeaderText}>STATUS</Text>
            </View>
            <View style={s.systemColNotes}>
              <Text style={s.systemHeaderText}>NOTES</Text>
            </View>
          </View>
          {/* Table rows */}
          {data.systems.map((sys, i) => (
            <View
              key={sys.system}
              style={i % 2 === 1 ? s.systemRowAlt : s.systemRow}
              wrap={false}
            >
              <View style={s.systemColSystem}>
                <Text style={s.systemLabel}>{sys.system}</Text>
              </View>
              <View style={s.systemColStatus}>
                {sys.status === 'WNL' ? (
                  <Text style={s.statusWNL}>{sys.status}</Text>
                ) : (
                  <Text style={s.statusAbnormalBadge}>{sys.status}</Text>
                )}
              </View>
              <View style={s.systemColNotes}>
                <Text style={s.systemNotes}>{sys.notes}</Text>
              </View>
            </View>
          ))}
        </SectionBreakable>

        {/* Skilled Nursing Interventions */}
        <SectionBreakable title="Skilled Nursing Interventions">
          <TextBlock
            label="Interventions Performed"
            value={data.interventions.performed}
          />
          <TextBlock
            label="Justification for Skilled Care"
            value={data.interventions.justification}
          />
          <TextBlock
            label="Education Provided"
            value={data.interventions.education}
          />
          <TextBlock
            label="Patient Response"
            value={data.interventions.patientResponse}
          />
        </SectionBreakable>

        {/* Medications & Treatments */}
        <SectionBreakable title="Medications & Treatments">
          <TextBlock
            label="Medications Administered"
            value={data.medications.given}
          />
          <TextBlock label="Compliance" value={data.medications.compliance} />
          <TextBlock
            label="Side Effects"
            value={data.medications.sideEffects}
          />
          <TextBlock
            label="Treatments Performed"
            value={data.medications.treatments}
          />
          <TextBlock
            label="Equipment / DME"
            value={data.medications.equipment}
          />
        </SectionBreakable>

        {/* Communication */}
        <SectionBreakable title="Communication">
          <TextBlock
            label="Physician Notification"
            value={data.communication.physicianNotified}
          />
          <TextBlock
            label="Incidents / Unusual Occurrences"
            value={data.communication.incidents}
          />
          <TextBlock label="Follow-Up" value={data.communication.followUp} />
          <TextBlock
            label="Next Shift Plan"
            value={data.communication.nextShiftPlan}
          />
        </SectionBreakable>

        {/* Clinical Summary */}
        <Section title="Clinical Summary">
          <Text style={s.textBlockValue}>
            {data.signature.clinicalSummary}
          </Text>
        </Section>

        {/* Signature */}
        <Section title="Signature">
          <View style={s.signatureGrid}>
            <View style={{ flex: 1 }}>
              <FieldPair
                label="Printed Name"
                value={data.signature.printedName}
              />
              <FieldPair
                label="Credential"
                value={data.signature.credential}
              />
              <FieldPair
                label="Date Signed"
                value={data.signature.dateSigned}
              />
            </View>
            <View style={{ flex: 1 }}>
              <View style={s.signatureLine}>
                <Text style={s.signatureLabel}>Signature</Text>
              </View>
            </View>
          </View>
        </Section>

        {/* Footer */}
        <View style={s.footer}>
          <Text>
            Confidential - Heart and Soul Home Health | This document contains
            protected health information (PHI)
          </Text>
        </View>

        {/* Page number */}
        <Text
          style={s.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
