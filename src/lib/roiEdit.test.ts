import { describe, expect, it } from 'vitest';
import { describeRoiEdit, roiEditableFields, validateRoiEdit, type RoiRecord } from './roiShared';

const roi = (over: Partial<RoiRecord> = {}): RoiRecord => ({
  id: 'x', formType: 'ga-hipaa', patientId: '', referralId: 'r1', memberName: 'Bronx Spry', direction: 'to-us',
  facility: { name: 'Peachtree Pediatrics - Dr. Ann Eggert', address: '12 Eastbrook Bend', phone: '7704873330', fax: '' },
  information: 'As listed on the signed authorization.', purpose: 'As listed on the signed authorization.', duration: 'transactions',
  status: 'signed', createdAt: null, createdByName: '', signed: { documentId: 'd', signedDate: '2026-10-18', expiresOn: '2028-10-18', byName: '' },
  faxes: [], hidden: false, ...over,
});
const TODAY = '2026-10-18';

describe('what a release lets you edit', () => {
  it('signed elsewhere: everything recorded; outside adds its expiry', () => {
    expect(roiEditableFields(roi())).toEqual(['facilityName', 'facilityAddress', 'facilityPhone', 'facilityFax', 'information', 'purpose', 'signedDate']);
    expect(roiEditableFields(roi({ formType: 'outside' }))).toContain('outsideExpiresOn');
  });
  it('prepared forms: all of it before signing (DBHDD), only phone and fax after; nothing once cancelled', () => {
    expect(roiEditableFields(roi({ formType: 'dbhdd', status: 'awaiting-signature' }))).toContain('facilityName');
    expect(roiEditableFields(roi({ formType: 'dbhdd', status: 'signed' }))).toEqual(['facilityPhone', 'facilityFax']);
    expect(roiEditableFields(roi({ formType: 'choa', status: 'awaiting-signature' }))).toEqual(['facilityPhone', 'facilityFax']);
    expect(roiEditableFields(roi({ status: 'cancelled' }))).toEqual([]);
  });
});

describe('validateRoiEdit', () => {
  it('adds a fax, normalizing it, and reports only what changed', () => {
    const { errors, changes } = validateRoiEdit(roi(), { facilityFax: '(770) 487-7736', facilityPhone: '(770) 487-3330' }, TODAY);
    expect(errors).toEqual({});
    expect(changes).toEqual({ facilityFax: '7704877736' });
  });
  it('ignores fields a signed prepared form does not allow', () => {
    const { changes } = validateRoiEdit(roi({ formType: 'dbhdd' }), { facilityName: 'Someone Else', facilityFax: '7704877736' }, TODAY);
    expect(changes).toEqual({ facilityFax: '7704877736' });
  });
  it('checks phones, the name, and dates', () => {
    const r = roi({ formType: 'outside' });
    const { errors } = validateRoiEdit(r, { facilityFax: '555', facilityName: ' ', signedDate: '2027-01-01', outsideExpiresOn: '2026-01-01' }, TODAY);
    expect(Object.keys(errors).sort()).toEqual(['facilityFax', 'facilityName', 'outsideExpiresOn', 'signedDate']);
    expect(validateRoiEdit(r, { outsideExpiresOn: '2026-10-01' }, TODAY).errors.outsideExpiresOn).toBeTruthy();
  });
  it('blank wording on a release signed elsewhere reads as "see the form"', () => {
    expect(validateRoiEdit(roi({ information: 'All medical records' }), { information: '' }, TODAY).changes.information).toBe('As listed on the signed authorization.');
  });
});

it('describes old and new for the activity history', () => {
  expect(describeRoiEdit(roi(), { facilityFax: '7704877736', signedDate: '2026-10-17' }))
    .toBe('Release of information for Peachtree Pediatrics - Dr. Ann Eggert edited: Fax (blank) → (770) 487-7736; Date signed 10/18/2026 → 10/17/2026.');
});
