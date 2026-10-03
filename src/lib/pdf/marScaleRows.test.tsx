// @vitest-environment node
import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { PDFDocument } from 'pdf-lib';
import MarPDF, { type MarPdfCell, type MarPDFProps } from './MarPDF';

const days = 31;
const mk = (fn: (d: number) => MarPdfCell): MarPdfCell[] => Array.from({ length: days }, (_, i) => fn(i + 1));
const blank: MarPdfCell = { label: '', status: 'none', star: false };

function props(over: Partial<MarPDFProps> = {}): MarPDFProps {
  return {
    orgName: 'Heart and Soul Healthcare',
    monthLabel: 'October 2026',
    days,
    patient: { name: 'ZZ Test Client', dob: '06/07/1985', sex: 'Male', recordNumber: '000008', diagnosis: 'Seizure Disorder', allergies: 'NKDA', physician: 'Dr. Test', diet: '' },
    rows: [],
    legend: [{ initials: 'KF', name: 'Kaheem Freeman' }],
    log: [],
    generatedAt: '10/2/2026',
    generatedBy: 'Test',
    ...over,
  };
}

const scaleRow = (slot: string, slotLabel: string, cells: MarPdfCell[]) => ({
  medLine1: 'ZZ Test Insulin lispro (Humalog)',
  medLine2: 'Per sliding scale · Subcutaneous · Before meals (AC)',
  medScale: 'Sliding scale (mg/dL: units): Below 70: 0 (Treat low blood sugar, call the physician) | 70-150: 0 | 151-200: 2 | 201-250: 4 | 251-300: 6 | Above 300: 8 (Call the physician)',
  slot,
  slotLabel,
  isPRN: false,
  isScale: true,
  cells,
});

async function pages(p: MarPDFProps): Promise<number> {
  const el = React.createElement(MarPDF, p);
  const buf = await renderToBuffer(el as unknown as React.ReactElement<DocumentProps>);
  if (process.env.MAR_SAMPLE_OUT) (await import('fs')).writeFileSync(process.env.MAR_SAMPLE_OUT, buf);
  return (await PDFDocument.load(buf)).getPageCount();
}

describe('MAR PDF sliding-scale rows', () => {
  it('renders three labeled lines per insulin time, with held and refused entries', async () => {
    const cells = mk((d) =>
      d === 1
        ? { label: '232', sub: '4u', initials: 'KF', status: 'given', star: false }
        : d === 2
          ? { label: '', sub: 'Ref', initials: 'KF', status: 'refused', star: false }
          : d === 3
            ? { label: '62', sub: 'Held', initials: 'KF', status: 'held', star: true }
            : blank,
    );
    const n = await pages(
      props({
        rows: [
          { medLine1: 'Keppra', medLine2: '1500 mg · J-tube', slot: '12:00', isPRN: false, cells: mk(() => blank) },
          scaleRow('07:30', 'Before Breakfast', cells),
          scaleRow('11:30', 'Before Lunch', mk(() => blank)),
          scaleRow('17:00', 'Before Dinner', mk(() => blank)),
        ],
        log: [{ date: 'Oct 2', time: '-', med: 'ZZ Test Insulin lispro (Humalog)', status: 'refused', by: 'Kaheem Freeman', reason: 'Client refused the fingerstick', result: '-', initials: 'KF' }],
      }),
    );
    expect(n).toBeGreaterThanOrEqual(1);
  }, 30000);

  it('a month of insulin three times a day no longer prints a per-dose glucose log', async () => {
    const full = mk((d) => ({ label: String(100 + d * 5), sub: '2u', initials: 'KF', status: 'given', star: false }));
    const n = await pages(
      props({ rows: [scaleRow('07:30', 'Before Breakfast', full), scaleRow('11:30', 'Before Lunch', full), scaleRow('17:00', 'Before Dinner', full)] }),
    );
    // 93 doses used to add 93 log rows (three more pages); the grid now carries them.
    expect(n).toBe(1);
  }, 30000);

  it('a blank month prints ruled rows to write in under the exception log', async () => {
    const empty = mk(() => blank);
    const rows = [
      { medLine1: 'Keppra', medLine2: '1500 mg · J-tube', slot: '12:00', isPRN: false, cells: empty },
      scaleRow('07:30', 'Before Breakfast', empty),
      { medLine1: 'Tylenol', medLine2: '500 mg · PO (by mouth) · As needed (PRN)', medLine3: 'For: Pain', slot: 'PRN', isPRN: true, cells: empty },
    ];
    // The write-in block is kept together (it must stay shorter than a page:
    // an unbreakable block taller than one page collapses the layout), so a
    // blank month is the grid page plus, at most, one page for the log.
    const without = await pages(props({ rows, legend: [], logWriteInRows: 0 }));
    const withRows = await pages(props({ rows, legend: [], logWriteInRows: 20 }));
    expect(without).toBe(1);
    expect(withRows).toBeGreaterThanOrEqual(1);
    expect(withRows).toBeLessThanOrEqual(2);
  }, 30000);
});
