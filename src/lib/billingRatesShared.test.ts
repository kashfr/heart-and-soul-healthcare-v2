import { describe, it, expect } from 'vitest';
import { resolveRate, resolveRateRow, programsWithRates } from './billingRatesShared';

const rows = [
  { program: 'now-comp', bucket: 'shift' as const, credential: '', ratePerUnit: 24.36, effectiveFrom: '2026-01-01', effectiveTo: '' },
  { program: 'now-comp', bucket: 'shift' as const, credential: '', ratePerUnit: 25.1, effectiveFrom: '2026-10-01', effectiveTo: '' },
  { program: 'now-comp', bucket: 'oversight' as const, credential: '', ratePerUnit: 36.68, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' },
  { program: 'gapp', bucket: 'shift' as const, credential: 'LPN', ratePerUnit: 8.5, effectiveFrom: '2026-07-01', effectiveTo: '' },
  { program: 'gapp', bucket: 'shift' as const, credential: 'RN', ratePerUnit: 10.25, effectiveFrom: '2026-07-01', effectiveTo: '' },
];

describe('resolveRate', () => {
  it('picks the row in force for the program, bucket, and date', () => {
    expect(resolveRate(rows, 'now-comp', 'shift', '2026-09-14')).toBe(24.36);
    expect(resolveRate(rows, 'now-comp', 'oversight', '2026-09-07')).toBe(36.68);
  });
  it('a later effective row wins once its date arrives; an ended row stops', () => {
    expect(resolveRate(rows, 'now-comp', 'shift', '2026-10-01')).toBe(25.1);
    expect(resolveRate(rows, 'now-comp', 'oversight', '2027-01-15')).toBeNull();
    expect(resolveRate(rows, 'gapp', 'shift', '2026-06-30', 'LPN')).toBeNull();
  });
  it('matches the note author\'s credential on GAPP (LPN vs RN pay differently)', () => {
    expect(resolveRate(rows, 'gapp', 'shift', '2026-09-14', 'LPN')).toBe(8.5);
    expect(resolveRate(rows, 'gapp', 'shift', '2026-09-14', 'RN')).toBe(10.25);
    expect(resolveRate(rows, 'gapp', 'shift', '2026-09-14', 'rn')).toBe(10.25); // case-insensitive
    // no row for the credential and no "any" row: unpriced, never a guess
    expect(resolveRate(rows, 'gapp', 'shift', '2026-09-14', 'HHA')).toBeNull();
    expect(resolveRate(rows, 'gapp', 'shift', '2026-09-14', '')).toBeNull();
  });
  it('a credential-specific row beats an "any" row; "any" is the fallback', () => {
    const withAny = [...rows, { program: 'gapp', bucket: 'shift' as const, credential: '', ratePerUnit: 7, effectiveFrom: '2026-01-01', effectiveTo: '' }];
    expect(resolveRate(withAny, 'gapp', 'shift', '2026-09-14', 'RN')).toBe(10.25);
    expect(resolveRate(withAny, 'gapp', 'shift', '2026-09-14', 'HHA')).toBe(7);
    expect(resolveRateRow(withAny, 'gapp', 'shift', '2026-09-14', 'LPN')?.credential).toBe('LPN');
    // NOW/COMP "any" rows apply to whoever worked the shift
    expect(resolveRate(rows, 'now-comp', 'shift', '2026-09-14', 'RN')).toBe(24.36);
  });
  it('is null for an unknown program, bucket, or blank inputs', () => {
    expect(resolveRate(rows, 'edwp', 'shift', '2026-09-14')).toBeNull();
    expect(resolveRate(rows, 'gapp', 'oversight', '2026-09-14', 'RN')).toBeNull();
    expect(resolveRate(rows, '', 'shift', '2026-09-14')).toBeNull();
    expect(programsWithRates(rows)).toEqual(new Set(['now-comp', 'gapp']));
  });
});
