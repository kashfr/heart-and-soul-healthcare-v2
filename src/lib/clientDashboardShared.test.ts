import { describe, expect, it } from 'vitest';
import {
  adverseEvents,
  isAdverseTolerance,
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
  vitalSeries,
  weeklyBuckets,
  weeklyMedBuckets,
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
  it('a note submitted before its (pre-charted) service date counts as timely, and empties yield null', () => {
    expect(timelinessStats([]).pctSameDay).toBeNull();
    const t = timelinessStats([
      note({ dateISO: '2026-07-05', submittedAt: new Date('2026-07-04T10:00:00') }),
    ]);
    expect(t.sameDay).toBe(1);
  });

  it('classifies by the AGENCY timezone, not the viewer clock (late-evening ET submission)', () => {
    // 2026-07-02T03:30Z is 11:30 PM ET on 7/1 — same-day for a 7/1 service
    // date, even when this test runs on a UTC machine.
    const t = timelinessStats([
      note({ dateISO: '2026-07-01', submittedAt: new Date('2026-07-02T03:30:00Z') }),
    ]);
    expect(t.sameDay).toBe(1);
    expect(t.late).toBe(0);
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

  it('counts the HEAD gap when the client has history before the window (boundary-straddling hiatus)', () => {
    const notes = [
      note({ id: 'old', dateISO: '2026-04-01' }), // prior history, outside window
      note({ id: 'a', dateISO: '2026-06-25' }),
      note({ id: 'b', dateISO: '2026-06-28' }),
    ];
    // window 5/15..6/30: head gap 5/15 -> 6/25 = 41d dominates (tail = 2, mid = 3)
    expect(largestGapDays(notes, '2026-05-15', '2026-06-30')).toBe(41);
  });

  it('does NOT penalize a brand-new client for days before care started', () => {
    const notes = [note({ id: 'a', dateISO: '2026-06-25' }), note({ id: 'b', dateISO: '2026-06-28' })];
    expect(largestGapDays(notes, '2026-05-15', '2026-06-30')).toBe(3);
  });
});

describe('adverseEvents / careTeamFromNotes', () => {
  it('matches BOTH stored punctuation variants of the adverse-tolerance label', () => {
    // The literal strings the form has stored over time — do not "clean up" to
    // a shared constant, or this test can no longer catch a drifting label.
    const semicolonVariant = 'Adverse reaction / intolerance; document below'; // current (FormPageFive)
    const emDashVariant = 'Adverse reaction / intolerance — document below'; // pre-2026-06-10 notes
    expect(isAdverseTolerance(semicolonVariant)).toBe(true);
    expect(isAdverseTolerance(emDashVariant)).toBe(true);
    expect(isAdverseTolerance('No issues observed')).toBe(false);
    expect(isAdverseTolerance('')).toBe(false);
    const evts = adverseEvents([
      note({ id: 'a', dateISO: '2026-06-01', medTolerance: emDashVariant, physNotified: 'Yes' }),
      note({ id: 'c', dateISO: '2026-06-15', medTolerance: semicolonVariant, physNotified: 'No' }),
    ]);
    expect(evts).toHaveLength(2);
  });

  it('picks only adverse-tolerance notes, newest first', () => {
    const v = 'Adverse reaction / intolerance; document below';
    const evts = adverseEvents([
      note({ id: 'a', dateISO: '2026-06-01', medTolerance: v, physNotified: 'Yes' }),
      note({ id: 'b', dateISO: '2026-06-10' }),
      note({ id: 'c', dateISO: '2026-06-15', medTolerance: v, physNotified: 'No' }),
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

  it('a med change does not double-count the handoff day (old endDate == new startDate)', () => {
    const changed: DashOrder[] = [
      {
        id: 'old',
        status: 'discontinued',
        scheduledTimes: ['08:00'],
        startDate: '2026-06-01',
        endDate: '2026-07-01',
        supersededByOrderId: 'new',
      },
      { id: 'new', status: 'active', scheduledTimes: ['08:00'], startDate: '2026-07-01', supersedesOrderId: 'old' },
    ];
    // 7/1 (handoff) + 7/2: exactly one 08:00 dose per day = 2 expected, not 3
    const s = marComplianceStats(changed, [], '2026-07-01', '2026-07-02', '2026-07-02');
    expect(s.expected).toBe(2);
    // A dose charted on the handoff day against the OLD order still counts.
    const s2 = marComplianceStats(
      changed,
      [{ id: 'h1', orderId: 'old', date: '2026-07-01', scheduledTime: '08:00', status: 'given' }],
      '2026-07-01',
      '2026-07-01',
      '2026-07-01',
    );
    expect(s2.expected).toBe(1);
    expect(s2.given).toBe(1);
    expect(s2.undocumented).toBe(0);
  });

  it('counts unscheduled one-off PRN doses in the PRN tallies', () => {
    const s = marComplianceStats(
      [],
      [
        { id: 'u1', orderId: '', date: '2026-07-01', scheduledTime: 'unscheduled', status: 'given', outcome: '' },
        { id: 'u2', orderId: '', date: '2026-07-01', scheduledTime: 'unscheduled', status: 'given', outcome: 'relieved' },
      ],
      '2026-07-01',
      '2026-07-02',
      '2026-07-02',
    );
    expect(s.prnGiven).toBe(2);
    expect(s.prnPendingResult).toBe(1);
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

describe('vitalSeries', () => {
  it('parses vitals, splits BP, and sorts oldest first', () => {
    const pts = vitalSeries([
      note({ id: 'b', dateISO: '2026-07-02', bloodPressure: '118/76', pulse: '72', oxygenSaturation: '98' }),
      note({ id: 'a', dateISO: '2026-07-01', temperature: '98.6', painScore: '6' }),
    ]);
    expect(pts.map((p) => p.dateISO)).toEqual(['2026-07-01', '2026-07-02']);
    expect(pts[0].temp).toBeCloseTo(98.6);
    expect(pts[0].pain).toBe(6);
    expect(pts[1].sys).toBe(118);
    expect(pts[1].dia).toBe(76);
    expect(pts[1].pulse).toBe(72);
    expect(pts[1].spo2).toBe(98);
  });

  it('drops implausible values (typos) instead of charting them, and skips vital-less notes', () => {
    const pts = vitalSeries([
      note({ id: 'a', dateISO: '2026-07-01', bloodPressure: '980/60', temperature: '9.86', pulse: '72' }),
      note({ id: 'b', dateISO: '2026-07-02' }), // no vitals at all
      note({ id: 'c', dateISO: '', pulse: '80' }), // no date
    ]);
    expect(pts).toHaveLength(1);
    expect(pts[0].sys).toBeUndefined(); // 980 out of bounds — dropped
    expect(pts[0].dia).toBe(60); // the plausible half of the pair is kept
    expect(pts[0].temp).toBeUndefined(); // 9.86 out of bounds
    expect(pts[0].pulse).toBe(72);
  });
});

describe('weeklyMedBuckets', () => {
  it('buckets current administrations by week and resolves amendment chains', () => {
    const admins: DashAdmin[] = [
      { id: 'a1', orderId: 'o', date: '2026-06-29', scheduledTime: '08:00', status: 'given' },
      { id: 'a2', orderId: 'o', date: '2026-06-30', scheduledTime: '08:00', status: 'given' },
      // amended: original given, corrected to held — must count ONCE as held
      { id: 'a3', orderId: 'o', date: '2026-07-01', scheduledTime: '08:00', status: 'given' },
      { id: 'a4', amends: 'a3', orderId: 'o', date: '2026-07-01', scheduledTime: '08:00', status: 'held' },
      { id: 'a5', orderId: 'o', date: '2026-06-22', scheduledTime: 'PRN', status: 'refused' },
    ];
    const weeks = weeklyMedBuckets(admins, 3, '2026-07-04');
    expect(weeks).toHaveLength(3);
    expect(weeks[2].weekStartISO).toBe('2026-06-29');
    expect(weeks[2].given).toBe(2);
    expect(weeks[2].held).toBe(1);
    expect(weeks[1].refused).toBe(1);
    expect(weeks[0].given + weeks[0].held + weeks[0].refused).toBe(0);
  });
});
