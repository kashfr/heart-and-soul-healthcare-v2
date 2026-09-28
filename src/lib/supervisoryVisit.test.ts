import { describe, it, expect, vi } from 'vitest';

// submissions / patientVisits import the Firebase client, which cannot
// initialize in the test env; only their pure helpers are exercised here.
vi.mock('./firebase', () => ({ db: {}, auth: {}, storage: {} }));
import {
  canAuthorSupervisoryVisit,
  getSupervisoryIncomplete,
  isSupervisoryNote,
  SUPERVISORY_NOTE_TYPE,
} from './supervisoryVisit';
import { getIncompleteRequired } from './noteValidation';
import { readShiftWindow } from './submissions';
import { scheduledSupervisoryVisitsOn, type PatientVisit } from './patientVisits';

/** A fully complete supervisory visit as the flat merged record. */
function completeVisit(): Record<string, string> {
  return {
    noteType: SUPERVISORY_NOTE_TYPE,
    patientId: 'p1',
    q3_clientName: 'Neal Kelly',
    q6_dateofService: '2026-09-28',
    sv_timeIn: '10:00',
    sv_timeOut: '10:45',
    sv_address: '12 Oak St, Atlanta, GA 30301',
    sv_staffName: 'Ann Lee, CNA',
    q11_nurseName: 'Souz Payne',
    q12_credential: 'RN',
    sv_temp: '98.4',
    sv_bp: '118/76',
    sv_pulse: '72',
    sv_generalConditions: 'Alert, oriented, home clean.',
    sv_clientProgress: 'Walking further with the walker.',
    sv_problems: 'No',
    sv_rightsInformed: 'Yes',
    sv_clientSatisfied: 'Yes',
    sv_interviewMethod: 'In person',
    sv_levelOfCare: 'Yes',
    sv_satisfiedWithStaff: 'Yes',
    q61_signature: 'data:image/png;base64,xxx',
  };
}

describe('getSupervisoryIncomplete', () => {
  it('passes a complete visit (narrative boxes optional when nothing needs explaining)', () => {
    expect(getSupervisoryIncomplete(completeVisit())).toEqual([]);
  });

  it('flags each missing core field, in document order', () => {
    const d = completeVisit();
    delete d.sv_bp;
    delete d.sv_staffName;
    delete d.sv_clientProgress;
    delete d.q61_signature;
    expect(getSupervisoryIncomplete(d).map((i) => i.key)).toEqual(['sv_staffName', 'sv_bp', 'sv_clientProgress', 'q61_signature']);
  });

  it('requires an explanation only when the answer calls for one', () => {
    const d = completeVisit();
    d.sv_problems = 'Yes';
    d.sv_clientSatisfied = 'No';
    d.sv_levelOfCare = 'No';
    d.sv_satisfiedWithStaff = 'No';
    expect(getSupervisoryIncomplete(d).map((i) => i.key)).toEqual([
      'sv_problemsDetail',
      'sv_dissatisfaction',
      'sv_levelOfCareRecs',
      'sv_staffFeedback',
    ]);
    d.sv_problemsDetail = 'Aide arrived late twice.';
    d.sv_dissatisfaction = 'Wants a consistent aide.';
    d.sv_levelOfCareRecs = 'Increase to 5 days a week.';
    d.sv_staffFeedback = 'Rushed through bathing.';
    expect(getSupervisoryIncomplete(d)).toEqual([]);
  });
});

describe('supervisory visit type', () => {
  it('is recognized by its noteType', () => {
    expect(isSupervisoryNote(completeVisit())).toBe(true);
    expect(isSupervisoryNote({ noteType: 'rn-oversight-visit' })).toBe(false);
    expect(isSupervisoryNote(null)).toBe(false);
  });

  it('is authored by supervisors and admins only', () => {
    expect(canAuthorSupervisoryVisit('supervisor')).toBe(true);
    expect(canAuthorSupervisoryVisit('admin')).toBe(true);
    expect(canAuthorSupervisoryVisit('nurse')).toBe(false);
    expect(canAuthorSupervisoryVisit('va')).toBe(false);
    expect(canAuthorSupervisoryVisit(null)).toBe(false);
  });

  it('is never scored against the shift-note rules', () => {
    expect(getIncompleteRequired(completeVisit())).toEqual([]);
  });

  it('has no time window, so it never counts toward shift or oversight hours', () => {
    expect(readShiftWindow(completeVisit())).toEqual({ shiftStart: '', shiftEnd: '', shiftEndDate: '', totalHours: '' });
  });
});

describe('scheduledSupervisoryVisitsOn', () => {
  const v = (over: Partial<PatientVisit>): PatientVisit => ({
    id: 'v',
    patientId: 'p1',
    date: '2026-09-28',
    type: 'supervisory',
    status: 'scheduled',
    createdBy: 'u',
    createdByName: 'U',
    ...over,
  });

  it('matches only scheduled supervisory visits on that date', () => {
    const visits = [
      v({ id: 'hit' }),
      v({ id: 'other-day', date: '2026-09-27' }),
      v({ id: 'shift', type: 'shift' }),
      v({ id: 'done', status: 'completed' }),
      v({ id: 'cancelled', status: 'cancelled' }),
    ];
    expect(scheduledSupervisoryVisitsOn(visits, '2026-09-28').map((x) => x.id)).toEqual(['hit']);
  });
});
