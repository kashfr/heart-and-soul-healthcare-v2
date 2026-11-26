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
    expect(levenshtein('Marisa', 'Marisa')).toBe(0);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(levenshtein('  Marisa ', 'MARISA')).toBe(0);
  });

  it('counts single-character substitutions', () => {
    expect(levenshtein('Marisa', 'Marasa')).toBe(1);
  });

  it('handles empty strings', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('catches a truncated last name with many ops', () => {
    // "Marisa Delgado b" → "Marisa Delgado-Brockton":
    // replace " " with "-" (1) + replace "b" with "B" (case-insensitive: 0)
    // + insert "rockton" (7) = 8 ops in the lowercased forms.
    expect(levenshtein('Marisa Delgado b', 'Marisa Delgado-Brockton')).toBe(8);
  });
});

describe('dayDiff', () => {
  it('returns 0 for the same date', () => {
    expect(dayDiff('2022-03-17', '2022-03-17')).toBe(0);
  });

  it('returns the absolute day delta', () => {
    expect(dayDiff('2022-03-17', '2022-03-11')).toBe(6);
    expect(dayDiff('2022-03-11', '2022-03-17')).toBe(6);
  });

  it('returns Infinity for unparseable input', () => {
    expect(dayDiff('not-a-date', '2022-03-17')).toBe(Infinity);
    expect(dayDiff('', '2022-03-17')).toBe(Infinity);
  });
});

describe('normalizeName', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeName('Marisa Delgado-Brockton')).toBe('marisa delgado brockton');
    expect(normalizeName("O'Neil, Mary ")).toBe('o neil mary');
  });
});

describe('findExactPatientId', () => {
  const roster: RosterPatientLite[] = [
    { id: 'p1', name: 'Marisa Delgado-Brockton', dob: '2022-03-17' },
    { id: 'p2', name: 'Nola Vance', dob: '2017-04-21' },
  ];

  it('matches normalized name + exact DOB', () => {
    expect(findExactPatientId('marisa delgado-brockton', '2022-03-17', roster)).toBe('p1');
  });

  it('ignores hyphenation / case when normalizing', () => {
    expect(findExactPatientId('Marisa Delgado Brockton', '2022-03-17', roster)).toBe('p1');
  });

  it('returns null when DOB does not match', () => {
    expect(findExactPatientId('Marisa Delgado-Brockton', '2022-03-11', roster)).toBeNull();
  });

  it('returns null when name does not match', () => {
    expect(findExactPatientId('Marisa Delgado b', '2022-03-17', roster)).toBeNull();
  });
});

describe('findPatientCandidates', () => {
  const roster: RosterPatientLite[] = [
    { id: 'p1', name: 'Marisa Delgado-Brockton', dob: '2022-03-17' },
    { id: 'p2', name: 'Nola Vance', dob: '2017-04-21' },
    { id: 'p3', name: 'Sabrina Stone', dob: '2023-09-25' },
  ];

  it('finds the right patient when name is truncated but DOB matches', () => {
    const result = findPatientCandidates('Marisa Delgado b', '2022-03-17', roster);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].patientId).toBe('p1');
    expect(result[0].reason).toContain('DOB exact');
  });

  it('finds the right patient when both name + DOB are slightly off', () => {
    const result = findPatientCandidates('Marisa Delgado Brockton', '2022-03-11', roster);
    expect(result[0].patientId).toBe('p1');
  });

  it('returns empty when nothing is close', () => {
    const result = findPatientCandidates('Completely Unrelated', '1900-01-01', roster);
    expect(result).toEqual([]);
  });

  it('prefers exact-DOB match over name-only proximity', () => {
    const r: RosterPatientLite[] = [
      { id: 'p1', name: 'Marisa Delgado-Brockton', dob: '2022-03-17' },
      // Marisa-look-alike but wrong DOB
      { id: 'p2', name: 'Marisa Delgada', dob: '2010-01-01' },
    ];
    const result = findPatientCandidates('Marisa Delgado b', '2022-03-17', r);
    expect(result[0].patientId).toBe('p1');
  });

  it('caps results at maxResults', () => {
    const result = findPatientCandidates('Marisa Delgado-Brockton', '2022-03-17', roster, 1);
    expect(result.length).toBe(1);
  });

  // Regression: nurses type the name BEFORE the DOB on Page 1. The
  // banner has to surface a suggestion even when typedDob is blank,
  // otherwise it never fires for the most common path.
  it('still suggests on first-name match when DOB is blank', () => {
    const result = findPatientCandidates('marisa delgado b', '', roster);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].patientId).toBe('p1');
    expect(result[0].reason.toLowerCase()).toContain('first-name match');
  });

  it('suggests on partial first name even without DOB', () => {
    // Just the first name typed
    const result = findPatientCandidates('marisa', '', roster);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].patientId).toBe('p1');
  });

  it('does not surface unrelated patients on first-name miss', () => {
    const result = findPatientCandidates('marisa delgado b', '', roster);
    const ids = result.map((c) => c.patientId);
    // Only Marisa should match; Nola and Sabrina have different first names.
    expect(ids).toContain('p1');
    expect(ids).not.toContain('p2');
    expect(ids).not.toContain('p3');
  });

  it('handles the small-typo case ("Marsa" for "Marisa") via widened name distance', () => {
    // "marsa delgado-brockton" vs "marisa delgado-brockton" — distance 1
    const result = findPatientCandidates('Marsa Delgado-Brockton', '2022-03-17', roster);
    expect(result[0].patientId).toBe('p1');
  });
});

describe('findNameCandidates (name-only, form-side)', () => {
  const roster: RosterPatientLite[] = [
    { id: 'p1', name: 'Marisa Delgado-Brockton', dob: '2022-03-17' },
    { id: 'p2', name: 'Nola Vance', dob: '2017-04-21' },
    { id: 'p3', name: 'Sabrina Stone', dob: '2023-09-25' },
  ];

  it('finds the right patient on truncated last name (no DOB required)', () => {
    const result = findNameCandidates('marisa delgado b', roster);
    expect(result[0].patientId).toBe('p1');
  });

  it('finds the right patient on just the first name', () => {
    const result = findNameCandidates('marisa', roster);
    expect(result[0].patientId).toBe('p1');
  });

  it('finds the right patient on missing-hyphen variant', () => {
    const result = findNameCandidates('Marisa Delgado Brockton', roster);
    expect(result[0].patientId).toBe('p1');
  });

  it('returns nothing for very short queries', () => {
    expect(findNameCandidates('ma', roster)).toEqual([]);
    expect(findNameCandidates('', roster)).toEqual([]);
  });

  it('does not surface unrelated patients', () => {
    const result = findNameCandidates('marisa delgado b', roster);
    const ids = result.map((c) => c.patientId);
    expect(ids).toContain('p1');
    expect(ids).not.toContain('p2');
    expect(ids).not.toContain('p3');
  });

  it('does not require any DOB info to function', () => {
    // Same call as findPatientCandidates would need typedDob, but here
    // we never pass one — the function should still surface the match.
    const result = findNameCandidates('Marsa Delgado-Brockton', roster);
    expect(result[0].patientId).toBe('p1');
  });

  it('returns top-N by name distance', () => {
    const r: RosterPatientLite[] = [
      { id: 'a', name: 'Anna Smith', dob: '2020-01-01' },
      { id: 'b', name: 'Anna Smyth', dob: '2020-01-01' },
      { id: 'c', name: 'Nola Vance', dob: '2017-04-21' },
    ];
    // "Anna Smith" → distance 0 vs p:a, distance 1 vs p:b, far from c
    const result = findNameCandidates('Anna Smith', r, 2);
    expect(result.length).toBe(2);
    expect(result[0].patientId).toBe('a');
    expect(result[1].patientId).toBe('b');
  });

  // The regression that drove the per-word matching rewrite: nurse
  // types a typo in the first name AND truncates the last name
  // ("marsa delg" instead of "Marisa Delgado-Brockton"). Whole-string
  // Levenshtein punishes this combo too harshly (distance ~13); per-word
  // matching recognizes each word individually.
  it('finds the right patient with first-name typo + truncated last name', () => {
    const result = findNameCandidates('marsa delg', roster);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].patientId).toBe('p1');
  });

  it('finds the right patient on prefix of just first name', () => {
    const result = findNameCandidates('mar', roster);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].patientId).toBe('p1');
  });

  it('finds the right patient with last name typo only', () => {
    // "marisa delgada" — first name exact, last name 1-char typo
    const result = findNameCandidates('marisa delgada', roster);
    expect(result[0].patientId).toBe('p1');
  });

  it('does not surface a different patient on mostly-mismatched words', () => {
    // "nola vance" should match Nola, not Marisa
    const r: RosterPatientLite[] = [
      { id: 'p1', name: 'Marisa Delgado-Brockton', dob: '2022-03-17' },
      { id: 'p2', name: 'Nola Vance', dob: '2017-04-21' },
    ];
    const result = findNameCandidates('nola vance', r, 3);
    expect(result[0].patientId).toBe('p2');
    const ids = result.map((c) => c.patientId);
    expect(ids).not.toContain('p1');
  });

  it('does not require a DOB to be present anywhere in the call', () => {
    // Sanity: the function signature really is name-only — no `typedDob`.
    expect(findNameCandidates('marisa', roster).length).toBeGreaterThan(0);
  });
});
