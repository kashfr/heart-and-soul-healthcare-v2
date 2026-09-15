import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { EdwpConsentRecord } from '@/lib/edwpConsentServer';
import {
  EDWP_CONSENT_STATEMENTS,
  PROGRAM_LABEL,
  serviceLabels,
  type EdwpProgram,
} from '@/lib/edwpConsent';
import { formatDateUS } from '@/lib/dateFormat';
import { BRAND_LOGO_DATA_URL, BRAND_LOGO_ASPECT } from './brandLogo';

// One-page PDF of a signed EDWP consent. Laid out to match the paper form
// (company header, four numbered sections, signature block) so the office can
// file it alongside forms signed by hand.

const CORAL = '#DE5B4A';
const INK = '#1f2937';
const MUTED = '#6b7280';
const RULE = '#d1d5db';

const LOGO_W = 140;

const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 36, paddingHorizontal: 50, fontSize: 9.5, fontFamily: 'Helvetica', color: INK },
  header: { alignItems: 'center', marginBottom: 6 },
  logo: { width: LOGO_W, height: LOGO_W / BRAND_LOGO_ASPECT, marginBottom: 8 },
  company: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  contact: { fontSize: 8, color: MUTED, marginTop: 2 },
  headerRule: { borderBottomWidth: 1.5, borderBottomColor: CORAL, marginTop: 6, marginBottom: 8 },
  title: { fontSize: 15, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  subtitle: { fontSize: 9, color: MUTED, textAlign: 'center', marginTop: 2, marginBottom: 8 },
  sectionHeading: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    marginTop: 8,
    marginBottom: 4,
    paddingBottom: 2,
    borderBottomWidth: 0.75,
    borderBottomColor: CORAL,
  },
  grid: { borderWidth: 0.5, borderColor: RULE },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: RULE },
  rowLast: { flexDirection: 'row' },
  cell: { paddingVertical: 5, paddingHorizontal: 6, borderRightWidth: 0.5, borderRightColor: RULE },
  cellLast: { paddingVertical: 5, paddingHorizontal: 6 },
  label: { fontSize: 7.5, color: MUTED, marginBottom: 1.5 },
  value: { fontSize: 9.5 },
  statementRow: { flexDirection: 'row', marginBottom: 3.5 },
  statementNum: { width: 14, fontFamily: 'Helvetica-Bold' },
  statementText: { flex: 1 },
  agreed: { marginTop: 4, fontSize: 8.5, color: MUTED, fontFamily: 'Helvetica-Oblique' },
  sigGrid: { flexDirection: 'row', marginTop: 8 },
  sigCol: { flex: 1, paddingRight: 16 },
  sigImage: { width: 180, height: 50, borderBottomWidth: 0.75, borderBottomColor: INK },
  sigLine: { height: 50, borderBottomWidth: 0.75, borderBottomColor: INK },
  sigCaption: { fontSize: 7.5, color: MUTED, marginTop: 3 },
  sigValue: { fontSize: 9.5, marginTop: 2 },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 50,
    right: 50,
    fontSize: 7,
    color: '#9ca3af',
    textAlign: 'center',
  },
});

function Cell({ label, value, flex = 1, last = false }: { label: string; value: string; flex?: number; last?: boolean }) {
  return (
    <View style={[last ? s.cellLast : s.cell, { flex }]}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value || ' '}</Text>
    </View>
  );
}

function fmtSubmitted(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
}

export default function EdwpConsentPDF({ consent }: { consent: EdwpConsentRecord }) {
  const program = consent.program ? PROGRAM_LABEL[consent.program as EdwpProgram] : '';
  const services = serviceLabels(consent.services, consent.servicesOther).join(', ');
  const signedOn = fmtSubmitted(consent.submittedAt);
  const signerLine =
    consent.signerType === 'representative'
      ? `${consent.signerName} (${consent.signerRelationship || 'Authorized representative'})`
      : consent.signerName;

  return (
    <Document title={`EDWP Client Consent - ${consent.clientName}`} author="Heart and Soul Healthcare, LLC">
      <Page size="LETTER" style={s.page}>
        {/* Declared first and `fixed`: an absolutely-positioned footer placed
            after the content is laid out in flow by react-pdf and can push a
            single-page form onto a second page. */}
        <Text style={s.footer} fixed>
          Signed electronically via heartandsoulhc.org. Reference {consent.id}. Confidential: contains protected health information.
        </Text>
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
          <Image src={BRAND_LOGO_DATA_URL} style={s.logo} />
          <Text style={s.company}>Heart and Soul Healthcare, LLC</Text>
          <Text style={s.contact}>
            1372 Peachtree St NE, Atlanta, GA 30309   |   Phone: 678.644.0337   |   Fax: 678.802.3121
          </Text>
        </View>
        <View style={s.headerRule} />

        <Text style={s.title}>CLIENT CONSENT FORM</Text>
        <Text style={s.subtitle}>Elderly and Disabled Waiver Program (EDWP): CCSP and SOURCE Services</Text>

        <Text style={s.sectionHeading}>1. CLIENT INFORMATION</Text>
        <View style={s.grid}>
          <View style={s.row}>
            <Cell label="Client Name" value={consent.clientName} flex={3} />
            <Cell label="Date of Birth" value={formatDateUS(consent.dob)} flex={2} last />
          </View>
          <View style={s.row}>
            <Cell label="Home Address" value={consent.address} flex={3} />
            <Cell label="Medicaid ID Number" value={consent.medicaidId} flex={2} last />
          </View>
          <View style={s.rowLast}>
            <Cell label="Phone" value={consent.phone} flex={1.5} />
            <Cell label="Email" value={consent.email} flex={1.5} />
            <Cell label="Emergency Contact" value={consent.emergencyContactName} flex={1.5} />
            <Cell label="Emergency Contact Phone" value={consent.emergencyContactPhone} flex={1.5} last />
          </View>
        </View>

        <Text style={s.sectionHeading}>2. PROGRAM AND CARE COORDINATION</Text>
        <View style={s.grid}>
          <View style={s.row}>
            <Cell label="Program" value={program} flex={1} last />
          </View>
          <View style={s.row}>
            <Cell label="Care Coordinator / Case Manager" value={consent.careCoordinatorName} flex={1.6} />
            <Cell label="Agency" value={consent.careCoordinatorAgency} flex={1.4} />
            <Cell label="Phone" value={consent.careCoordinatorPhone} flex={1} last />
          </View>
          <View style={s.rowLast}>
            <Cell label="Services Requested" value={services || 'None selected'} flex={1} last />
          </View>
        </View>

        <Text style={s.sectionHeading}>3. CONSENT</Text>
        <Text style={{ marginBottom: 4 }}>
          By signing below, I (or my authorized representative) confirm the following:
        </Text>
        {EDWP_CONSENT_STATEMENTS.map((text, i) => (
          <View key={i} style={s.statementRow}>
            <Text style={s.statementNum}>{i + 1}.</Text>
            <Text style={s.statementText}>{text}</Text>
          </View>
        ))}
        <Text style={s.agreed}>
          This consent remains in effect for the duration of services unless withdrawn or revised.
          {' '}Agreed electronically (consent wording version {consent.consentVersion}).
        </Text>

        <Text style={s.sectionHeading}>4. SIGNATURES</Text>
        <View style={s.sigGrid}>
          <View style={s.sigCol}>
            {consent.signature ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop
              <Image src={consent.signature} style={s.sigImage} />
            ) : (
              <View style={s.sigLine} />
            )}
            <Text style={s.sigCaption}>
              {consent.signerType === 'representative'
                ? 'Authorized Representative Signature'
                : 'Client Signature'}
            </Text>
            <Text style={s.sigValue}>{signerLine}</Text>
          </View>
          <View style={s.sigCol}>
            <View style={s.sigLine}>
              <Text style={{ marginTop: 34 }}>{signedOn}</Text>
            </View>
            <Text style={s.sigCaption}>Date Signed</Text>
          </View>
        </View>
        <View style={[s.sigGrid, { marginTop: 10 }]}>
          <View style={s.sigCol}>
            <View style={[s.sigLine, { height: 26 }]} />
            <Text style={s.sigCaption}>Heart and Soul Healthcare Representative</Text>
          </View>
          <View style={s.sigCol}>
            <View style={[s.sigLine, { height: 26 }]} />
            <Text style={s.sigCaption}>Title / Date</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}
