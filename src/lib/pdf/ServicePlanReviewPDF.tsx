import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { BRAND_LOGO_DATA_URL, BRAND_LOGO_ASPECT } from './brandLogo';

// One page filed under Documents each time a supervisor reviews the current
// Service Plan and finds nothing to change. It points at the plan by its
// signed date instead of repeating it. Printed, so no em or en dashes.

const CORAL = '#DE5B4A';
const INK = '#1f2937';
const MUTED = '#4b5563';
const RULE = '#9ca3af';
const LOGO_W = 110;

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 46, paddingHorizontal: 54, fontSize: 10.5, fontFamily: 'Helvetica', color: INK },
  header: { alignItems: 'center', marginBottom: 2 },
  logo: { width: LOGO_W, height: LOGO_W / BRAND_LOGO_ASPECT, marginBottom: 3 },
  company: { fontSize: 10.5, fontFamily: 'Helvetica-Bold' },
  contact: { fontSize: 8, color: MUTED, marginTop: 1 },
  headerRule: { borderBottomWidth: 1.5, borderBottomColor: CORAL, marginTop: 5, marginBottom: 12 },
  title: { fontSize: 15, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 14, letterSpacing: 0.5 },
  row: { flexDirection: 'row', marginBottom: 5 },
  label: { fontFamily: 'Helvetica-Bold', width: 150 },
  value: { flex: 1, fontSize: 10.5, lineHeight: 1.35 },
  para: { fontSize: 10.5, lineHeight: 1.35, marginTop: 10, marginBottom: 4 },
  listItem: { fontSize: 10.5, lineHeight: 1.35, marginLeft: 10 },
  sigBlock: { marginTop: 26, flexDirection: 'row', gap: 30 },
  sigCol: { flex: 1 },
  sigLine: { borderTopWidth: 0.75, borderTopColor: INK, paddingTop: 3, fontSize: 8.5, color: MUTED },
  sigImage: { width: 190, height: 60 },
  footer: { position: 'absolute', bottom: 20, left: 54, right: 54, fontSize: 7.5, color: MUTED, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 4 },
});

const noHyphen = (word: string) => [word];

export interface ServicePlanReviewPdfProps {
  clientName: string;
  dob: string; // formatted
  planSignedDate: string; // formatted
  planSignedBy: string;
  reviewedDate: string; // formatted
  reviewerName: string;
  reviewerCredentials: string;
  signature: string;
  note: string;
  differencesAcknowledged: string[];
  nextDueDate: string; // formatted
}

export default function ServicePlanReviewPDF(p: ServicePlanReviewPdfProps) {
  const lines = (t: string) => t.split(/\r?\n/);
  return (
    <Document title={`Service Plan Review: ${p.clientName}`} author="Heart and Soul Healthcare, LLC">
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
          <Image src={BRAND_LOGO_DATA_URL} style={s.logo} />
          <Text style={s.company}>Heart and Soul Healthcare, LLC</Text>
          <Text style={s.contact}>1372 Peachtree St NE, Atlanta, GA 30309   |   Phone: (678) 644-0337</Text>
        </View>
        <View style={s.headerRule} />
        <Text style={s.title}>Service Plan Review</Text>

        <View style={s.row}><Text style={s.label}>Name of Client:</Text><Text style={s.value}>{p.clientName}</Text></View>
        <View style={s.row}><Text style={s.label}>Date of Birth:</Text><Text style={s.value}>{p.dob}</Text></View>
        <View style={s.row}><Text style={s.label}>Service Plan Reviewed:</Text><Text style={s.value}>Signed {p.planSignedDate}{p.planSignedBy ? ` by ${p.planSignedBy}` : ''}</Text></View>
        <View style={s.row}><Text style={s.label}>Date of Review:</Text><Text style={s.value}>{p.reviewedDate}</Text></View>
        <View style={s.row}><Text style={s.label}>Next Review Due By:</Text><Text style={s.value}>{p.nextDueDate}</Text></View>

        <Text style={s.para} hyphenationCallback={noHyphen}>
          I reviewed the service plan named above and it continues to reflect the client&apos;s functional limitations, services, frequency and duration of services, goals and objectives, medications, and discharge plans. No changes to the plan are needed at this time.
        </Text>

        {p.differencesAcknowledged.length > 0 ? (
          <View>
            <Text style={s.para} hyphenationCallback={noHyphen}>The following differences from the client record were reviewed and do not change the plan:</Text>
            {p.differencesAcknowledged.map((d, i) => (
              <Text key={i} style={s.listItem} hyphenationCallback={noHyphen}>{`• ${d}`}</Text>
            ))}
          </View>
        ) : null}

        {p.note ? (
          <View>
            <Text style={s.para}>Note:</Text>
            {lines(p.note).map((l, i) => (
              <Text key={i} style={s.listItem} hyphenationCallback={noHyphen}>{l || ' '}</Text>
            ))}
          </View>
        ) : null}

        <View style={s.sigBlock} wrap={false}>
          <View style={s.sigCol}>
            <Text style={{ marginBottom: 3 }}>{p.reviewerName}{p.reviewerCredentials ? `, ${p.reviewerCredentials}` : ''}</Text>
            <Text style={s.sigLine}>Reviewer Printed Name/Credentials</Text>
          </View>
          <View style={s.sigCol}>
            {p.signature ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop
              <Image src={p.signature} style={s.sigImage} />
            ) : (
              <View style={{ height: 60 }} />
            )}
            <Text style={s.sigLine}>Reviewer Signature/Date: {p.reviewedDate}</Text>
          </View>
        </View>

        <Text style={s.footer} fixed>
          Confidential: contains protected health information. Service plans for nursing services are reviewed and updated at least every 62 days (Ga. Comp. R. and Regs. 111-8-65-.11).
        </Text>
      </Page>
    </Document>
  );
}
