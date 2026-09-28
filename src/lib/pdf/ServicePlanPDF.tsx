import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { BRAND_LOGO_DATA_URL, BRAND_LOGO_ASPECT } from './brandLogo';
import { serviceTypesLabel, specialDietLabel, usedGoals, yesNoLabel, type ServicePlanRecord } from '@/lib/servicePlanShared';

// The signed Service Plan, laid out like the agency's paper form: identity
// lines, the service lines, the diet and personal-care answers, the goals and
// objectives table, medications, discharge plans, and the supervisor's
// signature. Letterhead matches the other filed documents. Printed, so no em
// or en dashes.

const CORAL = '#DE5B4A';
const INK = '#1f2937';
const MUTED = '#4b5563';
const RULE = '#9ca3af';
const LOGO_W = 110;

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 46, paddingHorizontal: 54, fontSize: 10, fontFamily: 'Helvetica', color: INK },
  header: { alignItems: 'center', marginBottom: 2 },
  logo: { width: LOGO_W, height: LOGO_W / BRAND_LOGO_ASPECT, marginBottom: 3 },
  company: { fontSize: 10.5, fontFamily: 'Helvetica-Bold' },
  contact: { fontSize: 8, color: MUTED, marginTop: 1 },
  headerRule: { borderBottomWidth: 1.5, borderBottomColor: CORAL, marginTop: 5, marginBottom: 8 },
  title: { fontSize: 15, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 10, letterSpacing: 0.5 },
  row: { flexDirection: 'row', marginBottom: 4 },
  label: { fontFamily: 'Helvetica-Bold', width: 168, paddingRight: 6 },
  value: { flex: 1, lineHeight: 1.3 },
  block: { marginBottom: 5 },
  blockLabel: { fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  blockValue: { lineHeight: 1.3, paddingLeft: 2 },
  twoUp: { flexDirection: 'row', gap: 18 },
  half: { flex: 1 },
  section: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 6, marginBottom: 6, paddingBottom: 2, borderBottomWidth: 0.75, borderBottomColor: RULE },
  table: { borderWidth: 0.75, borderColor: RULE, marginBottom: 8 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: RULE },
  trLast: { flexDirection: 'row' },
  th: { flex: 1, padding: 5, fontFamily: 'Helvetica-Bold', backgroundColor: '#f3f4f6', textAlign: 'center' },
  td: { flex: 1, padding: 5, lineHeight: 1.3 },
  tdLeft: { borderRightWidth: 0.75, borderRightColor: RULE },
  sigBlock: { marginTop: 14, flexDirection: 'row', gap: 30 },
  sigCol: { flex: 1 },
  sigLine: { borderTopWidth: 0.75, borderTopColor: INK, paddingTop: 3, fontSize: 8.5, color: MUTED },
  sigImage: { width: 190, height: 60 },
  footer: { position: 'absolute', bottom: 20, left: 54, right: 54, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: MUTED },
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row} wrap={false}>
      <Text style={s.label}>{label}:</Text>
      <Text style={s.value}>{value || ' '}</Text>
    </View>
  );
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.block}>
      <Text style={s.blockLabel}>{label}:</Text>
      <Text style={s.blockValue}>{value || ' '}</Text>
    </View>
  );
}

export interface ServicePlanPdfProps {
  plan: ServicePlanRecord;
  /** Already formatted for print (MM/DD/YYYY). */
  dob: string;
  signedDate: string;
}

export default function ServicePlanPDF({ plan, dob, signedDate }: ServicePlanPdfProps) {
  const goals = usedGoals(plan.goals);
  return (
    <Document title={`Service Plan: ${plan.clientName}`} author="Heart and Soul Healthcare, LLC">
      <Page size="LETTER" style={s.page}>
        <View style={s.header} fixed>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
          <Image src={BRAND_LOGO_DATA_URL} style={s.logo} />
          <Text style={s.company}>Heart and Soul Healthcare, LLC</Text>
          <Text style={s.contact}>1372 Peachtree St NE, Atlanta, GA 30309   |   Phone: (678) 644-0337</Text>
        </View>
        <View style={s.headerRule} fixed />
        <Text style={s.title}>Service Plan</Text>

        <View style={s.twoUp}>
          <View style={s.half}>
            <Row label="Name of Client" value={plan.clientName} />
          </View>
          <View style={{ width: 190 }}>
            <Row label="Date of Birth" value={dob} />
          </View>
        </View>
        <Row label="Address" value={plan.address} />
        <Row label="Diagnosis" value={plan.diagnosis} />
        <Block label="Client Functional Limitations" value={plan.functionalLimitations} />
        <Row label="Types of Services Required" value={serviceTypesLabel(plan.serviceTypes)} />
        <Row label="Nutritional Needs" value={plan.nutritionalNeeds} />
        <Row label="Allergies" value={plan.allergies} />
        <Block label="Expected Times and Frequency of Service Delivery" value={plan.expectedTimesFrequency} />
        <Row label="Expected Duration of Services" value={plan.expectedDuration} />
        <Block label="Description of Services to be Provided" value={plan.descriptionOfServices} />

        <Text style={s.section}>Diet and Personal Care</Text>
        <View style={s.twoUp}>
          <View style={s.half}>
            <Row label="Regular Diet" value={yesNoLabel(plan.regularDiet)} />
          </View>
          <View style={s.half}>
            <Row label="Special Diet" value={specialDietLabel(plan.specialDiets, plan.specialDietOther) || 'None'} />
          </View>
        </View>
        <Row label="Special Treatments" value={plan.specialTreatments || 'None'} />
        <Row label="Special Equipment" value={plan.specialEquipment || 'None'} />
        <Block label="Behaviors that may interfere with delivering services" value={plan.behaviors || 'None'} />
        <View style={s.twoUp}>
          <View style={s.half}>
            <Row label="Tub Bath" value={yesNoLabel(plan.tubBath)} />
          </View>
          <View style={s.half}>
            <Row label="Bed Bath" value={yesNoLabel(plan.bedBath)} />
          </View>
          <View style={s.half}>
            <Row label="Applying Lotion to Back" value={yesNoLabel(plan.lotionToBack)} />
          </View>
        </View>

        <Text style={s.section}>Goals and Objectives</Text>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, s.tdLeft]}>Goals</Text>
            <Text style={s.th}>Objectives</Text>
          </View>
          {goals.map((g, i) => (
            <View key={i} style={i === goals.length - 1 ? s.trLast : s.tr} wrap={false}>
              <Text style={[s.td, s.tdLeft]}>{g.goal}</Text>
              <Text style={s.td}>{g.objective}</Text>
            </View>
          ))}
        </View>

        <Block label="Medications" value={plan.medications} />
        <Block label="Discharge Plans" value={plan.dischargePlans} />

        <View style={s.sigBlock} wrap={false}>
          <View style={s.sigCol}>
            <Text style={{ marginBottom: 3 }}>{plan.supervisorName}{plan.supervisorCredentials ? `, ${plan.supervisorCredentials}` : ''}</Text>
            <Text style={s.sigLine}>Supervisor Printed Name/Credentials</Text>
          </View>
          <View style={s.sigCol}>
            {plan.signature ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop
              <Image src={plan.signature} style={s.sigImage} />
            ) : (
              <View style={{ height: 60 }} />
            )}
            <Text style={s.sigLine}>Supervisor Signature/Date: {signedDate}</Text>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>Confidential: contains protected health information.</Text>
          <Text render={({ pageNumber, totalPages }) => `Service Plan Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
