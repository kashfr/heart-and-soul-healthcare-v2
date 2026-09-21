import { describe, it, expect } from 'vitest';
import {
  splitShiftByDay,
  hoursInRange,
  touchesRange,
  monthCap,
  monthCapSource,
  monthUsage,
  hoursFindings,
  monthsBetween,
  authForMonth,
  fmtH,
  type HoursAuthorization,
} from './shiftHours';

describe('splitShiftByDay', () => {
  it('keeps a same-day shift on its date', () => {
    expect(splitShiftByDay({ dateISO: '2026-09-03', shiftStart: '08:00', shiftEndDate: '2026-09-03', shiftEnd: '16:00', totalHours: '8.00' }))
      .toEqual([{ dateISO: '2026-09-03', hours: 8 }]);
  });

  it('splits an overnight shift at midnight (19:00 to 07:00 = 5 + 7)', () => {
    expect(splitShiftByDay({ dateISO: '2026-08-31', shiftStart: '19:00', shiftEndDate: '2026-09-01', shiftEnd: '07:00', totalHours: '12.00' }))
      .toEqual([
        { dateISO: '2026-08-31', hours: 5 },
        { dateISO: '2026-09-01', hours: 7 },
      ]);
  });

  it('handles a multi-day stretch (32h weekend)', () => {
    expect(splitShiftByDay({ dateISO: '2026-05-31', shiftStart: '08:00', shiftEndDate: '2026-06-01', shiftEnd: '16:00', totalHours: '32.00' }))
      .toEqual([
        { dateISO: '2026-05-31', hours: 16 },
        { dateISO: '2026-06-01', hours: 16 },
      ]);
  });

  it('rolls a legacy note (no end date) overnight when end <= start', () => {
    expect(splitShiftByDay({ dateISO: '2026-03-10', shiftStart: '22:00', shiftEndDate: '', shiftEnd: '06:30', totalHours: '8.50' }))
      .toEqual([
        { dateISO: '2026-03-10', hours: 2 },
        { dateISO: '2026-03-11', hours: 6.5 },
      ]);
  });

  it('falls back to the note total when times are missing', () => {
    expect(splitShiftByDay({ dateISO: '2026-03-10', shiftStart: '', shiftEndDate: '', shiftEnd: '', totalHours: '7.25' }))
      .toEqual([{ dateISO: '2026-03-10', hours: 7.25 }]);
  });

  it('falls back to the note total on end-before-start with explicit dates', () => {
    expect(splitShiftByDay({ dateISO: '2026-03-10', shiftStart: '10:00', shiftEndDate: '2026-03-10', shiftEnd: '08:00', totalHours: '6' }))
      .toEqual([{ dateISO: '2026-03-10', hours: 6 }]);
  });

  it('returns nothing for an unparseable date of service', () => {
    expect(splitShiftByDay({ dateISO: '', shiftStart: '08:00', shiftEndDate: '', shiftEnd: '16:00', totalHours: '8' })).toEqual([]);
  });

  it('drops a zero total with no usable times', () => {
    expect(splitShiftByDay({ dateISO: '2026-03-10', shiftStart: '', shiftEndDate: '', shiftEnd: '', totalHours: '0.00' })).toEqual([]);
  });

  it('is DST-proof (spring forward night still totals by the clock)', () => {
    // 2026-03-08 is the US spring-forward date; 23:00 to 03:00 is 4 clock hours.
    expect(splitShiftByDay({ dateISO: '2026-03-07', shiftStart: '23:00', shiftEndDate: '2026-03-08', shiftEnd: '03:00', totalHours: '4' }))
      .toEqual([
        { dateISO: '2026-03-07', hours: 1 },
        { dateISO: '2026-03-08', hours: 3 },
      ]);
  });
});

describe('range helpers', () => {
  const segs = [
    { dateISO: '2026-08-31', hours: 5 },
    { dateISO: '2026-09-01', hours: 7 },
  ];
  it('sums only the in-range days', () => {
    expect(hoursInRange(segs, '2026-09-01', '2026-09-30')).toBe(7);
    expect(hoursInRange(segs, '2026-08-01', '2026-08-31')).toBe(5);
    expect(hoursInRange(segs, '', '')).toBe(12);
  });
  it('touchesRange is true when any day overlaps', () => {
    expect(touchesRange(segs, '2026-09-01', '2026-09-30')).toBe(true);
    expect(touchesRange(segs, '2026-09-02', '2026-09-30')).toBe(false);
  });
});

const piper: HoursAuthorization = {
  patientId: 'p1',
  paNumber: '126040902312',
  kind: 'skilled',
  hoursPerWeek: 21,
  from: '2026-06-10',
  to: '2026-09-30',
  monthOverrides: { '2026-06': 71 },
};

describe('monthCap', () => {
  it('reproduces the letter for full months from the weekly rate', () => {
    expect(monthCap(piper, '2026-07')).toBe(93);
    expect(monthCap(piper, '2026-08')).toBe(93);
    expect(monthCap(piper, '2026-09')).toBe(90);
    expect(monthCapSource(piper, '2026-09')).toBe('weekly');
  });
  it('uses the override for the partial first month', () => {
    expect(monthCap(piper, '2026-06')).toBe(71);
    expect(monthCapSource(piper, '2026-06')).toBe('override');
  });
  it('prorates a partial month when there is no override', () => {
    const a = { ...piper, monthOverrides: {} };
    expect(monthCap(a, '2026-06')).toBe(63); // 21 days x 21/7
  });
  it('is null outside the window or without any rate', () => {
    expect(monthCap(piper, '2026-10')).toBeNull();
    expect(monthCap({ ...piper, hoursPerWeek: null, monthOverrides: {} }, '2026-07')).toBeNull();
    expect(monthCapSource(piper, '2026-10')).toBe('none');
  });
  it('authForMonth prefers the newest overlapping authorization', () => {
    const renewal = { ...piper, from: '2026-09-15', to: '2027-03-31', hoursPerWeek: 28, monthOverrides: {} };
    expect(authForMonth([piper, renewal], '2026-09')).toBe(renewal);
    expect(authForMonth([piper, renewal], '2026-07')).toBe(piper);
    expect(authForMonth([piper], '2026-12')).toBeNull();
  });
});

describe('monthUsage', () => {
  const days = new Map<string, number>([
    ['2026-09-01', 12],
    ['2026-09-05', 12],
    ['2026-09-10', 12],
    ['2026-08-31', 5], // prior month, ignored
  ]);
  it('sums the month and computes remaining + pace', () => {
    const u = monthUsage(days, 90, '2026-09', '2026-09-10');
    expect(u.used).toBe(36);
    expect(u.remaining).toBe(54);
    expect(u.pct).toBeCloseTo(0.4);
    expect(u.perDay).toBe(3.6);
    expect(u.projected).toBe(108); // 3.6 x 30
    expect(u.runsOutOn).toBe('2026-09-25'); // 54 / 3.6 = 15 days after 9/10
  });
  it('reports a past month as final', () => {
    const u = monthUsage(days, 90, '2026-09', '2026-10-15');
    expect(u.projected).toBe(36);
    expect(u.runsOutOn).toBeNull();
  });
  it('handles no cap', () => {
    const u = monthUsage(days, null, '2026-09', '2026-09-10');
    expect(u.remaining).toBeNull();
    expect(u.pct).toBeNull();
  });
  it('flags today when already over', () => {
    const u = monthUsage(new Map([['2026-09-02', 100]]), 90, '2026-09', '2026-09-10');
    expect(u.remaining).toBe(-10);
    expect(u.runsOutOn).toBe('2026-09-10');
  });
});

describe('hoursFindings', () => {
  it('is silent without an authorization', () => {
    expect(hoursFindings([], new Map(), '2026-09-21')).toEqual([]);
  });
  it('warns on an authorization ending within 45 days and errors inside 14', () => {
    expect(hoursFindings([piper], new Map(), '2026-08-20')[0]).toMatchObject({ severity: 'warn' });
    expect(hoursFindings([piper], new Map(), '2026-09-21')[0]).toMatchObject({
      severity: 'error',
      message: 'Hours authorization ends 09/30/2026 (9 days). No renewal on file.',
    });
  });
  it('errors once expired, and stays quiet when a renewal is on file', () => {
    expect(hoursFindings([piper], new Map(), '2026-10-05')[0]).toMatchObject({ severity: 'error' });
    const renewal = { ...piper, from: '2026-10-01', to: '2027-03-31', monthOverrides: {} };
    expect(hoursFindings([piper, renewal], new Map(), '2026-10-05')).toEqual([]);
  });
  it('warns at 90% used and errors when over', () => {
    const near = new Map([['2026-09-02', 84]]);
    expect(hoursFindings([piper], near, '2026-09-05').some((f) => /93%/.test(f.message))).toBe(true);
    const over = new Map([['2026-09-02', 95]]);
    expect(hoursFindings([piper], over, '2026-09-05').some((f) => /Over by 5/.test(f.message))).toBe(true);
  });
  it('warns when on pace to run out before month end', () => {
    const fast = new Map([['2026-09-01', 12], ['2026-09-02', 12], ['2026-09-03', 12]]);
    const f = hoursFindings([piper], fast, '2026-09-03');
    expect(f.some((x) => /on pace to run out/.test(x.message))).toBe(true);
  });
});

describe('misc', () => {
  it('monthsBetween walks across a year boundary', () => {
    expect(monthsBetween('2026-11-10', '2027-02-01')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });
  it('fmtH trims zeros', () => {
    expect(fmtH(93)).toBe('93');
    expect(fmtH(5.5)).toBe('5.5');
    expect(fmtH(12.25)).toBe('12.25');
    expect(fmtH(7.1)).toBe('7.1');
  });
});
