import { describe, expect, it } from 'vitest';
import {
  amendmentChain,
  buildMarAdminFields,
  compareMarOrders,
  computeRequiredDoseGaps,
  doseTimeStatus,
  looksLikeUnknownPhysician,
  orderSignedAgeDays,
  physicianAttributionPending,
  physicianOrderStale,
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

  it('keeps the outcome (trimmed) only for a GIVEN PRN dose', () => {
    const prn = buildMarAdminFields(
      input({ scheduledTime: 'PRN', isPRN: true, reason: 'pain 6/10', outcome: '  pain 2/10 after 45 min ' }),
      meta,
    );
    expect(prn.outcome).toBe('pain 2/10 after 45 min');
  });

  it('blanks the outcome for scheduled given, held, and refused doses', () => {
    expect(buildMarAdminFields(input({ outcome: 'x' }), meta).outcome).toBe('');
    expect(
      buildMarAdminFields(
        input({ scheduledTime: 'PRN', isPRN: true, status: 'held', reason: 'asleep', outcome: 'x' }),
        meta,
      ).outcome,
    ).toBe('');
    expect(
      buildMarAdminFields(
        input({ scheduledTime: 'PRN', isPRN: true, status: 'refused', reason: 'declined', outcome: 'x' }),
        meta,
      ).outcome,
    ).toBe('');
  });

  it('a given PRN dose with no outcome yet stores an empty string (result pending), never undefined', () => {
    const f = buildMarAdminFields(input({ scheduledTime: 'PRN', isPRN: true, reason: 'pain' }), meta);
    expect(f.outcome).toBe('');
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

describe('physician attribution', () => {
  it('flags junk non-answers, tolerant of punctuation and case', () => {
    for (const junk of ['', '  ', 'N/A', 'n/a', 'NA', 'None', 'none.', 'UNKNOWN', 'unk', '?', '???', 'TBD', 't.b.d.', 'not available', 'Not Applicable', "don't know", 'x', 'XXX', 'pending']) {
      expect(looksLikeUnknownPhysician(junk), `"${junk}" should be junk`).toBe(true);
    }
  });

  it('accepts real names, including short and punctuated ones', () => {
    for (const name of ['Dr. Ali', 'Dr. Barnwell', 'Kendra Freeman', 'Emanuel mordi', 'Dr. X. Nunez', 'Wu']) {
      expect(looksLikeUnknownPhysician(name), `"${name}" should be accepted`).toBe(false);
    }
  });

  it('token-collision boundaries: prefixed short surnames pass; bare tokens are the documented tradeoff', () => {
    // "Na" and "Ng" are real surnames. With a Dr. prefix (how physicians are
    // recorded here) the strip yields 'drna'/'drng', which are accepted.
    expect(looksLikeUnknownPhysician('Dr. Na')).toBe(false);
    expect(looksLikeUnknownPhysician('Dr. Ng')).toBe(false);
    expect(looksLikeUnknownPhysician('Pending, Dr. Sarah')).toBe(false);
    // BARE 'na'/'unk' collide with the junk tokens: the form guides the user
    // to add the Dr. prefix. Documented false positive, entry-time only.
    expect(looksLikeUnknownPhysician('Na')).toBe(true);
    expect(looksLikeUnknownPhysician('unk')).toBe(true);
  });

  it('non-Latin-script names survive the strip (Unicode letters kept)', () => {
    expect(looksLikeUnknownPhysician('\uae40\uc601\uc218')).toBe(false); // Korean
    expect(looksLikeUnknownPhysician('\u0418\u0432\u0430\u043d\u043e\u0432')).toBe(false); // Cyrillic
    expect(looksLikeUnknownPhysician('N\u00fa\u00f1ez')).toBe(false); // accented Latin
  });

  it('pending when explicitly flagged OR when the stored value is legacy junk', () => {
    expect(physicianAttributionPending({ physicianPending: true, orderingPhysician: 'Dr. Ali' })).toBe(true);
    expect(physicianAttributionPending({ orderingPhysician: 'N/A' })).toBe(true);
    expect(physicianAttributionPending({ orderingPhysician: '' })).toBe(true);
    expect(physicianAttributionPending({})).toBe(true);
    expect(physicianAttributionPending({ orderingPhysician: 'Dr. Barnwell' })).toBe(false);
    expect(physicianAttributionPending({ physicianPending: false, orderingPhysician: 'Dr. Ali' })).toBe(false);
  });
});

describe('physician-order currency', () => {
  it('ages from orderSignedDate when present, else startDate', () => {
    expect(orderSignedAgeDays({ orderSignedDate: '2026-07-01', startDate: '2020-01-01' }, '2026-07-13')).toBe(12);
    expect(orderSignedAgeDays({ startDate: '2026-06-13' }, '2026-07-13')).toBe(30);
    expect(orderSignedAgeDays({}, '2026-07-13')).toBeNull();
    expect(orderSignedAgeDays({ startDate: 'garbage' }, '2026-07-13')).toBeNull();
  });

  it('stale past 365 days, or when undatable; a renewal refreshes it', () => {
    expect(physicianOrderStale({ startDate: '2025-06-07' }, '2026-07-13')).toBe(true); // 401d
    expect(physicianOrderStale({ startDate: '2025-08-01' }, '2026-07-13')).toBe(false); // 346d
    expect(physicianOrderStale({ startDate: '2025-06-07', orderSignedDate: '2026-05-01' }, '2026-07-13')).toBe(false);
    expect(physicianOrderStale({}, '2026-07-13')).toBe(true);
    // boundary: exactly 365 is still current
    expect(physicianOrderStale({ startDate: '2025-07-13' }, '2026-07-13')).toBe(false);
  });
});

describe('buildMarAdminFields: prescriber-notified attestation', () => {
  const meta: MarAdminFieldMeta = {
    patientId: 'p1',
    date: '2026-07-13',
    sourceNoteId: '',
    documenter: { uid: 'u1', name: 'Sam Jones', credential: 'RN' },
  };
  const base: MarAdminFieldInput = {
    orderId: 'o1', medName: 'Keppra', dose: '500', units: 'mg', route: 'PO',
    scheduledTime: '08:00', status: 'refused', administeredByType: 'nurse',
    administratorName: '', actualTime: '', initials: 'SJ', reason: 'Client refused',
  };

  it('persists the attestation on held/refused doses', () => {
    expect(buildMarAdminFields({ ...base, prescriberNotified: true }, meta).prescriberNotified).toBe(true);
    expect(buildMarAdminFields({ ...base, status: 'held', prescriberNotified: true }, meta).prescriberNotified).toBe(true);
    expect(buildMarAdminFields(base, meta).prescriberNotified).toBe(false);
  });

  it('forces FALSE on given doses — the load-bearing line for refused-to-given amendments', () => {
    // amendMarAdministration passes the original attestation through even when
    // the corrected status is 'given'; this is what guarantees it gets dropped.
    const rebuilt = buildMarAdminFields(
      { ...base, status: 'given', actualTime: '08:05', reason: '', prescriberNotified: true },
      meta,
    );
    expect(rebuilt.prescriberNotified).toBe(false);
  });
});

describe('computeRequiredDoseGaps', () => {
  const row = (orderId: string, slot: string, medName = 'Keppra', isPRN = false) => ({
    orderId,
    medName,
    slot,
    isPRN,
  });
  const base = {
    markedSlots: [] as Array<{ orderId: string; slot: string }>,
    priorSlots: [] as Array<{ orderId: string; slot: string }>,
    shiftStart: '08:00',
    shiftEnd: '16:00',
    shiftEndsNextDay: false,
  };

  it('requires only doses inside the shift window', () => {
    const gaps = computeRequiredDoseGaps({
      ...base,
      rows: [row('o1', '07:00'), row('o1', '09:00'), row('o1', '20:00')],
    });
    expect(gaps.map((g) => g.slot)).toEqual(['09:00']);
  });

  it('window is inclusive at both ends', () => {
    const gaps = computeRequiredDoseGaps({
      ...base,
      rows: [row('o1', '08:00'), row('o1', '16:00')],
    });
    expect(gaps.map((g) => g.slot)).toEqual(['08:00', '16:00']);
  });

  it('skips doses already marked in this note and doses documented by an earlier note today', () => {
    const gaps = computeRequiredDoseGaps({
      ...base,
      rows: [row('o1', '09:00'), row('o1', '12:00'), row('o2', '12:00')],
      markedSlots: [{ orderId: 'o1', slot: '09:00' }],
      priorSlots: [{ orderId: 'o1', slot: '12:00' }],
    });
    // same slot on a DIFFERENT order is still owed
    expect(gaps).toEqual([{ orderId: 'o2', medName: 'Keppra', slot: '12:00' }]);
  });

  it('never requires PRN rows', () => {
    const gaps = computeRequiredDoseGaps({
      ...base,
      rows: [row('o1', 'PRN', 'Tylenol', true), row('o2', 'PRN', 'Tylenol')],
    });
    expect(gaps).toEqual([]);
  });

  it('falls back to the whole day when the shift start is blank or unparseable', () => {
    for (const shiftStart of ['', 'soon']) {
      const gaps = computeRequiredDoseGaps({
        ...base,
        shiftStart,
        rows: [row('o1', '06:00'), row('o1', '22:00')],
      });
      expect(gaps.map((g) => g.slot)).toEqual(['06:00', '22:00']);
    }
  });

  it('missing shift end leaves the rest of the day in scope (nurse may not have clocked out)', () => {
    const gaps = computeRequiredDoseGaps({
      ...base,
      shiftEnd: '',
      rows: [row('o1', '07:00'), row('o1', '20:00')],
    });
    expect(gaps.map((g) => g.slot)).toEqual(['20:00']);
  });

  it('overnight shift (explicit next-day end date) drops the upper bound', () => {
    const gaps = computeRequiredDoseGaps({
      ...base,
      shiftStart: '19:00',
      shiftEnd: '07:00',
      shiftEndsNextDay: true,
      rows: [row('o1', '08:00'), row('o1', '21:00'), row('o1', '23:00')],
    });
    expect(gaps.map((g) => g.slot)).toEqual(['21:00', '23:00']);
  });

  it('infers overnight when the end time is before the start time', () => {
    const gaps = computeRequiredDoseGaps({
      ...base,
      shiftStart: '22:00',
      shiftEnd: '06:00',
      shiftEndsNextDay: false,
      rows: [row('o1', '21:00'), row('o1', '23:00')],
    });
    expect(gaps.map((g) => g.slot)).toEqual(['23:00']);
  });

  it('a slot with an unparseable time cannot be window-scoped, so it stays owed', () => {
    const gaps = computeRequiredDoseGaps({
      ...base,
      rows: [row('o1', 'bedtime')],
    });
    expect(gaps.map((g) => g.slot)).toEqual(['bedtime']);
  });
});
