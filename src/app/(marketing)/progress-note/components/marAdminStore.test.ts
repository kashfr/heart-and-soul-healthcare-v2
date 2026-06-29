import { describe, expect, it, beforeEach } from 'vitest';
import {
  setMarAdmin,
  getAllMarAdmin,
  clearMarAdmin,
  marAdminKey,
  unlistedMarAdminKey,
  selectSubmittableMarks,
  computeExtraMarks,
  type MarAdminRecord,
  type MarAdminEntry,
} from './marAdminStore';

function rec(overrides: Partial<MarAdminRecord> = {}): MarAdminRecord {
  return {
    patientId: 'pat-1',
    orderId: 'ord-1',
    medName: 'Acetaminophen',
    dose: '500',
    units: 'mg',
    route: 'PO',
    scheduledTime: '08:00',
    isPRN: false,
    status: 'given',
    administeredByType: 'nurse',
    administratorName: '',
    actualTime: '08:05',
    initials: 'SJ',
    reason: '',
    sessionId: 'sess-1',
    ...overrides,
  };
}

function entry(key: string, overrides: Partial<MarAdminRecord> = {}): MarAdminEntry {
  return { key, ...rec(overrides) };
}

beforeEach(() => {
  clearMarAdmin();
});

describe('marAdminStore singleton', () => {
  it('clearMarAdmin then set REPLACES rather than unions (the resume/hydrate path)', () => {
    setMarAdmin(marAdminKey('pat-1', 'ord-A', '08:00'), rec({ orderId: 'ord-A' }));
    // Simulate resuming a different note: clear first, then load that note's marks.
    clearMarAdmin();
    setMarAdmin(marAdminKey('pat-2', 'ord-B', '08:00'), rec({ patientId: 'pat-2', orderId: 'ord-B' }));
    const all = getAllMarAdmin();
    expect(all).toHaveLength(1);
    expect(all[0].orderId).toBe('ord-B');
  });

  it('setting the same key twice overwrites (no duplicate dose rows)', () => {
    const k = marAdminKey('pat-1', 'ord-A', '08:00');
    setMarAdmin(k, rec({ status: 'held' }));
    setMarAdmin(k, rec({ status: 'given' }));
    const all = getAllMarAdmin();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe('given');
  });

  it('unlistedMarAdminKey is unique per call so two same-time one-offs do not collide', () => {
    const k1 = unlistedMarAdminKey('pat-1', 'Morphine', 'id-1');
    const k2 = unlistedMarAdminKey('pat-1', 'Morphine', 'id-2');
    expect(k1).not.toBe(k2);
    setMarAdmin(k1, rec({ orderId: '', scheduledTime: 'unscheduled' }));
    setMarAdmin(k2, rec({ orderId: '', scheduledTime: 'unscheduled' }));
    expect(getAllMarAdmin()).toHaveLength(2);
  });
});

describe('selectSubmittableMarks (defense-in-depth harvest filter)', () => {
  const opts = { patientId: 'pat-1', sessionId: 'sess-1' };

  it('keeps marks for this client + this session that have a status', () => {
    const out = selectSubmittableMarks([entry('k1')], opts);
    expect(out).toHaveLength(1);
  });

  it('drops marks for a different client', () => {
    const out = selectSubmittableMarks([entry('k1', { patientId: 'pat-2' })], opts);
    expect(out).toHaveLength(0);
  });

  it('drops untouched marks (no status)', () => {
    const out = selectSubmittableMarks([entry('k1', { status: '' })], opts);
    expect(out).toHaveLength(0);
  });

  it('drops a stale mark stamped with another note session', () => {
    const out = selectSubmittableMarks([entry('k1', { sessionId: 'sess-OTHER' })], opts);
    expect(out).toHaveLength(0);
  });

  it('keeps a legacy mark with no sessionId (back-compat for older drafts)', () => {
    const out = selectSubmittableMarks([entry('k1', { sessionId: undefined })], opts);
    expect(out).toHaveLength(1);
  });
});

describe('computeExtraMarks (resumed / unlisted doses an order row does not cover)', () => {
  it('surfaces an orderId-less one-off dose so it is never silently hidden', () => {
    const marks = [entry('pat-1|unlisted:Morphine:x|unscheduled', { orderId: '', scheduledTime: 'unscheduled' })];
    const out = computeExtraMarks(marks, new Set(), 'pat-1');
    expect(out).toHaveLength(1);
    expect(out[0].orderId).toBe('');
  });

  it('excludes marks an order-derived row already renders this pass', () => {
    const covered = marAdminKey('pat-1', 'ord-A', '08:00');
    const out = computeExtraMarks([entry(covered, { orderId: 'ord-A' })], new Set([covered]), 'pat-1');
    expect(out).toHaveLength(0);
  });

  it('excludes other clients and untouched marks, and returns [] with no patient', () => {
    const marks = [
      entry('k-other', { patientId: 'pat-2' }),
      entry('k-empty', { status: '' }),
      entry('k-ok'),
    ];
    expect(computeExtraMarks(marks, new Set(), 'pat-1')).toHaveLength(1);
    expect(computeExtraMarks(marks, new Set(), '')).toHaveLength(0);
  });
});
