import { describe, expect, it } from 'vitest';
import {
  agencyLocalToISO,
  deliveryStatus,
  EMPTY_MANUAL_COMM,
  sanitizeManualComm,
  validateManualComm,
} from './communicationsShared';

describe('validateManualComm', () => {
  const ok = { ...EMPTY_MANUAL_COMM, channel: 'email' as const, staffUid: 'u1', body: 'Hello', occurredAt: '2026-09-28T14:00' };
  it('accepts a complete entry', () => {
    expect(validateManualComm(ok, '2026-09-28T15:00')).toEqual({});
  });
  it('needs a channel, someone, a time and the message', () => {
    expect(Object.keys(validateManualComm(EMPTY_MANUAL_COMM, '2026-09-28T15:00')).sort()).toEqual(['body', 'channel', 'occurredAt', 'who']);
  });
  it('accepts a named person instead of a staff member', () => {
    expect(validateManualComm({ ...ok, staffUid: '', counterpartyName: 'Mother' }, '2026-09-28T15:00')).toEqual({});
  });
  it('refuses a time in the future and a portal channel', () => {
    expect(validateManualComm({ ...ok, occurredAt: '2026-09-29T09:00' }, '2026-09-28T15:00').occurredAt).toMatch(/future/);
    expect(validateManualComm({ ...ok, channel: 'portal' }, '2026-09-28T15:00').channel).toBeTruthy();
  });
});

describe('sanitizeManualComm', () => {
  it('drops unknown channels and defaults the direction', () => {
    const m = sanitizeManualComm({ channel: 'pigeon', direction: 'sideways', body: 'x' });
    expect(m.channel).toBe('');
    expect(m.direction).toBe('outbound');
    expect(sanitizeManualComm({ direction: 'inbound', channel: 'phone' })).toMatchObject({ direction: 'inbound', channel: 'phone' });
  });
});

describe('deliveryStatus', () => {
  const c = (ok: boolean) => ({ channel: 'email' as const, to: '', ok, body: '' });
  it('says whether anyone got it', () => {
    expect(deliveryStatus({ channels: [c(true), c(true)] })).toBe('delivered');
    expect(deliveryStatus({ channels: [c(true), c(false)] })).toBe('partial');
    expect(deliveryStatus({ channels: [c(false), c(false)] })).toBe('failed');
  });
});

describe('agencyLocalToISO', () => {
  it('reads the time as Georgia time, in daylight and standard time', () => {
    expect(agencyLocalToISO('2026-09-28T14:00')).toBe('2026-09-28T18:00:00.000Z');
    expect(agencyLocalToISO('2026-12-15T09:30')).toBe('2026-12-15T14:30:00.000Z');
    expect(agencyLocalToISO('nope')).toBe('');
  });
});
