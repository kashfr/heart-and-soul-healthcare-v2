import { describe, expect, it } from 'vitest';
import { canUseFax, cleanFaxFileName, faxDeliveryState, validateFaxSendInput } from './faxShared';

const on = { enabled: true, userUids: ['rose', 'sup1'] };

describe('canUseFax', () => {
  it('is closed to everyone while the feature is off', () => {
    expect(canUseFax({ enabled: false, userUids: ['rose'] }, 'admin1', 'admin')).toBe(false);
    expect(canUseFax({ enabled: false, userUids: ['rose'] }, 'rose', 'va')).toBe(false);
  });
  it('lets any admin in once it is on', () => {
    expect(canUseFax(on, 'admin1', 'admin')).toBe(true);
  });
  it('lets a checked supervisor or VA in, and no one else', () => {
    expect(canUseFax(on, 'rose', 'va')).toBe(true);
    expect(canUseFax(on, 'sup1', 'supervisor')).toBe(true);
    expect(canUseFax(on, 'sup2', 'supervisor')).toBe(false);
  });
  it('never lets a nurse in, even when her uid is on the list', () => {
    expect(canUseFax({ enabled: true, userUids: ['n1'] }, 'n1', 'nurse')).toBe(false);
  });
  it('handles a signed-out or unknown caller', () => {
    expect(canUseFax(on, null, 'admin')).toBe(false);
    expect(canUseFax(on, 'rose', null)).toBe(false);
    expect(canUseFax(undefined, 'admin1', 'admin')).toBe(false);
  });
});

describe('validateFaxSendInput', () => {
  const good = { recipientName: 'Dr. Patel', recipientOrg: '', toNumber: '(404) 555-0100', confirmNumber: '404-555-0100', regarding: '', note: '', includeCover: true };
  it('accepts a complete form', () => {
    expect(validateFaxSendInput(good, true)).toEqual({});
  });
  it('accepts a leading 1 on either number', () => {
    expect(validateFaxSendInput({ ...good, toNumber: '1 404 555 0100' }, true)).toEqual({});
  });
  it('requires the recipient, a valid number, and a file', () => {
    const e = validateFaxSendInput({ ...good, recipientName: ' ', toNumber: '555-0100' }, false);
    expect(e.recipientName).toBeTruthy();
    expect(e.toNumber).toBeTruthy();
    expect(e.file).toBeTruthy();
  });
  it('blocks a send when the confirmation does not match', () => {
    expect(validateFaxSendInput({ ...good, confirmNumber: '404-555-0101' }, true).confirmNumber).toMatch(/do not match/);
    expect(validateFaxSendInput({ ...good, confirmNumber: '' }, true).confirmNumber).toMatch(/again/);
  });
  it('caps the free-text fields', () => {
    expect(validateFaxSendInput({ ...good, note: 'x'.repeat(1201) }, true).note).toBeTruthy();
    expect(validateFaxSendInput({ ...good, regarding: 'x'.repeat(121) }, true).regarding).toBeTruthy();
  });
});

describe('faxDeliveryState', () => {
  it('maps SRFax statuses', () => {
    expect(faxDeliveryState('Sent')).toBe('sent');
    expect(faxDeliveryState('Failed')).toBe('failed');
    expect(faxDeliveryState('In Progress')).toBe('sending');
    expect(faxDeliveryState('Sending Email')).toBe('sending');
    expect(faxDeliveryState('')).toBe('sending');
  });
});

describe('cleanFaxFileName', () => {
  it('keeps a readable stem and forces .pdf', () => {
    expect(cleanFaxFileName('Appendix T - Jane Doe.PDF')).toBe('Appendix_T_-_Jane_Doe.pdf');
    expect(cleanFaxFileName('C:\\Users\\me\\scan.pdf')).toBe('scan.pdf');
    expect(cleanFaxFileName('')).toBe('document.pdf');
    expect(cleanFaxFileName('../../etc.pdf')).toBe('etc.pdf');
  });
});
