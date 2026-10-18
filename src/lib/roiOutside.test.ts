import { describe, expect, it } from 'vitest';
import { isOutsideRoi, roiExpiryFor, roiIntroParagraphs, twoYearsFrom, validateRoiInput } from './roiShared';

const base = { referralId: 'ref_1', referralDob: '2025-11-11', direction: 'to-us', facility: { name: 'Peachtree Pediatrics - Dr. Ann Eggert', address: '12 Eastbrook Bend, Peachtree City, GA 30269' } };

describe('releases signed elsewhere', () => {
  it('knows which forms are recorded rather than prepared', () => {
    expect(isOutsideRoi('ga-hipaa')).toBe(true);
    expect(isOutsideRoi('outside')).toBe(true);
    expect(isOutsideRoi('dbhdd')).toBe(false);
    expect(isOutsideRoi('choa')).toBe(false);
  });

  it('accepts a Georgia HIPAA release without the portal’s wording, and still needs the facility', () => {
    const ok = validateRoiInput({ ...base, formType: 'ga-hipaa' });
    expect(ok.errors).toEqual({});
    expect(ok.value).toMatchObject({ formType: 'ga-hipaa', duration: 'transactions', information: 'As listed on the signed authorization.' });
    expect(validateRoiInput({ ...base, formType: 'ga-hipaa', facility: { name: '' } }).errors.facilityName).toBeTruthy();
  });

  it('keeps an outside release’s own expiration date, and checks it', () => {
    expect(validateRoiInput({ ...base, formType: 'outside', outsideExpiresOn: '2027-06-30' }).value?.outsideExpiresOn).toBe('2027-06-30');
    expect(validateRoiInput({ ...base, formType: 'outside', outsideExpiresOn: '06/30/2027' }).errors.outsideExpiresOn).toBeTruthy();
    expect(validateRoiInput({ ...base, formType: 'carrier-pigeon' }).errors.formType).toBeTruthy();
  });

  it('runs a Georgia HIPAA release two years, an outside one to its own date, the others as before', () => {
    expect(twoYearsFrom('2026-10-18')).toBe('2028-10-18');
    expect(twoYearsFrom('2024-02-29')).toBe('2026-02-28');
    expect(roiExpiryFor({ formType: 'ga-hipaa', duration: 'transactions' }, '2026-10-18')).toBe('2028-10-18');
    expect(roiExpiryFor({ formType: 'outside', duration: 'transactions', outsideExpiresOn: '2027-06-30' }, '2026-10-18')).toBe('2027-06-30');
    expect(roiExpiryFor({ formType: 'outside', duration: 'transactions' }, '2026-10-18')).toBe('');
    expect(roiExpiryFor({ formType: 'dbhdd', duration: 'year' }, '2026-10-18')).toBe('2027-10-18');
  });

  it('names the Georgia HIPAA form in the fax introduction letter', () => {
    const paras = roiIntroParagraphs({ memberName: 'Bronx Spry', program: 'gapp', facilityName: 'Peachtree Pediatrics', direction: 'to-us', formType: 'ga-hipaa', isReferral: true });
    expect(paras[1]).toContain('Georgia HIPAA Compliant Authorization for the Release of Patient Information');
  });
});
