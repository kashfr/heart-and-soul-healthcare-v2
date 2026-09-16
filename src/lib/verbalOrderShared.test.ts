import { describe, expect, it } from 'vitest';
import {
  candidateOrdersForInboundFax,
  daysBetweenISO,
  formatUSFaxNumber,
  normalizeUSFaxNumber,
  validateVerbalOrderInput,
  verbalOrderBellText,
  verbalOrderStatusLabel,
  verbalOrderUrgency,
  VERBAL_ORDER_TEXT_MAX,
} from './verbalOrderShared';

const T = { overdueDays: 14, escalateDays: 30 };

describe('fax number helpers', () => {
  it('normalizes US numbers', () => {
    expect(normalizeUSFaxNumber('(470) 235-1891')).toBe('4702351891');
    expect(normalizeUSFaxNumber('1-470-235-1891')).toBe('4702351891');
    expect(normalizeUSFaxNumber('235-1891')).toBe('');
    expect(normalizeUSFaxNumber('')).toBe('');
  });
  it('formats and passes junk through', () => {
    expect(formatUSFaxNumber('4702351891')).toBe('(470) 235-1891');
    expect(formatUSFaxNumber('n/a')).toBe('n/a');
  });
});

describe('validateVerbalOrderInput', () => {
  const good = {
    patientId: 'p1',
    orderType: 'medication' as const,
    physicianName: 'Dr. Holmes',
    physicianPhone: '404-555-0100',
    physicianFax: '404-555-0101',
    physicianSpecialty: 'Neurology',
    orderText: 'Increase Keppra to 500 mg BID starting tonight.',
    readBackVerified: true,
    nurseSignature: 'data:image/png;base64,AAAA',
  };
  it('accepts a complete order', () => {
    expect(validateVerbalOrderInput(good)).toEqual({});
  });
  it('requires read-back, signature, fax, and text', () => {
    const e = validateVerbalOrderInput({ ...good, readBackVerified: false, nurseSignature: '', physicianFax: '123', orderText: ' ' });
    expect(Object.keys(e).sort()).toEqual(['nurseSignature', 'orderText', 'physicianFax', 'readBackVerified']);
  });
  it('caps the order text', () => {
    expect(validateVerbalOrderInput({ ...good, orderText: 'x'.repeat(VERBAL_ORDER_TEXT_MAX + 1) }).orderText).toBeTruthy();
  });
});

describe('urgency', () => {
  it('is open before the overdue threshold, then overdue, then escalated', () => {
    const o = { status: 'faxed' as const, takenDate: '2026-09-01' };
    expect(verbalOrderUrgency(o, '2026-09-10', T)).toBe('open');
    expect(verbalOrderUrgency(o, '2026-09-15', T)).toBe('overdue');
    expect(verbalOrderUrgency(o, '2026-10-01', T)).toBe('escalated');
  });
  it('signed is never overdue; malformed dates are open', () => {
    expect(verbalOrderUrgency({ status: 'signed', takenDate: '2020-01-01' }, '2026-09-15', T)).toBe('signed');
    expect(verbalOrderUrgency({ status: 'taken', takenDate: '' }, '2026-09-15', T)).toBe('open');
  });
  it('daysBetweenISO', () => {
    expect(daysBetweenISO('2026-09-01', '2026-09-15')).toBe(14);
    expect(daysBetweenISO('bad', '2026-09-15')).toBeNull();
  });
});

describe('labels', () => {
  it('reflects fax failure', () => {
    const base = { provider: 'srfax' as const, toNumber: '', faxDetailsId: '', queuedAt: null, sentAt: null, error: '', attempts: 1 };
    expect(verbalOrderStatusLabel({ status: 'faxed', fax: { ...base, sentStatus: 'Failed' } })).toBe('Fax failed');
    expect(verbalOrderStatusLabel({ status: 'faxed', fax: { ...base, sentStatus: 'Sent' } })).toBe('Faxed, awaiting signature');
    expect(verbalOrderStatusLabel({ status: 'taken', fax: null })).toBe('Taken, not yet faxed');
  });
  it('bell text', () => {
    const o = { patientName: 'ZZ Test Client', nurseName: 'Test Nurse', physicianName: 'Dr. Holmes' };
    expect(verbalOrderBellText('taken', o)).toContain('ZZ Test Client');
    expect(verbalOrderBellText('signed', o)).toContain('Dr. Holmes');
  });
});

describe('candidateOrdersForInboundFax', () => {
  const orders = [
    { id: 'a', physicianFax: '(404) 555-0101', status: 'faxed' as const },
    { id: 'b', physicianFax: '4045550101', status: 'signed' as const },
    { id: 'c', physicianFax: '4045550199', status: 'faxed' as const },
  ];
  it('matches open orders by the sender fax number only', () => {
    expect(candidateOrdersForInboundFax('14045550101', orders)).toEqual(['a']);
    expect(candidateOrdersForInboundFax('unknown', orders)).toEqual([]);
  });
});
