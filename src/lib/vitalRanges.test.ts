import { describe, expect, it } from 'vitest';
import {
  getVitalRanges,
  checkVitalRange,
  hasAnyAbnormalVital,
  type VitalRangesOverride,
} from './vitalRanges';

describe('getVitalRanges — overrides', () => {
  it('returns hard-coded defaults when no override is passed', () => {
    const ranges = getVitalRanges('4');
    // Preschool defaults — sanity check matches what the form expects.
    expect(ranges.pulse).toEqual({
      low: 70,
      high: 130,
      unit: 'bpm',
      label: 'Pulse',
    });
  });

  it('applies a single-leaf override and leaves other vitals untouched', () => {
    const overrides: VitalRangesOverride = {
      preschool: { temperature: { low: 96.0, high: 99.5 } },
    };
    const ranges = getVitalRanges('4', undefined, overrides);
    expect(ranges.temperature.low).toBe(96.0);
    expect(ranges.temperature.high).toBe(99.5);
    // Other vitals in the same group still default.
    expect(ranges.pulse.low).toBe(70);
    expect(ranges.pulse.high).toBe(130);
  });

  it('ignores overrides for a different age group', () => {
    const overrides: VitalRangesOverride = {
      adult: { temperature: { low: 50, high: 200 } },
    };
    // Asking for preschool — adult override should not leak in.
    const ranges = getVitalRanges('4', undefined, overrides);
    expect(ranges.temperature.low).toBe(97.0);
    expect(ranges.temperature.high).toBe(99.0);
  });

  it('drops an override pair where low > high (corrupt data defense)', () => {
    const overrides: VitalRangesOverride = {
      adult: { pulse: { low: 200, high: 50 } },
    };
    const ranges = getVitalRanges('30', undefined, overrides);
    // Falls back to default.
    expect(ranges.pulse.low).toBe(60);
    expect(ranges.pulse.high).toBe(100);
  });
});

describe('checkVitalRange — overrides', () => {
  it('uses the override when classifying a value', () => {
    // Default preschool temperature low is 97.0 — 96.5 would normally
    // read LOW. With a 96.0 override floor, 96.5 reads NORMAL.
    const overrides: VitalRangesOverride = {
      preschool: { temperature: { low: 96.0, high: 99.5 } },
    };
    expect(checkVitalRange('temperature', 96.5, '4', undefined, overrides)).toBe('normal');
  });
});

describe('hasAnyAbnormalVital — overrides', () => {
  it('does not flag a value that is normal under an override', () => {
    const data = {
      q5_ageYears: '4',
      q4_dateofBirth: '2022-01-01',
      q16_temperature: '96.5', // would be LOW vs default preschool floor of 97.0
    };
    // No override → flagged abnormal.
    expect(hasAnyAbnormalVital(data)).toBe(true);
    // With a loosened floor → no longer flagged.
    const overrides: VitalRangesOverride = {
      preschool: { temperature: { low: 96.0, high: 99.5 } },
    };
    expect(hasAnyAbnormalVital(data, overrides)).toBe(false);
  });
});
