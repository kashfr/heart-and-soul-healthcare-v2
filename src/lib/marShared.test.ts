import { describe, expect, it } from 'vitest';
import {
  amendmentChain,
  buildMarAdminFields,
  compareMarOrders,
  doseTimeStatus,
  parseHHMM,
  resolveCurrentAdministrations,
  type MarAdminFieldInput,
  type MarAdminFieldMeta,
} from './marShared';

const meta: MarAdminFieldMeta = {
  patientId: 'pat-1',
  date: '2026-06-15',
  sourceNoteId: 'note-1',
  documenter: { uid: 'uid-9', name: 'Sam Jones', credential: 'RN' },
};

function input(overrides: Partial<MarAdminFieldInput> = {}): MarAdminFieldInput {
  return {
    orderId: 'ord-1',
    medName: 'Acetaminophen',
    dose: '500',
    units: 'mg',
    route: 'PO (by mouth)',
    scheduledTime: '08:00',
    status: 'given',
    administeredByType: 'nurse',
    administratorName: '',
    actualTime: '08:05',
    initials: 'SJ',
    reason: '',
    ...overrides,
  };
}

describe('buildMarAdminFields', () => {
  it('pins identity + documenter from meta, never from the row', () => {
    const f = buildMarAdminFields(input(), meta);
    expect(f.patientId).toBe('pat-1');
    expect(f.date).toBe('2026-06-15');
    expect(f.sourceNoteId).toBe('note-1');
    expect(f.documentedBy).toBe('uid-9');
    expect(f.documentedByName).toBe('Sam Jones');
    expect(f.documentedByCredential).toBe('RN');
  });

  it('blanks the reason for a SCHEDULED given dose (a scheduled dose carries no reason)', () => {
    const f = buildMarAdminFields(input({ status: 'given', reason: 'should be dropped' }), meta);
    expect(f.reason).toBe('');
    expect(f.actualTime).toBe('08:05');
  });

  it('PRESERVES the reason for a PRN given dose (the why-given indication)', () => {
    const f = buildMarAdminFields(
      input({ status: 'given', scheduledTime: 'PRN', isPRN: true, reason: '  pain 6/10  ' }),
      meta,
    );
    expect(f.reason).toBe('pain 6/10');
  });

  it('treats scheduledTime "PRN" as PRN even when isPRN flag is absent', () => {
    const f = buildMarAdminFields(input({ status: 'given', scheduledTime: 'PRN', reason: 'fever' }), meta);
    expect(f.reason).toBe('fever');
  });

  it('keeps the reason for held / refused and drops the actual time', () => {
    const held = buildMarAdminFields(input({ status: 'held', actualTime: '08:05', reason: ' asleep ' }), meta);
    expect(held.reason).toBe('asleep');
    expect(held.actualTime).toBe('');
    const refused = buildMarAdminFields(input({ status: 'refused', reason: 'declined' }), meta);
    expect(refused.reason).toBe('declined');
  });

  it('snapshots the order indication onto the record', () => {
    const f = buildMarAdminFields(input({ indication: '  Moderate pain  ' }), meta);
    expect(f.indicationSnapshot).toBe('Moderate pain');
    expect(buildMarAdminFields(input(), meta).indicationSnapshot).toBe('');
  });

  it('blanks administratorName when the nurse gave it, keeps it (trimmed) otherwise', () => {
    expect(buildMarAdminFields(input({ administeredByType: 'nurse', administratorName: 'X' }), meta).administratorName).toBe('');
    const fam = buildMarAdminFields(input({ administeredByType: 'family', administratorName: '  Jane Doe ' }), meta);
    expect(fam.administeredByType).toBe('family');
    expect(fam.administratorName).toBe('Jane Doe');
  });
});

describe('compareMarOrders', () => {
  it('orders by med name, then start date, then id', () => {
    const rows = [
      { medName: 'Zinc', startDate: '2026-01-01', id: 'b' },
      { medName: 'Aspirin', startDate: '2026-02-01', id: 'a' },
      { medName: 'Aspirin', startDate: '2026-01-01', id: 'c' },
    ];
    const sorted = [...rows].sort(compareMarOrders).map((r) => r.id);
    expect(sorted).toEqual(['c', 'a', 'b']);
  });
});

describe('parseHHMM', () => {
  it('parses valid 24h times to minutes since midnight', () => {
    expect(parseHHMM('08:00')).toBe(480);
    expect(parseHHMM('8:00')).toBe(480);
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('23:59')).toBe(1439);
  });
  it('rejects out-of-range, non-time, and empty values', () => {
    expect(parseHHMM('24:00')).toBeNull();
    expect(parseHHMM('08:60')).toBeNull();
    expect(parseHHMM('PRN')).toBeNull();
    expect(parseHHMM('')).toBeNull();
    expect(parseHHMM('unscheduled')).toBeNull();
  });
});

describe('doseTimeStatus', () => {
  it('is "none" for a non-today date no matter the clock (never paints a backdated note)', () => {
    expect(doseTimeStatus('08:00', 9 * 60, { isToday: false })).toBe('none');
    expect(doseTimeStatus('08:00', 23 * 60, { isToday: false })).toBe('none');
  });
  it('is "none" for PRN / unparseable times', () => {
    expect(doseTimeStatus('PRN', 600, { isToday: true })).toBe('none');
    expect(doseTimeStatus('', 600, { isToday: true })).toBe('none');
  });
  it('is "future" before the scheduled time', () => {
    expect(doseTimeStatus('08:00', 8 * 60 - 1, { isToday: true })).toBe('future');
  });
  it('is "due" from the scheduled time through the grace window (default 60m)', () => {
    expect(doseTimeStatus('08:00', 8 * 60, { isToday: true })).toBe('due'); // exactly due
    expect(doseTimeStatus('08:00', 9 * 60, { isToday: true })).toBe('due'); // +60m, edge
  });
  it('is "late" past the grace window', () => {
    expect(doseTimeStatus('08:00', 9 * 60 + 1, { isToday: true })).toBe('late'); // +61m
  });
  it('respects a custom grace window', () => {
    expect(doseTimeStatus('08:00', 8 * 60 + 20, { isToday: true, graceMin: 15 })).toBe('late');
    expect(doseTimeStatus('08:00', 8 * 60 + 10, { isToday: true, graceMin: 15 })).toBe('due');
  });
});

describe('resolveCurrentAdministrations / amendmentChain', () => {
  // a (original) -> b (amends a) -> c (amends b); plus standalone d.
  const list = [
    { id: 'a', amends: undefined, status: 'given' },
    { id: 'b', amends: 'a', status: 'held' },
    { id: 'c', amends: 'b', status: 'refused' },
    { id: 'd', amends: undefined, status: 'given' },
  ];

  it('keeps only the live (non-superseded) record of each chain', () => {
    const current = resolveCurrentAdministrations(list).map((r) => r.id).sort();
    expect(current).toEqual(['c', 'd']);
  });

  it('returns standalone records untouched when nothing is amended', () => {
    const flat = [{ id: 'x' }, { id: 'y' }];
    expect(resolveCurrentAdministrations(flat).map((r) => r.id)).toEqual(['x', 'y']);
  });

  it('walks the full chain oldest-first for the audit trail', () => {
    const c = list.find((r) => r.id === 'c')!;
    expect(amendmentChain(c, list).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('a record with no amendments is its own one-item chain', () => {
    const d = list.find((r) => r.id === 'd')!;
    expect(amendmentChain(d, list).map((r) => r.id)).toEqual(['d']);
  });

  it('is cycle-safe if pointers ever loop', () => {
    const looped = [
      { id: 'p', amends: 'q' },
      { id: 'q', amends: 'p' },
    ];
    const p = looped[0];
    expect(() => amendmentChain(p, looped)).not.toThrow();
  });
});
