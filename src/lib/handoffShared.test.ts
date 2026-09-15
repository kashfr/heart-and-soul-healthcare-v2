import { describe, expect, it } from 'vitest';
import {
  computeHandoffRecipients,
  handoffBellText,
  handoffSmsText,
  isAcknowledgedBy,
  isPendingFor,
  isSubstantiveHandoffText,
  normalizeHandoffText,
  summarizeAcks,
  HANDOFF_TEXT_MAX,
} from './handoffShared';

describe('computeHandoffRecipients', () => {
  it('drops the author, blanks, and duplicates', () => {
    expect(computeHandoffRecipients(['a', 'b', 'a', '', ' b ', 'me'], 'me')).toEqual(['a', 'b']);
  });
  it('tolerates a missing care team', () => {
    expect(computeHandoffRecipients(undefined, 'me')).toEqual([]);
    expect(computeHandoffRecipients('nope', 'me')).toEqual([]);
  });
  it('is empty when the author is the only nurse', () => {
    expect(computeHandoffRecipients(['me'], 'me')).toEqual([]);
  });
});

describe('isSubstantiveHandoffText', () => {
  it('rejects empties and placeholder answers', () => {
    for (const v of ['', '  ', 'N/A', 'n/a.', 'NA', 'none', 'None.', 'no', '-', undefined, null]) {
      expect(isSubstantiveHandoffText(v)).toBe(false);
    }
  });
  it('accepts real plans', () => {
    expect(isSubstantiveHandoffText('Continue seizure precautions; Keppra refill due Thursday.')).toBe(true);
    expect(isSubstantiveHandoffText('No BM today, monitor tomorrow')).toBe(true);
  });
});

describe('normalizeHandoffText', () => {
  it('trims, normalizes newlines, and caps length', () => {
    expect(normalizeHandoffText('  a\r\nb  ')).toBe('a\nb');
    expect(normalizeHandoffText('x'.repeat(HANDOFF_TEXT_MAX + 50)).length).toBe(HANDOFF_TEXT_MAX);
  });
});

describe('messages', () => {
  it('bell text names client and author, flags urgent', () => {
    expect(handoffBellText({ clientName: 'ZZ Test Client', authorName: 'Jane Doe', urgent: false })).toBe(
      'Handoff for ZZ Test Client from Jane Doe',
    );
    expect(handoffBellText({ clientName: '', authorName: '', urgent: true })).toBe(
      'Urgent handoff for a client from a team member',
    );
  });
  it('sms text is PHI-free and carries the opt-out', () => {
    const t = handoffSmsText();
    expect(t).toContain('Reply STOP');
    expect(t).not.toMatch(/client\s+[A-Z]/);
  });
});

describe('ack helpers', () => {
  const h = {
    recipientIds: ['a', 'b', 'c'],
    recipientNames: { a: 'Ann', b: 'Bea', c: 'Cy' },
    pendingIds: ['b', 'c'],
    acks: { a: {} },
  };
  it('reports acknowledgment state per user', () => {
    expect(isAcknowledgedBy(h, 'a')).toBe(true);
    expect(isAcknowledgedBy(h, 'b')).toBe(false);
    expect(isPendingFor(h, 'b')).toBe(true);
    expect(isPendingFor(h, 'a')).toBe(false);
    expect(isPendingFor(h, '')).toBe(false);
  });
  it('summarizes who still owes an acknowledgment', () => {
    expect(summarizeAcks(h)).toEqual({ total: 3, acknowledged: 1, pendingNames: ['Bea', 'Cy'] });
    expect(summarizeAcks({ recipientIds: [], recipientNames: {}, pendingIds: [] })).toEqual({
      total: 0,
      acknowledged: 0,
      pendingNames: [],
    });
  });
});
