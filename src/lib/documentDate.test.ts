import { describe, expect, it } from 'vitest';
import { DOC_DATE_FUTURE, DOC_DATE_REQUIRED, documentDateError, todayEasternISO } from './documentDate';

describe('documentDateError', () => {
  it('accepts today and earlier', () => {
    expect(documentDateError('2026-11-25', '2026-11-25')).toBeNull();
    expect(documentDateError('2026-11-20', '2026-11-25')).toBeNull();
  });
  it('rejects a future date, like a mistyped year', () => {
    expect(documentDateError('2026-11-26', '2026-11-25')).toBe(DOC_DATE_FUTURE);
    expect(documentDateError('2618-11-20', '2026-11-25')).toBe(DOC_DATE_FUTURE);
  });
  it('rejects blanks and dates that are not on the calendar', () => {
    expect(documentDateError('', '2026-11-25')).toBe(DOC_DATE_REQUIRED);
    expect(documentDateError('11/20/2026', '2026-11-25')).toBe(DOC_DATE_REQUIRED);
    expect(documentDateError('2026-02-30', '2026-11-25')).toBe(DOC_DATE_REQUIRED);
  });
});

describe('todayEasternISO', () => {
  it('uses the Eastern calendar day, not UTC', () => {
    // 11:30 PM Eastern on 11/25 is already 11/26 in UTC.
    expect(todayEasternISO(new Date('2026-11-26T04:30:00Z'))).toBe('2026-11-25');
    expect(todayEasternISO(new Date('2026-11-26T05:30:00Z'))).toBe('2026-11-26');
  });
});
