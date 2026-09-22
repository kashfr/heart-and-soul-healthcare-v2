import { describe, it, expect } from 'vitest';
import { resolveRate, programsWithRates } from './billingRatesShared';

const rows = [
  { program: 'now-comp', bucket: 'shift' as const, ratePerUnit: 24.36, effectiveFrom: '2026-01-01', effectiveTo: '' },
  { program: 'now-comp', bucket: 'shift' as const, ratePerUnit: 25.1, effectiveFrom: '2026-10-01', effectiveTo: '' },
  { program: 'now-comp', bucket: 'oversight' as const, ratePerUnit: 36.68, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' },
  { program: 'gapp', bucket: 'shift' as const, ratePerUnit: 8.5, effectiveFrom: '2026-07-01', effectiveTo: '' },
];

describe('resolveRate', () => {
  it('picks the row in force for the program, bucket, and date', () => {
    expect(resolveRate(rows, 'now-comp', 'shift', '2026-09-14')).toBe(24.36);
    expect(resolveRate(rows, 'now-comp', 'oversight', '2026-09-07')).toBe(36.68);
    expect(resolveRate(rows, 'gapp', 'shift', '2026-09-14')).toBe(8.5);
  });
  it('a later effective row wins once its date arrives; an ended row stops', () => {
    expect(resolveRate(rows, 'now-comp', 'shift', '2026-10-01')).toBe(25.1);
    expect(resolveRate(rows, 'now-comp', 'oversight', '2027-01-15')).toBeNull();
    expect(resolveRate(rows, 'gapp', 'shift', '2026-06-30')).toBeNull();
  });
  it('is null for an unknown program, bucket, or blank inputs', () => {
    expect(resolveRate(rows, 'edwp', 'shift', '2026-09-14')).toBeNull();
    expect(resolveRate(rows, 'gapp', 'oversight', '2026-09-14')).toBeNull();
    expect(resolveRate(rows, '', 'shift', '2026-09-14')).toBeNull();
    expect(programsWithRates(rows)).toEqual(new Set(['now-comp', 'gapp']));
  });
});
