import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { VerbalOrder } from '@/lib/verbalOrderShared';
import { formatUSFaxNumber } from '@/lib/verbalOrderShared';
import { formatDateUS } from '@/lib/dateFormat';
import { BRAND_LOGO_DATA_URL, BRAND_LOGO_ASPECT } from './brandLogo';

// One-page verbal order, laid out like the paper form the office already
// files (nurse block, physician authentication block, office block). Generated
// twice in an order's life: once to fax the physician (physician block blank)
// and once as the completed record after signature. No em or en dashes: this
// is a printed deliverable.

const CORAL = '#DE5B4A';
const INK = '#1f2937';
const MUTED = '#6b7280';
const RULE = '#d1d5db';
const LOGO_W = 110;

const s = StyleSheet.create({
  page: { paddingTop: 22, paddingBottom: 34, paddingHorizontal: 48, fontSize: 9.5, fontFamily: 'Helvetica', color: INK },
  header: { alignItems: 'center', marginBottom: 4 },
  logo: { width: LOGO_W, height: LOGO_W / BRAND_LOGO_ASPECT, marginBottom: 4 },
  company: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  contact: { fontSize: 8, color: MUTED, marginTop: 2 },
  headerRule: { borderBottomWidth: 1.5, borderBottomColor: CORAL, marginTop: 5, marginBottom: 6 },
  title: { fontSize: 15, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  subtitle: { fontSize: 8.5, color: MUTED, textAlign: 'center', marginTop: 2, marginBottom: 6 },
  sectionHeading: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', marginTop: 6, marginBottom: 3, paddingBottom: 2, borderBottomWidth: 0.75, borderBottomColor: CORAL },
  grid: { borderWidth: 0.5, borderColor: RULE },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: RULE },
  rowLast: { flexDirection: 'row' },
  cell: { paddingVertical: 4, paddingHorizontal: 6, borderRightWidth: 0.5, borderRightColor: RULE },
  cellLast: { paddingVertical: 4, paddingHorizontal: 6 },
  label: { fontSize: 7.5, color: MUTED, marginBottom: 1.5 },
  value: { fontSize: 9.5 },
  orderBox: { borderWidth: 0.5, borderColor: RULE, padding: 8, minHeight: 64, marginTop: 3 },
  orderText: { fontSize: 10.5, lineHeight: 1.45 },
  readBack: { marginTop: 4, fontSize: 8.5, fontFamily: 'Helvetica-Oblique', color: MUTED },
  sigGrid: { flexDirection: 'row', marginTop: 4 },
  sigCol: { flex: 1, paddingRight: 16 },
  sigImage: { width: 170, height: 38, borderBottomWidth: 0.75, borderBottomColor: INK },
  sigLine: { height: 34, borderBottomWidth: 0.75, borderBottomColor: INK },
  sigCaption: { fontSize: 7.5, color: MUTED, marginTop: 3 },
  sigValue: { fontSize: 9.5, marginTop: 2 },
  instruction: { fontSize: 9, lineHeight: 1.4, marginBottom: 4 },
  esignRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, padding: 5, borderWidth: 0.5, borderColor: RULE, backgroundColor: '#f8fafc' },
  qr: { width: 54, height: 54, marginRight: 10 },
  esignText: { flex: 1, fontSize: 8.5, lineHeight: 1.4, color: INK },
  officeRow: { flexDirection: 'row', marginTop: 2 },
  officeCol: { flex: 1, paddingRight: 12 },
  officeLine: { height: 18, borderBottomWidth: 0.75, borderBottomColor: INK },
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

function fmtWhen(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
}

export interface VerbalOrderPdfProps {
  order: VerbalOrder;
  /** The number the physician faxes the signed copy back to. */
  returnFax: string;
  /** Public e-sign link and its QR image (data URL); omitted once signed. */
  esignUrl?: string;
  esignQrDataUrl?: string;
}

export default function VerbalOrderPDF({ order, returnFax, esignUrl, esignQrDataUrl }: VerbalOrderPdfProps) {
  const signed = order.signed;
  const isSigned = order.status === 'signed' && !!signed;
  return (
    <Document title={`Verbal Order - ${order.patientName}`} author="Heart and Soul Healthcare, LLC">
      <Page size="LETTER" style={s.page}>
        <Text style={s.footer} fixed>
          Verbal order reference {order.id}. Confidential: contains protected health information. If received in error, call 678.644.0337.
        </Text>
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
          <Image src={BRAND_LOGO_DATA_URL} style={s.logo} />
          <Text style={s.company}>Heart and Soul Healthcare, LLC</Text>
          <Text style={s.contact}>1372 Peachtree St NE, Atlanta, GA 30309   |   Phone: 678.644.0337   |   Fax: {formatUSFaxNumber(returnFax)}</Text>
        </View>
        <View style={s.headerRule} />

        <Text style={s.title}>VERBAL ORDER</Text>
        <Text style={s.subtitle}>{order.orderType === 'medication' ? 'Medication order' : 'Treatment or care order'} received by telephone</Text>

        <View style={s.grid}>
          <View style={s.row}>
            <Cell label="Client's name" value={order.patientName} flex={2} />
            <Cell label="Date of birth" value={formatDateUS(order.patientDob)} />
            <Cell label="Date order taken" value={formatDateUS(order.takenDate)} last />
          </View>
          <View style={s.row}>
            <Cell label="Nurse taking the verbal order" value={`${order.nurseName}${order.nurseCredential ? `, ${order.nurseCredential}` : ''}`} flex={2} />
            <Cell label="Time taken" value={fmtWhen(order.takenAt)} flex={2} last />
          </View>
          <View style={s.row}>
            <Cell label="Physician's name" value={order.physicianName} flex={2} />
            <Cell label="Area of specialty" value={order.physicianSpecialty} flex={2} last />
          </View>
          <View style={s.rowLast}>
            <Cell label="Physician's telephone" value={order.physicianPhone} />
            <Cell label="Physician's fax" value={formatUSFaxNumber(order.physicianFax)} last />
          </View>
        </View>

        <Text style={s.sectionHeading}>Describe the order</Text>
        <View style={s.orderBox}>
          <Text style={s.orderText}>{order.orderText}</Text>
        </View>
        <Text style={s.readBack}>
          {order.readBackVerified ? 'The nurse read this order back to the physician and verified it before signing.' : ''}
        </Text>

        <View style={s.sigGrid}>
          <View style={s.sigCol}>
            {order.nurseSignature ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={order.nurseSignature} style={s.sigImage} />
            ) : (
              <View style={s.sigLine} />
            )}
            <Text style={s.sigCaption}>{"Nurse's signature"}</Text>
            <Text style={s.sigValue}>{order.nurseName}{order.nurseCredential ? `, ${order.nurseCredential}` : ''}</Text>
          </View>
          <View style={s.sigCol}>
            <View style={{ height: 38, justifyContent: 'flex-end' }}>
              <Text style={s.sigValue}>{formatDateUS(order.takenDate)}</Text>
            </View>
            <Text style={s.sigCaption}>Date</Text>
          </View>
        </View>

        <Text style={s.sectionHeading}>Physician authentication</Text>
        {isSigned ? (
          <View style={s.sigGrid}>
            <View style={s.sigCol}>
              {signed.physicianSignature ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image src={signed.physicianSignature} style={s.sigImage} />
              ) : (
                <View style={{ height: 38, justifyContent: 'flex-end' }}>
                  <Text style={s.sigValue}>{signed.method === 'fax' ? 'Signed copy on file (returned by fax)' : 'Signed copy on file'}</Text>
                </View>
              )}
              <Text style={s.sigCaption}>{"Physician's signature"}</Text>
              <Text style={s.sigValue}>{signed.physicianPrintedName || order.physicianName}</Text>
            </View>
            <View style={s.sigCol}>
              <View style={{ height: 38, justifyContent: 'flex-end' }}>
                <Text style={s.sigValue}>{formatDateUS(signed.signedDate)}</Text>
              </View>
              <Text style={s.sigCaption}>Date signed</Text>
            </View>
          </View>
        ) : (
          <>
            <Text style={s.instruction}>
              Physician: please review the order above, sign, date, and return by fax to Heart and Soul Healthcare at {formatUSFaxNumber(returnFax)}.
            </Text>
            <View style={s.sigGrid}>
              <View style={s.sigCol}>
                <View style={s.sigLine} />
                <Text style={s.sigCaption}>{"Physician's signature"}</Text>
              </View>
              <View style={s.sigCol}>
                <View style={s.sigLine} />
                <Text style={s.sigCaption}>Date</Text>
              </View>
            </View>
            <View style={s.sigGrid}>
              <View style={s.sigCol}>
                <View style={s.sigLine} />
                <Text style={s.sigCaption}>{"Physician's printed name"}</Text>
              </View>
            </View>
            {esignUrl && esignQrDataUrl ? (
              <View style={s.esignRow}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={esignQrDataUrl} style={s.qr} />
                <Text style={s.esignText}>
                  Prefer to sign electronically? Scan this code or open {esignUrl} to review and sign on any phone or computer. Nothing needs to be faxed back when you sign online.
                </Text>
              </View>
            ) : null}
          </>
        )}

        <Text style={s.sectionHeading}>Office use</Text>
        {isSigned ? (
          <View style={s.grid}>
            <View style={s.rowLast}>
              <Cell label="Signed order received on" value={signed.receivedAt ? fmtWhen(signed.receivedAt) : formatDateUS(signed.signedDate)} />
              <Cell label="Received by" value={signed.receivedByName || (signed.method === 'esign' ? 'Electronic signature' : '')} />
              <Cell label="How" value={signed.method === 'fax' ? 'Returned by fax' : signed.method === 'esign' ? 'Signed online' : 'Recorded by office'} last />
            </View>
          </View>
        ) : (
          <View style={s.officeRow}>
            <View style={s.officeCol}>
              <View style={s.officeLine} />
              <Text style={s.sigCaption}>Signed order received on</Text>
            </View>
            <View style={s.officeCol}>
              <View style={s.officeLine} />
              <Text style={s.sigCaption}>Received by</Text>
            </View>
          </View>
        )}
        <Text style={[s.readBack, { marginTop: 4 }]}>
          File the signed copy in the client binder and update the MAR order with the signed date.
        </Text>
      </Page>
    </Document>
  );
}
