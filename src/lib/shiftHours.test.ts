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
  findShiftOverlaps,
  unitsUsage,
  emptyBucketDayHours,
  rateLabel,
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
  covers: 'shift',
  rateBasis: 'week',
  rateHours: 21,
  from: '2026-06-10',
  to: '2026-09-30',
  monthOverrides: { '2026-06': 71 },
  totalUnits: null,
};

// Kimberly Guffey's Therap lines (NOW/COMP): 4 h daily LPN, 6 h monthly RN,
// 04/03/2026 to 04/02/2027, 5,840 and 288 fifteen-minute units.
const kimLpn: HoursAuthorization = {
  patientId: 'k1',
  paNumber: '926021602410',
  kind: 'skilled',
  covers: 'shift',
  rateBasis: 'day',
  rateHours: 4,
  from: '2026-04-03',
  to: '2027-04-02',
  monthOverrides: {},
  totalUnits: 5840,
  serviceCode: 'NL1',
};
const kimRn: HoursAuthorization = { ...kimLpn, covers: 'oversight', rateBasis: 'month', rateHours: 6, totalUnits: 288, serviceCode: 'NR1' };

const shiftOnly = (m: Map<string, number>) => ({ ...emptyBucketDayHours(), shift: m });

describe('monthCap', () => {
  it('reproduces the letter for full months from the weekly rate', () => {
    expect(monthCap(piper, '2026-07')).toBe(93);
    expect(monthCap(piper, '2026-08')).toBe(93);
    expect(monthCap(piper, '2026-09')).toBe(90);
    expect(monthCapSource(piper, '2026-09')).toBe('rate');
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
    expect(monthCap({ ...piper, rateHours: null, monthOverrides: {} }, '2026-07')).toBeNull();
    expect(monthCapSource(piper, '2026-10')).toBe('none');
  });
  it('daily rate multiplies by covered days; monthly rate is as stated', () => {
    expect(monthCap(kimLpn, '2026-09')).toBe(120); // 4 x 30
    expect(monthCap(kimLpn, '2026-10')).toBe(124); // 4 x 31
    expect(monthCap(kimLpn, '2026-04')).toBe(112); // 04/03 to 04/30 = 28 days
    expect(monthCap(kimLpn, '2027-04')).toBe(8); // 04/01 to 04/02
    expect(monthCap(kimRn, '2026-09')).toBe(6);
    expect(monthCap(kimRn, '2026-04')).toBe(6); // partial month, not prorated
    expect(rateLabel(kimLpn)).toBe('4/day');
    expect(rateLabel(kimRn)).toBe('6/mo');
    expect(rateLabel(piper)).toBe('21/wk');
  });
  it('authForMonth prefers the newest overlapping authorization, per bucket', () => {
    const renewal = { ...piper, from: '2026-09-15', to: '2027-03-31', rateHours: 28, monthOverrides: {} };
    expect(authForMonth([piper, renewal], '2026-09')).toBe(renewal);
    expect(authForMonth([piper, renewal], '2026-07')).toBe(piper);
    expect(authForMonth([piper], '2026-12')).toBeNull();
    expect(authForMonth([kimLpn, kimRn], '2026-09', 'oversight')).toBe(kimRn);
    expect(authForMonth([kimLpn, kimRn], '2026-09', 'shift')).toBe(kimLpn);
    expect(authForMonth([kimLpn], '2026-09', 'oversight')).toBeNull();
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
  const none = emptyBucketDayHours();
  it('is silent without an authorization', () => {
    expect(hoursFindings([], none, '2026-09-21')).toEqual([]);
  });
  it('warns on an authorization ending within 45 days and errors inside 14', () => {
    expect(hoursFindings([piper], none, '2026-08-20')[0]).toMatchObject({ severity: 'warn' });
    expect(hoursFindings([piper], none, '2026-09-21')[0]).toMatchObject({
      severity: 'error',
      message: 'Shift hours authorization ends 09/30/2026 (9 days). No renewal on file.',
    });
  });
  it('errors once expired, and stays quiet when a renewal is on file', () => {
    expect(hoursFindings([piper], none, '2026-10-05')[0]).toMatchObject({ severity: 'error' });
    const renewal = { ...piper, from: '2026-10-01', to: '2027-03-31', monthOverrides: {} };
    expect(hoursFindings([piper, renewal], none, '2026-10-05')).toEqual([]);
  });
  it('warns at 90% used and errors when over', () => {
    const near = shiftOnly(new Map([['2026-09-02', 84]]));
    expect(hoursFindings([piper], near, '2026-09-05').some((f) => /93%/.test(f.message))).toBe(true);
    const over = shiftOnly(new Map([['2026-09-02', 95]]));
    expect(hoursFindings([piper], over, '2026-09-05').some((f) => /Over by 5/.test(f.message))).toBe(true);
  });
  it('warns when on pace to run out before month end', () => {
    const fast = shiftOnly(new Map([['2026-09-01', 12], ['2026-09-02', 12], ['2026-09-03', 12]]));
    const f = hoursFindings([piper], fast, '2026-09-03');
    expect(f.some((x) => /on pace to run out/.test(x.message))).toBe(true);
  });
  it('nudges when an RN oversight line has no visit after the 20th, and not before', () => {
    expect(hoursFindings([kimLpn, kimRn], none, '2026-09-21').some((f) => /No RN oversight visit documented yet for September/.test(f.message))).toBe(true);
    expect(hoursFindings([kimLpn, kimRn], none, '2026-09-15').some((f) => /No RN oversight visit/.test(f.message))).toBe(false);
    const visited = { ...none, oversight: new Map([['2026-09-07', 3.5]]) };
    expect(hoursFindings([kimLpn, kimRn], visited, '2026-09-21').some((f) => /No RN oversight visit/.test(f.message))).toBe(false);
    // a shift-only client (GAPP) never gets the nudge
    expect(hoursFindings([piper], none, '2026-09-21').some((f) => /RN oversight visit/.test(f.message))).toBe(false);
    // a line that began on the 19th has not had 20 days yet
    const late = { ...kimRn, from: '2026-09-19', to: '2027-09-18' };
    expect(hoursFindings([late], none, '2026-09-21').some((f) => /No RN oversight visit/.test(f.message))).toBe(false);
    expect(hoursFindings([late], none, '2026-10-09').some((f) => /No RN oversight visit/.test(f.message))).toBe(false); // October counts from the 1st
    expect(hoursFindings([late], none, '2026-10-21').some((f) => /No RN oversight visit/.test(f.message))).toBe(true);
  });
  it('treats a fully used RN month as informational, and going over as an error', () => {
    const full = { ...none, oversight: new Map([['2026-09-09', 6]]) };
    const f = hoursFindings([kimRn], full, '2026-09-21');
    expect(f.find((x) => /6 of 6 used/.test(x.message))?.severity).toBe('info');
    const over = { ...none, oversight: new Map([['2026-09-09', 6.42]]) };
    expect(hoursFindings([kimRn], over, '2026-09-21').find((x) => /Over by 0.42/.test(x.message))?.severity).toBe('error');
  });
  it('reports each bucket separately', () => {
    const both = { shift: new Map([['2026-09-02', 118]]), oversight: new Map([['2026-09-07', 6.5]]) };
    const msgs = hoursFindings([kimLpn, kimRn], both, '2026-09-21').map((f) => f.message);
    expect(msgs.some((m) => /September shift hours: 118 of 120 used \(98%\)/.test(m))).toBe(true);
    expect(msgs.some((m) => /September RN oversight: 6.5 of 6 used. Over by 0.5/.test(m))).toBe(true);
  });
  it('flags annual units', () => {
    // 4 h/day used every day since 04/03 through 09/21 = 172 days x 16 units = 2752 of 5840, on pace exactly
    const steady = new Map<string, number>();
    for (let d = new Date(Date.UTC(2026, 3, 3)); d <= new Date(Date.UTC(2026, 8, 21)); d.setUTCDate(d.getUTCDate() + 1)) {
      steady.set(d.toISOString().slice(0, 10), 4);
    }
    expect(hoursFindings([kimLpn], shiftOnly(steady), '2026-09-21').some((f) => /annual units/.test(f.message))).toBe(false);
    // 6 h/day = 4,128 units so far (71%), but the pace exhausts 5,840 by early December
    const heavy = new Map(steady);
    for (const k of heavy.keys()) heavy.set(k, 6);
    const f = hoursFindings([kimLpn], shiftOnly(heavy), '2026-09-21');
    expect(f.some((x) => /on pace to exhaust the 5,840 annual units 12\/01\/2026/.test(x.message))).toBe(true);
    // 8 h/day is already past 90% used, which takes precedence over the pace message
    const over = new Map(steady);
    for (const k of over.keys()) over.set(k, 8);
    expect(hoursFindings([kimLpn], shiftOnly(over), '2026-09-21').some((x) => /5,504 of 5,840 annual units used \(94%\)/.test(x.message))).toBe(true);
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

describe('findShiftOverlaps', () => {
  const night = { id: 'night', dateISO: '2026-09-16', shiftStart: '19:00', shiftEndDate: '2026-09-17', shiftEnd: '07:00', totalHours: '12' };
  const day = { id: 'day', dateISO: '2026-09-17', shiftStart: '08:00', shiftEndDate: '2026-09-17', shiftEnd: '16:00', totalHours: '8' };
  const night2 = { id: 'night2', dateISO: '2026-09-17', shiftStart: '19:00', shiftEndDate: '2026-09-18', shiftEnd: '07:00', totalHours: '12' };
  const dup = { id: 'dup', dateISO: '2026-09-17', shiftStart: '14:00', shiftEndDate: '2026-09-17', shiftEnd: '22:00', totalHours: '8' };

  it('is empty for back-to-back shifts that only touch', () => {
    expect(findShiftOverlaps([night, day, night2]).size).toBe(0);
    // 07:00 end meeting 07:00 start is not an overlap
    const touch = { ...day, shiftStart: '07:00' };
    expect(findShiftOverlaps([night, touch]).size).toBe(0);
  });

  it('reports every pair with the shared minutes', () => {
    const m = findShiftOverlaps([night, day, night2, dup]);
    expect(m.get('dup')).toEqual([
      { otherId: 'day', minutes: 120 },
      { otherId: 'night2', minutes: 180 },
    ]);
    expect(m.get('day')).toEqual([{ otherId: 'dup', minutes: 120 }]);
    expect(m.get('night2')).toEqual([{ otherId: 'dup', minutes: 180 }]);
    expect(m.has('night')).toBe(false);
  });

  it('ignores shifts whose window cannot be resolved', () => {
    const blank = { id: 'blank', dateISO: '2026-09-17', shiftStart: '', shiftEndDate: '', shiftEnd: '', totalHours: '8' };
    expect(findShiftOverlaps([day, blank]).size).toBe(0);
  });
});

describe('unitsUsage', () => {
  it('converts hours to 15-minute units and projects over the window', () => {
    const days = new Map<string, number>([
      ['2026-04-02', 4], // before the window, ignored
      ['2026-04-03', 4],
      ['2026-04-04', 4],
    ]);
    const u = unitsUsage(kimLpn, days, '2026-04-04')!;
    expect(u.hours).toBe(8);
    expect(u.usedUnits).toBe(32);
    expect(u.remainingUnits).toBe(5808);
    expect(u.projectedUnits).toBe(5840); // 16/day x 365
    expect(u.runsOutOn).toBeNull();
  });
  it('is null without a unit total', () => {
    expect(unitsUsage(piper, new Map(), '2026-09-21')).toBeNull();
  });
  it('names the run-out day when the pace exceeds the total', () => {
    const days = new Map<string, number>([['2026-04-03', 8], ['2026-04-04', 8]]);
    const u = unitsUsage(kimLpn, days, '2026-04-04')!;
    expect(u.projectedUnits).toBe(11680);
    expect(u.runsOutOn).toBe('2026-10-01'); // 5776 / 32 per day = 180.5 days after 04/04
  });
});
