import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { MedErrorReport } from '@/lib/medErrorShared';
import {
  formatLocalDateTimeUS,
  medErrorHarmLabel,
  medErrorOutcomeLabel,
  medErrorResponsibleLabel,
  medErrorTypeLabel,
} from '@/lib/medErrorShared';
import { formatDateUS } from '@/lib/dateFormat';
import { BRAND_LOGO_DATA_URL, BRAND_LOGO_ASPECT } from './brandLogo';

// Medication error report for the client binder and, when required, the
// DBHDD incident report packet. Printed deliverable: no em or en dashes.

const CORAL = '#DE5B4A';
const INK = '#1f2937';
const MUTED = '#6b7280';
const RULE = '#d1d5db';
const LOGO_W = 110;

const s = StyleSheet.create({
  page: { paddingTop: 22, paddingBottom: 36, paddingHorizontal: 48, fontSize: 9.5, fontFamily: 'Helvetica', color: INK },
  header: { alignItems: 'center', marginBottom: 4 },
  logo: { width: LOGO_W, height: LOGO_W / BRAND_LOGO_ASPECT, marginBottom: 4 },
  company: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  contact: { fontSize: 8, color: MUTED, marginTop: 2 },
  headerRule: { borderBottomWidth: 1.5, borderBottomColor: CORAL, marginTop: 5, marginBottom: 6 },
  title: { fontSize: 15, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  subtitle: { fontSize: 8.5, color: MUTED, textAlign: 'center', marginTop: 2, marginBottom: 6 },
  banner: { borderWidth: 1, borderColor: '#b3261e', backgroundColor: '#fdeaea', color: '#b3261e', padding: 6, fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 6 },
  sectionHeading: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', marginTop: 7, marginBottom: 3, paddingBottom: 2, borderBottomWidth: 0.75, borderBottomColor: CORAL },
  grid: { borderWidth: 0.5, borderColor: RULE },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: RULE },
  rowLast: { flexDirection: 'row' },
  cell: { paddingVertical: 4, paddingHorizontal: 6, borderRightWidth: 0.5, borderRightColor: RULE },
  cellLast: { paddingVertical: 4, paddingHorizontal: 6 },
  label: { fontSize: 7.5, color: MUTED, marginBottom: 1.5 },
  value: { fontSize: 9.5 },
  box: { borderWidth: 0.5, borderColor: RULE, padding: 7, marginTop: 3 },
  boxText: { fontSize: 9.5, lineHeight: 1.4 },
  sigGrid: { flexDirection: 'row', marginTop: 4 },
  sigCol: { flex: 1, paddingRight: 16 },
  sigImage: { width: 170, height: 36, borderBottomWidth: 0.75, borderBottomColor: INK },
  sigLine: { height: 30, borderBottomWidth: 0.75, borderBottomColor: INK },
  sigCaption: { fontSize: 7.5, color: MUTED, marginTop: 3 },
  sigValue: { fontSize: 9.5, marginTop: 2 },
  footer: { position: 'absolute', bottom: 16, left: 48, right: 48, fontSize: 7, color: '#9ca3af', textAlign: 'center' },
});

function Cell({ label, value, flex = 1, last = false }: { label: string; value: string; flex?: number; last?: boolean }) {
  return (
    <View style={[last ? s.cellLast : s.cell, { flex }]}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value || ' '}</Text>
    </View>
  );
}

function Box({ heading, text }: { heading: string; text: string }) {
  return (
    <>
      <Text style={s.sectionHeading}>{heading}</Text>
      <View style={s.box}>
        <Text style={s.boxText}>{text || ' '}</Text>
      </View>
    </>
  );
}

function notifText(n: { notified: boolean; name: string; at: string }): string {
  if (!n.notified) return 'Not notified';
  return `${n.name || 'Yes'}${n.at ? `, ${formatLocalDateTimeUS(n.at)}` : ''}`;
}

function fmtIso(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
}

export default function MedErrorPDF({ report: r }: { report: MedErrorReport }) {
  const incident = r.review ? r.review.incidentReportRequired : r.incidentReportRequired;
  return (
    <Document title={`Medication Error Report - ${r.patientName}`} author="Heart and Soul Healthcare, LLC">
      <Page size="LETTER" style={s.page}>
        <Text style={s.footer} fixed>
          Medication error report {r.id}. Confidential: contains protected health information. Quality improvement document.
        </Text>
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={BRAND_LOGO_DATA_URL} style={s.logo} />
          <Text style={s.company}>Heart and Soul Healthcare, LLC</Text>
          <Text style={s.contact}>1372 Peachtree St NE, Atlanta, GA 30309   |   Phone: (678) 644-0337</Text>
        </View>
        <View style={s.headerRule} />
        <Text style={s.title}>MEDICATION ERROR REPORT</Text>
        <Text style={s.subtitle}>{r.status === 'reviewed' ? 'Reviewed by nursing supervision' : 'Awaiting nursing review'}</Text>
        {incident ? <Text style={s.banner}>This error meets the criteria for a DBHDD reportable incident. File the incident report within the required window.</Text> : null}

        <View style={s.grid}>
          <View style={s.row}>
            <Cell label="Client" value={r.patientName} flex={2} />
            <Cell label="Date of birth" value={formatDateUS(r.patientDob)} />
            <Cell label="Report number" value={r.id} flex={1.5} last />
          </View>
          <View style={s.row}>
            <Cell label="Error discovered" value={formatLocalDateTimeUS(r.discoveredAt)} flex={1.5} />
            <Cell label="Error occurred" value={r.occurredAt ? `${formatLocalDateTimeUS(r.occurredAt)}${r.occurredApprox ? ' (approx.)' : ''}` : 'Unknown'} flex={1.5} />
            <Cell label="Reported by" value={`${r.reporterName}${r.reporterCredential ? `, ${r.reporterCredential}` : ''}`} flex={1.5} last />
          </View>
          <View style={s.row}>
            <Cell label="Medication" value={r.medName} flex={2} />
            <Cell label="Dose ordered" value={r.doseOrdered} />
            <Cell label="Dose given" value={r.doseGiven} />
            <Cell label="Route" value={r.route} last />
          </View>
          <View style={s.rowLast}>
            <Cell label="Type of error" value={medErrorTypeLabel(r.errorType)} flex={1.5} />
            <Cell label="Dose outcome" value={medErrorOutcomeLabel(r.doseOutcome)} flex={1.5} />
            <Cell label="Administered or responsible" value={`${medErrorResponsibleLabel(r.responsibleType)}${r.responsibleName ? `: ${r.responsibleName}` : ''}`} flex={2} last />
          </View>
        </View>

        <Box heading="What happened" text={r.description} />

        <Text style={s.sectionHeading}>Client condition</Text>
        <View style={s.grid}>
          <View style={s.rowLast}>
            <Cell label="Effect on client" value={medErrorHarmLabel(r.harm)} flex={1.2} />
            <Cell label="Condition and symptoms observed" value={r.clientCondition} flex={3} last />
          </View>
        </View>

        <Text style={s.sectionHeading}>Notifications</Text>
        <View style={s.grid}>
          <View style={s.rowLast}>
            <Cell label="Physician" value={notifText(r.physician)} />
            <Cell label="Family or guardian" value={notifText(r.guardian)} />
            <Cell label="Nursing supervisor" value={notifText(r.supervisor)} last />
          </View>
        </View>

        <Box heading="Actions taken" text={r.actionsTaken} />

        <View style={s.sigGrid}>
          <View style={s.sigCol}>
            {r.reporterSignature ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={r.reporterSignature} style={s.sigImage} />
            ) : (
              <View style={s.sigLine} />
            )}
            <Text style={s.sigCaption}>{'Reporter\'s signature'}</Text>
            <Text style={s.sigValue}>{r.reporterName}{r.reporterCredential ? `, ${r.reporterCredential}` : ''}</Text>
          </View>
          <View style={s.sigCol}>
            <View style={{ height: 36, justifyContent: 'flex-end' }}>
              <Text style={s.sigValue}>{fmtIso(r.createdAt)}</Text>
            </View>
            <Text style={s.sigCaption}>Filed</Text>
          </View>
        </View>

        <Text style={s.sectionHeading}>Nursing review</Text>
        {r.review ? (
          <>
            <View style={s.grid}>
              <View style={s.rowLast}>
                <Cell label="Reviewed by" value={`${r.review.reviewerName}${r.review.reviewerCredential ? `, ${r.review.reviewerCredential}` : ''}`} flex={1.5} />
                <Cell label="Reviewed on" value={fmtIso(r.review.reviewedAt)} flex={1.5} />
                <Cell label="Incident report" value={r.review.incidentReportRequired ? (r.review.incidentReportFiledDate ? `Required, filed ${formatDateUS(r.review.incidentReportFiledDate)}` : 'Required, not yet filed') : 'Not required'} flex={1.5} last />
              </View>
            </View>
            <Box heading="Findings" text={r.review.findings} />
            <Box heading="Root cause" text={r.review.rootCause} />
            <Box heading="Corrective action" text={r.review.correctiveAction} />
          </>
        ) : (
          <View style={s.box}>
            <Text style={[s.boxText, { color: MUTED, fontFamily: 'Helvetica-Oblique' }]}>Pending. Findings, root cause, and corrective action are added by the reviewing nurse in the portal.</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}
