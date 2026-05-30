import { describe, it, expect } from 'vitest';
import { computeAgeString, parseNoteDate } from './age';

describe('parseNoteDate', () => {
  it('parses YYYY-MM-DD', () => {
    expect(parseNoteDate('2022-02-18')?.getFullYear()).toBe(2022);
  });
  it('tolerates MM/DD/YYYY', () => {
    const d = parseNoteDate('02/18/2022');
    expect(d?.getFullYear()).toBe(2022);
    expect(d?.getMonth()).toBe(1); // February
    expect(d?.getDate()).toBe(18);
  });
  it('returns null for empty/garbage', () => {
    expect(parseNoteDate('')).toBeNull();
    expect(parseNoteDate('not-a-date')).toBeNull();
    expect(parseNoteDate(undefined)).toBeNull();
  });
});

describe('computeAgeString', () => {
  it('returns whole years for ages >= 1 (the Yanira case)', () => {
    expect(computeAgeString('2022-02-18', '2026-04-25')).toBe('4');
  });

  it('does NOT round up before the birthday has passed', () => {
    // Day before the 4th birthday → still 3
    expect(computeAgeString('2022-02-18', '2026-02-17')).toBe('3');
    // On the birthday → 4
    expect(computeAgeString('2022-02-18', '2026-02-18')).toBe('4');
  });

  it('returns months for under a year', () => {
    expect(computeAgeString('2026-01-01', '2026-06-15')).toBe('5 mo');
  });

  it('returns days for under a month, with correct pluralization', () => {
    expect(computeAgeString('2026-04-25', '2026-04-25')).toBe('0 days');
    expect(computeAgeString('2026-04-24', '2026-04-25')).toBe('1 day');
    expect(computeAgeString('2026-04-10', '2026-04-25')).toBe('15 days');
  });

  it('returns empty string when DOB is unparseable', () => {
    expect(computeAgeString('', '2026-04-25')).toBe('');
    expect(computeAgeString('garbage', '2026-04-25')).toBe('');
  });
});
