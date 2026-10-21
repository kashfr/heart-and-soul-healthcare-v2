import React from 'react';
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
  /** Sliding-scale rows only. `label` is the blood glucose reading, `sub`
   *  the units given ("4u", or "Held" / "Ref"), `initials` the documenter's. */
  sub?: string;
  initials?: string;
  status: MarCellStatus;
  star: boolean; // administered by family/proxy; see log
}

export interface MarPdfRow {
  medLine1: string; // medication name
  medLine2: string; // dose/units · route · frequency (+ D/C)
  // Special instructions from the order ("take with meals") and, for PRN
  // rows, the standing purpose ("For: moderate pain"). DBHDD FY27 manual
  // D.6.a.ii.e (special instructions on the MAR) and D.6.b.ii.d (purpose
  // of periodic/PRN medications on the MAR). Kept to a bounded length by
  // the route: rows are wrap={false}, so an unbounded line would silently
  // clip on a survey document.
  medLine3?: string;
  /** The order's sliding scale in full (never truncated: it is the dose). */
  medScale?: string;
  slot: string; // 'HH:MM' or 'PRN'
  /** The meal the time is tied to ("Before Breakfast"), printed under it. */
  slotLabel?: string;
  /** Sliding-scale row: the boxes carry a blood glucose reading, the units
   *  given and the initials, each on its own labeled line. */
  isScale?: boolean;
  isPRN: boolean; // PRN rows render in their own labeled section (D.6.b)
  cells: MarPdfCell[]; // one per day of the month
}

export interface MarPdfLogEntry {
  date: string;
  time: string;
  med: string;
  status: string;
  by: string;
  reason: string;
  // PRN effectiveness follow-up: the recorded outcome, "Result pending" for a
  // given PRN dose not yet completed, or '-' where a result doesn't apply.
  result: string;
  initials: string;
  amendment?: string; // correction note (append-only audit trail), if this entry amends another
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
  /** Blank, ruled rows printed under the log for staff to write in by hand.
   *  The route asks for them when the month is not over yet (the current
   *  month or a future one), since that printout is used as a paper MAR.
   *  Keep it small enough that title + rows fit on one page: with no real
   *  entries the section is unbreakable, and an unbreakable block taller
   *  than a page collapses the whole layout. */
  logWriteInRows?: number;
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
  // flexShrink lets a cell give up width instead of overflowing the row: without
  // it, a long value (allergies, diet) renders as one unbroken line that runs
  // past its cell and paints over the neighbouring ones.
  infoCell: { flexDirection: 'row', marginRight: 14, flexShrink: 1 },
  infoLabel: { fontFamily: 'Helvetica-Bold', color: '#5c6b7a' },
  infoValue: { marginLeft: 3, flexShrink: 1 },
  // Applied to the free-text fields so they claim the remaining row width and
  // wrap onto as many lines as they need.
  infoCellGrow: { flex: 1, marginRight: 0 },
  infoValueGrow: { flex: 1 },
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
  },
  timeText: { fontSize: 6.5, textAlign: 'center', fontFamily: 'Helvetica-Bold', color: NAVY },
  // The meal a time is tied to ("Before Breakfast"), under the clock time.
  timeLabel: { fontSize: 5, textAlign: 'center', color: '#5c6b7a', marginTop: 1 },
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
  // Special instructions / PRN purpose (manual D.6.a.ii.e, D.6.b.ii.d).
  medInstructions: { fontSize: 6, color: '#2c3e50', marginTop: 1, fontFamily: 'Helvetica-Oblique' },
  // The sliding scale, in full. It is the dose on the row, so it is never cut.
  medScale: { fontSize: 6, color: NAVY, marginTop: 1 },
  // Units given, under the blood glucose reading in a sliding-scale cell.
  daySub: { fontSize: 5.5 },
  // Sliding-scale rows: three labeled lines (reading, units, initials). The
  // label column and every day column split into three equal-height cells,
  // so each label lines up with its values across the whole month.
  scaleLabelCell: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: BORDER,
    backgroundColor: LIGHT,
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 1,
    minHeight: 11,
  },
  scaleLabelText: { fontSize: 5.2, fontFamily: 'Helvetica-Bold', color: NAVY },
  scaleSubCell: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 11,
  },

  // Full-width section banner separating the routine portion of the grid
  // from the PRN / as-needed portion (manual D.6.a / D.6.b).
  sectionRow: {
    backgroundColor: LIGHT,
    borderBottomWidth: 0.5,
    borderBottomColor: '#b9c6d2',
    borderBottomStyle: 'solid',
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  sectionRowText: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: NAVY, letterSpacing: 0.4 },
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
  sigNote: { fontSize: 6.5, color: '#5c6b7a', marginBottom: 4 },
  // Two side-by-side columns of signature lines (each 370pt wide).
  sigGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  sigLine: { flexDirection: 'row', width: 370, marginBottom: 3 },
  sigCell: { borderBottomWidth: 0.6, borderBottomColor: BORDER, minHeight: 14, justifyContent: 'flex-end', paddingHorizontal: 3, marginRight: 4 },
  sigCellText: { fontSize: 7 },
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
  logBlankTd: { borderWidth: 0.5, borderColor: BORDER, height: 20 },
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

// Signature line widths: initials, printed name, credential / role, signature
// (sums to 370 with the 4pt gaps).
const SIG_W = [34, 120, 76, 124];
// Header labels for the signature lines, printed as the first row.
const SIG_LABELS = { initials: 'Initials', name: 'Printed name', credential: 'Credential / role' };
/** Minimum signature lines on a printed MAR, so a blank month still has room for every nurse and proxy caregiver. */
const MIN_SIG_LINES = 10;

/**
 * The legend's documented entries first (initials and name filled in, credential
 * blank for the signer to complete), then blank lines up to the minimum, always
 * an even count so the two columns balance.
 */
export function signatureRows(legend: Array<{ initials: string; name: string }>): Array<{ initials: string; name: string; credential: string }> {
  const rows = [
    { ...SIG_LABELS },
    ...legend.map((l) => ({ initials: l.initials, name: l.name, credential: '' })),
  ];
  while (rows.length < MIN_SIG_LINES + 1 || rows.length % 2 === 1) rows.push({ initials: '', name: '', credential: '' });
  return rows;
}

// Sliding-scale rows: the label column is carved out of the medication
// column, so the Time and day columns stay aligned with every other row.
const SCALE_LABEL_W = 44;
const SCALE_LINE_LABELS = ['Blood glucose (mg/dL)', 'Units given', 'Initials'];
// Log-table column widths (landscape usable width ≈ 748pt).
const LOG_W = [56, 34, 140, 44, 116, 150, 128, 36];

export default function MarPDF({
  orgName,
  monthLabel,
  days,
  patient,
  rows,
  legend,
  log,
  logWriteInRows = 0,
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
        {/* Allergies get their own full-width row: it's the safety-critical
            field and the longest, so it must never be truncated or overlapped. */}
        <View style={s.infoRow}>
          <View style={[s.infoCell, s.infoCellGrow]}>
            <Text style={s.infoLabel}>Allergies:</Text>
            <Text style={[s.infoValue, s.allergy, s.infoValueGrow]}>{patient.allergies || 'None listed'}</Text>
          </View>
        </View>
        <View style={s.infoRow}>
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>Physician:</Text>
            <Text style={s.infoValue}>{patient.physician || '-'}</Text>
          </View>
          <View style={[s.infoCell, s.infoCellGrow]}>
            <Text style={s.infoLabel}>Diet:</Text>
            <Text style={[s.infoValue, s.infoValueGrow]}>{patient.diet || '-'}</Text>
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
            <React.Fragment key={ri}>
              {/* Section breaks: routine meds are one discrete portion of the
                  MAR; PRN / as-needed meds follow in their own labeled
                  portion (DBHDD FY27 manual D.6.a / D.6.b). */}
              {ri === 0 && !row.isPRN && (
                <View style={s.sectionRow} wrap={false} minPresenceAhead={24}>
                  <Text style={s.sectionRowText}>SCHEDULED (ROUTINE) MEDICATIONS</Text>
                </View>
              )}
              {row.isPRN && (ri === 0 || !rows[ri - 1].isPRN) && (
                <View style={s.sectionRow} wrap={false} minPresenceAhead={24}>
                  <Text style={s.sectionRowText}>
                    PRN / AS-NEEDED MEDICATIONS: each use is documented in the log below with reason and result
                  </Text>
                </View>
              )}
              {row.isScale ? (
              <View style={s.row} wrap={false}>
                <View style={[s.medCell, { width: MED_W - SCALE_LABEL_W }]}>
                  <Text style={s.medName}>{row.medLine1}</Text>
                  <Text style={s.medMeta}>{row.medLine2}</Text>
                  {row.medScale ? <Text style={s.medScale}>{row.medScale}</Text> : null}
                  {row.medLine3 ? <Text style={s.medInstructions}>{row.medLine3}</Text> : null}
                </View>
                <View style={{ width: SCALE_LABEL_W }}>
                  {SCALE_LINE_LABELS.map((label) => (
                    <View key={label} style={s.scaleLabelCell}>
                      <Text style={s.scaleLabelText}>{label}</Text>
                    </View>
                  ))}
                </View>
                <View style={s.timeCell}>
                  <Text style={s.timeText}>{row.slot}</Text>
                  {row.slotLabel ? <Text style={s.timeLabel}>{row.slotLabel}</Text> : null}
                </View>
                {row.cells.map((cell, ci) => {
                  const bg = CELL_BG[cell.status];
                  const fg = CELL_FG[cell.status];
                  const lines = [cell.label, cell.sub || '', `${cell.initials || ''}${cell.initials && cell.star ? '*' : ''}`];
                  return (
                    <View key={ci} style={{ width: dayW }}>
                      {lines.map((text, li) => (
                        <View key={li} style={[s.scaleSubCell, { backgroundColor: bg }]}>
                          {text ? <Text style={[li === 0 ? s.dayText : s.daySub, { color: fg }]}>{text}</Text> : null}
                        </View>
                      ))}
                    </View>
                  );
                })}
              </View>
              ) : (
              <View style={s.row} wrap={false}>
              <View style={s.medCell}>
                <Text style={s.medName}>{row.medLine1}</Text>
                <Text style={s.medMeta}>{row.medLine2}</Text>
                {row.medScale ? <Text style={s.medScale}>{row.medScale}</Text> : null}
                {row.medLine3 ? <Text style={s.medInstructions}>{row.medLine3}</Text> : null}
              </View>
              <View style={s.timeCell}>
                <Text style={s.timeText}>{row.slot}</Text>
                {row.slotLabel ? <Text style={s.timeLabel}>{row.slotLabel}</Text> : null}
              </View>
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
              )}
            </React.Fragment>
          ))}
        </View>

        <Text style={s.legendNote}>
          A. Initials in a box = medication given. B. Circled = held or refused; see the log below for the
          reason. C. * = administered by family / responsible party / proxy (documented by the nurse; see
          log). D. Gray = order not active that day (before the order start, or after its end/discontinuation).
          E. Reasons a dose is held, refused, or otherwise not received are documented per dose in the log
          below (examples: refused, hospital, NPO (nothing by mouth), home visit, day service). PRN doses:
          reason and result are recorded in the log.
          {rows.some((r) => r.isScale)
            ? ' F. Sliding scale insulin: each time has three lines, the blood glucose reading (mg/dL), the units given (u), and the initials. A dose that was held, refused, or differs from the scale is explained in the log below.'
            : ''}
        </Text>

        {/* Initial / signature legend. Everyone who charts on this record
            signs here once: the documented entries are pre-filled with their
            initials and name, and blank rows follow so a printed copy (a
            future month taken to a day program, for example) gives each
            nurse and each proxy-trained caregiver a line to print, initial,
            and sign. Two-column layout so the block stays compact. */}
        <Text style={s.sectionTitle}>Initial / Signature Legend</Text>
        <Text style={s.sigNote}>
          Each person who documents on this MAR prints their name, credential or role (RN, LPN, proxy caregiver), initials, and signature below.
        </Text>
        <View style={s.sigGrid}>
          {signatureRows(legend).map((r, i) => (
            <View key={i} style={s.sigLine} wrap={false}>
              <View style={[s.sigCell, { width: SIG_W[0] }]}><Text style={s.sigCellText}>{r.initials}</Text></View>
              <View style={[s.sigCell, { width: SIG_W[1] }]}><Text style={s.sigCellText}>{r.name}</Text></View>
              <View style={[s.sigCell, { width: SIG_W[2] }]}><Text style={s.sigCellText}>{r.credential}</Text></View>
              <View style={[s.sigCell, { width: SIG_W[3] }]}><Text style={s.sigCellText}> </Text></View>
            </View>
          ))}
        </View>

        {/* PRN & exception log. On a blank printout (no entries, only rows to
            write in) the whole section stays together, so the column headers
            never end up on a different page from the rows under them. */}
        <View wrap={log.length > 0}>
        <Text style={s.sectionTitle}>PRN, Refused &amp; Exception Log</Text>
        {logWriteInRows > 0 ? (
          <Text style={{ fontSize: 7, color: '#5c6b7a', marginBottom: 4 }}>
            Write in every PRN dose (with the reason and the result) and every dose that was held, refused, or
            not given (with the reason).
          </Text>
        ) : null}
        {log.length === 0 && logWriteInRows === 0 ? (
          <Text style={{ fontSize: 7, color: '#7f8c8d' }}>None this month.</Text>
        ) : (
          <View>
            <View style={s.row}>
              {['Date', 'Time', 'Medication', 'Status', 'Administered by', 'Reason / note', 'Result', 'Initials'].map(
                (h, i) => (
                  <Text key={h} style={[s.logTh, { width: LOG_W[i] }]}>{h}</Text>
                ),
              )}
            </View>
            {log.map((e, i) => (
              <View key={i} wrap={false}>
                <View style={s.row}>
                  <Text style={[s.logTd, { width: LOG_W[0] }]}>{e.date}</Text>
                  <Text style={[s.logTd, { width: LOG_W[1] }]}>{e.time}</Text>
                  <Text style={[s.logTd, { width: LOG_W[2] }]}>{e.med}</Text>
                  <Text style={[s.logTd, { width: LOG_W[3] }]}>{e.status}</Text>
                  <Text style={[s.logTd, { width: LOG_W[4] }]}>{e.by}</Text>
                  <Text style={[s.logTd, { width: LOG_W[5] }]}>{e.reason}</Text>
                  <Text style={[s.logTd, { width: LOG_W[6] }]}>{e.result}</Text>
                  <Text style={[s.logTd, { width: LOG_W[7] }]}>{e.initials}</Text>
                </View>
                {e.amendment ? (
                  <Text style={{ fontSize: 6.5, color: '#6b21a8', paddingLeft: 4, paddingBottom: 2 }}>
                    {'↳'} {e.amendment}
                  </Text>
                ) : null}
              </View>
            ))}
            {/* Ruled blank rows, tall enough to write in by hand. */}
            {Array.from({ length: logWriteInRows }, (_, i) => (
              <View key={`blank-${i}`} style={s.row} wrap={false}>
                {LOG_W.map((w, ci) => (
                  <View key={ci} style={[s.logBlankTd, { width: w }]} />
                ))}
              </View>
            ))}
          </View>
        )}
        </View>

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
