import { describe, expect, it } from 'vitest';
import { convertBlocker, parseDobToIso, planFromReferral, programIdFromLabel, splitAddress } from './referralConvertShared';

describe('parseDobToIso', () => {
  it('reads the printed and ISO forms', () => {
    expect(parseDobToIso('08/03/1980')).toBe('1980-08-03');
    expect(parseDobToIso('8/3/1980')).toBe('1980-08-03');
    expect(parseDobToIso('1980-08-03')).toBe('1980-08-03');
  });
  it('refuses nonsense', () => {
    expect(parseDobToIso('13/40/1980')).toBe('');
    expect(parseDobToIso('soon')).toBe('');
    expect(parseDobToIso('')).toBe('');
  });
});

describe('splitAddress', () => {
  it('splits our form (street, city, state, zip)', () => {
    expect(splitAddress('125 Ted Turner Dr SW, Atlanta, GA, 30303')).toEqual({ street: '125 Ted Turner Dr SW', city: 'Atlanta', state: 'GA', zip: '30303' });
  });
  it('splits the GAPP intake (street, city, GA zip)', () => {
    expect(splitAddress('12 Oak St, Decatur, GA 30033')).toEqual({ street: '12 Oak St', city: 'Decatur', state: 'GA', zip: '30033' });
  });
  it('keeps an apartment comma with the street', () => {
    expect(splitAddress('12 Oak St, Apt 4, Decatur, GA 30033').street).toBe('12 Oak St, Apt 4');
  });
  it('keeps an odd shape whole rather than guessing', () => {
    expect(splitAddress('somewhere in Fulton County')).toEqual({ street: 'somewhere in Fulton County', city: '', state: '', zip: '' });
    expect(splitAddress('')).toEqual({ street: '', city: '', state: '', zip: '' });
  });
});

describe('programIdFromLabel', () => {
  it('maps the labels the forms use', () => {
    expect(programIdFromLabel('GAPP')).toBe('gapp');
    expect(programIdFromLabel('Georgia Pediatric Program (GAPP)')).toBe('gapp');
    expect(programIdFromLabel('NOW/COMP')).toBe('now-comp');
    expect(programIdFromLabel('now-comp')).toBe('now-comp');
    expect(programIdFromLabel('Elderly and Disabled Waiver')).toBe('edwp');
    expect(programIdFromLabel('Private pay')).toBe('');
  });
});

describe('planFromReferral', () => {
  const details = [
    { label: 'Date of birth', value: '03/14/2019' },
    { label: 'Address', value: '12 Oak St, Decatur, GA 30033' },
    { label: 'Medicaid #', value: '1234 5678 9012' },
    { label: "Child's physician", value: 'Dr. Anita Patel' },
    { label: 'Physician phone', value: '(404) 555-0101' },
    { label: 'Physician fax', value: '404-555-0102' },
    { label: 'Diagnosis', value: 'Cerebral palsy; seizure disorder' },
  ];
  it('fills the client and clinical fields from the intake', () => {
    const p = planFromReferral({ clientName: ' Seven Houston ', program: 'GAPP', details });
    expect(p.name).toBe('Seven Houston');
    expect(p.dob).toBe('2019-03-14');
    expect(p.city).toBe('Decatur');
    expect(p.program).toBe('gapp');
    expect(p.clinical).toEqual({ physicianName: 'Dr. Anita Patel', physicianPhone: '4045550101', physicianFax: '4045550102', medicaidId: '123456789012' });
    expect(p.missing).toEqual([]);
  });
  it('names what the intake left out', () => {
    const p = planFromReferral({ clientName: 'Jazz King', program: '', details: [] });
    expect(p.dob).toBe('');
    expect(p.missing).toEqual(['date of birth', 'address', 'diagnosis', 'program', 'physician', 'Medicaid ID']);
  });
});

describe('convertBlocker', () => {
  it('allows an open referral once', () => {
    expect(convertBlocker({ clientName: 'A', stage: 'assessment' })).toBeNull();
    expect(convertBlocker({ clientName: 'A', stage: 'assessment', patientId: 'p1' })).toMatch(/already/);
    expect(convertBlocker({ clientName: 'A', stage: 'closed' })).toMatch(/closed/);
    expect(convertBlocker({ clientName: '', stage: 'new' })).toMatch(/name/);
  });
});
