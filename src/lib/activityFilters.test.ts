import { expect, it } from 'vitest';
import { activityDateBounds, parseActivityUSDate } from './activityFilters';
it('validates US input and rejects impossible or reversed dates', () => {
  expect(parseActivityUSDate('2/29/2024')).toBe('2024-02-29');
  expect(parseActivityUSDate('2/29/2025')).toBeNull();
  expect(parseActivityUSDate('2026-10-15')).toBeNull();
  expect(() => activityDateBounds('2026-02-30')).toThrow();
  expect(() => activityDateBounds('2026-10-16', '2026-10-15')).toThrow();
});
it('includes entire Eastern days across daylight-saving transitions', () => {
  const spring = activityDateBounds('2026-03-08', '2026-03-08');
  expect(spring.start?.toISOString()).toBe('2026-03-08T05:00:00.000Z');
  expect(spring.end?.toISOString()).toBe('2026-03-09T04:00:00.000Z');
  const fall = activityDateBounds('2026-11-01', '2026-11-01');
  expect(fall.start?.toISOString()).toBe('2026-11-01T04:00:00.000Z');
  expect(fall.end?.toISOString()).toBe('2026-11-02T05:00:00.000Z');
  expect(activityDateBounds()).toEqual({ start: undefined, end: undefined });
});
