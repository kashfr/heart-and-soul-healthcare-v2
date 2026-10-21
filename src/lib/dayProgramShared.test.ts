import { describe, expect, it } from 'vitest';
import { normalizeDayProgram, validateDayProgram } from './dayProgramShared';

const full = {
  attends: 'yes' as const,
  programName: "Treasure's Box",
  address: '3893 Covington Hwy, Decatur, GA 30032',
  contactName: 'Chequita Brown',
  email: 'chequitabrown@seabreezeretreat.com',
};

describe('validateDayProgram', () => {
  it('requires an attends answer first', () => {
    expect(Object.keys(validateDayProgram({}))).toEqual(['attends']);
  });

  it('needs nothing else when the client does not attend', () => {
    expect(validateDayProgram({ attends: 'no' })).toEqual({});
  });

  it('accepts a complete record', () => {
    expect(validateDayProgram(full)).toEqual({});
  });

  it('requires name, site address, contact, and a way to reach them', () => {
    const e = validateDayProgram({ attends: 'yes' });
    expect(Object.keys(e).sort()).toEqual(['address', 'contact', 'contactName', 'programName']);
  });

  it('accepts a phone alone as the way to reach the contact', () => {
    expect(validateDayProgram({ ...full, email: '', phone: '404-296-0238' })).toEqual({});
  });

  it('flags a malformed email or date', () => {
    const e = validateDayProgram({ ...full, email: 'not-an-email', startedOn: '02/16/2026' });
    expect(e.email).toBeTruthy();
    expect(e.startedOn).toBeTruthy();
  });
});

describe('normalizeDayProgram', () => {
  it('trims values', () => {
    expect(normalizeDayProgram({ ...full, programName: "  Treasure's Box " }).programName).toBe("Treasure's Box");
  });

  it('clears program details when the client does not attend', () => {
    const out = normalizeDayProgram({ ...full, attends: 'no' });
    expect(out.attends).toBe('no');
    expect(out.programName).toBe('');
    expect(out.email).toBe('');
  });
});
