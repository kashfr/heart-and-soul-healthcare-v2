import { describe, expect, it } from 'vitest';
import {
  ADVERSE_TOLERANCE_VALUE,
  adverseEvents,
  ageYears,
  careTeamFromNotes,
  daysBetweenISO,
  largestGapDays,
  marComplianceStats,
  normalizeDateISO,
  notesInWindow,
  shiftISO,
  sortNotesDesc,
  timelinessStats,
  weeklyBuckets,
  type DashboardNote,
  type DashAdmin,
  type DashOrder,
} from './clientDashboardShared';

function note(overrides: Partial<DashboardNote> = {}): DashboardNote {
  return {
    id: 'n1',
    dateISO: '2026-07-01',
    submittedAt: new Date('2026-07-01T18:00:00'),
    nurseId: 'u1',
    nurseName: 'Sam Jones',
    credential: 'RN',
    totalHours: '8',
    temperature: '',
    bloodPressure: '',
    pulse: '',
    respiration: '',
    oxygenSaturation: '',
    painScore: '',
    medTolerance: '',
    physNotified: '',
    addrLine1: '',
    city: '',
    state: '',
    postal: '',
    ...overrides,
  };
}

describe('normalizeDateISO', () => {
  it('passes ISO through, converts US format, rejects garbage', () => {
    expect(normalizeDateISO('2026-07-04')).toBe('2026-07-04');
    expect(normalizeDateISO('7/4/2026')).toBe('2026-07-04');
    expect(normalizeDateISO('07/04/2026')).toBe('2026-07-04');
    expect(normalizeDateISO('not a date')).toBe('');
    expect(normalizeDateISO('')).toBe('');
  });
});

describe('date math', () => {
  it('daysBetweenISO and shiftISO round-trip across a month boundary', () => {
    expect(daysBetweenISO('2026-06-28', '2026-07-02')).toBe(4);
    expect(shiftISO('2026-07-01', -1)).toBe('2026-06-30');
    expect(shiftISO('2026-06-30', 1)).toBe('2026-07-01');
  });
  it('ageYears handles pre/post birthday and rejects junk', () => {
    expect(ageYears('1985-06-07', '2026-07-04')).toBe(41);
    expect(ageYears('1985-08-07', '2026-07-04')).toBe(40);
    expect(ageYears('', '2026-07-04')).toBeNull();
  });
});

describe('timelinessStats', () => {
  it('splits same-day from late entries', () => {
    const t = timelinessStats([
      note({ id: 'a', dateISO: '2026-07-01', submittedAt: new Date('2026-07-01T20:00:00') }),
      note({ id: 'b', dateISO: '2026-07-01', submittedAt: new Date('2026-07-03T09:00:00') }),
    ]);
    expect(t.sameDay).toBe(1);
    expect(t.late).toBe(1);
    expect(t.pctSameDay).toBe(50);
  });
  it('a note submitted before its (backdated) service date counts as timely, and empties yield null', () => {
    expect(timelinessStats([]).pctSameDay).toBeNull();
    const t = timelinessStats([
      note({ dateISO: '2026-07-05', submittedAt: new Date('2026-07-04T10:00:00') }),
    ]);
    expect(t.sameDay).toBe(1);
  });
});

describe('largestGapDays', () => {
  it('finds the biggest gap between visits INCLUDING the tail to today', () => {
    const notes = [
      note({ id: 'a', dateISO: '2026-06-01' }),
      note({ id: 'b', dateISO: '2026-06-04' }),
      note({ id: 'c', dateISO: '2026-06-20' }),
    ];
    // gaps: 3, 16, tail 20-30 = 10 → 16
    expect(largestGapDays(notes, '2026-05-15', '2026-06-30')).toBe(16);
  });
  it('uses the tail gap when it dominates, and null with no visits', () => {
    expect(largestGapDays([note({ dateISO: '2026-06-01' })], '2026-05-15', '2026-06-30')).toBe(29);
    expect(largestGapDays([], '2026-05-15', '2026-06-30')).toBeNull();
  });
});

describe('adverseEvents / careTeamFromNotes', () => {
  it('picks only adverse-tolerance notes, newest first', () => {
    const evts = adverseEvents([
      note({ id: 'a', dateISO: '2026-06-01', medTolerance: ADVERSE_TOLERANCE_VALUE, physNotified: 'Yes' }),
      note({ id: 'b', dateISO: '2026-06-10' }),
      note({ id: 'c', dateISO: '2026-06-15', medTolerance: ADVERSE_TOLERANCE_VALUE, physNotified: 'No' }),
    ]);
    expect(evts.map((e) => e.dateISO)).toEqual(['2026-06-15', '2026-06-01']);
  });
  it('derives a deduped care team with the most recent name per uid', () => {
    const team = careTeamFromNotes([
      note({ id: 'a', dateISO: '2026-06-01', nurseId: 'u1', nurseName: 'Old Name' }),
      note({ id: 'b', dateISO: '2026-06-20', nurseId: 'u1', nurseName: 'Sam Jones' }),
      note({ id: 'c', dateISO: '2026-06-10', nurseId: 'u2', nurseName: 'Ana Brown', credential: 'LPN' }),
    ]);
    expect(team).toHaveLength(2);
    expect(team.find((m) => m.uid === 'u1')?.name).toBe('Sam Jones');
  });
});

describe('marComplianceStats', () => {
  const orders: DashOrder[] = [
    { id: 'o1', status: 'active', scheduledTimes: ['08:00', '20:00'], startDate: '2026-06-01' },
    { id: 'o2', status: 'active', isPRN: true, scheduledTimes: [], startDate: '2026-06-01' },
  ];
  const admins: DashAdmin[] = [
    { id: 'a1', orderId: 'o1', date: '2026-07-01', scheduledTime: '08:00', status: 'given' },
    { id: 'a2', orderId: 'o1', date: '2026-07-01', scheduledTime: '20:00', status: 'held' },
    { id: 'a3', orderId: 'o2', date: '2026-07-01', scheduledTime: 'PRN', status: 'given', outcome: '' },
    { id: 'a4', orderId: 'o2', date: '2026-07-02', scheduledTime: 'PRN', status: 'given', outcome: 'pain relieved' },
  ];

  it('counts expected slots per applicable day and fills from current admins', () => {
    // window 7/1..7/2: o1 has 2 slots × 2 days = 4 expected
    const s = marComplianceStats(orders, admins, '2026-07-01', '2026-07-02', '2026-07-02');
    expect(s.expected).toBe(4);
    expect(s.given).toBe(1);
    expect(s.held).toBe(1);
    expect(s.undocumented).toBe(2);
    expect(s.pctGiven).toBe(25);
    expect(s.prnGiven).toBe(2);
    expect(s.prnPendingResult).toBe(1);
  });

  it('never expects future doses and respects order windows', () => {
    // today caps the window: only 7/1 counts even though the range runs to 7/5
    const s = marComplianceStats(orders, admins, '2026-07-01', '2026-07-05', '2026-07-01');
    expect(s.expected).toBe(2);
    const s2 = marComplianceStats(
      [{ id: 'o3', status: 'discontinued', scheduledTimes: ['08:00'], startDate: '2026-06-01', endDate: '2026-06-30' }],
      [],
      '2026-07-01',
      '2026-07-05',
      '2026-07-05',
    );
    expect(s2.expected).toBe(0);
    expect(s2.pctGiven).toBeNull();
  });

  it('an amended record counts once at its corrected value', () => {
    const s = marComplianceStats(
      [{ id: 'o1', status: 'active', scheduledTimes: ['08:00'], startDate: '2026-06-01' }],
      [
        { id: 'x1', orderId: 'o1', date: '2026-07-01', scheduledTime: '08:00', status: 'given' },
        { id: 'x2', amends: 'x1', orderId: 'o1', date: '2026-07-01', scheduledTime: '08:00', status: 'refused' },
      ],
      '2026-07-01',
      '2026-07-01',
      '2026-07-01',
    );
    expect(s.expected).toBe(1);
    expect(s.given).toBe(0);
    expect(s.refused).toBe(1);
  });
});

describe('weeklyBuckets / notesInWindow / sortNotesDesc', () => {
  it('buckets visits+hours by Monday week and includes empty weeks', () => {
    const buckets = weeklyBuckets(
      [
        note({ id: 'a', dateISO: '2026-06-29', totalHours: '8' }), // Monday
        note({ id: 'b', dateISO: '2026-07-01', totalHours: '4.5' }),
        note({ id: 'c', dateISO: '2026-06-22', totalHours: '8' }), // prior week
      ],
      3,
      '2026-07-04', // Saturday of the 6/29 week
    );
    expect(buckets).toHaveLength(3);
    expect(buckets[2].weekStartISO).toBe('2026-06-29');
    expect(buckets[2].visits).toBe(2);
    expect(buckets[2].hours).toBeCloseTo(12.5);
    expect(buckets[1].visits).toBe(1);
    expect(buckets[0].visits).toBe(0);
  });
  it('window filter + sort behave', () => {
    const ns = [note({ id: 'a', dateISO: '2026-06-01' }), note({ id: 'b', dateISO: '2026-07-01' })];
    expect(notesInWindow(ns, '2026-06-15', '2026-07-15')).toHaveLength(1);
    expect(sortNotesDesc(ns)[0].id).toBe('b');
  });
});
