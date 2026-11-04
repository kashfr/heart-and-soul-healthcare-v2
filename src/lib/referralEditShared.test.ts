import { describe, expect, it } from 'vitest';
import {
  addLegacyDob, applyEdits, canAddLegacyDob, currentEditValues, describeEdits, editFieldsFor, isEditableSource, LEGACY_DOB_FLAG_LABEL, validateEdits, validateLegacyDob,
} from './referralEditShared';

const gapp = {
  clientName: 'Jazz King',
  referrerName: 'Ariel King',
  clientPhone: '(828) 508-8228',
  clientEmail: 'ariel@example.com',
  county: 'Gwinnett',
  details: [
    { label: '⚠ Young child', value: 'Cleared: skilled equipment' },
    { label: 'Date of birth', value: '05/12/2025' },
    { label: "Member's Medicaid ID", value: 'Will provide later' },
    { label: 'Seeking paid caregiver', value: 'No' },
  ],
};
const specs = editFieldsFor('gapp-website');

describe('which fields are editable', () => {
  it('never offers an answer the GAPP screening reads', () => {
    for (const source of ['gapp-website', 'hs-website'] as const) {
      const rows = editFieldsFor(source).map((s) => s.row).filter(Boolean);
      for (const locked of ['Seeking paid caregiver', 'Wants agency staff in the home', 'Date of birth', 'Relationship to child', 'Diagnosis', 'Equipment & daily care', 'Behavior risk', 'Current services', 'Legal guardianship', 'Hands-on care mainly due to', 'Primary care need', 'Service needs', 'Additional notes']) {
        expect(rows).not.toContain(locked);
      }
      expect(rows.some((r) => r!.startsWith('⚠'))).toBe(false);
    }
  });
  it('covers the website sources only', () => {
    expect(isEditableSource('gapp-website')).toBe(true);
    expect(isEditableSource('hs-website')).toBe(true);
    expect(isEditableSource('phone')).toBe(false);
  });
});

describe('applyEdits', () => {
  it('adds a Medicaid ID and leaves every other answer and flag untouched', () => {
    const values = { ...currentEditValues(gapp, specs), "row:Member's Medicaid ID": '222120339644' };
    const out = applyEdits(gapp, specs, values);
    expect(out.changes).toEqual([{ label: 'Medicaid ID', from: 'Will provide later', to: '222120339644' }]);
    expect(out.details).toEqual([
      gapp.details[0], gapp.details[1], { label: "Member's Medicaid ID", value: '222120339644' }, gapp.details[3],
    ]);
    expect(out.top).toEqual({});
  });
  it('adds a missing row at the end, removes a cleared one, and formats phones', () => {
    const values = { ...currentEditValues(gapp, specs), 'row:Physician phone': '7702776725', "row:Member's Medicaid ID": '', 'top:clientPhone': '8285550000' };
    const out = applyEdits(gapp, specs, values);
    expect(out.details.at(-1)).toEqual({ label: 'Physician phone', value: '(770) 277-6725' });
    expect(out.details.find((d) => d.label === "Member's Medicaid ID")).toBeUndefined();
    expect(out.top.clientPhone).toBe('(828) 555-0000');
  });
  it('ignores keys it does not know and reformatting alone', () => {
    const raw = { ...gapp, clientPhone: '8285088228' };
    const out = applyEdits(raw, specs, { ...currentEditValues(raw, specs), 'row:Seeking paid caregiver': 'Yes' });
    expect(out.changes).toEqual([]);
    expect(out.details).toEqual(raw.details);
  });
});

describe('validateEdits', () => {
  it('keeps required fields filled and checks changed values only', () => {
    const before = { ...currentEditValues(gapp, specs), 'row:Physician fax': '555-1212' };
    const e = validateEdits(specs, { ...before, 'top:clientName': ' ', 'top:clientEmail': 'nope' }, before);
    expect(e['top:clientName']).toBe("Enter the child's name.");
    expect(e['top:clientEmail']).toBeTruthy();
    expect(e['row:Physician fax']).toBeUndefined();
    expect(validateEdits(specs, { ...before, 'row:Physician fax': '555-1213' }, before)['row:Physician fax']).toBe('Enter a 10-digit phone number.');
  });
});

it('describes old and new values for the timeline', () => {
  expect(describeEdits([{ label: 'Medicaid ID', from: 'Will provide later', to: '222120339644' }, { label: 'Email', from: '', to: 'a@b.co' }]))
    .toBe('Details edited: Medicaid ID "Will provide later" → "222120339644"; Email (blank) → "a@b.co".');
});

describe('date of birth on an old referral', () => {
  const fmt = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
  const age = () => '3 years';

  it('can be added only when missing and the answers were not kept', () => {
    expect(canAddLegacyDob({ details: [] })).toBe(true);
    expect(canAddLegacyDob({ details: [{ label: 'Date of birth', value: '' }] })).toBe(true);
    expect(canAddLegacyDob({ details: [{ label: 'Date of birth', value: '05/14/2019' }] })).toBe(false);
    expect(canAddLegacyDob({ details: [], intakeAnswers: { dob: '' } })).toBe(false);
  });

  it('rejects bad and future dates', () => {
    expect(validateLegacyDob('', '2026-11-04')).toBeNull();
    expect(validateLegacyDob('2019-05-14', '2026-11-04')).toBeNull();
    expect(validateLegacyDob('2019-02-30', '2026-11-04')).toBe('Enter a valid date.');
    expect(validateLegacyDob('2026-11-05', '2026-11-04')).toBe('The date of birth can’t be in the future.');
  });

  it('adds the date and Age on a GAPP card, replacing a blank row', () => {
    const out = addLegacyDob('gapp-website', [{ label: 'Date of birth', value: '' }, { label: 'Seeking paid caregiver', value: 'No' }], '2023-01-02', '2026-11-04', fmt, age);
    expect(out).toEqual([
      { label: 'Seeking paid caregiver', value: 'No' },
      { label: 'Date of birth', value: '01/02/2023' },
      { label: 'Age', value: '3 years' },
    ]);
  });

  it('flags a paid-caregiver request for a child under 6, since the young-child check never ran', () => {
    const out = addLegacyDob('gapp-website', [{ label: 'Seeking paid caregiver', value: 'Yes' }], '2023-01-02', '2026-11-04', fmt, age);
    expect(out[0].label).toBe(LEGACY_DOB_FLAG_LABEL);
    const older = addLegacyDob('gapp-website', [{ label: 'Seeking paid caregiver', value: 'Yes' }], '2019-01-02', '2026-11-04', fmt, age);
    expect(older.some((d) => d.label === LEGACY_DOB_FLAG_LABEL)).toBe(false);
  });

  it('adds no Age row on a Heart & Soul card', () => {
    const out = addLegacyDob('hs-website', [], '2019-01-02', '2026-11-04', fmt, age);
    expect(out).toEqual([{ label: 'Date of birth', value: '01/02/2019' }]);
  });
});
