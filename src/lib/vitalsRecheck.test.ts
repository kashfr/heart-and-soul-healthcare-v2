import { describe, it, expect } from 'vitest';
import {
  VITALS_RECHECK_COUNT_KEY,
  MAX_VITALS_RECHECKS,
  readVitalsRechecks,
  vitalsRecheckFieldKey,
  vitalsRecheckGaps,
  recheckAbnormalVitals,
  anyRecheckAbnormal,
  recheckBloodPressure,
  recheckWhen,
  vitalsRecheckAllKeys,
  collapseAddedRechecks,
  recheckAddedKey,
} from './vitalsRecheck';
import { getVitalRanges, hasAnyAbnormalVital } from './vitalRanges';
import { getCriticalFindings, summarizeFindings } from './criticalVitals';
import { getIncompleteRequired } from './noteValidation';

const k = vitalsRecheckFieldKey;

/** The 09/22/2026 case: pulse 102 on the first set, retaken after rest at 100. */
function annNote(extra: Record<string, string> = {}): Record<string, string> {
  return {
    q5_ageYears: '30',
    q18_pulse: '102',
    [VITALS_RECHECK_COUNT_KEY]: '1',
    [k(1, 'time')]: '11:00',
    [k(1, 'context')]: 'Resting / calm',
    [k(1, 'pulse')]: '100',
    [k(1, 'pulseSite')]: 'Radial',
    [k(1, 'notes')]: 'Retaken after 2 hours of rest',
    ...extra,
  };
}

describe('readVitalsRechecks', () => {
  it('reads nothing when there is no count key (notes written before the feature)', () => {
    expect(readVitalsRechecks({ q18_pulse: '80' })).toEqual([]);
  });

  it('reads only the counted blocks and trims values', () => {
    const list = readVitalsRechecks(annNote({ [k(2, 'pulse')]: '99' }));
    expect(list).toHaveLength(1);
    expect(list[0].pulse).toBe('100');
    expect(list[0].context).toBe('Resting / calm');
  });

  it('caps at the maximum number of rechecks', () => {
    expect(readVitalsRechecks({ [VITALS_RECHECK_COUNT_KEY]: '50' })).toHaveLength(MAX_VITALS_RECHECKS);
    expect(vitalsRecheckAllKeys(MAX_VITALS_RECHECKS)).toContain(k(MAX_VITALS_RECHECKS, 'notes'));
  });
});

describe('vitalsRecheckGaps', () => {
  it('accepts a partial reading: time plus one vital', () => {
    expect(vitalsRecheckGaps(annNote())).toEqual([]);
  });

  it('requires a time', () => {
    const gaps = vitalsRecheckGaps(annNote({ [k(1, 'time')]: '' }));
    expect(gaps.map((g) => g.targetId)).toEqual([k(1, 'time')]);
  });

  it('requires at least one vital', () => {
    const gaps = vitalsRecheckGaps(annNote({ [k(1, 'pulse')]: '' }));
    expect(gaps).toHaveLength(1);
    expect(gaps[0].label).toMatch(/at least one vital/);
  });

  it('rejects a half-entered blood pressure and points at the empty box', () => {
    const gaps = vitalsRecheckGaps(annNote({ [k(1, 'systolic')]: '120' }));
    expect(gaps.map((g) => g.targetId)).toEqual([k(1, 'diastolic')]);
  });

  it('requires the route once a temperature is present and the source once SpO2 is present', () => {
    const gaps = vitalsRecheckGaps(annNote({ [k(1, 'temperature')]: '98.6', [k(1, 'oxygenSaturation')]: '96' }));
    expect(gaps.map((g) => g.targetId)).toEqual([k(1, 'temperatureRoute'), k(1, 'oxygenSource')]);
  });

  it('is surfaced by the shared completeness check on Tab 2', () => {
    const issues = getIncompleteRequired({ q12_credential: 'RN', ...annNote({ [k(1, 'time')]: '' }) });
    const hit = issues.find((i) => i.key === k(1, 'time'));
    expect(hit?.tab).toBe(2);
    expect(hit?.label).toMatch(/Vitals recheck 1/);
  });
});

describe('abnormal and critical detection on rechecks', () => {
  const adultRanges = getVitalRanges('30');

  it('flags a recheck value outside the age range', () => {
    const [r] = readVitalsRechecks(annNote({ [k(1, 'pulse')]: '115' }));
    expect(recheckAbnormalVitals(r, adultRanges)).toEqual({ pulse: 'high' });
    expect(anyRecheckAbnormal(annNote({ [k(1, 'pulse')]: '115' }), adultRanges)).toBe(true);
  });

  it('a normal recheck after a normal first set is not abnormal', () => {
    expect(hasAnyAbnormalVital({ q5_ageYears: '30', q18_pulse: '80', ...annNote({ q18_pulse: '80', [k(1, 'pulse')]: '84' }) })).toBe(false);
  });

  it('the dashboard abnormal flag sees an abnormal recheck even when the first set was fine', () => {
    expect(hasAnyAbnormalVital(annNote({ q18_pulse: '80', [k(1, 'pulse')]: '115' }))).toBe(true);
  });

  it('a critical recheck value raises an escalation finding tagged with the reading', () => {
    const findings = getCriticalFindings(annNote({ q18_pulse: '90', [k(1, 'pulse')]: '140' }));
    expect(findings).toHaveLength(1);
    expect(findings[0].key).toBe('pulse');
    expect(findings[0].recheck).toEqual({ index: 1, when: 'at 11:00 (Resting / calm)' });
    expect(findings[0].message).toMatch(/^Recheck 1 at 11:00/);
    expect(summarizeFindings(findings)).toMatch(/\[recheck 1 at 11:00/);
  });

  it('a normal recheck never clears a critical first reading', () => {
    const findings = getCriticalFindings(annNote({ q18_pulse: '140', [k(1, 'pulse')]: '90' }));
    expect(findings).toHaveLength(1);
    expect(findings[0].recheck).toBeUndefined();
  });
});

describe('formatting helpers', () => {
  it('prints BP only when both halves exist', () => {
    expect(recheckBloodPressure({ systolic: '118', diastolic: '76' })).toBe('118/76');
    expect(recheckBloodPressure({ systolic: '118', diastolic: '' })).toBe('');
  });

  it('builds the heading suffix from time and context', () => {
    expect(recheckWhen({ time: '14:30', context: 'Sleeping' })).toBe('at 14:30 (Sleeping)');
    expect(recheckWhen({ time: '', context: '' })).toBe('');
  });
});

describe('collapseAddedRechecks', () => {
  const t1 = new Date('2026-09-22T16:37:22Z');
  const t2 = new Date('2026-09-23T14:00:00Z');
  const v = (oldValue: unknown, at: Date) => ({ oldValue, correctedAt: at, correctedBy: 'ZZ TEST ACCOUNT' });

  it('turns a recheck added by one amendment into a single "added" marker', () => {
    const raw = {
      [k(1, 'time')]: [v('', t1)],
      [k(1, 'pulse')]: [v(undefined, t1)],
      [k(1, 'systolic')]: [v(null, t1)],
      [k(1, 'notes')]: [v('', t1)],
      q22_additionalObservations: [v('', t1)], // not a recheck: untouched
    };
    const out = collapseAddedRechecks(raw);
    expect(out[k(1, 'time')]).toBeUndefined();
    expect(out[k(1, 'pulse')]).toBeUndefined();
    expect(out[k(1, 'systolic')]).toBeUndefined();
    expect(out[k(1, 'notes')]).toBeUndefined();
    expect(out[recheckAddedKey(1)]).toEqual([v('', t1)]);
    expect(out.q22_additionalObservations).toEqual([v('', t1)]);
  });

  it('keeps a later real correction to an added recheck', () => {
    const out = collapseAddedRechecks({
      [k(1, 'time')]: [v('', t1)],
      [k(1, 'pulse')]: [v('', t1), v('82', t2)],
    });
    expect(out[k(1, 'pulse')]).toEqual([v('82', t2)]);
    expect(out[recheckAddedKey(1)]).toBeDefined();
  });

  it('keeps a vital added to an existing recheck by a later amendment', () => {
    const out = collapseAddedRechecks({
      [k(1, 'time')]: [v('', t1)],
      [k(1, 'systolic')]: [v('', t2)],
    });
    expect(out[k(1, 'systolic')]).toEqual([v('', t2)]);
  });

  it('leaves a recheck that existed at submission alone', () => {
    const raw = {
      [k(1, 'time')]: [v('11:00', t1)], // time corrected, not created
      [k(1, 'systolic')]: [v('', t1)], // BP added to an existing reading
    };
    const out = collapseAddedRechecks(raw);
    expect(out).toEqual(raw);
    expect(out[recheckAddedKey(1)]).toBeUndefined();
  });
});
