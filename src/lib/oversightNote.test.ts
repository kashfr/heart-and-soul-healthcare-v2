import { describe, it, expect } from 'vitest';
import {
  getOversightIncomplete,
  isOversightNote,
  OVERSIGHT_NOTE_TYPE,
} from './oversightNote';

/** A fully complete oversight note as the flat merged record. */
function completeNote(): Record<string, string> {
  return {
    noteType: OVERSIGHT_NOTE_TYPE,
    q1_formRev: '2',
    q2_program: 'now-comp',
    q2_serviceLevel: 'rn-oversight',
    patientId: 'abc123',
    q3_clientName: 'Neal Kelly',
    q4_dateofBirth: '1985-06-07',
    q6_dateofService: '2026-08-15',
    ov_timeIn: '10:00',
    ov_timeOut: '11:15',
    ov_location: "Individual's home",
    ov_visitType: 'Routine oversight',
    q11_nurseName: 'Souz Payne',
    q12_credential: 'RN',
    ov_generalCondition: 'Stable; no changes since last visit.',
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

  it('requires the quarterly summary only when the quarterly review was completed', () => {
    const d = completeNote();
    d.ov_quarterly = 'Completed this visit';
    expect(getOversightIncomplete(d).map((i) => i.key)).toEqual(['ov_quarterlySummary']);
    d.ov_quarterlySummary = 'Data reviewed for the quarter; BP trending down; goal progressing.';
    expect(getOversightIncomplete(d)).toEqual([]);
    d.ov_quarterly = 'Not due this visit';
    delete d.ov_quarterlySummary;
    expect(getOversightIncomplete(d)).toEqual([]);
  });

  it('an empty form reports every unconditional requirement', () => {
    const issues = getOversightIncomplete({});
    expect(issues.length).toBeGreaterThan(15);
    expect(issues[0].key).toBe('q3_clientName'); // first thing the scroll lands on
    expect(issues.map((i) => i.key)).toContain('q61_signature');
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
