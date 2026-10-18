import { describe, expect, it } from 'vitest';
import {
  ageAt, changedPhoneIntakeFields, emptyPhoneReferral, formatPhone, phoneReferralDetails, phoneReferralFromBody,
  phoneReferralFromIntake, programLabel, toPhoneIntake, validatePhoneReferral,
  type PhoneReferralInput,
} from './phoneReferralShared';
import { planFromReferral } from './referralConvertShared';

const TODAY = '2026-10-17';
const base = (over: Partial<PhoneReferralInput> = {}): PhoneReferralInput => ({
  ...emptyPhoneReferral(),
  callerName: 'Marcus Reed',
  callerPhone: '404-555-1212',
  clientName: 'Jayden Reed',
  ...over,
});
const row = (rows: { label: string; value: string }[], label: string) => rows.find((r) => r.label === label)?.value ?? '';

describe('validatePhoneReferral', () => {
  it('needs only the caller, a callback number, and the client', () => {
    expect(validatePhoneReferral(base(), TODAY)).toEqual({});
    expect(Object.keys(validatePhoneReferral(emptyPhoneReferral(), TODAY))).toEqual(['callerName', 'callerPhone', 'clientName']);
  });
  it('checks what was entered', () => {
    const e = validatePhoneReferral(base({ callerPhone: '555-1212', callerEmail: 'nope', dob: '2027-01-01', county: 'Atlantis', zip: '3004' }), TODAY);
    expect(Object.keys(e).sort()).toEqual(['callerEmail', 'callerPhone', 'county', 'dob', 'zip']);
  });
  it('takes an 11-digit number with a leading 1, and rejects an extra digit', () => {
    expect(validatePhoneReferral(base({ callerPhone: '1 (404) 555-1212' }), TODAY)).toEqual({});
    expect(validatePhoneReferral(base({ callerPhone: '40455512129' }), TODAY).callerPhone).toBe('Enter a 10-digit phone number.');
  });
});

describe('phoneReferralDetails', () => {
  const full = base({
    callerRelationship: 'Parent',
    dob: '2025-03-02',
    program: 'gapp',
    county: 'Gwinnett',
    street: '12 Oak St',
    city: 'Lawrenceville',
    zip: '30046',
    diagnosis: 'Trach and vent dependent',
    service: 'nursing',
    hospitalStatus: 'In the hospital now',
    hospitalName: 'CHOA Egleston',
    expectedDischarge: '2026-10-30',
    physicianName: 'Dr. Ada Lin',
    physicianPhone: '7705551234',
    callNotes: 'Call back after 3 PM.',
  });

  it('labels the rows the way the website intake does', () => {
    const rows = phoneReferralDetails(full, TODAY, 'Kaheem Freeman');
    expect(row(rows, 'Taken by phone')).toBe('Call taken by Kaheem Freeman');
    expect(row(rows, 'Date of birth')).toBe('03/02/2025');
    expect(row(rows, 'Age')).toBe('1 year');
    expect(row(rows, 'Address')).toBe('12 Oak St, Lawrenceville, GA 30046');
    expect(row(rows, "Member's Medicaid ID")).toBe('Not given yet (caller will provide)');
    expect(row(rows, 'Primary care need')).toBe('Skilled nursing');
    expect(row(rows, 'Hospital')).toBe('CHOA Egleston');
    expect(row(rows, 'Expected discharge')).toBe('10/30/2026');
    expect(row(rows, 'Physician phone')).toBe('(770) 555-1234');
    expect(row(rows, 'Call notes')).toBe('Call back after 3 PM.');
  });

  it('feeds Create Client Record', () => {
    const plan = planFromReferral({ clientName: 'Jayden Reed', program: programLabel('gapp'), details: phoneReferralDetails(full, TODAY, '') });
    expect(plan).toMatchObject({
      dob: '2025-03-02',
      street: '12 Oak St',
      city: 'Lawrenceville',
      state: 'GA',
      zip: '30046',
      diagnosis: 'Trach and vent dependent',
      program: 'gapp',
      clinical: { physicianName: 'Dr. Ada Lin', physicianPhone: '7705551234', medicaidId: '' },
    });
  });

  it('drops hospital rows when the client is at home, and keeps a city without a street', () => {
    const rows = phoneReferralDetails(base({ hospitalStatus: 'At home', hospitalName: 'CHOA', expectedDischarge: '2026-10-30', city: 'Macon' }), TODAY, '');
    expect(row(rows, 'Hospital')).toBe('');
    expect(row(rows, 'Expected discharge')).toBe('');
    expect(row(rows, 'Address')).toBe('');
    expect(row(rows, 'City')).toBe('Macon');
  });
});

describe('helpers', () => {
  it('formats phones and ages', () => {
    expect(formatPhone('14045551212')).toBe('(404) 555-1212');
    expect(formatPhone('470-783-4812')).toBe('(470) 783-4812');
    expect(ageAt('2026-04-20', TODAY)).toBe('5 months');
    expect(ageAt('2027-01-01', TODAY)).toBe('');
  });
  it('labels programs like the website forms', () => {
    expect(programLabel('gapp')).toBe('GAPP - Georgia Pediatric Program');
    expect(programLabel('')).toBe('');
  });
});

describe('editing', () => {
  it('keeps the answers without the assignee, and reopens them', () => {
    const intake = toPhoneIntake(base({ assigneeUid: 'va1', county: 'Gwinnett ' }));
    expect(intake).not.toHaveProperty('assigneeUid');
    expect(intake.county).toBe('Gwinnett');
    expect(phoneReferralFromIntake(intake)).toMatchObject({ callerName: 'Marcus Reed', county: 'Gwinnett', assigneeUid: '' });
    expect(phoneReferralFromIntake(null)).toEqual(emptyPhoneReferral());
  });
  it('names the fields an edit changed, in form order', () => {
    const before = toPhoneIntake(base({ county: 'Gwinnett' }));
    const after = toPhoneIntake(base({ county: 'Fulton', callerName: 'Marcus T. Reed', callNotes: 'x' }));
    expect(changedPhoneIntakeFields(before, after)).toEqual(['caller’s name', 'county', 'call notes']);
    expect(changedPhoneIntakeFields(before, before)).toEqual([]);
  });
  it('reads only strings from a request body and checks the service', () => {
    const r = phoneReferralFromBody({ callerName: 'A', county: 7, service: 'surgery' });
    expect(r.callerName).toBe('A');
    expect(r.county).toBe('');
    expect(r.service).toBe('');
  });
  it('keeps a physician extension', () => {
    expect(row(phoneReferralDetails(base({ physicianPhone: '7705551234145' }), TODAY, ''), 'Physician phone')).toBe('(770) 555-1234 ext. 145');
  });
});
