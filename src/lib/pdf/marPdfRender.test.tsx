// @vitest-environment node
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { PDFDocument } from 'pdf-lib';
import MarPDF, { signatureRows, type MarPdfRow } from './MarPDF';

const days = 31;
const row = (name: string): MarPdfRow => ({
  medLine1: name,
  medLine2: '10 units · SubQ · Daily',
  timeLabel: '08:00',
  cells: Array.from({ length: days }, () => ({ label: '', status: 'none' as const, star: false })),
});

const base = {
  orgName: 'Heart and Soul Healthcare',
  monthLabel: 'October 2026',
  days,
  patient: { name: 'ZZ Test Client', dob: '01/01/1970', sex: 'M', recordNumber: '000001', diagnosis: 'T1DM', allergies: 'None listed', physician: 'Dr. Test', diet: 'Diabetic' },
  rows: [row('LANTUS'), row('NOVOLOG')],
  log: [],
  generatedAt: '10/01/2026, 8:00 AM',
  generatedBy: 'Test',
};

describe('signatureRows', () => {
  it('pads a blank month to the minimum lines, header first, even count', () => {
    const rows = signatureRows([]);
    expect(rows[0]).toEqual({ initials: 'Initials', name: 'Printed name', credential: 'Credential / role' });
    expect(rows.length).toBeGreaterThanOrEqual(11);
    expect(rows.length % 2).toBe(0);
    expect(rows.slice(1).every((r) => r.initials === '' && r.name === '')).toBe(true);
  });

  it('pre-fills documented signers and still leaves blank lines', () => {
    const rows = signatureRows([{ initials: 'SP', name: 'Souz Payne' }]);
    expect(rows[1]).toEqual({ initials: 'SP', name: 'Souz Payne', credential: '' });
    expect(rows.filter((r) => r.name === '').length).toBeGreaterThanOrEqual(9);
  });
});

describe('MarPDF', () => {
  it('renders a blank future month with signature lines', async () => {
    const buf = await renderToBuffer(React.createElement(MarPDF, { ...base, legend: [] }) as never);
    const pdf = await PDFDocument.load(buf);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(buf.length).toBeGreaterThan(2000);
  });
});
