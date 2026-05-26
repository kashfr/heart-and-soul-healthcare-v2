import { describe, it, expect } from 'vitest';
import {
  levenshtein,
  dayDiff,
  normalizeName,
  findPatientCandidates,
  findNameCandidates,
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

  // Regression: nurses type the name BEFORE the DOB on Page 1. The
  // banner has to surface a suggestion even when typedDob is blank,
  // otherwise it never fires for the most common path.
  it('still suggests on first-name match when DOB is blank', () => {
    const result = findPatientCandidates('yanira fernando b', '', roster);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].patientId).toBe('p1');
    expect(result[0].reason.toLowerCase()).toContain('first-name match');
  });

  it('suggests on partial first name even without DOB', () => {
    // Just the first name typed
    const result = findPatientCandidates('yanira', '', roster);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].patientId).toBe('p1');
  });

  it('does not surface unrelated patients on first-name miss', () => {
    const result = findPatientCandidates('yanira fernando b', '', roster);
    const ids = result.map((c) => c.patientId);
    // Only Yanira should match; Tora and Sapphire have different first names.
    expect(ids).toContain('p1');
    expect(ids).not.toContain('p2');
    expect(ids).not.toContain('p3');
  });

  it('handles the small-typo case ("Yanra" for "Yanira") via widened name distance', () => {
    // "yanra fernando-bautista" vs "yanira fernando-bautista" — distance 1
    const result = findPatientCandidates('Yanra Fernando-Bautista', '2022-02-18', roster);
    expect(result[0].patientId).toBe('p1');
  });
});

describe('findNameCandidates (name-only, form-side)', () => {
  const roster: RosterPatientLite[] = [
    { id: 'p1', name: 'Yanira Fernando-Bautista', dob: '2022-02-18' },
    { id: 'p2', name: 'Tora Vinson', dob: '2018-02-22' },
    { id: 'p3', name: 'Sapphire Simmons', dob: '2023-10-26' },
  ];

  it('finds the right patient on truncated last name (no DOB required)', () => {
    const result = findNameCandidates('yanira fernando b', roster);
    expect(result[0].patientId).toBe('p1');
  });

  it('finds the right patient on just the first name', () => {
    const result = findNameCandidates('yanira', roster);
    expect(result[0].patientId).toBe('p1');
  });

  it('finds the right patient on missing-hyphen variant', () => {
    const result = findNameCandidates('Yanira Fernando Bautista', roster);
    expect(result[0].patientId).toBe('p1');
  });

  it('returns nothing for very short queries', () => {
    expect(findNameCandidates('ya', roster)).toEqual([]);
    expect(findNameCandidates('', roster)).toEqual([]);
  });

  it('does not surface unrelated patients', () => {
    const result = findNameCandidates('yanira fernando b', roster);
    const ids = result.map((c) => c.patientId);
    expect(ids).toContain('p1');
    expect(ids).not.toContain('p2');
    expect(ids).not.toContain('p3');
  });

  it('does not require any DOB info to function', () => {
    // Same call as findPatientCandidates would need typedDob, but here
    // we never pass one — the function should still surface the match.
    const result = findNameCandidates('Yanra Fernando-Bautista', roster);
    expect(result[0].patientId).toBe('p1');
  });

  it('returns top-N by name distance', () => {
    const r: RosterPatientLite[] = [
      { id: 'a', name: 'Anna Smith', dob: '2020-01-01' },
      { id: 'b', name: 'Anna Smyth', dob: '2020-01-01' },
      { id: 'c', name: 'Tora Vinson', dob: '2018-02-22' },
    ];
    // "Anna Smith" → distance 0 vs p:a, distance 1 vs p:b, far from c
    const result = findNameCandidates('Anna Smith', r, 2);
    expect(result.length).toBe(2);
    expect(result[0].patientId).toBe('a');
    expect(result[1].patientId).toBe('b');
  });
});
