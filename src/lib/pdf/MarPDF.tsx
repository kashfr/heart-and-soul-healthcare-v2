import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

/**
 * Printable monthly Medication Administration Record, landscape Letter,
 * modeled on the Heart & Soul paper MAR (med grid with day columns, initials
 * when given, circled when held/refused, initial/signature legend, PRN &
 * exception log). Purely presentational: the /api/mar/pdf route assembles the
 * view-model (a header SNAPSHOT at export time) so this file stays free of
 * Firebase imports.
 */

export type MarCellStatus = 'given' | 'held' | 'refused' | 'none' | 'inactive';

export interface MarPdfCell {
  label: string;
  status: MarCellStatus;
  star: boolean; // administered by family/caregiver; see log
}

export interface MarPdfRow {
  medLine1: string; // medication name
  medLine2: string; // dose/units · route · frequency (+ D/C)
  slot: string; // 'HH:MM' or 'PRN'
  cells: MarPdfCell[]; // one per day of the month
}

export interface MarPdfLogEntry {
  date: string;
  time: string;
  med: string;
  status: string;
  by: string;
  reason: string;
  initials: string;
}

export interface MarPDFProps {
  orgName: string;
  monthLabel: string;
  days: number;
  patient: {
    name: string;
    dob: string;
    sex: string;
    recordNumber: string;
    diagnosis: string;
    allergies: string;
    physician: string;
    diet: string;
  };
  rows: MarPdfRow[];
  legend: Array<{ initials: string; name: string }>;
  log: MarPdfLogEntry[];
  generatedAt: string;
  generatedBy: string;
}

const NAVY = '#1a3a5c';
const LIGHT = '#e8eef4';
const BORDER = '#9aa6b2';
const MED_W = 148;
const TIME_W = 32;

const s = StyleSheet.create({
  page: { padding: 22, fontFamily: 'Helvetica', fontSize: 8, color: '#1f2937' },
  headerBar: { borderBottomWidth: 2, borderBottomColor: NAVY, paddingBottom: 6, marginBottom: 8 },
  org: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: NAVY },
  docTitle: { fontSize: 10, marginTop: 2 },
  monthLine: { position: 'absolute', right: 0, top: 2, fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY },
  infoRow: { flexDirection: 'row', marginBottom: 2 },
  infoCell: { flexDirection: 'row', marginRight: 14 },
  infoLabel: { fontFamily: 'Helvetica-Bold', color: '#5c6b7a' },
  infoValue: { marginLeft: 3 },
  allergy: { color: '#b3261e', fontFamily: 'Helvetica-Bold' },
  grid: { marginTop: 6 },
  row: { flexDirection: 'row' },
  th: {
    backgroundColor: LIGHT,
    borderWidth: 0.5,
    borderColor: BORDER,
    paddingVertical: 3,
    paddingHorizontal: 2,
    fontFamily: 'Helvetica-Bold',
    fontSize: 6.5,
    textAlign: 'center',
    color: NAVY,
  },
  medCell: {
    width: MED_W,
    borderWidth: 0.5,
    borderColor: BORDER,
    paddingVertical: 2,
    paddingHorizontal: 3,
  },
  timeCell: {
    width: TIME_W,
    borderWidth: 0.5,
    borderColor: BORDER,
    paddingVertical: 2,
    paddingHorizontal: 1,
    fontSize: 6.5,
    textAlign: 'center',
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
  },
  dayCell: {
    borderWidth: 0.5,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    minHeight: 16,
  },
  dayText: { fontSize: 6 },
  medName: { fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
  medMeta: { fontSize: 6, color: '#5c6b7a', marginTop: 1 },
  // True circle for the usual 2-character initials: fixed equal width/height
  // with radius = half, so the shape can't stretch into an oval.
  circled: {
    width: 12,
    height: 12,
    borderWidth: 0.9,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Fallback pill for longer labels (e.g. joined initials "SJ/AB") that can't
  // fit a 12pt circle without spilling.
  circledWide: {
    borderWidth: 0.9,
    borderRadius: 5,
    height: 10,
    minWidth: 11,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendNote: { fontSize: 6.5, color: '#5c6b7a', marginTop: 5, lineHeight: 1.4 },
  sectionTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY, marginTop: 12, marginBottom: 4 },
  sigRow: { flexDirection: 'row', flexWrap: 'wrap' },
  sigEntry: {
    flexDirection: 'row',
    borderWidth: 0.5,
    borderColor: BORDER,
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginRight: 6,
    marginBottom: 4,
  },
  logTh: {
    backgroundColor: LIGHT,
    borderWidth: 0.5,
    borderColor: BORDER,
    padding: 3,
    fontFamily: 'Helvetica-Bold',
    fontSize: 6.5,
    color: NAVY,
  },
  logTd: { borderWidth: 0.5, borderColor: BORDER, padding: 3, fontSize: 7 },
  footer: {
    position: 'absolute',
    bottom: 12,
    left: 22,
    right: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 6.5,
    color: '#7f8c8d',
  },
});

const CELL_BG: Record<MarCellStatus, string> = {
  given: '#e8f4e8',
  held: '#fdf0dc',
  refused: '#fbe4e1',
  none: '#ffffff',
  inactive: '#eceff2',
};
const CELL_FG: Record<MarCellStatus, string> = {
  given: '#1e5c1e',
  held: '#8a5a0d',
  refused: '#b3261e',
  none: '#1f2937',
  inactive: '#9aa6b2',
};

// Log-table column widths (landscape usable width ≈ 748pt).
const LOG_W = [60, 36, 170, 46, 150, 206, 40];

export default function MarPDF({
  orgName,
  monthLabel,
  days,
  patient,
  rows,
  legend,
  log,
  generatedAt,
  generatedBy,
}: MarPDFProps) {
  const dayW = (748 - MED_W - TIME_W) / days;

  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={s.page}>
        {/* Header */}
        <View style={s.headerBar}>
          <Text style={s.org}>{orgName.toUpperCase()}</Text>
          <Text style={s.docTitle}>Medication Administration Record (MAR)</Text>
          <Text style={s.monthLine}>{monthLabel}</Text>
        </View>

        {/* Client snapshot */}
        <View style={s.infoRow}>
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>Client:</Text>
            <Text style={s.infoValue}>{patient.name || '-'}</Text>
          </View>
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>DOB:</Text>
            <Text style={s.infoValue}>{patient.dob || '-'}</Text>
          </View>
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>Sex:</Text>
            <Text style={s.infoValue}>{patient.sex || '-'}</Text>
          </View>
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>Record #:</Text>
            <Text style={s.infoValue}>{patient.recordNumber || '-'}</Text>
          </View>
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>Diagnosis:</Text>
            <Text style={s.infoValue}>{patient.diagnosis || '-'}</Text>
          </View>
        </View>
        <View style={s.infoRow}>
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>Allergies:</Text>
            <Text style={[s.infoValue, s.allergy]}>{patient.allergies || 'None listed'}</Text>
          </View>
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>Physician:</Text>
            <Text style={s.infoValue}>{patient.physician || '-'}</Text>
          </View>
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>Diet:</Text>
            <Text style={s.infoValue}>{patient.diet || '-'}</Text>
          </View>
        </View>

        {/* Grid */}
        <View style={s.grid}>
          <View style={s.row}>
            <Text style={[s.th, { width: MED_W, textAlign: 'left' }]}>Medication / dose / route / frequency</Text>
            <Text style={[s.th, { width: TIME_W }]}>Time</Text>
            {Array.from({ length: days }, (_, i) => (
              <Text key={i} style={[s.th, { width: dayW }]}>{i + 1}</Text>
            ))}
          </View>
          {rows.map((row, ri) => (
            <View key={ri} style={s.row} wrap={false}>
              <View style={s.medCell}>
                <Text style={s.medName}>{row.medLine1}</Text>
                <Text style={s.medMeta}>{row.medLine2}</Text>
              </View>
              <Text style={s.timeCell}>{row.slot}</Text>
              {row.cells.map((cell, ci) => (
                <View key={ci} style={[s.dayCell, { width: dayW, backgroundColor: CELL_BG[cell.status] }]}>
                  {cell.label ? (
                    cell.status === 'held' || cell.status === 'refused' ? (
                      // "Circle when not given" (paper-MAR convention). A true
                      // circle for standard 2-char initials; longer labels get
                      // the pill so they never spill past the border.
                      <View
                        style={[
                          (cell.label + (cell.star ? '*' : '')).length <= 2 ? s.circled : s.circledWide,
                          { borderColor: CELL_FG[cell.status] },
                        ]}
                      >
                        <Text style={[s.dayText, { color: CELL_FG[cell.status] }]}>
                          {cell.label}
                          {cell.star ? '*' : ''}
                        </Text>
                      </View>
                    ) : (
                      <Text style={[s.dayText, { color: CELL_FG[cell.status] }]}>
                        {cell.label}
                        {cell.star ? '*' : ''}
                      </Text>
                    )
                  ) : null}
                </View>
              ))}
            </View>
          ))}
        </View>

        <Text style={s.legendNote}>
          A. Initials in a box = medication given. B. Circled = held or refused; see the log below for the
          reason. C. * = administered by family / responsible party / caregiver (documented by the nurse; see
          log). D. Gray = order not active that day. PRN doses: reason and result are recorded in the log.
        </Text>

        {/* Initial / signature legend */}
        <Text style={s.sectionTitle}>Initial / Signature Legend</Text>
        <View style={s.sigRow}>
          {legend.length === 0 ? (
            <Text style={{ fontSize: 7, color: '#7f8c8d' }}>No administrations documented this month.</Text>
          ) : (
            legend.map((l, i) => (
              <View key={i} style={s.sigEntry} wrap={false}>
                <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7 }}>{l.initials}</Text>
                <Text style={{ fontSize: 7, marginLeft: 4 }}>· {l.name}</Text>
              </View>
            ))
          )}
        </View>

        {/* PRN & exception log */}
        <Text style={s.sectionTitle}>PRN, Refused &amp; Exception Log</Text>
        {log.length === 0 ? (
          <Text style={{ fontSize: 7, color: '#7f8c8d' }}>None this month.</Text>
        ) : (
          <View>
            <View style={s.row}>
              {['Date', 'Time', 'Medication', 'Status', 'Administered by', 'Reason / note', 'Initials'].map(
                (h, i) => (
                  <Text key={h} style={[s.logTh, { width: LOG_W[i] }]}>{h}</Text>
                ),
              )}
            </View>
            {log.map((e, i) => (
              <View key={i} style={s.row} wrap={false}>
                <Text style={[s.logTd, { width: LOG_W[0] }]}>{e.date}</Text>
                <Text style={[s.logTd, { width: LOG_W[1] }]}>{e.time}</Text>
                <Text style={[s.logTd, { width: LOG_W[2] }]}>{e.med}</Text>
                <Text style={[s.logTd, { width: LOG_W[3] }]}>{e.status}</Text>
                <Text style={[s.logTd, { width: LOG_W[4] }]}>{e.by}</Text>
                <Text style={[s.logTd, { width: LOG_W[5] }]}>{e.reason}</Text>
                <Text style={[s.logTd, { width: LOG_W[6] }]}>{e.initials}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.footer} fixed>
          <Text>
            Generated {generatedAt} by {generatedBy}; header reflects the client record at export time.
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
