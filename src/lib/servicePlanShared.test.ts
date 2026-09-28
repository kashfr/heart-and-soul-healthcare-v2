import { describe, expect, it } from 'vitest';
import {
  draftFromPlan,
  EMPTY_SERVICE_PLAN_INPUT,
  medicationsText,
  sanitizeServicePlanInput,
  SERVICE_PLAN_ERROR_ORDER,
  serviceTypesLabel,
  servicesTextFromTasks,
  specialDietLabel,
  validateServicePlan,
  type ServicePlanInput,
  type ServicePlanRecord,
} from './servicePlanShared';

const complete: ServicePlanInput = {
  ...EMPTY_SERVICE_PLAN_INPUT,
  patientId: 'p1',
  address: '1 Main St, Atlanta, GA 30309',
  diagnosis: 'Cerebral palsy',
  functionalLimitations: 'Non-ambulatory; total assist with transfers.',
  serviceTypes: ['nursing'],
  nutritionalNeeds: 'Pureed diet',
  allergies: 'No known allergies',
  expectedTimesFrequency: 'Monday through Friday, 8 AM to 4 PM',
  expectedDuration: 'Ongoing',
  descriptionOfServices: 'Skilled nursing: medication administration, G-tube feeds.',
  regularDiet: 'no',
  tubBath: 'no',
  bedBath: 'yes',
  lotionToBack: 'yes',
  goals: [{ goal: 'Skin stays intact', objective: 'Reposition every 2 hours' }],
  medications: 'Keppra 500 mg, PO, BID',
  dischargePlans: 'Family assumes care when nursing hours end.',
  supervisorName: 'S. Lilian Payne',
  supervisorCredentials: 'RN',
  signature: 'data:image/png;base64,abc=',
};

describe('validateServicePlan', () => {
  it('accepts a complete plan', () => {
    expect(validateServicePlan(complete)).toEqual({});
  });

  it('names every blank required line, in display order', () => {
    const e = validateServicePlan(EMPTY_SERVICE_PLAN_INPUT);
    for (const k of SERVICE_PLAN_ERROR_ORDER) expect(e[k], k).toBeTruthy();
    expect(Object.keys(e).length).toBe(SERVICE_PLAN_ERROR_ORDER.length);
  });

  it('leaves the optional lines optional', () => {
    const e = validateServicePlan({ ...complete, specialTreatments: '', specialEquipment: '', behaviors: '', specialDiets: [], specialDietOther: '' });
    expect(e).toEqual({});
  });

  it('requires at least one used goal, and both halves of every used row', () => {
    expect(validateServicePlan({ ...complete, goals: [{ goal: '', objective: '' }] }).goals).toMatch(/at least one goal/);
    expect(validateServicePlan({ ...complete, goals: [{ goal: 'Only a goal', objective: '' }] }).goals).toMatch(/needs an objective/);
    // A trailing blank row (the spare row on the form) is ignored.
    expect(validateServicePlan({ ...complete, goals: [...complete.goals, { goal: '', objective: '' }] }).goals).toBeUndefined();
  });

  it('requires a Yes/No answer, not just any string', () => {
    expect(validateServicePlan({ ...complete, regularDiet: 'maybe' as never }).regularDiet).toBeTruthy();
  });
});

describe('sanitizeServicePlanInput', () => {
  it('drops unknown keys and values, caps text, and keeps a spare goal row', () => {
    const out = sanitizeServicePlanInput({
      patientId: ' p1 ',
      serviceTypes: ['nursing', 'bogus'],
      specialDiets: ['low-fat', 'keto'],
      regularDiet: 'YES',
      tubBath: 'yes',
      goals: [],
      diagnosis: 'x'.repeat(2000),
      extra: 'ignored',
    });
    expect(out.patientId).toBe('p1');
    expect(out.serviceTypes).toEqual(['nursing']);
    expect(out.specialDiets).toEqual(['low-fat']);
    expect(out.regularDiet).toBe('');
    expect(out.tubBath).toBe('yes');
    expect(out.goals).toEqual([{ goal: '', objective: '' }]);
    expect(out.diagnosis.length).toBe(1000);
    expect('extra' in out).toBe(false);
  });
});

describe('draftFromPlan', () => {
  it('carries the plan over but never the signature or the earlier signer', () => {
    const plan: ServicePlanRecord = {
      ...complete,
      id: 'plan1',
      clientName: 'ZZ Test Client',
      dob: '2010-01-01',
      signedDate: '2026-01-15',
      createdAt: null,
      createdBy: 'u1',
      createdByName: 'S. Lilian Payne',
      documentId: 'd1',
      goals: [...complete.goals, { goal: '', objective: '' }],
    };
    const d = draftFromPlan(plan, { name: 'Kaheem Freeman', credentials: '' });
    expect(d.diagnosis).toBe('Cerebral palsy');
    expect(d.goals).toEqual(complete.goals);
    expect(d.signature).toBe('');
    expect(d.supervisorName).toBe('Kaheem Freeman');
    expect(d.supervisorCredentials).toBe('');
    expect(d.revisesPlanId).toBe('plan1');
  });

  it('keeps the credentials the same signer typed before when the profile has none', () => {
    const plan = { ...complete, id: 'plan1', clientName: '', dob: '', signedDate: '', createdAt: null, createdBy: '', createdByName: '', documentId: '', supervisorName: 'Kaheem Freeman', supervisorCredentials: 'RN' } as ServicePlanRecord;
    expect(draftFromPlan(plan, { name: 'kaheem freeman ', credentials: '' }).supervisorCredentials).toBe('RN');
    expect(draftFromPlan(plan, { name: 'Kaheem Freeman', credentials: 'MSN, RN' }).supervisorCredentials).toBe('MSN, RN');
    expect(draftFromPlan(plan, { name: 'S. Lilian Payne', credentials: '' }).supervisorCredentials).toBe('');
  });
});

describe('prefill text', () => {
  it('lists medications one per line the way the MAR prints them', () => {
    expect(medicationsText([
      { medName: 'Keppra', dose: '500', units: 'mg', route: 'PO', frequency: 'Twice daily (BID)' },
      { medName: 'Tylenol', dose: '', units: '', route: 'PO', frequency: 'Every 6 hours (Q6H) as needed (PRN)' },
    ])).toBe('Keppra, 500 mg, PO, Twice daily (BID)\nTylenol, PO, Every 6 hours (Q6H) as needed (PRN)');
  });

  it('turns care-plan tasks into service lines', () => {
    expect(servicesTextFromTasks([
      { name: 'G-tube feeding', frequency: 'Every shift', instructions: 'Flush 30 mL before and after' },
      { name: 'Range of motion' },
      { name: '' },
    ])).toBe('G-tube feeding (Every shift): Flush 30 mL before and after\nRange of motion');
  });

  it('labels the checked boxes the way the paper form reads', () => {
    expect(serviceTypesLabel(['nursing', 'companion-sitter'])).toBe('Companion/Sitter, Nursing');
    expect(specialDietLabel(['low-salt'], ' diabetic ')).toBe('Low salt, Other: diabetic');
    expect(specialDietLabel([], '')).toBe('');
  });
});
