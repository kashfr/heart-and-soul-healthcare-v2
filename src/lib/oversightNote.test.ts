import { describe, it, expect } from 'vitest';
import {
  getOversightIncomplete,
  isOversightNote,
  locationChoiceFor,
  locationFromChoice,
  MED_REVIEW_DISCREPANCIES,
  MED_REVIEW_NOT_REVIEWED,
  OVERSIGHT_NOTE_TYPE,
} from './oversightNote';

/** A fully complete oversight note as the flat merged record. */
function completeNote(): Record<string, string> {
  return {
    noteType: OVERSIGHT_NOTE_TYPE,
    q1_formRev: '3',
    q2_program: 'now-comp',
    q2_serviceLevel: 'rn-oversight',
    patientId: 'abc123',
    q3_clientName: 'Neal Kelly',
    q4_dateofBirth: '1985-06-07',
    q5_ageYears: '41',
    q6_dateofService: '2026-08-15',
    ov_timeIn: '10:00',
    ov_timeOut: '11:15',
    ov_locationChoice: "Client's Home",
    ov_location: "Client's Home",
    ov_visitType: 'Routine oversight',
    q11_nurseName: 'Souz Payne',
    q12_credential: 'RN',
    ov_generalCondition: 'Stable; no changes since last visit.',
    q16_temperature: '98.1',
    q16_temperatureRoute: 'Oral',
    q17_systolic: '114',
    q17_diastolic: '82',
    q17_bloodPressure: '114/82',
    q18_pulse: '60',
    q19_respiration: '16',
    q20_oxygenSaturation: '98',
    q21_oxygenSource: 'Room air',
    ov_interactions: 'Talked about his week; he smiled and showed me his garden.',
    ov_hcpStatus: 'Current; reflects present condition',
    ov_hcpStaffTrained: 'Yes; training dates verified in record',
    ov_ordersVerified: 'Yes',
    ov_marReviewed: 'Yes',
    ov_equipOrders: 'N/A (no adaptive equipment)',
    ov_preventiveReviewed: 'Reviewed; current or requested',
    ov_aims: 'N/A',
    ov_hospitalization: 'None',
    ov_logsReviewed: 'N/A (no logs in place)',
    ov_hrst: 'Current',
    ov_educationResponse: 'Restated that he can call the office with concerns.',
    ov_choicesMade: 'Chose to meet in the kitchen; declined a morning visit next month.',
    ov_goalProgress: 'Blood pressure goal on track; log reviewed.',
    ov_quarterly: 'Not due this visit',
    ov_actions: 'Requested renewal of lisinopril order from Dr. Patel.',
    ov_nextVisit: 'Mid-September 2026',
    q61_signature: 'data:image/png;base64,xxx',
  };
}

describe('getOversightIncomplete', () => {
  it('passes a complete note', () => {
    expect(getOversightIncomplete(completeNote())).toEqual([]);
  });

  it('flags each missing required field, in document order', () => {
    const d = completeNote();
    delete d.ov_interactions;
    delete d.ov_choicesMade;
    const keys = getOversightIncomplete(d).map((i) => i.key);
    expect(keys).toEqual(['ov_interactions', 'ov_choicesMade']);
  });

  it('requires the quarterly summary when the review is completed OR the visit is a quarterly review', () => {
    const d = completeNote();
    d.ov_quarterly = 'Completed this visit';
    expect(getOversightIncomplete(d).map((i) => i.key)).toEqual(['ov_quarterlySummary']);
    d.ov_quarterlySummary = 'Data reviewed for the quarter; BP trending down; goal progressing.';
    expect(getOversightIncomplete(d)).toEqual([]);
    d.ov_quarterly = 'Not due this visit';
    delete d.ov_quarterlySummary;
    expect(getOversightIncomplete(d)).toEqual([]);
    // Declaring the VISIT a quarterly review binds the summary too — a
    // quarterly-review visit can't submit with "not due" and no summary.
    d.ov_visitType = 'Quarterly review';
    expect(getOversightIncomplete(d).map((i) => i.key)).toEqual(['ov_quarterlySummary']);
  });

  it('an empty form reports every unconditional requirement', () => {
    const issues = getOversightIncomplete({});
    expect(issues.length).toBeGreaterThan(15);
    expect(issues[0].key).toBe('q3_clientName'); // first thing the scroll lands on
    expect(issues.map((i) => i.key)).toContain('q61_signature');
  });
});

describe('getOversightIncomplete: vitals (rev 3)', () => {
  const VITALS = ['q16_temperature', 'q16_temperatureRoute', 'q17_systolic', 'q17_diastolic', 'q17_bloodPressure', 'q18_pulse', 'q19_respiration', 'q20_oxygenSaturation', 'q21_oxygenSource'];
  const noVitals = (rev: string) => {
    const d = completeNote();
    d.q1_formRev = rev;
    for (const k of VITALS) delete d[k];
    return d;
  };

  it('requires every vital on a rev 3 note, right after the general condition', () => {
    expect(getOversightIncomplete(noVitals('3')).map((i) => i.key)).toEqual([
      'q16_temperature',
      'q17_bloodPressure',
      'q18_pulse',
      'q19_respiration',
      'q20_oxygenSaturation',
    ]);
  });

  it('never asks a visit filed before vitals existed (rev 2) for them', () => {
    expect(getOversightIncomplete(noVitals('2'))).toEqual([]);
  });

  it('an "unable to obtain vitals" reason covers the blanks', () => {
    const d = noVitals('3');
    d.q16_vitalsNotObtainedReason = 'Individual refused';
    expect(getOversightIncomplete(d)).toEqual([]);
  });

  it('asks for the route and oxygen source once their readings are in', () => {
    const d = completeNote();
    delete d.q16_temperatureRoute;
    delete d.q21_oxygenSource;
    expect(getOversightIncomplete(d).map((i) => i.key)).toEqual(['q16_temperatureRoute', 'q21_oxygenSource']);
  });

  it('BP is optional under age 3 and satisfied by its own reason', () => {
    const d = completeNote();
    delete d.q17_systolic;
    delete d.q17_diastolic;
    delete d.q17_bloodPressure;
    expect(getOversightIncomplete(d).map((i) => i.key)).toEqual(['q17_bloodPressure']);
    d.q17_bpNotObtainedReason = 'Individual refused';
    expect(getOversightIncomplete(d)).toEqual([]);
    delete d.q17_bpNotObtainedReason;
    d.q5_ageYears = '2';
    d.q4_dateofBirth = '';
    expect(getOversightIncomplete(d)).toEqual([]);
  });
});

describe('orders and MAR answers (rev 3)', () => {
  it('a discrepancy or not-reviewed answer requires the medication notes', () => {
    for (const [key, value] of [
      ['ov_ordersVerified', MED_REVIEW_DISCREPANCIES],
      ['ov_ordersVerified', MED_REVIEW_NOT_REVIEWED],
      ['ov_marReviewed', MED_REVIEW_DISCREPANCIES],
      ['ov_marReviewed', MED_REVIEW_NOT_REVIEWED],
    ]) {
      const d = completeNote();
      d[key] = value;
      expect(getOversightIncomplete(d).map((i) => i.key)).toEqual(['ov_medsNotes']);
      d.ov_medsNotes = 'Requested the hydroxyzine prescriber from the home manager on 10/08.';
      expect(getOversightIncomplete(d)).toEqual([]);
    }
  });

  it('a pre-rev-3 note with a bare "No" and no notes is not blocked on amend', () => {
    const d = completeNote();
    d.q1_formRev = '2';
    d.ov_ordersVerified = 'No';
    expect(getOversightIncomplete(d)).toEqual([]);
  });

  it('a "No" carried into a rev 3 note still requires the notes', () => {
    const d = completeNote();
    d.ov_marReviewed = 'No';
    expect(getOversightIncomplete(d).map((i) => i.key)).toEqual(['ov_medsNotes']);
  });
});

describe('visit location', () => {
  it('requires a choice, and the place itself for "Other"', () => {
    const d = completeNote();
    delete d.ov_locationChoice;
    expect(getOversightIncomplete(d).map((i) => i.key)).toEqual(['ov_locationChoice']);
    d.ov_locationChoice = 'Other';
    expect(getOversightIncomplete(d).map((i) => i.key)).toEqual(['ov_locationOther']);
    d.ov_locationOther = "Grandmother's house";
    expect(getOversightIncomplete(d)).toEqual([]);
  });

  it('prints the choice, or the typed place for "Other"', () => {
    expect(locationFromChoice("Client's Home", 'ignored')).toBe("Client's Home");
    expect(locationFromChoice('Other', '  Library  ')).toBe('Library');
  });

  it('maps free-text locations from before the dropdown', () => {
    expect(locationChoiceFor("Client's Home")).toEqual({ choice: "Client's Home", other: '' });
    expect(locationChoiceFor("individual's home")).toEqual({ choice: "Client's Home", other: '' });
    expect(locationChoiceFor('Client\u2019s home')).toEqual({ choice: "Client's Home", other: '' });
    expect(locationChoiceFor('Home')).toEqual({ choice: "Client's Home", other: '' });
    expect(locationChoiceFor('day program')).toEqual({ choice: 'Day Program', other: '' });
    expect(locationChoiceFor('Emory clinic')).toEqual({ choice: 'Other', other: 'Emory clinic' });
    expect(locationChoiceFor('')).toEqual({ choice: '', other: '' });
  });
});

describe('isOversightNote', () => {
  it('discriminates by noteType', () => {
    expect(isOversightNote(completeNote())).toBe(true);
    expect(isOversightNote({ q3_clientName: 'A shift note' })).toBe(false);
    expect(isOversightNote(null)).toBe(false);
    expect(isOversightNote(undefined)).toBe(false);
  });
});
