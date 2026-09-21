import { describe, it, expect } from 'vitest';
import { resolveRange, describeRange } from './dateRange';

// Monday 2026-09-21
const T = '2026-09-21';

describe('resolveRange', () => {
  it('handles the relative presets', () => {
    expect(resolveRange('', {}, T)).toEqual({ fromISO: '', toISO: '' });
    expect(resolveRange('today', {}, T)).toEqual({ fromISO: T, toISO: T });
    expect(resolveRange('yesterday', {}, T)).toEqual({ fromISO: '2026-09-20', toISO: '2026-09-20' });
    expect(resolveRange('week', {}, T)).toEqual({ fromISO: '2026-09-20', toISO: '2026-09-26' });
    expect(resolveRange('lastweek', {}, T)).toEqual({ fromISO: '2026-09-13', toISO: '2026-09-19' });
    expect(resolveRange('month', {}, T)).toEqual({ fromISO: '2026-09-01', toISO: '2026-09-30' });
    expect(resolveRange('lastmonth', {}, T)).toEqual({ fromISO: '2026-08-01', toISO: '2026-08-31' });
    expect(resolveRange('30d', {}, T)).toEqual({ fromISO: '2026-08-22', toISO: T });
    expect(resolveRange('year', {}, T)).toEqual({ fromISO: '2026-01-01', toISO: '2026-12-31' });
    expect(resolveRange('lastyear', {}, T)).toEqual({ fromISO: '2025-01-01', toISO: '2025-12-31' });
  });
  it('last month across a January boundary', () => {
    expect(resolveRange('lastmonth', {}, '2027-01-05')).toEqual({ fromISO: '2026-12-01', toISO: '2026-12-31' });
  });
  it('picked month', () => {
    expect(resolveRange('m', { month: '2025-08' }, T)).toEqual({ fromISO: '2025-08-01', toISO: '2025-08-31' });
    expect(resolveRange('m', { month: '2024-02' }, T)).toEqual({ fromISO: '2024-02-01', toISO: '2024-02-29' });
    expect(resolveRange('m', { month: 'nope' }, T)).toEqual({ fromISO: '', toISO: '' });
  });
  it('custom range, including open ends and swapped bounds', () => {
    expect(resolveRange('c', { from: '2026-08-01', to: '2026-08-15' }, T)).toEqual({ fromISO: '2026-08-01', toISO: '2026-08-15' });
    expect(resolveRange('c', { from: '2026-08-15', to: '2026-08-01' }, T)).toEqual({ fromISO: '2026-08-01', toISO: '2026-08-15' });
    expect(resolveRange('c', { from: '2026-08-01' }, T)).toEqual({ fromISO: '2026-08-01', toISO: '' });
    expect(resolveRange('c', {}, T)).toEqual({ fromISO: '', toISO: '' });
  });
});

describe('describeRange', () => {
  it('formats in US order', () => {
    expect(describeRange({ fromISO: '2026-08-01', toISO: '2026-08-15' })).toBe('08/01/2026 to 08/15/2026');
    expect(describeRange({ fromISO: '2026-08-01', toISO: '2026-08-01' })).toBe('08/01/2026');
    expect(describeRange({ fromISO: '', toISO: '' })).toBe('all dates');
  });
});
