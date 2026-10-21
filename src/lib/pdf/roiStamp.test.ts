// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { fillRoiForm, wrapToLines } from './roiStamp';
import { DEFAULT_ROI_INFORMATION, defaultRoiPurpose, roiCopies } from '../roiShared';

const blank = readFileSync(path.join(process.cwd(), 'public', 'forms', 'dbhdd-roi-attachment-a.pdf'));
const facility = { name: 'Magnolia Manor Health and Rehabilitation', address: '2020 Example Rd, Decatur, GA 30033', phone: '4045550101', fax: '4045550102' };

describe('fillRoiForm', () => {
  it('fills one three-page copy for a one-way release', async () => {
    const out = await fillRoiForm(blank, {
      memberName: 'Ann Torres',
      dob: '03/14/1978',
      copies: roiCopies('to-us', facility, '4702351891'),
      information: DEFAULT_ROI_INFORMATION,
      purpose: defaultRoiPurpose('now-comp'),
      duration: 'year',
    });
    expect((await PDFDocument.load(out)).getPageCount()).toBe(3);
  });
  it('makes two copies for both ways, and copes with very long text', async () => {
    const out = await fillRoiForm(blank, {
      memberName: 'Maria Guadalupe Fernandez Rodriguez de la Cruz Montgomery',
      dob: '',
      copies: roiCopies('both', { ...facility, name: 'A'.repeat(90), address: 'B '.repeat(60) }, ''),
      information: 'word '.repeat(72),
      purpose: 'reason '.repeat(42),
      duration: 'transactions',
    });
    expect((await PDFDocument.load(out)).getPageCount()).toBe(6);
  });
});

describe('wrapToLines', () => {
  const measure = (s: string) => s.length;
  it('fills each line in turn', () => {
    expect(wrapToLines(['aa', 'bb', 'cc', 'dd'], [5, 5, 5], measure)).toEqual(['aa bb', 'cc dd']);
  });
  it('returns null when the words do not fit', () => {
    expect(wrapToLines(['aaaa', 'bbbb', 'cccc'], [4, 4], measure)).toBeNull();
  });
});
