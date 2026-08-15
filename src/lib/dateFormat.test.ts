import { describe, expect, it } from 'vitest';
import { formatDateUS } from './dateFormat';

describe('formatDateUS', () => {
  it('converts ISO date-only strings to MM/DD/YYYY', () => {
    expect(formatDateUS('2006-09-14')).toBe('09/14/2006');
    expect(formatDateUS('2026-01-01')).toBe('01/01/2026');
  });

  it('returns empty for empty input', () => {
    expect(formatDateUS('')).toBe('');
  });

  it('passes non-ISO values through unchanged', () => {
    // Free text riding in the same field must survive verbatim.
    expect(formatDateUS('Will provide later')).toBe('Will provide later');
    // Unpadded or partial dates are not ISO — do not risk mangling them.
    expect(formatDateUS('2006-9-1')).toBe('2006-9-1');
    expect(formatDateUS('09/14/2006')).toBe('09/14/2006');
  });
});
