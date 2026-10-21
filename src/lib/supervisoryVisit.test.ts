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
    sv_complaint: 'Call the office and ask for the supervisor.',
    sv_anythingElse: 'Nothing else.',
    q16_temperature: '98.4',
    q16_temperatureRoute: 'Oral',
    q17_systolic: '118',
    q17_diastolic: '76',
    q17_bloodPressure: '118/76',
    q18_pulse: '72',
    q19_respiration: '16',
    q20_oxygenSaturation: '98',
    q21_oxygenSource: 'Room air',
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
    delete d.q17_diastolic; // half a BP is not a BP
    delete d.sv_staffName;
    delete d.sv_clientProgress;
    delete d.q61_signature;
    expect(getSupervisoryIncomplete(d).map((i) => i.key)).toEqual(['sv_staffName', 'q17_bloodPressure', 'sv_clientProgress', 'q61_signature']);
  });

  it('requires the temperature route once a temperature is entered', () => {
    const d = completeVisit();
    delete d.q16_temperatureRoute;
    expect(getSupervisoryIncomplete(d).map((i) => i.key)).toEqual(['q16_temperatureRoute']);
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

  it('requires all five vitals, and the oxygen source once SpO2 is entered', () => {
    const d = completeVisit();
    delete d.q19_respiration;
    delete d.q21_oxygenSource;
    expect(getSupervisoryIncomplete(d).map((i) => i.key)).toEqual(['q19_respiration', 'q21_oxygenSource']);
    delete d.q20_oxygenSaturation;
    expect(getSupervisoryIncomplete(d).map((i) => i.key)).toEqual(['q19_respiration', 'q20_oxygenSaturation']);
  });

  it('accepts an "unable to obtain vitals" reason in place of the readings, like the shift note', () => {
    const d = completeVisit();
    for (const k of ['q16_temperature', 'q16_temperatureRoute', 'q17_systolic', 'q17_diastolic', 'q17_bloodPressure', 'q18_pulse', 'q19_respiration', 'q20_oxygenSaturation', 'q21_oxygenSource']) delete d[k];
    expect(getSupervisoryIncomplete(d).map((i) => i.key)).toEqual(['q16_temperature', 'q17_bloodPressure', 'q18_pulse', 'q19_respiration', 'q20_oxygenSaturation']);
    d.q16_vitalsNotObtainedReason = 'Client asleep';
    expect(getSupervisoryIncomplete(d)).toEqual([]);
  });

  it('makes BP optional under age 3, and accepts its own "unable to obtain" reason', () => {
    const d = completeVisit();
    delete d.q17_systolic;
    delete d.q17_diastolic;
    delete d.q17_bloodPressure;
    expect(getSupervisoryIncomplete(d).map((i) => i.key)).toEqual(['q17_bloodPressure']);
    d.q17_bpNotObtainedReason = 'Client refused';
    expect(getSupervisoryIncomplete(d)).toEqual([]);
    delete d.q17_bpNotObtainedReason;
    d.q4_dateofBirth = '2025-02-08';
    d.q5_ageYears = '1';
    expect(getSupervisoryIncomplete(d)).toEqual([]);
  });

  it('rev 3 asks about the service plan only when it needs action, and wants a reason for "Not today"', () => {
    const d: Record<string, string> = { ...completeVisit(), q1_formRev: '3', sv_servicePlanStatus: 'overdue' };
    expect(getSupervisoryIncomplete(d).map((i) => i.key)).toEqual(['sv_servicePlanAction']);
    d.sv_servicePlanAction = 'Not today';
    expect(getSupervisoryIncomplete(d).map((i) => i.key)).toEqual(['sv_servicePlanReason']);
    d.sv_servicePlanReason = 'Mother not home; scheduled with her for 10/03.';
    expect(getSupervisoryIncomplete(d)).toEqual([]);
    expect(getSupervisoryIncomplete({ ...completeVisit(), q1_formRev: '3', sv_servicePlanStatus: 'current' })).toEqual([]);
    // Older visits and an unloaded status are never flagged.
    expect(getSupervisoryIncomplete({ ...completeVisit(), q1_formRev: '2', sv_servicePlanStatus: 'overdue' })).toEqual([]);
    expect(getSupervisoryIncomplete({ ...completeVisit(), q1_formRev: '3', sv_servicePlanStatus: '' })).toEqual([]);
  });
});
