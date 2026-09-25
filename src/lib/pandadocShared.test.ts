import { describe, expect, it } from 'vitest';
import { isNewer, isTrackedDocument, packetStage, packetSubject, parsePandadocWebhook } from './pandadocShared';

const delivery = [
  {
    event: 'document_state_changed',
    data: {
      id: 'aBc123DEF',
      name: 'RN Onboarding Packet - Jane Nurse',
      status: 'document.sent',
      date_created: '2026-09-20T14:00:00.000Z',
      date_modified: '2026-09-21T15:00:00.000Z',
      template: { id: 't1', name: 'RN Onboarding Packet' },
      sent_by: { first_name: 'Kaheem', last_name: 'Freeman', email: 'kfreeman@heartandsoulhc.org' },
      recipients: [
        { first_name: 'Jane', last_name: 'Nurse', email: 'Jane.Nurse@Example.com', role: 'Nurse', has_completed: true },
        { first_name: 'Kaheem', last_name: 'Freeman', email: 'kfreeman@heartandsoulhc.org', role: 'Heart and Soul', has_completed: false },
      ],
    },
  },
  { event: 'document_state_changed', data: { id: 'bad id!' } },
  'junk',
];

describe('parsePandadocWebhook', () => {
  it('normalizes a delivery and skips unusable items', () => {
    const [e, ...rest] = parsePandadocWebhook(delivery);
    expect(rest).toEqual([]);
    expect(e).toMatchObject({ event: 'document_state_changed', id: 'aBc123DEF', templateName: 'RN Onboarding Packet', status: 'document.sent', sentByName: 'Kaheem Freeman' });
    expect(e.recipients).toEqual([
      { email: 'jane.nurse@example.com', name: 'Jane Nurse', role: 'Nurse', completed: true, internal: false },
      { email: 'kfreeman@heartandsoulhc.org', name: 'Kaheem Freeman', role: 'Heart and Soul', completed: false, internal: true },
    ]);
  });
  it('accepts a single object and rejects garbage', () => {
    expect(parsePandadocWebhook(delivery[0])).toHaveLength(1);
    expect(parsePandadocWebhook(null)).toEqual([]);
    expect(parsePandadocWebhook('x')).toEqual([]);
  });
});

describe('isTrackedDocument', () => {
  it('matches keywords against the document or template name, ignoring case', () => {
    expect(isTrackedDocument({ name: 'Packet for Jane', templateName: 'LPN Onboarding' }, ['onboarding'])).toBe(true);
    expect(isTrackedDocument({ name: 'Start of Care Packet - Sam', templateName: 'Start of Care' }, ['onboarding'])).toBe(false);
    expect(isTrackedDocument({ name: 'x', templateName: 'y' }, ['', '  '])).toBe(false);
  });
});

describe('packetStage', () => {
  const [e] = parsePandadocWebhook(delivery);
  it('flags a packet the nurse finished and we still have to countersign', () => {
    expect(packetStage('document.sent', e.recipients)).toBe('awaiting-countersign');
  });
  it('is with the recipient until every outside signer is done', () => {
    expect(packetStage('document.viewed', e.recipients.map((r) => ({ ...r, completed: false })))).toBe('with-recipient');
  });
  it('maps the terminal states', () => {
    expect(packetStage('document.completed', e.recipients)).toBe('completed');
    expect(packetStage('document.declined', e.recipients)).toBe('declined');
    expect(packetStage('document.voided', e.recipients)).toBe('voided');
    expect(packetStage('document.draft', e.recipients)).toBe('draft');
  });
});

describe('isNewer', () => {
  it('never lets an older modification overwrite a newer one', () => {
    expect(isNewer('2026-09-21T15:00:00Z', '2026-09-21T16:00:00Z')).toBe(false);
    expect(isNewer('2026-09-21T16:00:00Z', '2026-09-21T15:00:00Z')).toBe(true);
    expect(isNewer('', '2026-09-21T15:00:00Z')).toBe(true);
  });
});

describe('packetSubject', () => {
  it('is the first outside recipient', () => {
    const [e] = parsePandadocWebhook(delivery);
    expect(packetSubject(e.recipients)?.email).toBe('jane.nurse@example.com');
  });
});
