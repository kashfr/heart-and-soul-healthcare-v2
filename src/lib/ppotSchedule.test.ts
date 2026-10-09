import { expect, it } from 'vitest';
import { ppotDueMilestone, validPpotSchedule } from './ppotSchedule';
const due = (today: string, progress = {}) => ppotDueMilestone('2026-10-01', today, [3, 7, 10], progress);
it('uses calendar-day offsets 3, 7 and 10 from the original fax', () => {
  expect(due('2026-10-03')).toBeNull();
  expect(due('2026-10-04')).toBe(3);
  expect(due('2026-10-08', { followupAttemptDate: '2026-10-04' })).toBe(7);
  expect(due('2026-10-11', { followupAttemptDate: '2026-10-08' })).toBe(10);
  expect(due('2026-11-01', { followupAttemptDate: '2026-10-11' })).toBeNull();
});
it('collapses missed milestones into the latest one', () => {
  expect(due('2026-10-20')).toBe(10);
  expect(due('2026-10-21', { followupCoveredThroughDay: 19 })).toBeNull();
});
it('manual sends cover earlier milestones without cancelling later ones', () => {
  expect(due('2026-10-07', { followupDate: '2026-10-06' })).toBeNull();
  expect(due('2026-10-08', { followupDate: '2026-10-06' })).toBe(7);
});
it('does not repeat failed attempts and handles legacy reminders', () => {
  expect(due('2026-10-05', { followupAttemptDate: '2026-10-04' })).toBeNull();
  expect(due('2026-10-08', { reminderSentAt: true })).toBe(7);
  expect(due('2026-10-05', { reminderSentAt: true })).toBeNull();
  expect(due('2026-10-12', { reminderDate: '2026-10-11' })).toBeNull();
});
it('handles invalid dates, disabled schedules and custom schedules', () => {
  expect(due('bad date')).toBeNull();
  expect(ppotDueMilestone('2026-02-30', '2026-03-10', [3], {})).toBeNull();
  expect(ppotDueMilestone('2026-10-01', '2026-10-20', [], {})).toBeNull();
  expect(ppotDueMilestone('2026-10-01', '2026-10-20', [3, 7, 10, 14, 21], { followupCoveredThroughDay: 10 })).toBe(14);
  for (const invalid of [[0], [1.5], [366], [7,3], [3,3], ['3'], Array.from({length:13},(_,i)=>i+1)]) expect(validPpotSchedule(invalid)).toBe(false);
  expect(validPpotSchedule([])).toBe(true);
});
