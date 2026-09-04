import { describe, it, expect } from 'vitest';
import {
  SHIFT_CHANGE_KEYS,
  readShiftChange,
  shiftChangeAnyYes,
  shiftChangeLabels,
  shiftChangeBellText,
  shiftChangeSmsText,
  shiftChangeEmailCopy,
  excerptDetails,
  type ShiftChangeAlertContext,
} from './shiftChange';

const K = SHIFT_CHANGE_KEYS;

function ctx(over: Partial<ShiftChangeAlertContext> = {}): ShiftChangeAlertContext {
  return {
    nurseName: 'Bianca Bryant',
    credential: 'RN',
    clientName: 'Ann Torres',
    dateOfService: '09/03/2026',
    report: readShiftChange({ [K.hospitalAdmission]: 'No', [K.erUrgentCare]: 'Yes', [K.medChange]: 'Yes', [K.details]: 'ER for fever; started amoxicillin.' }),
    ...over,
  };
}

describe('readShiftChange', () => {
  it('reads the three answers and the details', () => {
    const r = readShiftChange({ [K.hospitalAdmission]: 'Yes', [K.erUrgentCare]: 'No', [K.medChange]: 'No', [K.details]: '  Admitted 9/1.  ' });
    expect(r).toEqual({ hospitalAdmission: true, erUrgentCare: false, medChange: false, any: true, answered: true, details: 'Admitted 9/1.' });
  });

  it('treats a note written before the section existed as unanswered, not as No', () => {
    const r = readShiftChange({ q3_clientName: 'Ann Torres' });
    expect(r.any).toBe(false);
    expect(r.answered).toBe(false);
  });

  it('is case-insensitive and ignores whitespace', () => {
    expect(readShiftChange({ [K.medChange]: ' yes ' }).medChange).toBe(true);
    expect(shiftChangeAnyYes({ [K.erUrgentCare]: 'YES' })).toBe(true);
    expect(shiftChangeAnyYes({ [K.erUrgentCare]: 'No', [K.medChange]: 'No' })).toBe(false);
  });

  it('only counts all-three-answered as answered', () => {
    expect(readShiftChange({ [K.hospitalAdmission]: 'No', [K.erUrgentCare]: 'No' }).answered).toBe(false);
    expect(readShiftChange({ [K.hospitalAdmission]: 'No', [K.erUrgentCare]: 'No', [K.medChange]: 'No' }).answered).toBe(true);
  });
});

describe('shift-change alert copy', () => {
  it('lists only the Yes items in question order', () => {
    expect(shiftChangeLabels(ctx().report)).toEqual(['Urgent care / ER visit', 'Medication started, changed, or stopped']);
  });

  it('bell text names the client, the items, and asks for a MAR check on a med change', () => {
    expect(shiftChangeBellText(ctx())).toBe(
      'Bianca Bryant (RN) reports since the last shift for Ann Torres (09/03/2026): Urgent care / ER visit · Medication started, changed, or stopped. Verify the MAR.',
    );
    const hospitalOnly = ctx({ report: readShiftChange({ [K.hospitalAdmission]: 'Yes', [K.erUrgentCare]: 'No', [K.medChange]: 'No' }) });
    expect(shiftChangeBellText(hospitalOnly)).not.toMatch(/Verify the MAR/);
  });

  it('text message never carries PHI and names the MAR only for a med change', () => {
    for (const c of [ctx(), ctx({ report: readShiftChange({ [K.hospitalAdmission]: 'Yes' }) })]) {
      const sms = shiftChangeSmsText(c);
      expect(sms).not.toMatch(/Ann Torres|Bianca|09\/03|amoxicillin/);
      expect(sms).toMatch(/heartandsoulhc\.org\/login/);
      expect(sms).toMatch(/Reply STOP to opt out/);
    }
    expect(shiftChangeSmsText(ctx())).toMatch(/medication change/);
    expect(shiftChangeSmsText(ctx({ report: readShiftChange({ [K.hospitalAdmission]: 'Yes' }) }))).toMatch(/hospital or ER/);
  });

  it('email subject leads with the medication change when one is reported and lists all three answers', () => {
    const copy = shiftChangeEmailCopy(ctx());
    expect(copy.subject).toBe('Med change reported: Ann Torres (09/03/2026)');
    expect(copy.answers).toEqual([
      'Hospital admission: No',
      'Urgent care / ER visit: Yes',
      'Medication started, changed, or stopped: Yes',
    ]);
    expect(copy.intro).toMatch(/^Bianca Bryant, RN answered Yes to 2 /);
    expect(copy.body).toMatch(/verify the client's MAR/);
    const hosp = shiftChangeEmailCopy(ctx({ report: readShiftChange({ [K.hospitalAdmission]: 'Yes' }) }));
    expect(hosp.subject).toBe('Hospital / ER visit reported: Ann Torres (09/03/2026)');
    expect(hosp.intro).toMatch(/answered Yes to a "since your last shift" question on/);
  });

  it('excerpts long details for the email and bell', () => {
    expect(excerptDetails('  short  ')).toBe('short');
    const long = excerptDetails('x'.repeat(500));
    expect(long.length).toBe(300);
    expect(long.endsWith('…')).toBe(true);
  });
});
