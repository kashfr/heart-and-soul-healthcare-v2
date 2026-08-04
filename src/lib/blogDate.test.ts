// Pin the runtime to a zone west of UTC BEFORE importing the module under test.
// This is the condition that produced the bug: `new Date('2026-07-15')` parses as
// UTC midnight, so any negative UTC offset rendered the previous calendar day.
// Production builds happen to run in UTC, which masked it — this file makes sure
// a US-timezone build (or a dev machine) can never reintroduce the off-by-one.
process.env.TZ = 'America/New_York';

import { describe, it, expect } from 'vitest';
import { formatPostDate } from './blog';

describe('formatPostDate', () => {
  it('renders the same calendar day that is written in the frontmatter', () => {
    expect(formatPostDate('2026-07-15')).toBe('July 15, 2026');
    expect(formatPostDate('2026-08-03')).toBe('August 3, 2026');
    expect(formatPostDate('2026-04-15')).toBe('April 15, 2026');
  });

  it('does not slip a day at month, year, or DST boundaries', () => {
    expect(formatPostDate('2026-01-01')).toBe('January 1, 2026');
    expect(formatPostDate('2026-12-31')).toBe('December 31, 2026');
    // US DST transitions — the historical off-by-one hot spots
    expect(formatPostDate('2026-03-08')).toBe('March 8, 2026');
    expect(formatPostDate('2026-11-01')).toBe('November 1, 2026');
  });

  it('never disagrees with the raw ISO value emitted in <time dateTime>', () => {
    // Every real post date on the biweekly cadence, plus the boundaries above.
    const dates = [
      '2026-01-01', '2026-01-15', '2026-03-08', '2026-04-15', '2026-05-01',
      '2026-05-15', '2026-06-01', '2026-06-15', '2026-07-01', '2026-07-15',
      '2026-08-01', '2026-08-15', '2026-11-01', '2026-12-31',
    ];
    for (const iso of dates) {
      const [y, m, d] = iso.split('-').map(Number);
      const rendered = new Date(`${iso}T12:00:00`);
      expect(formatPostDate(iso)).toBe(
        rendered.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      );
      // and the rendered day matches the digits in the frontmatter string
      expect([rendered.getFullYear(), rendered.getMonth() + 1, rendered.getDate()]).toEqual([y, m, d]);
    }
  });

  it('still handles a full ISO timestamp if a post ever uses one', () => {
    expect(formatPostDate('2026-07-15T18:30:00Z')).toBe('July 15, 2026');
  });
});
