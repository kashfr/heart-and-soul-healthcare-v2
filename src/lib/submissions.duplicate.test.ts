import { describe, it, expect } from 'vitest';
import { normalizeName } from './levenshtein';
import { noteIsActiveDuplicate } from './duplicateMatch';

// The query scopes candidates to one nurse + one date of service, so these
// tests cover the in-memory part: archived exclusion + patient identity match.

describe('noteIsActiveDuplicate', () => {
  it('matches the same client by normalized name (missing hyphen / casing)', () => {
    expect(
      noteIsActiveDuplicate(
        { q3_clientName: 'Yanira Fernando-Bautista' },
        { normName: normalizeName('yanira fernando bautista') }
      )
    ).toBe(true);
  });

  it('does not match a different client', () => {
    expect(
      noteIsActiveDuplicate(
        { q3_clientName: 'Tora Vinson' },
        { normName: normalizeName('Yanira Fernando-Bautista') }
      )
    ).toBe(false);
  });

  it('prefers the roster link when both notes have a patientId', () => {
    // Same patientId → duplicate even if the typed names differ.
    expect(
      noteIsActiveDuplicate(
        { patientId: 'pat_1', q3_clientName: 'Y. Fernando' },
        { patientId: 'pat_1', normName: normalizeName('totally different') }
      )
    ).toBe(true);
    // Different patientId → not a duplicate even if names happen to match.
    expect(
      noteIsActiveDuplicate(
        { patientId: 'pat_2', q3_clientName: 'Tora Vinson' },
        { patientId: 'pat_1', normName: normalizeName('Tora Vinson') }
      )
    ).toBe(false);
  });

  it('falls back to name when only one side has a patientId', () => {
    // Target has no patientId (typed note) but stored note does → compare names.
    expect(
      noteIsActiveDuplicate(
        { patientId: 'pat_1', q3_clientName: 'Tora Vinson' },
        { normName: normalizeName('tora vinson') }
      )
    ).toBe(true);
  });

  it('excludes admin-archived notes (status or archivedAt)', () => {
    expect(
      noteIsActiveDuplicate(
        { q3_clientName: 'Tora Vinson', status: 'archived' },
        { normName: normalizeName('Tora Vinson') }
      )
    ).toBe(false);
    expect(
      noteIsActiveDuplicate(
        { q3_clientName: 'Tora Vinson', archivedAt: { seconds: 1 } },
        { normName: normalizeName('Tora Vinson') }
      )
    ).toBe(false);
  });

  it('returns false when there is no identity signal', () => {
    expect(noteIsActiveDuplicate({ q3_clientName: 'Tora Vinson' }, { normName: '' })).toBe(false);
  });
});
