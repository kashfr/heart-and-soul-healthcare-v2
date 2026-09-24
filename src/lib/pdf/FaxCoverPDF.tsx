import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { formatUSFaxNumber } from '@/lib/verbalOrderShared';
import { BRAND_LOGO_DATA_URL, BRAND_LOGO_ASPECT } from './brandLogo';

// Fax Center cover sheet: who it is for, who sent it, how many pages, the
// "regarding" line, an optional note, and the confidentiality notice. The
// "regarding" line is where client identifiers go (never on the attached
// forms themselves; see the GAPP rule that providers cannot complete the
// PPOT). No em or en dashes: this is a printed deliverable.

const CORAL = '#DE5B4A';
const INK = '#1f2937';
const MUTED = '#4b5563';
// Faxes are sent black and white: anything much lighter than mid gray drops
// out, so rules and small print stay dark.
const RULE = '#4b5563';
const LOGO_W = 120;

const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 40, paddingHorizontal: 54, fontSize: 10.5, fontFamily: 'Helvetica', color: INK },
  header: { alignItems: 'center', marginBottom: 4 },
  logo: { width: LOGO_W, height: LOGO_W / BRAND_LOGO_ASPECT, marginBottom: 4 },
  company: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  contact: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  headerRule: { borderBottomWidth: 1.5, borderBottomColor: CORAL, marginTop: 6, marginBottom: 14 },
  title: { fontSize: 30, fontFamily: 'Helvetica-Bold', letterSpacing: 4, textAlign: 'center', marginBottom: 14 },
  grid: { borderWidth: 0.5, borderColor: RULE },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: RULE },
  rowLast: { flexDirection: 'row' },
  cell: { paddingVertical: 6, paddingHorizontal: 8, borderRightWidth: 0.5, borderRightColor: RULE },
  cellLast: { paddingVertical: 6, paddingHorizontal: 8 },
  label: { fontSize: 8, color: MUTED, marginBottom: 2 },
  value: { fontSize: 11 },
  sectionHeading: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 4, paddingBottom: 2, borderBottomWidth: 0.75, borderBottomColor: CORAL },
  noteBox: { borderWidth: 0.5, borderColor: RULE, padding: 10, minHeight: 90 },
  noteText: { fontSize: 11, lineHeight: 1.5 },
  notice: { marginTop: 18, padding: 10, borderWidth: 1, borderColor: INK },
  noticeTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  noticeText: { fontSize: 8.5, lineHeight: 1.45 },
  ppotBox: { borderWidth: 1.5, borderColor: INK, padding: 8, marginBottom: 12 },
  ppotTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  ppotSub: { fontSize: 9, textAlign: 'center', marginTop: 2 },
  blankLine: { height: 14, borderBottomWidth: 0.75, borderBottomColor: INK },
  blankHint: { fontSize: 7.5, color: MUTED, marginTop: 2 },
  footer: { position: 'absolute', bottom: 18, left: 54, right: 54, fontSize: 7.5, color: MUTED, textAlign: 'center' },
});

function Cell({ label, value, flex = 1, last = false }: { label: string; value: string; flex?: number; last?: boolean }) {
  return (
    <View style={[last ? s.cellLast : s.cell, { flex }]}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value || ' '}</Text>
    </View>
  );
}

export interface FaxCoverPdfProps {
  recipientName: string;
  recipientOrg: string;
  toNumber: string;
  senderName: string;
  returnFax: string;
  /** Total pages including this cover. */
  totalPages: number;
  sentDate: string; // already formatted for print
  regarding: string;
  note: string;
  reference: string;
  /** A PPOT request: adds the request banner and a member block (Medicaid ID
   *  left as a blank line for the office when we don't have it). */
  ppot?: {
    requestLabel: string; // "New case (initial request)" | "Recertification"
    memberName: string;
    dob: string;
    medicaidId: string;
  };
}

export default function FaxCoverPDF(p: FaxCoverPdfProps) {
  return (
    <Document title="Fax cover sheet" author="Heart and Soul Healthcare, LLC">
      <Page size="LETTER" style={s.page}>
        <Text style={s.footer} fixed>
          Fax reference {p.reference}. If you did not receive all pages, call (678) 644-0337.
        </Text>
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
          <Image src={BRAND_LOGO_DATA_URL} style={s.logo} />
          <Text style={s.company}>Heart and Soul Healthcare, LLC</Text>
          <Text style={s.contact}>1372 Peachtree St NE, Atlanta, GA 30309   |   Phone: (678) 644-0337   |   Fax: {formatUSFaxNumber(p.returnFax)}</Text>
        </View>
        <View style={s.headerRule} />

        <Text style={s.title}>FAX</Text>

        {p.ppot ? (
          <View style={s.ppotBox}>
            <Text style={s.ppotTitle}>REQUEST FOR PHYSICIAN PLAN OF TREATMENT (GAPP APPENDIX T)</Text>
            <Text style={s.ppotSub}>{p.ppot.requestLabel}. The blank form is attached for the physician to complete and sign.</Text>
            <View style={[s.grid, { marginTop: 6 }]}>
              <View style={s.rowLast}>
                <Cell label="Member name" value={p.ppot.memberName} flex={2} />
                <Cell label="Date of birth" value={p.ppot.dob} />
                <View style={[s.cellLast, { flex: 2 }]}>
                  <Text style={s.label}>Medicaid ID</Text>
                  {p.ppot.medicaidId ? (
                    <Text style={s.value}>{p.ppot.medicaidId}</Text>
                  ) : (
                    <>
                      <View style={s.blankLine} />
                      <Text style={s.blankHint}>Please enter on the form</Text>
                    </>
                  )}
                </View>
              </View>
            </View>
          </View>
        ) : null}

        <View style={s.grid}>
          <View style={s.row}>
            <Cell label="To" value={p.recipientName} flex={2} />
            <Cell label="Fax" value={formatUSFaxNumber(p.toNumber)} last />
          </View>
          <View style={s.row}>
            <Cell label="Office / organization" value={p.recipientOrg} flex={2} />
            <Cell label="Date" value={p.sentDate} last />
          </View>
          <View style={s.row}>
            <Cell label="From" value={p.senderName ? `${p.senderName}, Heart and Soul Healthcare` : 'Heart and Soul Healthcare'} flex={2} />
            <Cell label="Pages (including cover)" value={String(p.totalPages)} last />
          </View>
          <View style={s.row}>
            <Cell label="Phone" value="(678) 644-0337" flex={2} />
            <Cell label="Return fax" value={formatUSFaxNumber(p.returnFax)} last />
          </View>
          <View style={s.rowLast}>
            <Cell label="Regarding" value={p.regarding} last />
          </View>
        </View>

        <Text style={s.sectionHeading}>Message</Text>
        <View style={s.noteBox}>
          <Text style={s.noteText}>{p.note || ' '}</Text>
        </View>

        <View style={s.notice}>
          <Text style={s.noticeTitle}>CONFIDENTIALITY NOTICE</Text>
          <Text style={s.noticeText}>
            This fax may contain protected health information that is privileged and confidential under
            federal and state law (including HIPAA). It is intended only for the person or office named above.
            If you are not the intended recipient, you are notified that any review, disclosure, copying, or
            distribution of this fax is prohibited. If you received it in error, please call (678) 644-0337 right
            away and destroy all pages.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
