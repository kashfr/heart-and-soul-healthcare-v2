import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

/**
 * Printable monthly Treatment Administration Record: the treatment twin of
 * MarPDF. Same landscape month grid, but rows are ordered treatments from the
 * client's care plan rather than medications, and a cell records who carried
 * the treatment out rather than a dose given.
 *
 * Purely presentational — /api/tar/pdf assembles the data. Deliberately mirrors
 * MarPDF's layout so a surveyor reading both documents reads one format twice,
 * including the full-width allergies row (a long allergy list must never be the
 * thing that gets squeezed; see the header overlap fix in #118).
 */

export type TarCellStatus = 'none' | 'done' | 'not-done' | 'na' | 'inactive';

export interface TarPdfCell {
  label: string;
  status: TarCellStatus;
  /** Carried out by family / DSP / proxy rather than agency staff; see log. */
  star: boolean;
}

export interface TarPdfRow {
  treatmentLine1: string; // treatment name
  treatmentLine2: string; // category · frequency (+ D/C)
  treatmentLine3?: string; // instructions, capped by the route
  /** Box number within the day, shown only when a task has more than one. */
  slot: string;
  cells: TarPdfCell[];
}

export interface TarPdfLogEntry {
  date: string;
  time: string;
  treatment: string;
  status: string;
  by: string;
  reason: string;
  note: string;
  initials: string;
  amendment?: string;
}

export interface TarPDFProps {
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
  rows: TarPdfRow[];
  legend: Array<{ initials: string; name: string }>;
  log: TarPdfLogEntry[];
  generatedAt: string;
  generatedBy: string;
}

const NAVY = '#1a3a5c';
const LIGHT = '#e8eef4';
const BORDER = '#9aa6b2';
const TASK_W = 168;
const SLOT_W = 26;

const CELL_BG: Record<TarCellStatus, string> = {
  none: 'white',
  done: 'white',
  'not-done': '#fdecea',
  na: '#f4f7fa',
  inactive: '#eceff2',
};
const CELL_FG: Record<TarCellStatus, string> = {
  none: '#1f2937',
  done: '#14532d',
  'not-done': '#a3261c',
  na: '#6b7280',
  inactive: '#9aa6b2',
};

const s = StyleSheet.create({
  page: { padding: 22, fontFamily: 'Helvetica', fontSize: 8, color: '#1f2937' },
  headerBar: { borderBottomWidth: 2, borderBottomColor: NAVY, paddingBottom: 6, marginBottom: 8 },
  org: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: NAVY },
  docTitle: { fontSize: 10, marginTop: 2 },
  monthLine: { position: 'absolute', right: 0, top: 2, fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY },
  infoRow: { flexDirection: 'row', marginBottom: 2 },
  // flexShrink so a long value yields width instead of overflowing its cell and
  // painting over the neighbouring one (the MAR header bug fixed in #118).
  infoCell: { flexDirection: 'row', marginRight: 14, flexShrink: 1 },
  infoLabel: { fontFamily: 'Helvetica-Bold', color: '#5c6b7a' },
  infoValue: { marginLeft: 3, flexShrink: 1 },
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
    color: NAVY,
    textAlign: 'center',
  },
  taskCell: {
    width: TASK_W,
    borderWidth: 0.5,
    borderColor: BORDER,
    paddingVertical: 3,
    paddingHorizontal: 3,
    backgroundColor: '#fbfcfd',
  },
  taskName: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: NAVY },
  taskMeta: { fontSize: 6, color: '#5c6b7a', marginTop: 1 },
  taskInstructions: { fontSize: 5.8, color: '#2c3e50', marginTop: 1, fontStyle: 'italic' },
  slotCell: {
    width: SLOT_W,
    borderWidth: 0.5,
    borderColor: BORDER,
    paddingVertical: 3,
    textAlign: 'center',
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    backgroundColor: '#fbfcfd',
  },
  dayCell: {
    borderWidth: 0.5,
    borderColor: BORDER,
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 16,
  },
  dayText: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  circled: {
    borderWidth: 0.7,
    borderRadius: 8,
    width: 15,
    height: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circledWide: {
    borderWidth: 0.7,
    borderRadius: 6,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionRow: { backgroundColor: LIGHT, borderWidth: 0.5, borderColor: BORDER, paddingVertical: 2, paddingHorizontal: 4 },
  sectionRowText: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: NAVY },
  legendNote: { fontSize: 6, color: '#5c6b7a', marginTop: 6, lineHeight: 1.4 },
  sectionTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY, marginTop: 10, marginBottom: 4 },
  sigRow: { flexDirection: 'row', flexWrap: 'wrap' },
  sigEntry: { flexDirection: 'row', width: '25%', paddingVertical: 1, paddingRight: 6 },
  logHead: { flexDirection: 'row', backgroundColor: LIGHT },
  logRow: { flexDirection: 'row' },
  logTh: { borderWidth: 0.5, borderColor: BORDER, padding: 3, fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: NAVY },
  logTd: { borderWidth: 0.5, borderColor: BORDER, padding: 3, fontSize: 6.5 },
  footer: { position: 'absolute', bottom: 12, left: 22, right: 22, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 6, color: '#9aa6b2' },
});

const LOG_W = [46, 30, 150, 52, 78, 110, 110, 34];

export default function TarPDF({
  orgName,
  monthLabel,
  days,
  patient,
  rows,
  legend,
  log,
  generatedAt,
  generatedBy,
}: TarPDFProps) {
  const dayW = (748 - TASK_W - SLOT_W) / days;

  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={s.page}>
        <View style={s.headerBar}>
          <Text style={s.org}>{orgName.toUpperCase()}</Text>
          <Text style={s.docTitle}>Treatment Administration Record (TAR)</Text>
          <Text style={s.monthLine}>{monthLabel}</Text>
        </View>

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
        {/* Allergies get their own full-width row: safety-critical and the
            longest field, so it must never be truncated or overlapped. */}
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

        <View style={s.grid}>
          <View style={s.row}>
            <Text style={[s.th, { width: TASK_W, textAlign: 'left' }]}>Treatment / category / frequency</Text>
            <Text style={[s.th, { width: SLOT_W }]}>Box</Text>
            {Array.from({ length: days }, (_, i) => (
              <Text key={i} style={[s.th, { width: dayW }]}>{i + 1}</Text>
            ))}
          </View>
          {rows.length === 0 ? (
            <View style={s.sectionRow}>
              <Text style={s.sectionRowText}>No active treatments on the care plan this month.</Text>
            </View>
          ) : (
            rows.map((row, ri) => (
              <React.Fragment key={ri}>
                {ri === 0 && (
                  <View style={s.sectionRow} wrap={false} minPresenceAhead={24}>
                    <Text style={s.sectionRowText}>ORDERED TREATMENTS</Text>
                  </View>
                )}
                <View style={s.row} wrap={false}>
                  <View style={s.taskCell}>
                    <Text style={s.taskName}>{row.treatmentLine1}</Text>
                    <Text style={s.taskMeta}>{row.treatmentLine2}</Text>
                    {row.treatmentLine3 ? <Text style={s.taskInstructions}>{row.treatmentLine3}</Text> : null}
                  </View>
                  <Text style={s.slotCell}>{row.slot}</Text>
                  {row.cells.map((cell, ci) => (
                    <View key={ci} style={[s.dayCell, { width: dayW, backgroundColor: CELL_BG[cell.status] }]}>
                      {cell.label ? (
                        cell.status === 'not-done' ? (
                          // Circle when not carried out — the same paper-record
                          // convention the MAR uses for a held or refused dose.
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
              </React.Fragment>
            ))
          )}
        </View>

        <Text style={s.legendNote}>
          A. Initials in a box = treatment carried out. B. Circled = not carried out; see the log below for
          the reason. C. * = carried out by a parent, guardian, DSP or other non-agency caregiver, documented
          by the nurse (see log). D. N/A = not applicable that day. E. Gray = treatment not on the care plan
          that day (before it was added, or after it was discontinued). F. Entries are append-only: a
          correction appears in the log as an amendment rather than replacing the original.
        </Text>

        <Text style={s.sectionTitle}>Initial / Signature Legend</Text>
        <View style={s.sigRow}>
          {legend.length === 0 ? (
            <Text style={{ fontSize: 7, color: '#7f8c8d' }}>No treatments documented this month.</Text>
          ) : (
            legend.map((l, i) => (
              <View key={i} style={s.sigEntry} wrap={false}>
                <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7 }}>{l.initials}</Text>
                <Text style={{ fontSize: 7, marginLeft: 4 }}>· {l.name}</Text>
              </View>
            ))
          )}
        </View>

        <Text style={s.sectionTitle}>Exception &amp; Non-Agency Caregiver Log</Text>
        {log.length === 0 ? (
          <Text style={{ fontSize: 7, color: '#7f8c8d' }}>None this month.</Text>
        ) : (
          <View>
            <View style={s.logHead} wrap={false}>
              {['Date', 'Time', 'Treatment', 'Outcome', 'Performed by', 'Reason', 'Notes', 'Init.'].map((h, i) => (
                <Text key={h} style={[s.logTh, { width: LOG_W[i] }]}>{h}</Text>
              ))}
            </View>
            {log.map((e, i) => (
              <View key={i} style={s.logRow} wrap={false}>
                <Text style={[s.logTd, { width: LOG_W[0] }]}>{e.date}</Text>
                <Text style={[s.logTd, { width: LOG_W[1] }]}>{e.time}</Text>
                <Text style={[s.logTd, { width: LOG_W[2] }]}>{e.treatment}</Text>
                <Text style={[s.logTd, { width: LOG_W[3] }]}>{e.status}</Text>
                <Text style={[s.logTd, { width: LOG_W[4] }]}>{e.by}</Text>
                <Text style={[s.logTd, { width: LOG_W[5] }]}>
                  {e.reason}
                  {e.amendment ? ` ${e.amendment}` : ''}
                </Text>
                <Text style={[s.logTd, { width: LOG_W[6] }]}>{e.note}</Text>
                <Text style={[s.logTd, { width: LOG_W[7] }]}>{e.initials}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            Generated {generatedAt} by {generatedBy}; header reflects the client record at export time.
          </Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
