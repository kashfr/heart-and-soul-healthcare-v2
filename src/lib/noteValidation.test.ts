import { describe, it, expect } from 'vitest';
import {
  flattenDraft,
  getIncompleteRequired,
  getDraftIncompleteRequired,
} from './noteValidation';

// A fully-complete RN note as a flat map. Helpers below clone + mutate it.
function completeRN(): Record<string, string> {
  return {
    q3_clientName: 'Sapphire Simmons',
    q4_dateofBirth: '2023-10-26',
    q10_primaryDiagnosis: 'CP, Quadriplegic',
    q200_addr_line1: '3378 Greenbriar Pkwy',
    q200_city: 'Atlanta',
    q200_state: 'GA',
    q200_postal: '30331',
    q6_dateofService: '2026-05-26',
    q7_shiftStart: '07:26',
    q11_nurseName: 'Olayemi Akande',
    q12_credential: 'RN',
    q16_temperature: '97.5',
    q17_systolic: '120',
    q17_diastolic: '80',
    q18_pulse: '110',
    q19_respiration: '24',
    q20_oxygenSaturation: '95',
    q39_interventionDetails: 'Provided skilled care...',
    q62_shiftEndDate: '2026-05-26',
    q62_shiftEndTime: '18:36',
    q60_oncomingCaregiver: 'Jane Doe',
    q60_handoffTime: '18:36',
    q60_verbalReport: 'Handoff complete.',
    q60_conditionAtEnd: 'Stable',
    q65_certification: 'certified',
    q61_signature: 'data:image/png;base64,xxx',
  };
}

const keys = (data: Record<string, string>) =>
  getIncompleteRequired(data).map((i) => i.key);

describe('getIncompleteRequired', () => {
  it('returns no issues for a complete RN note', () => {
    expect(getIncompleteRequired(completeRN())).toEqual([]);
  });

  it('flags client condition at shift end when not selected', () => {
    const d = completeRN();
    delete d.q60_conditionAtEnd;
    expect(keys(d)).toContain('q60_conditionAtEnd');
  });

  it('flags every required field on a blank note', () => {
    const issues = getIncompleteRequired({ q12_credential: 'RN' });
    // client name, signature, and a vital should all be present
    expect(issues.map((i) => i.key)).toContain('q3_clientName');
    expect(issues.map((i) => i.key)).toContain('q61_signature');
    expect(issues.map((i) => i.key)).toContain('q16_temperature');
    // ordered by tab — first issue should be on tab 1
    expect(issues[0].tab).toBe(1);
  });

  describe('blood pressure', () => {
    it('is satisfied by a full reading', () => {
      expect(keys(completeRN())).not.toContain('q17_bloodPressure');
    });

    it('is satisfied by an "unable to obtain" reason with no reading', () => {
      const d = completeRN();
      delete d.q17_systolic;
      delete d.q17_diastolic;
      d.q17_bpNotObtainedReason = 'Patient refused';
      expect(keys(d)).not.toContain('q17_bloodPressure');
    });

    it('is flagged when neither a reading nor a reason is present', () => {
      const d = completeRN();
      delete d.q17_systolic;
      delete d.q17_diastolic;
      expect(keys(d)).toContain('q17_bloodPressure');
    });

    it('is flagged when only one of the two numbers is present', () => {
      const d = completeRN();
      delete d.q17_diastolic;
      expect(keys(d)).toContain('q17_bloodPressure');
    });
  });

  describe('section-level "unable to obtain vitals" reason', () => {
    const VITAL_KEYS = [
      'q16_temperature',
      'q17_systolic',
      'q17_diastolic',
      'q18_pulse',
      'q19_respiration',
      'q20_oxygenSaturation',
    ];

    it('satisfies every vital when none could be obtained', () => {
      const d = completeRN();
      for (const k of VITAL_KEYS) delete d[k];
      d.q16_vitalsNotObtainedReason = 'Parent/guardian refused';
      expect(getIncompleteRequired(d)).toEqual([]);
    });

    it('covers only the blank vitals in a partial set', () => {
      const d = completeRN();
      delete d.q17_systolic;
      delete d.q17_diastolic;
      delete d.q20_oxygenSaturation;
      d.q16_vitalsNotObtainedReason = 'Unable to tolerate / uncooperative';
      expect(getIncompleteRequired(d)).toEqual([]);
    });

    it('still flags missing vitals when no reason is documented', () => {
      const d = completeRN();
      delete d.q18_pulse;
      delete d.q20_oxygenSaturation;
      expect(keys(d)).toContain('q18_pulse');
      expect(keys(d)).toContain('q20_oxygenSaturation');
    });
  });

  describe('credential gating', () => {
    it('does not require vitals for an HHA', () => {
      const d = completeRN();
      d.q12_credential = 'HHA';
      delete d.q16_temperature;
      delete d.q17_systolic;
      delete d.q17_diastolic;
      delete d.q18_pulse;
      delete d.q19_respiration;
      delete d.q20_oxygenSaturation;
      delete d.q39_interventionDetails; // HHA skips skilled nursing too
      expect(getIncompleteRequired(d)).toEqual([]);
    });

    it('requires the intervention narrative for LPN/RN but not CNA', () => {
      const rn = completeRN();
      delete rn.q39_interventionDetails;
      expect(keys(rn)).toContain('q39_interventionDetails');

      const cna = completeRN();
      cna.q12_credential = 'CNA';
      delete cna.q39_interventionDetails;
      expect(keys(cna)).not.toContain('q39_interventionDetails');
    });
  });

  describe('conditional sections', () => {
    it('requires the nutrition note only when aspiration concerns = Yes', () => {
      const off = completeRN();
      expect(keys(off)).not.toContain('q38_nutritionNotes');

      const on = completeRN();
      on.q38_aspirationConcerns = 'Yes';
      expect(keys(on)).toContain('q38_nutritionNotes');
    });

    it('requires physician details only when physician was notified', () => {
      const off = completeRN();
      expect(keys(off)).not.toContain('q53_physicianName');

      const on = completeRN();
      on.q52_physicianNotify = 'Yes';
      const k = keys(on);
      expect(k).toContain('q53_physicianName');
      expect(k).toContain('q54_notificationTime');
      expect(k).toContain('q52_notifyMethod');
      expect(k).toContain('q52_infoReported');
      expect(k).toContain('q55_physicianOrders');
    });
  });
});

describe('flattenDraft', () => {
  it('merges formValues, radioState, and checkboxState into one map', () => {
    const flat = flattenDraft({
      formValues: { q3_clientName: 'Test', q5_ageYears: 2 },
      radioState: { q52_physicianNotify: 'Yes' },
      checkboxState: { q65_certification: ['certified'] },
    });
    expect(flat.q3_clientName).toBe('Test');
    expect(flat.q5_ageYears).toBe('2'); // numbers stringified
    expect(flat.q52_physicianNotify).toBe('Yes');
    expect(flat.q65_certification).toBe('certified');
  });

  it('joins multi-value checkbox groups with ", "', () => {
    const flat = flattenDraft({
      checkboxState: { q38_interventions: ['Wound care', 'Catheter care'] },
    });
    expect(flat.q38_interventions).toBe('Wound care, Catheter care');
  });

  it('getDraftIncompleteRequired runs end-to-end off a draft shape', () => {
    const issues = getDraftIncompleteRequired({
      formValues: { q12_credential: 'RN' },
      radioState: {},
      checkboxState: {},
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.map((i) => i.key)).toContain('q61_signature');
  });
});
