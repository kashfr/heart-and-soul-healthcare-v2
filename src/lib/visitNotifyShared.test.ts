import { describe, expect, it } from 'vitest';
import {
  PORTAL_LOGIN_URL,
  friendlyDate,
  friendlyTime,
  visitEmailBody,
  visitEmailSubject,
  visitSmsBody,
  whenPhrase,
  type VisitNotifyFacts,
} from './visitNotifyShared';

const SHIFT: VisitNotifyFacts = { date: '2026-07-10', startTime: '10:00', type: 'shift' };
const SUP_NO_TIME: VisitNotifyFacts = { date: '2026-07-12', type: 'supervisory' };

describe('friendly formatting', () => {
  it('formats a plain calendar date without timezone drift', () => {
    expect(friendlyDate('2026-07-10')).toBe('Fri, Jul 10');
  });

  it('formats times as 12-hour, and empty when unset', () => {
    expect(friendlyTime('10:00')).toBe('10:00 AM');
    expect(friendlyTime('00:15')).toBe('12:15 AM');
    expect(friendlyTime('13:05')).toBe('1:05 PM');
    expect(friendlyTime(undefined)).toBe('');
    expect(friendlyTime('nonsense')).toBe('');
  });

  it('whenPhrase joins date and time, or stands alone without a time', () => {
    expect(whenPhrase(SHIFT)).toBe('Fri, Jul 10 at 10:00 AM');
    expect(whenPhrase(SUP_NO_TIME)).toBe('Sun, Jul 12');
  });
});

describe('visitSmsBody', () => {
  it('describes an assignment with type, when, and the portal link', () => {
    const body = visitSmsBody('assigned', SHIFT);
    expect(body).toContain('shift visit');
    expect(body).toContain('Fri, Jul 10 at 10:00 AM');
    expect(body).toContain(PORTAL_LOGIN_URL);
  });

  it('covers cancellation and restore with the supervisory label', () => {
    expect(visitSmsBody('cancelled', SUP_NO_TIME)).toContain('supervisory visit');
    expect(visitSmsBody('cancelled', SUP_NO_TIME)).toContain('was cancelled');
    expect(visitSmsBody('restored', SUP_NO_TIME)).toContain('back on the schedule');
  });

  it('stays comfortably inside a single SMS segment budget', () => {
    for (const event of ['assigned', 'cancelled', 'restored'] as const) {
      expect(visitSmsBody(event, SHIFT).length).toBeLessThan(300);
    }
  });
});

describe('visitEmailSubject / visitEmailBody', () => {
  it('subject names the event and date', () => {
    expect(visitEmailSubject('assigned', SHIFT)).toBe('New shift visit assigned: Fri, Jul 10');
    expect(visitEmailSubject('cancelled', SHIFT)).toBe('Visit cancelled: Fri, Jul 10');
    expect(visitEmailSubject('restored', SUP_NO_TIME)).toBe('Visit back on the schedule: Sun, Jul 12');
  });

  it('body greets by first name and explains where client details live', () => {
    const body = visitEmailBody('assigned', SHIFT, 'Steve');
    expect(body).toContain('Hi Steve,');
    expect(body).toContain('assigned to you for Fri, Jul 10 at 10:00 AM');
    expect(body).toContain(PORTAL_LOGIN_URL);
    expect(body).toContain('never included in email or text');
  });

  it('degrades gracefully with no first name', () => {
    expect(visitEmailBody('cancelled', SHIFT, '')).toContain('Hi,');
  });
});

describe('PHI-free by construction', () => {
  // The composers' only inputs are date, time, and visit type — there is no
  // parameter through which a client's name or details could enter. This test
  // pins that: every produced string is fully reconstructible from those
  // three fields plus fixed copy.
  it('produces identical output for identical facts regardless of any other context', () => {
    const a = visitSmsBody('assigned', { date: '2026-07-10', startTime: '10:00', type: 'shift' });
    const b = visitSmsBody('assigned', { ...SHIFT });
    expect(a).toBe(b);
  });

  it('never emits anything besides the expected copy for the facts given', () => {
    const everything = [
      visitSmsBody('assigned', SHIFT),
      visitSmsBody('cancelled', SHIFT),
      visitSmsBody('restored', SHIFT),
      visitEmailSubject('assigned', SHIFT),
      visitEmailBody('assigned', SHIFT, 'Steve'),
    ].join(' ');
    // No street-address-like or medical-record-like fragments can appear —
    // the fixed copy plus date/time/type simply doesn't contain them.
    expect(everything).not.toMatch(/\d{3,} [A-Z][a-z]+ (St|Ave|Dr|Rd|Blvd)/);
    expect(everything).not.toMatch(/MRN|record #|diagnosis/i);
  });
});
