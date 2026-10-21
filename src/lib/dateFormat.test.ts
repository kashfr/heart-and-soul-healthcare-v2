import { describe, expect, it } from 'vitest';
import { formatDateUS, formatDateTimeUS, formatDateUSFile, formatMonthUSFile } from './dateFormat';

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

describe('formatDateUSFile', () => {
  it('converts ISO date-only strings to MM-DD-YYYY', () => {
    expect(formatDateUSFile('2026-08-15')).toBe('08-15-2026');
  });

  it('passes non-ISO values through unchanged', () => {
    expect(formatDateUSFile('')).toBe('');
    expect(formatDateUSFile('unknown-date')).toBe('unknown-date');
    expect(formatDateUSFile('08-15-2026')).toBe('08-15-2026');
  });
});

describe('formatMonthUSFile', () => {
  it('converts ISO month keys to MM-YYYY', () => {
    expect(formatMonthUSFile('2026-08')).toBe('08-2026');
  });

  it('passes non-month values through unchanged', () => {
    expect(formatMonthUSFile('')).toBe('');
    expect(formatMonthUSFile('2026-08-15')).toBe('2026-08-15');
    expect(formatMonthUSFile('August 2026')).toBe('August 2026');
  });
});

describe('formatDateTimeUS', () => {
  it('formats fax dates without shifting unzoned values', () => {
    expect(formatDateTimeUS('2026-10-13 14:45:50')).toBe('10/13/2026 14:45:50');
    expect(formatDateTimeUS('2026-10-13T14:45')).toBe('10/13/2026 14:45');
    expect(formatDateTimeUS('2026-10-13')).toBe('10/13/2026');
  });
  it('uses US agency time for zoned instants, including the previous day', () => {
    expect(formatDateTimeUS('2026-10-13T01:00:00Z')).toBe('10/12/2026, 9:00 PM');
  });
  it('preserves empty, legacy US, and unknown vendor labels', () => {
    for (const value of ['', '10/13/2026 14:45', 'Unknown']) expect(formatDateTimeUS(value)).toBe(value);
  });
});
