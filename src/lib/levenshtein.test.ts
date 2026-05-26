import { describe, it, expect } from 'vitest';
import {
  levenshtein,
  dayDiff,
  normalizeName,
  findPatientCandidates,
  findExactPatientId,
  type RosterPatientLite,
} from './levenshtein';

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('Yanira', 'Yanira')).toBe(0);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(levenshtein('  Yanira ', 'YANIRA')).toBe(0);
  });

  it('counts single-character substitutions', () => {
    expect(levenshtein('Yanira', 'Yanara')).toBe(1);
  });

  it('handles empty strings', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('catches a truncated last name with many ops', () => {
    // "Yanira Fernando b" → "Yanira Fernando-Bautista":
    // replace " " with "-" (1) + replace "b" with "B" (case-insensitive: 0)
    // + insert "autista" (7) = 8 ops in the lowercased forms.
    expect(levenshtein('Yanira Fernando b', 'Yanira Fernando-Bautista')).toBe(8);
  });
});

describe('dayDiff', () => {
  it('returns 0 for the same date', () => {
    expect(dayDiff('2022-02-18', '2022-02-18')).toBe(0);
  });

  it('returns the absolute day delta', () => {
    expect(dayDiff('2022-02-18', '2022-02-12')).toBe(6);
    expect(dayDiff('2022-02-12', '2022-02-18')).toBe(6);
  });

  it('returns Infinity for unparseable input', () => {
    expect(dayDiff('not-a-date', '2022-02-18')).toBe(Infinity);
    expect(dayDiff('', '2022-02-18')).toBe(Infinity);
  });
});

describe('normalizeName', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeName('Yanira Fernando-Bautista')).toBe('yanira fernando bautista');
    expect(normalizeName("O'Neil, Mary ")).toBe('o neil mary');
  });
});

describe('findExactPatientId', () => {
  const roster: RosterPatientLite[] = [
    { id: 'p1', name: 'Yanira Fernando-Bautista', dob: '2022-02-18' },
    { id: 'p2', name: 'Tora Vinson', dob: '2018-02-22' },
  ];

  it('matches normalized name + exact DOB', () => {
    expect(findExactPatientId('yanira fernando-bautista', '2022-02-18', roster)).toBe('p1');
  });

  it('ignores hyphenation / case when normalizing', () => {
    expect(findExactPatientId('Yanira Fernando Bautista', '2022-02-18', roster)).toBe('p1');
  });

  it('returns null when DOB does not match', () => {
    expect(findExactPatientId('Yanira Fernando-Bautista', '2022-02-12', roster)).toBeNull();
  });

  it('returns null when name does not match', () => {
    expect(findExactPatientId('Yanira Fernando b', '2022-02-18', roster)).toBeNull();
  });
});

describe('findPatientCandidates', () => {
  const roster: RosterPatientLite[] = [
    { id: 'p1', name: 'Yanira Fernando-Bautista', dob: '2022-02-18' },
    { id: 'p2', name: 'Tora Vinson', dob: '2018-02-22' },
    { id: 'p3', name: 'Sapphire Simmons', dob: '2023-10-26' },
  ];

  it('finds the right patient when name is truncated but DOB matches', () => {
    const result = findPatientCandidates('Yanira Fernando b', '2022-02-18', roster);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].patientId).toBe('p1');
    expect(result[0].reason).toContain('DOB exact');
  });

  it('finds the right patient when both name + DOB are slightly off', () => {
    const result = findPatientCandidates('Yanira Fernando Bautista', '2022-02-12', roster);
    expect(result[0].patientId).toBe('p1');
  });

  it('returns empty when nothing is close', () => {
    const result = findPatientCandidates('Completely Unrelated', '1900-01-01', roster);
    expect(result).toEqual([]);
  });

  it('prefers exact-DOB match over name-only proximity', () => {
    const r: RosterPatientLite[] = [
      { id: 'p1', name: 'Yanira Fernando-Bautista', dob: '2022-02-18' },
      // Yanira-look-alike but wrong DOB
      { id: 'p2', name: 'Yanira Fernanda', dob: '2010-01-01' },
    ];
    const result = findPatientCandidates('Yanira Fernando b', '2022-02-18', r);
    expect(result[0].patientId).toBe('p1');
  });

  it('caps results at maxResults', () => {
    const result = findPatientCandidates('Yanira Fernando-Bautista', '2022-02-18', roster, 1);
    expect(result.length).toBe(1);
  });
});
