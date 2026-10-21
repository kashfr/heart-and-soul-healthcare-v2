import { describe, it, expect } from 'vitest';
import {
  baselineCoversGroup,
  baselinesToDraft,
  baselinesToNoteFields,
  describeBaselines,
  hasAnyBaseline,
  parseBaselineDraft,
} from './vitalsBaselines';
import { BASELINE_NOTE_KEYS } from './vitalRanges';

describe('parseBaselineDraft', () => {
  it('stores only the vitals with both bounds; blank vitals mean "use the age range"', () => {
    const { baselines, errors } = parseBaselineDraft({ pulse: { low: '95', high: '110' }, temperature: { low: '', high: '' } });
    expect(errors).toEqual([]);
    expect(baselines).toEqual({ pulse: { low: 95, high: 110 } });
  });

  it('rejects a half range, an inverted range, and a value outside physiologic limits', () => {
    const { errors } = parseBaselineDraft({
      pulse: { low: '95', high: '' },
      oxygenSaturation: { low: '98', high: '92' },
      respiration: { low: '2', high: '20' },
    });
    expect(errors).toHaveLength(3);
    expect(errors[0]).toMatch(/Pulse: enter both/);
    expect(errors[1]).toMatch(/Respirations: must be between 4 and 80/);
    expect(errors[2]).toMatch(/SpO2: the low value \(98\) is above the high value \(92\)/);
  });

  it('round-trips through the editor draft', () => {
    const draft = baselinesToDraft({ systolic: { low: 100, high: 150 } });
    expect(draft.systolic).toEqual({ low: '100', high: '150' });
    expect(draft.pulse).toEqual({ low: '', high: '' });
    expect(parseBaselineDraft(draft).baselines).toEqual({ systolic: { low: 100, high: 150 } });
  });
});

describe('note snapshot', () => {
  it('writes every snapshot key, blank where the client has no baseline', () => {
    const fields = baselinesToNoteFields({ pulse: { low: 95, high: 110 } }, 'care plan 03/2026');
    expect(Object.keys(fields).sort()).toEqual([...BASELINE_NOTE_KEYS].sort());
    expect(fields.q16b_pulse_low).toBe('95');
    expect(fields.q16b_pulse_high).toBe('110');
    expect(fields.q16b_temperature_low).toBe('');
    expect(fields.q16b_note).toBe('care plan 03/2026');
  });

  it('a client without baselines clears the previous snapshot entirely', () => {
    const fields = baselinesToNoteFields(undefined, 'ignored');
    expect(Object.values(fields).every((v) => v === '')).toBe(true);
  });
});

describe('descriptions and coverage', () => {
  it('describes baselines in plain language with units', () => {
    expect(describeBaselines({ pulse: { low: 95, high: 110 }, oxygenSaturation: { low: 90, high: 100 } })).toBe(
      'Pulse 95 to 110 bpm, SpO2 90 to 100%',
    );
    expect(describeBaselines(undefined)).toBe('');
    expect(hasAnyBaseline({})).toBe(false);
  });

  it('knows which form vital groups a set of baselines covers (BP by either bound)', () => {
    const b = { diastolic: { low: 60, high: 95 } };
    expect(baselineCoversGroup(b, 'bloodPressure')).toBe(true);
    expect(baselineCoversGroup(b, 'pulse')).toBe(false);
    expect(baselineCoversGroup(undefined, 'pulse')).toBe(false);
  });
});
