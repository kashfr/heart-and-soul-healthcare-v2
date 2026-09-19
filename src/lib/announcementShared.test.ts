import { describe, expect, it } from 'vitest';
import {
  announcementFieldOrder,
  isAcknowledgedBy,
  normalizeAnnouncementInput,
  pendingAnnouncementsFor,
  validateAnnouncementInput,
  type Announcement,
  type AnnouncementInput,
} from './announcementShared';

const good: AnnouncementInput = {
  title: "What's new in the portal",
  items: [
    { label: 'Seizure log.', text: 'Clients with a seizure disorder: the note now asks about seizures each shift.' },
    { label: 'Handoffs.', text: 'Your Plans for Next Shift posts to the next nurse. Acknowledge each one at login.' },
  ],
  footer: 'If a form will not submit, look for the red box.',
  audience: ['nurse'],
};

function ann(over: Partial<Announcement>): Announcement {
  return { id: 'a', ...good, active: true, publishedAt: 1000, publishedBy: 'x', publishedByName: 'X', acks: {}, ackCount: 0, ...over };
}

describe('validateAnnouncementInput', () => {
  it('accepts a complete announcement', () => {
    expect(validateAnnouncementInput(good)).toEqual({});
  });
  it('names the exact field for each gap', () => {
    const e = validateAnnouncementInput({ ...good, title: ' ', audience: [] });
    expect(Object.keys(e).sort()).toEqual(['audience', 'title']);
  });
  it('requires at least one filled item, pointing at the first row', () => {
    const e = validateAnnouncementInput({ ...good, items: [{ label: '', text: '' }] });
    expect(e['item-0-label']).toMatch(/at least one item/);
  });
  it('flags a half-filled item on the missing half only', () => {
    const e = validateAnnouncementInput({ ...good, items: [{ label: 'Handoffs.', text: ' ' }, { label: '', text: 'Do the thing.' }] });
    expect(e['item-0-text']).toBeTruthy();
    expect(e['item-0-label']).toBeUndefined();
    expect(e['item-1-label']).toBeTruthy();
    expect(e['item-1-text']).toBeUndefined();
  });
  it('ignores an empty trailing row', () => {
    expect(validateAnnouncementInput({ ...good, items: [...good.items, { label: '', text: '' }] })).toEqual({});
  });
  it('rejects unknown audience roles', () => {
    expect(validateAnnouncementInput({ ...good, audience: ['family' as never] }).audience).toBeTruthy();
  });
  it('field order covers every item slot', () => {
    expect(announcementFieldOrder(2)).toEqual(['title', 'item-0-label', 'item-0-text', 'item-1-label', 'item-1-text', 'footer', 'audience']);
  });
});

describe('normalizeAnnouncementInput', () => {
  it('trims, drops empty rows, dedupes audience', () => {
    const n = normalizeAnnouncementInput({ title: '  T ', items: [{ label: ' A. ', text: ' a ' }, { label: '', text: ' ' }], footer: ' f ', audience: ['nurse', 'nurse', 'bogus' as never] });
    expect(n).toEqual({ title: 'T', items: [{ label: 'A.', text: 'a' }], footer: 'f', audience: ['nurse'] });
  });
});

describe('pendingAnnouncementsFor', () => {
  it('returns only active, in-audience, unacknowledged posts, oldest first', () => {
    const list = [
      ann({ id: 'new', publishedAt: 3000 }),
      ann({ id: 'old', publishedAt: 1000 }),
      ann({ id: 'acked', acks: { u1: { at: 1, name: 'N' } }, ackCount: 1 }),
      ann({ id: 'retired', active: false }),
      ann({ id: 'staff', audience: ['admin'] }),
    ];
    expect(pendingAnnouncementsFor(list, 'u1', 'nurse').map((a) => a.id)).toEqual(['old', 'new']);
    expect(pendingAnnouncementsFor(list, null, 'nurse')).toEqual([]);
    expect(isAcknowledgedBy(list[2], 'u1')).toBe(true);
    expect(isAcknowledgedBy(list[2], 'u2')).toBe(false);
  });
});
