import { describe, expect, it } from 'vitest';
import { rangeValidator, VITAL_RANGE } from './validators';

describe('rangeValidator', () => {
  it('accepts an empty string (required is enforced separately)', () => {
    const v = rangeValidator(0, 100, 'Must be 0–100');
    expect(v('')).toBe(true);
  });

  it('accepts values inside the range', () => {
    const v = rangeValidator(0, 100, 'Must be 0–100');
    expect(v('0')).toBe(true);
    expect(v('50')).toBe(true);
    expect(v('100')).toBe(true);
  });

  it('rejects values above the max with the given message', () => {
    const v = rangeValidator(0, 100, 'Must be 0–100');
    expect(v('101')).toBe('Must be 0–100');
    // The Makador case — 250% meal consumed
    expect(v('250')).toBe('Must be 0–100');
  });

  it('rejects values below the min', () => {
    const v = rangeValidator(50, 280, 'Must be 50–280 mmHg');
    expect(v('49')).toBe('Must be 50–280 mmHg');
  });

  it('rejects non-numeric input with a generic message', () => {
    const v = rangeValidator(0, 100, 'Must be 0–100');
    expect(v('abc')).toBe('Must be a number');
  });

  it('handles decimals correctly (e.g. temperature)', () => {
    const v = rangeValidator(80, 115, 'Must be 80–115 °F');
    expect(v('98.6')).toBe(true);
    expect(v('115.0')).toBe(true);
    expect(v('115.1')).toBe('Must be 80–115 °F');
  });
});

describe('VITAL_RANGE typo guards', () => {
  // Sanity: real vitals should pass; obvious typos should fail. These exist
  // so a future change that accidentally narrows a range (or widens it past
  // the typo-guard threshold) is caught immediately.
  const cases = [
    // Real abnormal-but-clinically-valid values (must pass)
    ['temperature', '102.5', true],   // fever
    ['temperature', '95.0', true],    // hypothermia
    ['systolic', '180', true],        // hypertensive crisis
    ['systolic', '90', true],         // hypotension
    ['diastolic', '120', true],       // crisis
    ['pulse', '160', true],           // peds
    ['pulse', '40', true],            // athlete bradycardia
    ['respiration', '60', true],      // newborn
    ['o2', '70', true],               // catastrophic but recorded
    ['glucose', '500', true],         // severe hyperglycemia
    // Typos / impossible values (must fail)
    ['temperature', '970', false],    // typo: 97.0 → 970
    ['temperature', '9.7', false],
    ['systolic', '999', false],
    ['systolic', '1200', false],      // typo: trailing zero
    ['pulse', '9999', false],
    ['o2', '101', false],             // saturation can't exceed 100
    ['glucose', '5000', false],
    ['respiration', '0', false],      // not breathing — should be a different field
    ['respiration', '999', false],
  ] as const;

  it.each(cases)('%s = %s → %s', (key, value, shouldPass) => {
    const cfg = VITAL_RANGE[key];
    const v = rangeValidator(cfg.min, cfg.max, cfg.label);
    const result = v(value);
    if (shouldPass) {
      expect(result).toBe(true);
    } else {
      // Failure returns the configured message string, not `false`.
      expect(typeof result).toBe('string');
    }
  });
});
