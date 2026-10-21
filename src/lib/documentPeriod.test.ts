import { describe, expect, it } from 'vitest';
import {
  draftFromPeriod, formatDocumentPeriod, isISODate, monthPeriod, parseDocumentPeriod, periodMonth, periodOverlaps, resolvePeriodDraft,
} from './documentPeriod';

describe('document period', () => {
  it('builds whole calendar months, leap years included', () => {
    expect(monthPeriod('2026-10')).toEqual({ periodStart: '2026-10-01', periodEnd: '2026-10-31' });
    expect(monthPeriod('2028-02')).toEqual({ periodStart: '2028-02-01', periodEnd: '2028-02-29' });
    expect(monthPeriod('2026-13')).toBeNull();
    expect(periodMonth({ periodStart: '2026-10-01', periodEnd: '2026-10-31' })).toBe('2026-10');
    expect(periodMonth({ periodStart: '2026-10-01', periodEnd: '2026-10-30' })).toBeNull();
    expect(isISODate('2026-02-29')).toBe(false);
  });
  it('labels months, years, month spans and custom ranges', () => {
    expect(formatDocumentPeriod({ periodStart: '2026-10-01', periodEnd: '2026-10-31' })).toBe('Oct 2026');
    expect(formatDocumentPeriod({ periodStart: '2026-01-01', periodEnd: '2026-12-31' })).toBe('2026');
    expect(formatDocumentPeriod({ periodStart: '2026-10-01', periodEnd: '2026-12-31' })).toBe('Oct 2026 to Dec 2026');
    expect(formatDocumentPeriod({ periodStart: '2026-10-15', periodEnd: '2027-04-14' })).toBe('10/15/2026 to 04/14/2027');
    expect(formatDocumentPeriod({ periodStart: '2026-10-15', periodEnd: '2026-10-01' })).toBe('');
    expect(formatDocumentPeriod({ periodStart: '2026-10-15' })).toBe('');
    expect(formatDocumentPeriod(undefined)).toBe('');
  });
  it('overlaps inclusively with open-ended filters', () => {
    const p = { periodStart: '2026-10-01', periodEnd: '2026-10-31' };
    expect(periodOverlaps(p, '2026-10-31', '2026-11-30')).toBe(true);
    expect(periodOverlaps(p, '2026-11-01', '')).toBe(false);
    expect(periodOverlaps(p, '', '2026-09-30')).toBe(false);
    expect(periodOverlaps(p, '', '')).toBe(true);
    expect(periodOverlaps({}, '', '')).toBe(false);
  });
  it('parses a submitted period as a complete ordered pair or nothing', () => {
    expect(parseDocumentPeriod({})).toEqual({ ok: true, period: null });
    expect(parseDocumentPeriod({ periodStart: '', periodEnd: ' ' })).toEqual({ ok: true, period: null });
    expect(parseDocumentPeriod({ periodStart: '2026-10-01' })).toMatchObject({ ok: false, error: expect.stringContaining('both') });
    expect(parseDocumentPeriod({ periodStart: '2026-10-01', periodEnd: '2026-02-30' })).toMatchObject({ ok: false });
    expect(parseDocumentPeriod({ periodStart: '2026-11-01', periodEnd: '2026-10-01' })).toMatchObject({ ok: false, error: expect.stringContaining('before') });
    expect(parseDocumentPeriod({ periodStart: '2026-10-01', periodEnd: '2026-10-31' })).toEqual({ ok: true, period: { periodStart: '2026-10-01', periodEnd: '2026-10-31' } });
  });
  it('round-trips form drafts in US text and validates them', () => {
    expect(draftFromPeriod({ periodStart: '2026-10-01', periodEnd: '2026-10-31' })).toEqual({ mode: 'month', month: '2026-10', from: '', to: '' });
    expect(draftFromPeriod({ periodStart: '2026-10-15', periodEnd: '2027-04-14' })).toEqual({ mode: 'range', month: '', from: '10/15/2026', to: '04/14/2027' });
    expect(draftFromPeriod(undefined).mode).toBe('none');
    expect(resolvePeriodDraft({ mode: 'none', month: '', from: '', to: '' })).toEqual({ ok: true, period: null });
    expect(resolvePeriodDraft({ mode: 'month', month: '', from: '', to: '' })).toMatchObject({ ok: false, error: expect.stringContaining('month') });
    expect(resolvePeriodDraft({ mode: 'month', month: '2026-10', from: '', to: '' })).toEqual({ ok: true, period: { periodStart: '2026-10-01', periodEnd: '2026-10-31' } });
    expect(resolvePeriodDraft({ mode: 'range', month: '', from: '10/15/2026', to: '' })).toMatchObject({ ok: false, error: expect.stringContaining('MM/DD/YYYY') });
    expect(resolvePeriodDraft({ mode: 'range', month: '', from: '10/15/2026', to: '10/01/2026' })).toMatchObject({ ok: false, error: expect.stringContaining('before') });
    expect(resolvePeriodDraft({ mode: 'range', month: '', from: '1/1/2026', to: '3/31/2026' })).toEqual({ ok: true, period: { periodStart: '2026-01-01', periodEnd: '2026-03-31' } });
  });
});
