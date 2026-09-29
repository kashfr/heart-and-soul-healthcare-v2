import { describe, expect, it } from 'vitest';
import {
  defaultRoiFaxNote,
  defaultRoiPurpose,
  roiCopies,
  roiExpiresOn,
  roiIntroParagraphs,
  roiPhoneFaxLine,
  validateRoiInput,
} from './roiShared';

const good = {
  patientId: 'p1',
  direction: 'to-us',
  facility: { name: ' Magnolia Manor ', address: '2020 Example Rd', phone: '(404) 555-0101', fax: '1-404-555-0102' },
  information: 'Medical records',
  purpose: 'Coordination of care',
  duration: 'year',
};

describe('validateRoiInput', () => {
  it('accepts a complete request and tidies it', () => {
    const { errors, value } = validateRoiInput(good);
    expect(errors).toEqual({});
    expect(value?.facility).toEqual({ name: 'Magnolia Manor', address: '2020 Example Rd', phone: '4045550101', fax: '4045550102' });
  });
  it('lets phone, fax, and address be blank', () => {
    expect(validateRoiInput({ ...good, facility: { name: 'X' } }).value?.facility).toEqual({ name: 'X', address: '', phone: '', fax: '' });
  });
  it('names every missing or bad field', () => {
    const { errors, value } = validateRoiInput({ facility: { phone: '555', fax: 'abc' } });
    expect(value).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(['direction', 'duration', 'facilityFax', 'facilityName', 'facilityPhone', 'information', 'patientId', 'purpose']);
  });
  it('caps text so it fits on the form', () => {
    expect(validateRoiInput({ ...good, information: 'x'.repeat(361) }).errors.information).toMatch(/360/);
    expect(validateRoiInput({ ...good, purpose: 'x'.repeat(301) }).errors.purpose).toMatch(/300/);
  });
});

describe('roiCopies', () => {
  const f = { name: 'Magnolia Manor', address: '', phone: '', fax: '' };
  it('puts the facility in From when it shares with us', () => {
    const [c] = roiCopies('to-us', f, '4702351891');
    expect(c.from.name).toBe('Magnolia Manor');
    expect(c.to.name).toBe('Heart and Soul Healthcare');
    expect(c.to.fax).toBe('4702351891');
  });
  it('makes one copy each way for both', () => {
    const copies = roiCopies('both', f, '');
    expect(copies.map((c) => c.from.name)).toEqual(['Magnolia Manor', 'Heart and Soul Healthcare']);
  });
});

describe('roiPhoneFaxLine', () => {
  it('formats what is there', () => {
    expect(roiPhoneFaxLine({ phone: '6786440337', fax: '4702351891' })).toBe('(678) 644-0337 / Fax (470) 235-1891');
    expect(roiPhoneFaxLine({ phone: '', fax: '4702351891' })).toBe('Fax (470) 235-1891');
    expect(roiPhoneFaxLine({ phone: '', fax: '' })).toBe('');
  });
});

describe('roiExpiresOn', () => {
  it('is one year to the day, and blank until services end', () => {
    expect(roiExpiresOn('2026-09-25', 'year')).toBe('2027-09-25');
    expect(roiExpiresOn('2028-02-29', 'year')).toBe('2029-02-28');
    expect(roiExpiresOn('2026-09-25', 'transactions')).toBe('');
  });
});

describe('wording', () => {
  it('names the program when known', () => {
    expect(defaultRoiPurpose('now-comp')).toBe('Coordination of care and services under the NOW/COMP program.');
    expect(defaultRoiPurpose(undefined)).toBe('Coordination of care and services.');
  });
  it('introduces us as the skilled nursing provider and explains the direction, with no dashes', () => {
    const paras = roiIntroParagraphs({ memberName: 'Ann Torres', program: 'now-comp', facilityName: 'Magnolia Manor', direction: 'to-us' });
    const text = paras.join(' ');
    expect(text).toMatch(/skilled nursing services under the NOW\/COMP program/);
    expect(text).toMatch(/allows Magnolia Manor to share Ann Torres's health information with Heart and Soul Healthcare/);
    expect(text).not.toMatch(/[–—]/);
    expect(roiIntroParagraphs({ memberName: 'A', program: '', facilityName: 'F', direction: 'both' }).join(' ')).toMatch(/with each other/);
    expect(defaultRoiFaxNote({ memberName: 'Ann Torres', direction: 'to-us', information: 'Visit notes.' })).not.toMatch(/[–—]/);
  });
});

describe('defaultRoiFaxNote', () => {
  const base = { memberName: 'Ricky Yancey', information: 'Current medication list and orders; A1C and recent lab results.', returnFax: '4702351891' };

  it('asks the facility to fax the listed records back when they share with us', () => {
    const note = defaultRoiFaxNote({ ...base, direction: 'to-us' });
    expect(note).toContain('Please fax the following records to Heart and Soul Healthcare at (470) 235-1891: Current medication list and orders; A1C and recent lab results.');
    expect(note).not.toContain('keep them on file');
  });

  it('asks for records and to keep it on file when both ways', () => {
    const note = defaultRoiFaxNote({ ...base, direction: 'both' });
    expect(note).toContain('Please fax the following records');
    expect(note).toContain('keep them on file');
  });

  it('only asks to keep it on file when we are the ones sharing', () => {
    const note = defaultRoiFaxNote({ ...base, direction: 'from-us' });
    expect(note).not.toContain('Please fax');
    expect(note).toContain('keep them on file');
  });

  it('points at the release when the return fax is unknown (the browser placeholder)', () => {
    expect(defaultRoiFaxNote({ ...base, returnFax: undefined, direction: 'to-us' })).toContain('at the fax number on the release:');
  });
});
