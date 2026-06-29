import { describe, expect, it } from 'vitest';
import {
  buildFieldAmendments,
  buildAmendmentWhyLog,
  prettyFieldName,
  prettyValue,
  type AmendmentSourceEntry,
} from './revisionFormat';

function entry(over: Partial<AmendmentSourceEntry> & { changes: AmendmentSourceEntry['changes'] }): AmendmentSourceEntry {
  return {
    editedByName: 'Sam Jones',
    editedByRole: 'nurse',
    editedAt: new Date('2026-06-29T14:00:00Z'),
    ...over,
  };
}

describe('buildFieldAmendments', () => {
  it('records one prior value per edit, tagged with who/when, oldest-first', () => {
    const t1 = new Date('2026-06-29T10:00:00Z');
    const t2 = new Date('2026-06-29T12:00:00Z');
    // Out of order on input; helper must sort oldest-first.
    const out = buildFieldAmendments([
      entry({ editedAt: t2, editedByName: 'B', changes: { q3_clientName: { from: 'Bob', to: 'Bobby' } } }),
      entry({ editedAt: t1, editedByName: 'A', changes: { q3_clientName: { from: 'Rob', to: 'Bob' } } }),
    ]);
    expect(out.q3_clientName.map((v) => v.oldValue)).toEqual(['Rob', 'Bob']);
    expect(out.q3_clientName.map((v) => v.correctedBy)).toEqual(['A', 'B']);
    expect(out.q3_clientName[0].correctedAt).toBe(t1);
  });

  it('captures every field changed in a single edit', () => {
    const out = buildFieldAmendments([
      entry({ changes: { q7_shiftStart: { from: '08:00', to: '07:30' }, q62_shiftEndTime: { from: '16:00', to: '15:30' } } }),
    ]);
    expect(Object.keys(out).sort()).toEqual(['q62_shiftEndTime', 'q7_shiftStart']);
    expect(out.q7_shiftStart[0].oldValue).toBe('08:00');
  });

  it('returns an empty map when nothing was amended', () => {
    expect(buildFieldAmendments([])).toEqual({});
  });
});

describe('buildAmendmentWhyLog', () => {
  it('keeps one line per edit event that has a reason, oldest-first, trimmed', () => {
    const t1 = new Date('2026-06-29T10:00:00Z');
    const t2 = new Date('2026-06-29T12:00:00Z');
    const log = buildAmendmentWhyLog([
      entry({ editedAt: t2, reason: '  updated per supervisor  ', changes: { q14_behavior: { from: 'x', to: 'y' } } }),
      entry({ editedAt: t1, reason: 'corrected a data-entry error', changes: { q3_clientName: { from: 'a', to: 'b' } } }),
      entry({ editedAt: t1, reason: '', changes: { q9_totalHours: { from: '7', to: '8' } } }), // no reason -> dropped
    ]);
    expect(log.map((l) => l.reason)).toEqual(['corrected a data-entry error', 'updated per supervisor']);
  });

  it('does not repeat the reason per changed field (one entry per event)', () => {
    const log = buildAmendmentWhyLog([
      entry({ reason: 'fixed both times', changes: { q7_shiftStart: { from: '8', to: '7' }, q62_shiftEndTime: { from: '4', to: '3' } } }),
    ]);
    expect(log).toHaveLength(1);
  });
});

describe('prettyFieldName / prettyValue (existing, sanity)', () => {
  it('maps known keys and camelCase', () => {
    expect(prettyFieldName('q4_dateofBirth')).toBe('Date of Birth');
    expect(prettyFieldName('q3_clientName')).toBe('Client Name');
  });
  it('renders empty as em dash and passes strings through', () => {
    expect(prettyValue('')).toBe('—');
    expect(prettyValue('hello')).toBe('hello');
  });
});
