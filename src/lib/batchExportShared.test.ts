import { describe, expect, it } from 'vitest';
import { compareChronological, type ChronoNote } from './batchExportShared';

const note = (over: Partial<ChronoNote['form']>): ChronoNote => ({
  form: { q6_dateofService: '', q7_shiftStart: '', q3_clientName: '', ...over },
});

describe('compareChronological (batch export order)', () => {
  it('exports oldest to newest regardless of selection order (the newest-first regression)', () => {
    // The submissions list defaults to newest first, and "select all" inserted
    // ids in that order, so exports came out newest first. Feed the same
    // newest-first order in and require oldest-first out.
    const input = [
      note({ q6_dateofService: '2026-08-29', q3_clientName: 'Ann Torres' }),
      note({ q6_dateofService: '2026-08-15', q3_clientName: 'Ann Torres' }),
      note({ q6_dateofService: '2026-08-01', q3_clientName: 'Ann Torres' }),
    ];
    const out = [...input].sort(compareChronological).map((n) => n.form.q6_dateofService);
    expect(out).toEqual(['2026-08-01', '2026-08-15', '2026-08-29']);
  });

  it('is independent of checkbox click order', () => {
    const a = note({ q6_dateofService: '2026-07-05' });
    const b = note({ q6_dateofService: '2026-07-20' });
    const c = note({ q6_dateofService: '2026-07-12' });
    const expected = ['2026-07-05', '2026-07-12', '2026-07-20'];
    for (const perm of [[a, b, c], [c, a, b], [b, c, a]]) {
      expect([...perm].sort(compareChronological).map((n) => n.form.q6_dateofService)).toEqual(expected);
    }
  });

  it('handles legacy MM/DD/YYYY dates and orders across a year boundary correctly', () => {
    const input = [note({ q6_dateofService: '01/05/2026' }), note({ q6_dateofService: '12/30/2025' })];
    const out = [...input].sort(compareChronological).map((n) => n.form.q6_dateofService);
    expect(out).toEqual(['12/30/2025', '01/05/2026']);
  });

  it('breaks same-day ties by shift start, then client name; undated notes sort last', () => {
    const input = [
      note({ q6_dateofService: '', q3_clientName: 'Zed' }),
      note({ q6_dateofService: '2026-08-10', q7_shiftStart: '19:00', q3_clientName: 'Ann Torres' }),
      note({ q6_dateofService: '2026-08-10', q7_shiftStart: '08:00', q3_clientName: 'Kimberly Guffey' }),
      note({ q6_dateofService: '2026-08-10', q7_shiftStart: '08:00', q3_clientName: 'Ann Torres' }),
    ];
    const out = [...input].sort(compareChronological).map((n) => `${n.form.q7_shiftStart}|${n.form.q3_clientName}`);
    expect(out).toEqual(['08:00|Ann Torres', '08:00|Kimberly Guffey', '19:00|Ann Torres', '|Zed']);
  });
});
