import { describe, expect, it } from 'vitest';
import {
  describeScaleRow,
  findSlidingScaleRow,
  formatScaleRange,
  formatScaleUnits,
  hasSlidingScale,
  isNoInsulinEntry,
  lookupScaleDose,
  parseGlucoseReading,
  parseSlidingScale,
  resolveScaleCharting,
  scaleMarkDoseGiven,
  scaleMarkProblems,
  slidingScaleFromForm,
  slidingScaleKey,
  slidingScaleToForm,
  starterSlidingScaleForm,
  summarizeSlidingScale,
  validateSlidingScale,
  validateSlidingScaleForm,
  EMPTY_SCALE_ENTRY,
  type SlidingScaleRow,
} from './slidingScale';

// A typical order: nothing under 150, stepping up by 2 units, call above 400.
const SCALE: SlidingScaleRow[] = [
  { min: 0, max: 69, units: 0, instruction: 'Treat low blood sugar, call the physician' },
  { min: 70, max: 150, units: 0, instruction: '' },
  { min: 151, max: 200, units: 2, instruction: '' },
  { min: 201, max: 250, units: 4, instruction: '' },
  { min: 251, max: 300, units: 6, instruction: '' },
  { min: 301, max: 400, units: 8, instruction: '' },
  { min: 401, max: null, units: 10, instruction: 'Call the physician' },
];

describe('parseSlidingScale', () => {
  it('coerces stored and posted rows, sorted by range', () => {
    const rows = parseSlidingScale([
      { min: '151', max: '', units: '2', instruction: ' Call ' },
      { min: 0, max: 150, units: 0 },
    ]);
    expect(rows).toEqual([
      { min: 0, max: 150, units: 0, instruction: '' },
      { min: 151, max: null, units: 2, instruction: 'Call' },
    ]);
  });

  it('drops rows that are not numbers and tolerates junk input', () => {
    expect(parseSlidingScale(null)).toEqual([]);
    expect(parseSlidingScale('nope')).toEqual([]);
    expect(parseSlidingScale([{ min: 'a', max: 5, units: 1 }, null, 7, { min: 0, max: 'x', units: 1 }])).toEqual([]);
    expect(hasSlidingScale({ slidingScale: [] })).toBe(false);
    expect(hasSlidingScale({ slidingScale: SCALE })).toBe(true);
    expect(hasSlidingScale(undefined)).toBe(false);
  });
});

describe('validateSlidingScale', () => {
  it('accepts a scale that covers every reading exactly once', () => {
    expect(validateSlidingScale(SCALE)).toBeNull();
  });

  it('rejects a scale that does not start at 0', () => {
    expect(validateSlidingScale(SCALE.slice(1))).toMatch(/start at 0/);
  });

  it('rejects gaps and overlaps', () => {
    const gap = SCALE.map((r) => (r.min === 151 ? { ...r, min: 160 } : r));
    expect(validateSlidingScale(gap)).toMatch(/no gaps or overlaps/);
    const overlap = SCALE.map((r) => (r.min === 151 ? { ...r, min: 140 } : r));
    expect(validateSlidingScale(overlap)).toMatch(/no gaps or overlaps/);
  });

  it('requires an open-ended last range and at least two ranges', () => {
    const capped = SCALE.map((r) => (r.max === null ? { ...r, max: 600 } : r));
    expect(validateSlidingScale(capped)).toMatch(/open-ended/);
    expect(validateSlidingScale([SCALE[0]])).toMatch(/at least two/);
  });

  it('rejects implausible units and non-whole glucose values', () => {
    expect(validateSlidingScale(SCALE.map((r) => (r.min === 151 ? { ...r, units: 250 } : r)))).toMatch(/units must be/);
    expect(
      validateSlidingScale([
        { min: 0, max: 150.5, units: 0, instruction: '' },
        { min: 151.5, max: null, units: 2, instruction: '' },
      ]),
    ).toMatch(/whole numbers/);
  });
});

describe('the order form rows', () => {
  it('round-trips with the stored rows', () => {
    const form = slidingScaleToForm(SCALE);
    expect(form[0]).toEqual({ upTo: '69', units: '0', instruction: 'Treat low blood sugar, call the physician' });
    expect(form[form.length - 1].upTo).toBe('');
    expect(slidingScaleFromForm(form)).toEqual(SCALE);
    expect(validateSlidingScaleForm(form)).toBeNull();
  });

  it('builds each range from where the one before it ends, so they cannot overlap', () => {
    const rows = slidingScaleFromForm([
      { upTo: '150', units: '0', instruction: '' },
      { upTo: '200', units: '2', instruction: '' },
      { upTo: 'ignored on the last row', units: '4', instruction: '' },
    ]);
    expect(rows?.map((r) => [r.min, r.max])).toEqual([
      [0, 150],
      [151, 200],
      [201, null],
    ]);
  });

  it('names the range that is incomplete', () => {
    const form = slidingScaleToForm(SCALE);
    expect(validateSlidingScaleForm(form.map((r, i) => (i === 2 ? { ...r, units: '' } : r)))).toMatch(/range 3.*units/i);
    expect(validateSlidingScaleForm(form.map((r, i) => (i === 1 ? { ...r, upTo: '' } : r)))).toMatch(/range 2.*up to/i);
    expect(validateSlidingScaleForm([form[0]])).toMatch(/at least two/);
  });

  it('rejects a range that ends below where it starts', () => {
    const form = [
      { upTo: '200', units: '0', instruction: '' },
      { upTo: '150', units: '2', instruction: '' },
      { upTo: '', units: '4', instruction: '' },
    ];
    expect(validateSlidingScaleForm(form)).toMatch(/range 2.*201/i);
  });

  it('the starter layout leaves every amount blank: doses come from the order, never a default', () => {
    const starter = starterSlidingScaleForm();
    expect(starter.every((r) => r.units === '')).toBe(true);
    expect(validateSlidingScaleForm(starter)).toMatch(/range 1.*units/i);
  });
});

describe('looking a dose up from a reading', () => {
  it('finds the range at both edges', () => {
    expect(findSlidingScaleRow(SCALE, 150)?.units).toBe(0);
    expect(findSlidingScaleRow(SCALE, 151)?.units).toBe(2);
    expect(findSlidingScaleRow(SCALE, 200)?.units).toBe(2);
    expect(findSlidingScaleRow(SCALE, 201)?.units).toBe(4);
    expect(findSlidingScaleRow(SCALE, 401)?.units).toBe(10);
    expect(findSlidingScaleRow(SCALE, 999)?.units).toBe(10);
    expect(findSlidingScaleRow(SCALE, 0)?.units).toBe(0);
  });

  it('only accepts a plausible whole-number meter reading', () => {
    expect(parseGlucoseReading('182')).toBe(182);
    expect(parseGlucoseReading(' 95 ')).toBe(95);
    expect(parseGlucoseReading('')).toBeNull();
    expect(parseGlucoseReading('18.2')).toBeNull();
    expect(parseGlucoseReading('HI')).toBeNull();
    expect(parseGlucoseReading('5')).toBeNull();
    expect(parseGlucoseReading('1820')).toBeNull();
  });

  it('flags a low reading and reports the matched range in words', () => {
    const low = lookupScaleDose(SCALE, '62');
    expect(low.low).toBe(true);
    expect(low.scaleDose).toBe('0');
    expect(low.scaleRange).toBe('Below 70 mg/dL: 0 units (no insulin). Treat low blood sugar, call the physician');
    const high = lookupScaleDose(SCALE, '232');
    expect(high.low).toBe(false);
    expect(high.scaleDose).toBe('4');
    expect(high.scaleRange).toBe('201-250 mg/dL: 4 units');
    expect(lookupScaleDose(SCALE, 'abc')).toMatchObject({ reading: null, row: null, scaleDose: '' });
  });

  it('words ranges and amounts the way an order reads', () => {
    expect(formatScaleRange(SCALE[0])).toBe('Below 70');
    expect(formatScaleRange(SCALE[2])).toBe('151-200');
    expect(formatScaleRange(SCALE[6])).toBe('Above 400');
    expect(formatScaleUnits(1)).toBe('1 unit');
    expect(formatScaleUnits(4)).toBe('4 units');
    expect(formatScaleUnits(0)).toBe('0 units (no insulin)');
    expect(describeScaleRow(SCALE[6])).toBe('Above 400 mg/dL: 10 units. Call the physician');
    expect(summarizeSlidingScale(SCALE.slice(1, 3))).toBe('70-150: 0 | 151-200: 2');
  });

  it('keys a scale by its content, so a re-save is not a change', () => {
    expect(slidingScaleKey(SCALE)).toBe(slidingScaleKey(slidingScaleFromForm(slidingScaleToForm(SCALE))));
    expect(slidingScaleKey([])).toBe('');
    expect(slidingScaleKey(SCALE)).not.toBe(slidingScaleKey(SCALE.map((r) => (r.min === 151 ? { ...r, units: 3 } : r))));
  });
});

describe('resolveScaleCharting', () => {
  it('a given dose needs the reading, and takes its amount from the scale', () => {
    expect(resolveScaleCharting(SCALE, 'given', EMPTY_SCALE_ENTRY).errors.glucoseReading).toMatch(/reading from the meter/);
    const r = resolveScaleCharting(SCALE, 'given', { ...EMPTY_SCALE_ENTRY, glucoseReading: '232' });
    expect(r.errors).toEqual({});
    expect(r).toMatchObject({ glucoseReading: '232', scaleDose: '4', doseGiven: '4', deviationReason: '' });
  });

  it('a reading that calls for no insulin records 0 units given', () => {
    const r = resolveScaleCharting(SCALE, 'given', { ...EMPTY_SCALE_ENTRY, glucoseReading: '112' });
    expect(r.errors).toEqual({});
    expect(r.doseGiven).toBe('0');
  });

  it('held and refused may carry a reading but do not need one, and record no amount', () => {
    expect(resolveScaleCharting(SCALE, 'refused', EMPTY_SCALE_ENTRY).errors).toEqual({});
    const held = resolveScaleCharting(SCALE, 'held', { ...EMPTY_SCALE_ENTRY, glucoseReading: '232' });
    expect(held.errors).toEqual({});
    expect(held).toMatchObject({ glucoseReading: '232', scaleDose: '4', doseGiven: '' });
  });

  it('rejects an implausible reading on any status', () => {
    expect(resolveScaleCharting(SCALE, 'held', { ...EMPTY_SCALE_ENTRY, glucoseReading: '5' }).errors.glucoseReading).toMatch(/whole number/);
  });

  it('a different amount needs the amount and the reason', () => {
    const custom = { ...EMPTY_SCALE_ENTRY, glucoseReading: '232', customDose: true };
    expect(resolveScaleCharting(SCALE, 'given', custom).errors.unitsGiven).toBeTruthy();
    expect(resolveScaleCharting(SCALE, 'given', { ...custom, unitsGiven: '6' }).errors.deviationReason).toBeTruthy();
    const ok = resolveScaleCharting(SCALE, 'given', { ...custom, unitsGiven: '6', deviationReason: ' phone order ' });
    expect(ok.errors).toEqual({});
    expect(ok).toMatchObject({ doseGiven: '6', scaleDose: '4', deviationReason: 'phone order' });
  });

  it('a "different" amount that equals the scale needs no reason and keeps none', () => {
    const r = resolveScaleCharting(SCALE, 'given', {
      glucoseReading: '232',
      customDose: true,
      unitsGiven: '4',
      deviationReason: 'stale text',
    });
    expect(r.errors).toEqual({});
    expect(r.deviationReason).toBe('');
  });

  it('refuses a reading a malformed scale does not cover', () => {
    const holey = [SCALE[2], SCALE[3]];
    expect(resolveScaleCharting(holey, 'given', { ...EMPTY_SCALE_ENTRY, glucoseReading: '100' }).errors.glucoseReading).toMatch(/not covered/);
  });
});

describe('progress-note marks', () => {
  it('lists what a given mark still needs', () => {
    expect(scaleMarkProblems({ status: 'given' })).toEqual(['the blood glucose reading (the dose is looked up from it)']);
    expect(scaleMarkProblems({ status: 'given', glucoseReading: '232', scaleDose: '4' })).toEqual([]);
    expect(scaleMarkProblems({ status: 'given', glucoseReading: '232', scaleDose: '' })[0]).toMatch(/scale covers/);
    expect(scaleMarkProblems({ status: 'given', glucoseReading: '2' })[0]).toMatch(/between 10 and 999/);
    expect(
      scaleMarkProblems({ status: 'given', glucoseReading: '232', scaleDose: '4', scaleCustomDose: true }),
    ).toEqual(['the units actually given']);
    expect(
      scaleMarkProblems({ status: 'given', glucoseReading: '232', scaleDose: '4', scaleCustomDose: true, scaleUnitsGiven: '6' }),
    ).toEqual(['why the amount given differs from the sliding scale']);
    expect(
      scaleMarkProblems({
        status: 'given',
        glucoseReading: '232',
        scaleDose: '4',
        scaleCustomDose: true,
        scaleUnitsGiven: '6',
        scaleDeviationReason: 'phone order',
      }),
    ).toEqual([]);
  });

  it('asks nothing of a held, refused, or untouched mark without a reading', () => {
    expect(scaleMarkProblems({ status: 'held' })).toEqual([]);
    expect(scaleMarkProblems({ status: 'refused' })).toEqual([]);
    expect(scaleMarkProblems({ status: '' })).toEqual([]);
  });

  it('records the scale amount unless a different one was entered', () => {
    expect(scaleMarkDoseGiven({ scaleDose: '4' })).toBe('4');
    expect(scaleMarkDoseGiven({ scaleDose: '4', scaleCustomDose: true, scaleUnitsGiven: '6' })).toBe('6');
    expect(scaleMarkDoseGiven({ scaleDose: '4', scaleCustomDose: true, scaleUnitsGiven: '' })).toBe('');
  });
});

describe('isNoInsulinEntry', () => {
  it('is a sliding-scale check that was done and called for nothing', () => {
    expect(isNoInsulinEntry({ status: 'given', glucoseReading: '112', doseSnapshot: '0' })).toBe(true);
    expect(isNoInsulinEntry({ status: 'given', glucoseReading: '232', doseSnapshot: '4' })).toBe(false);
    expect(isNoInsulinEntry({ status: 'held', glucoseReading: '112', doseSnapshot: '0' })).toBe(false);
    // An ordinary dose with no reading is never one, whatever its dose text.
    expect(isNoInsulinEntry({ status: 'given', glucoseReading: '', doseSnapshot: '0' })).toBe(false);
  });
});
