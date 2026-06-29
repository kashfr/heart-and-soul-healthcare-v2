import { describe, expect, it } from 'vitest';
import { buildMarAdminFields, compareMarOrders, type MarAdminFieldInput, type MarAdminFieldMeta } from './marShared';

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
