import { describe, expect, it } from 'vitest';
import {
  addDaysISO,
  developedWithLabel,
  EMPTY_REVIEW_INPUT,
  lastReviewedISO,
  planDifferences,
  sanitizeReviewInput,
  SERVICE_PLAN_MAX_DAYS,
  validateReview,
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
    // The caregiver block is optional (covered below).
    const required = SERVICE_PLAN_ERROR_ORDER.filter((k) => k !== 'caregiverName' && k !== 'caregiverSignature');
    for (const k of required) expect(e[k], k).toBeTruthy();
    expect(Object.keys(e).length).toBe(required.length);
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
      reviews: [],
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
    const plan = { ...complete, id: 'plan1', clientName: '', dob: '', signedDate: '', createdAt: null, createdBy: '', createdByName: '', documentId: '', reviews: [], supervisorName: 'Kaheem Freeman', supervisorCredentials: 'RN' } as ServicePlanRecord;
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

describe('caregiver signature block', () => {
  it('is optional, but a name needs a signature and a signature needs a name', () => {
    expect(validateServicePlan(complete)).toEqual({});
    expect(validateServicePlan({ ...complete, caregiverName: 'Jane Doe' }).caregiverSignature).toBeTruthy();
    expect(validateServicePlan({ ...complete, caregiverSignature: 'data:image/png;base64,x=' }).caregiverName).toBeTruthy();
    expect(validateServicePlan({ ...complete, caregiverName: 'Jane Doe', caregiverSignature: 'data:image/png;base64,x=' })).toEqual({});
  });

  it('is cleared on a revision, along with who the plan was developed with', () => {
    const plan = { ...complete, id: 'p', clientName: '', dob: '', signedDate: '', createdAt: null, createdBy: '', createdByName: '', documentId: '', reviews: [], caregiverName: 'Jane', caregiverSignature: 'data:image/png;base64,x=', developedWith: ['client' as const], developedWithNotes: 'Mom' } as ServicePlanRecord;
    const d = draftFromPlan(plan, { name: 'A', credentials: 'RN' });
    expect([d.caregiverName, d.caregiverSignature, d.developedWith, d.developedWithNotes]).toEqual(['', '', [], '']);
  });

  it('labels who the plan was developed with', () => {
    expect(developedWithLabel(['client', 'physician'], 'Dr. Patel by phone')).toBe('Client, Personal physician (Dr. Patel by phone)');
    expect(developedWithLabel([], '')).toBe('');
  });
});

describe('review clock', () => {
  it('counts from the newest of the signing and the reviews, 62 days out', () => {
    const r = (d: string) => ({ reviewedDate: d }) as never;
    expect(lastReviewedISO({ signedDate: '2026-07-01', reviews: [] })).toBe('2026-07-01');
    expect(lastReviewedISO({ signedDate: '2026-07-01', reviews: [r('2026-08-30'), r('2026-08-01')] })).toBe('2026-08-30');
    expect(SERVICE_PLAN_MAX_DAYS).toBe(62);
    expect(addDaysISO('2026-09-28', 62)).toBe('2026-11-29');
    expect(addDaysISO('2026-03-07', 1)).toBe('2026-03-08');
  });
});

describe('planDifferences', () => {
  const cur = { diagnosis: 'Seizure disorder', allergies: 'NKDA', diet: '', activeMeds: ['Keppra'], inactiveMeds: [], tasks: [] };
  const plan = { diagnosis: 'Seizure Disorder.', allergies: 'nkda', nutritionalNeeds: 'Pureed', medications: 'Keppra, 500 mg, PO, BID', descriptionOfServices: 'Vital signs (Every shift)' };

  it('finds nothing when only case and punctuation differ, and skips blank record fields', () => {
    expect(planDifferences(plan, cur)).toEqual([]);
  });

  it('names each real difference', () => {
    const diffs = planDifferences(plan, {
      ...cur,
      allergies: 'Penicillin',
      activeMeds: ['Keppra', 'Clonazepam'],
      inactiveMeds: ['Tylenol'],
      tasks: ['Vital signs', 'Tracheostomy site care'],
    });
    expect(diffs).toEqual([
      'Allergies: the client record now says "Penicillin".',
      'Medication on the MAR but not in the plan: Clonazepam.',
      'Care-plan task not in the description of services: Tracheostomy site care.',
    ]);
  });

  it('flags a medication in the plan that is no longer active, unless another order for it is', () => {
    const p = { ...plan, medications: 'Keppra 500 mg\nTylenol 500 mg PRN' };
    expect(planDifferences(p, { ...cur, inactiveMeds: ['Tylenol'] })).toEqual(['Medication in the plan but no longer active on the MAR: Tylenol.']);
    expect(planDifferences(p, { ...cur, activeMeds: ['Keppra', 'Tylenol'], inactiveMeds: ['Tylenol'] })).toEqual([]);
  });
});

describe('validateReview', () => {
  const ok = { ...EMPTY_REVIEW_INPUT, attested: true, reviewerName: 'K', reviewerCredentials: 'RN', signature: 'data:image/png;base64,x=' };
  it('needs the attestation, name, credentials and signature', () => {
    expect(validateReview(ok)).toEqual({});
    expect(Object.keys(validateReview(EMPTY_REVIEW_INPUT)).sort()).toEqual(['attested', 'reviewerCredentials', 'reviewerName', 'signature']);
  });
  it('needs an explanation when differences were shown', () => {
    const withDiffs = { ...ok, differencesAcknowledged: ['Allergies changed'] };
    expect(validateReview(withDiffs).note).toBeTruthy();
    expect(validateReview({ ...withDiffs, note: 'Penicillin was already known; no change.' })).toEqual({});
  });
  it('sanitizes the body', () => {
    expect(sanitizeReviewInput({ attested: 'true', note: 5, differencesAcknowledged: 'x' })).toEqual({ ...EMPTY_REVIEW_INPUT, note: '5' });
  });
});
