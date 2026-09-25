import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { formatUSFaxNumber } from '@/lib/verbalOrderShared';
import { BRAND_LOGO_DATA_URL, BRAND_LOGO_ASPECT } from './brandLogo';

// The introduction letter faxed in front of a signed Release of Information:
// who Heart and Soul is, what we do for the member, and why the facility is
// getting the authorization. Same letterhead as the fax cover sheet. Kept
// black and gray so it survives the fax; no em or en dashes (printed).

const CORAL = '#DE5B4A';
const INK = '#1f2937';
const MUTED = '#4b5563';
const LOGO_W = 120;

const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 48, paddingHorizontal: 64, fontSize: 10.5, fontFamily: 'Helvetica', color: INK },
  header: { alignItems: 'center', marginBottom: 4 },
  logo: { width: LOGO_W, height: LOGO_W / BRAND_LOGO_ASPECT, marginBottom: 4 },
  company: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  contact: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  headerRule: { borderBottomWidth: 1.5, borderBottomColor: CORAL, marginTop: 6, marginBottom: 18 },
  date: { marginBottom: 12 },
  to: { lineHeight: 1.2, marginBottom: 12 },
  re: { fontFamily: 'Helvetica-Bold', marginBottom: 12, lineHeight: 1.2 },
  para: { lineHeight: 1.3, marginBottom: 9 },
  closing: { marginTop: 2, lineHeight: 1.3 },
  sig: { marginTop: 14, lineHeight: 1.2 },
  footer: { position: 'absolute', bottom: 22, left: 64, right: 64, fontSize: 7.5, color: MUTED, textAlign: 'center' },
});

export interface RoiLetterPdfProps {
  date: string; // already formatted for print
  facilityName: string;
  attention: string;
  facilityAddress: string;
  memberName: string;
  dob: string;
  paragraphs: string[];
  senderName: string;
  returnFax: string;
}

export default function RoiLetterPDF(p: RoiLetterPdfProps) {
  return (
    <Document title="Introduction and release of information" author="Heart and Soul Healthcare, LLC">
      <Page size="LETTER" style={s.page}>
        <Text style={s.footer} fixed>
          Confidential: contains protected health information. If you received this in error, call (678) 644-0337 and destroy all pages.
        </Text>
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
          <Image src={BRAND_LOGO_DATA_URL} style={s.logo} />
          <Text style={s.company}>Heart and Soul Healthcare, LLC</Text>
          <Text style={s.contact}>
            1372 Peachtree St NE, Atlanta, GA 30309   |   Phone: (678) 644-0337{p.returnFax ? `   |   Fax: ${formatUSFaxNumber(p.returnFax)}` : ''}
          </Text>
        </View>
        <View style={s.headerRule} />

        <Text style={s.date}>{p.date}</Text>
        <View style={s.to}>
          {p.attention && p.attention !== p.facilityName ? <Text>Attn: {p.attention}</Text> : null}
          <Text>{p.facilityName}</Text>
          {p.facilityAddress ? <Text>{p.facilityAddress}</Text> : null}
        </View>
        <Text style={s.re}>
          Re: {p.memberName}{p.dob ? ` (DOB ${p.dob})` : ''}{'\n'}Introduction and Authorization for Release of Information
        </Text>

        <Text style={s.para}>To whom it may concern:</Text>
        {p.paragraphs.map((t, i) => (
          <Text key={i} style={s.para}>{t}</Text>
        ))}

        <Text style={s.closing}>Thank you for your partnership in {p.memberName}&apos;s care.</Text>
        <View style={s.sig}>
          <Text>Sincerely,</Text>
          <Text style={{ marginTop: 20 }}>{p.senderName || 'Heart and Soul Healthcare'}</Text>
          <Text>Heart and Soul Healthcare, LLC</Text>
          <Text>(678) 644-0337{p.returnFax ? `  |  Fax ${formatUSFaxNumber(p.returnFax)}` : ''}</Text>
        </View>
      </Page>
    </Document>
  );
}
