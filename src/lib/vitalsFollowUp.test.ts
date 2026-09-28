import { describe, it, expect } from 'vitest';
import {
  assessVitalsFollowUp,
  firstSetAbnormalGroups,
  followUpSummary,
  minutesSince,
  vitalsFollowUpApplies,
  vitalsFollowUpGaps,
  FOLLOW_UP_ACTION_KEY,
  FOLLOW_UP_BASELINE,
  FOLLOW_UP_NOTE_KEY,
  FOLLOW_UP_TIME_KEY,
} from './vitalsFollowUp';
import { VITALS_RECHECK_COUNT_KEY, vitalsRecheckFieldKey } from './vitalsRecheck';
import { getVitalRanges } from './vitalRanges';
import { getIncompleteRequired } from './noteValidation';

const k = vitalsRecheckFieldKey;
const ranges = getVitalRanges('30');

/** An adult shift with a high pulse on the first set (Ma Jamie's 09/22 case). */
function note(extra: Record<string, string> = {}): Record<string, string> {
  return {
    q1_formRev: '4',
    q5_ageYears: '30',
    q7_shiftStart: '09:00',
    q16_temperature: '98.2',
    q17_systolic: '118',
    q17_diastolic: '76',
    q18_pulse: '102',
    q19_respiration: '16',
    q20_oxygenSaturation: '98',
    ...extra,
  };
}

const recheck = (index: number, fields: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(fields).map(([f, v]) => [k(index, f as 'time'), v]));

describe('firstSetAbnormalGroups', () => {
  it('finds the out-of-range vitals on the first set', () => {
    expect(firstSetAbnormalGroups(note(), ranges)).toEqual({ pulse: 'high' });
  });
  it('treats blood pressure as one group and reads the legacy S/D string', () => {
    const n = note({ q17_systolic: '', q17_diastolic: '', q17_bloodPressure: '150/95', q18_pulse: '70' });
    expect(firstSetAbnormalGroups(n, ranges)).toEqual({ bloodPressure: 'high' });
  });
  it('ignores blanks (a vital not obtained is not abnormal)', () => {
    expect(firstSetAbnormalGroups(note({ q18_pulse: '' }), ranges)).toEqual({});
  });
});

describe('minutesSince', () => {
  it('measures a same-day gap', () => expect(minutesSince('09:00', '09:20')).toBe(20));
  it('wraps past midnight for an overnight shift', () => expect(minutesSince('23:50', '00:10')).toBe(20));
  it('is null for a missing time', () => expect(minutesSince('', '09:20')).toBeNull());
});

describe('vitalsFollowUpGaps', () => {
  it('asks for nothing when every vital is in range', () => {
    expect(vitalsFollowUpGaps(note({ q18_pulse: '72' }), ranges)).toEqual([]);
  });

  it('requires a recheck that includes the abnormal vital', () => {
    const gaps = vitalsFollowUpGaps(note(), ranges);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].label).toMatch(/Recheck the pulse: 102 bpm is high/);
    expect(gaps[0].targetId).toBe('q16r_readingList');
  });

  it('a recheck of a different vital does not satisfy it', () => {
    const n = note({ [VITALS_RECHECK_COUNT_KEY]: '1', ...recheck(1, { time: '11:00', temperature: '98.4', temperatureRoute: 'Oral' }) });
    expect(vitalsFollowUpGaps(n, ranges).map((g) => g.targetId)).toEqual(['q16r_readingList']);
  });

  it('rejects a recheck taken before the rest interval and points at its time', () => {
    const n = note({ [VITALS_RECHECK_COUNT_KEY]: '1', ...recheck(1, { time: '09:10', pulse: '100' }) });
    const gaps = vitalsFollowUpGaps(n, ranges);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].label).toMatch(/at least 15 minutes after the shift start \(09:00\)/);
    expect(gaps[0].targetId).toBe(k(1, 'time'));
  });

  it('is satisfied by a later recheck that is back in range, and asks nothing more', () => {
    const n = note({ [VITALS_RECHECK_COUNT_KEY]: '1', ...recheck(1, { time: '11:00', pulse: '96' }) });
    expect(vitalsFollowUpGaps(n, ranges)).toEqual([]);
    expect(assessVitalsFollowUp(n, ranges).stillAbnormal).toEqual([]);
  });

  it('does not ask for more rechecks when the value stays abnormal; it asks what was done', () => {
    const n = note({ [VITALS_RECHECK_COUNT_KEY]: '1', ...recheck(1, { time: '11:00', pulse: '104' }) });
    const gaps = vitalsFollowUpGaps(n, ranges);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].label).toMatch(/what was done about the pulse/);
    expect(gaps[0].targetId).toBe(FOLLOW_UP_ACTION_KEY);
  });

  it('a notification needs its time; then the note submits', () => {
    const base = note({ [VITALS_RECHECK_COUNT_KEY]: '1', ...recheck(1, { time: '11:00', pulse: '104' }), [FOLLOW_UP_ACTION_KEY]: 'Notified RN supervisor' });
    expect(vitalsFollowUpGaps(base, ranges).map((g) => g.targetId)).toEqual([FOLLOW_UP_TIME_KEY]);
    expect(vitalsFollowUpGaps({ ...base, [FOLLOW_UP_TIME_KEY]: '11:05' }, ranges)).toEqual([]);
  });

  it('a baseline claim needs a note saying what the baseline is', () => {
    const base = note({ [VITALS_RECHECK_COUNT_KEY]: '1', ...recheck(1, { time: '11:00', pulse: '104' }), [FOLLOW_UP_ACTION_KEY]: FOLLOW_UP_BASELINE });
    expect(vitalsFollowUpGaps(base, ranges).map((g) => g.targetId)).toEqual([FOLLOW_UP_NOTE_KEY]);
    expect(vitalsFollowUpGaps({ ...base, [FOLLOW_UP_NOTE_KEY]: 'Resting pulse 100-105 per care plan (03/2026)' }, ranges)).toEqual([]);
  });

  it('judges by the LATEST recheck of that vital', () => {
    const n = note({
      [VITALS_RECHECK_COUNT_KEY]: '2',
      ...recheck(1, { time: '10:00', pulse: '104' }),
      ...recheck(2, { time: '12:00', pulse: '92' }),
    });
    expect(vitalsFollowUpGaps(n, ranges)).toEqual([]);
  });

  it('counts every recheck when the shift start is unknown', () => {
    const n = note({ q7_shiftStart: '', [VITALS_RECHECK_COUNT_KEY]: '1', ...recheck(1, { time: '09:05', pulse: '90' }) });
    expect(vitalsFollowUpGaps(n, ranges)).toEqual([]);
  });
});

describe('form revision gating', () => {
  it('applies to revision 4 notes and later only', () => {
    expect(vitalsFollowUpApplies({ q1_formRev: '4' })).toBe(true);
    expect(vitalsFollowUpApplies({ q1_formRev: '3' })).toBe(false);
    expect(vitalsFollowUpApplies({})).toBe(false);
  });

  it('is surfaced by the shared completeness check on Tab 2 for new notes, never for older ones', () => {
    const keys = (n: Record<string, string>) => getIncompleteRequired(n).filter((i) => i.key === 'q16r_readingList');
    expect(keys(note()).map((i) => i.tab)).toEqual([2]);
    expect(keys(note({ q1_formRev: '3' }))).toEqual([]);
  });
});

describe('followUpSummary', () => {
  it('reads as one line on the record', () => {
    expect(followUpSummary({ [FOLLOW_UP_ACTION_KEY]: 'Notified physician', [FOLLOW_UP_TIME_KEY]: '13:05', [FOLLOW_UP_NOTE_KEY]: 'Dr. Patel: continue to monitor.' }))
      .toBe('Notified physician at 13:05. Dr. Patel: continue to monitor.');
    expect(followUpSummary({})).toBe('');
  });
});
