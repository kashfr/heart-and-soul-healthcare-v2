import { describe, expect, it } from 'vitest';
import {
  cleanMedicaidId,
  defaultPpotNote,
  latestAuthEnd,
  ppotSubjectFromReferral,
  recertStatus,
  validatePpotSendInput,
} from './ppotShared';

describe('cleanMedicaidId', () => {
  it('keeps a real ID, stripped of spaces and dashes', () => {
    expect(cleanMedicaidId('1234 5678 9012')).toBe('123456789012');
    expect(cleanMedicaidId('ab-123456')).toBe('AB123456');
  });
  it('drops placeholders so the physician fills it in', () => {
    expect(cleanMedicaidId('Will provide later')).toBe('');
    expect(cleanMedicaidId('N/A')).toBe('');
    expect(cleanMedicaidId('none')).toBe('');
    expect(cleanMedicaidId('')).toBe('');
    expect(cleanMedicaidId('123')).toBe('');
  });
});

describe('ppotSubjectFromReferral', () => {
  it('reads our own form (Medicaid # plus the physician section)', () => {
    const s = ppotSubjectFromReferral({
      id: 'r1',
      clientName: 'Jane Doe',
      stage: 'assessment',
      details: [
        { label: 'Date of birth', value: '01/02/2015' },
        { label: 'Medicaid #', value: '123456789012' },
        { label: "Child's physician", value: 'Dr. Patel' },
        { label: 'Physician office', value: 'Peachtree Pediatrics' },
        { label: 'Physician fax', value: '(404) 555-0101' },
      ],
    });
    expect(s).toMatchObject({ kind: 'referral', name: 'Jane Doe', dob: '01/02/2015', medicaidId: '123456789012', physicianName: 'Dr. Patel', physicianOffice: 'Peachtree Pediatrics', physicianFax: '4045550101', context: 'assessment' });
  });
  it('reads the GAPP website label and treats "Will provide later" as unknown', () => {
    const s = ppotSubjectFromReferral({ id: 'r2', clientName: 'Sam', details: [{ label: "Member's Medicaid ID", value: 'Will provide later' }] });
    expect(s.medicaidId).toBe('');
    expect(s.physicianFax).toBe('');
    const t = ppotSubjectFromReferral({ id: 'r3', clientName: 'Ann', details: [{ label: "Member's Medicaid ID", value: '999888777666' }] });
    expect(t.medicaidId).toBe('999888777666');
  });
});

describe('latestAuthEnd', () => {
  it('picks the latest valid end date', () => {
    expect(latestAuthEnd([{ to: '2026-10-31' }, { to: '2027-04-30' }, { to: '' }, { to: null }, { to: 'junk' }])).toBe('2027-04-30');
    expect(latestAuthEnd([])).toBe('');
  });
});

describe('recertStatus', () => {
  const base = { authEnd: '2026-11-07', leadDays: 45, lastRequestDate: '' };
  it('is due inside the 45-day window with no request yet', () => {
    expect(recertStatus({ ...base, today: '2026-09-24' })).toEqual({ due: true, daysLeft: 44, requestedThisCycle: false });
  });
  it('is not due before the window opens', () => {
    expect(recertStatus({ ...base, today: '2026-09-20' }).due).toBe(false);
  });
  it('stops once a request went out this cycle, including an early one', () => {
    expect(recertStatus({ ...base, today: '2026-10-01', lastRequestDate: '2026-09-25' }).due).toBe(false);
    expect(recertStatus({ ...base, today: '2026-10-01', lastRequestDate: '2026-08-25' }).due).toBe(false);
  });
  it("ignores last cycle's request", () => {
    expect(recertStatus({ ...base, today: '2026-10-01', lastRequestDate: '2026-05-01' }).due).toBe(true);
  });
  it('keeps flagging for a grace period after the end, then gives up', () => {
    expect(recertStatus({ ...base, today: '2026-11-20' }).due).toBe(true);
    expect(recertStatus({ ...base, today: '2026-12-20' }).due).toBe(false);
  });
  it('has nothing to say without an authorization', () => {
    expect(recertStatus({ ...base, authEnd: '', today: '2026-10-01' })).toEqual({ due: false, daysLeft: null, requestedThisCycle: false });
  });
});

describe('validatePpotSendInput', () => {
  const good = { subjectKind: 'client' as const, subjectId: 'p1', requestType: 'recert' as const, recipientName: 'Dr. Patel', recipientOrg: '', toNumber: '404-555-0101', confirmNumber: '(404) 555-0101', medicaidId: '', note: '' };
  it('accepts a complete request, with or without a Medicaid ID', () => {
    expect(validatePpotSendInput(good)).toEqual({});
    expect(validatePpotSendInput({ ...good, medicaidId: '123456789012' })).toEqual({});
  });
  it('requires a subject, a type, and a confirmed number', () => {
    const e = validatePpotSendInput({ ...good, subjectId: '', requestType: undefined, confirmNumber: '404-555-0102' });
    expect(e.subject).toBeTruthy();
    expect(e.requestType).toBeTruthy();
    expect(e.confirmNumber).toMatch(/do not match/);
  });
  it('rejects a malformed Medicaid ID', () => {
    expect(validatePpotSendInput({ ...good, medicaidId: '12' }).medicaidId).toBeTruthy();
  });
});

describe('defaultPpotNote', () => {
  it('asks for the Medicaid number only when we lack it, and never uses a dash', () => {
    expect(defaultPpotNote('new', false)).toMatch(/Medicaid number/);
    expect(defaultPpotNote('recert', true)).not.toMatch(/Medicaid number/);
    expect(defaultPpotNote('recert', true)).toMatch(/recertification/);
    expect(defaultPpotNote('new', false)).not.toMatch(/[–—]/);
  });
});
