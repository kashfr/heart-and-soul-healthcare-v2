import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  readSeizureEntries,
  seizureAdvisories,
  seizureDurationSeconds,
  seizureFieldKey,
  seizureGaps,
  sortSeizuresByStart,
} from './seizureShared';

const entry = (i: number, over: Record<string, string>): Record<string, string> => {
  const base: Record<string, string> = {
    startTime: '', endTime: '', durationSeconds: '', seizureType: '', witnessedBy: '', observations: '',
    interventions: '', rescueMed: '', rescueMedTime: '', response: '', postState: '', minutesToBaseline: '',
    physicianNotified: '', physicianNotifiedTime: '', familyNotified: '', notes: '', ...over,
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) out[seizureFieldKey(i, k as never)] = v;
  return out;
};
const complete = (i: number, over: Record<string, string> = {}) =>
  entry(i, { startTime: '16:15', endTime: '16:15', durationSeconds: '9', seizureType: 'Atonic / drop (sudden loss of tone)', witnessedBy: 'Nurse witnessed', ...over });

describe('seizureDurationSeconds', () => {
  it('a typed duration wins over the clock (drop seizures are shorter than a minute)', () => {
    // Kimberly's real charting: onset 16:15, end 16:15, "9 seconds" in the description.
    expect(seizureDurationSeconds({ startTime: '16:15', endTime: '16:15', durationSeconds: '9' })).toBe(9);
  });
  it('falls back to end minus start, crossing midnight', () => {
    expect(seizureDurationSeconds({ startTime: '13:00', endTime: '13:01', durationSeconds: '' })).toBe(60);
    expect(seizureDurationSeconds({ startTime: '23:58', endTime: '00:02', durationSeconds: '' })).toBe(240);
  });
  it('is null when nothing usable', () => {
    expect(seizureDurationSeconds({ startTime: '', endTime: '', durationSeconds: '' })).toBeNull();
    expect(seizureDurationSeconds({ startTime: '13:00', endTime: '', durationSeconds: '' })).toBeNull();
  });
  it('formats seconds and minutes', () => {
    expect(formatDuration(9)).toBe('9 sec');
    expect(formatDuration(60)).toBe('1 min');
    expect(formatDuration(330)).toBe('5 min 30 sec');
    expect(formatDuration(null)).toBe('');
  });
});

describe('readSeizureEntries', () => {
  it('reads the numbered blocks up to the count', () => {
    const v = { q69_seizureCount: '2', ...complete(1), ...complete(2, { startTime: '20:38' }) };
    const out = readSeizureEntries(v);
    expect(out.map((e) => e.index)).toEqual([1, 2]);
    expect(out[1].startTime).toBe('20:38');
  });
  it('ignores blocks beyond the count and caps at the maximum', () => {
    expect(readSeizureEntries({ q69_seizureCount: '0', ...complete(1) })).toEqual([]);
    expect(readSeizureEntries({ q69_seizureCount: '99' }).length).toBe(10);
  });
});

describe('seizureGaps (submit gate for flagged clients)', () => {
  it('requires the Yes/No first', () => {
    expect(seizureGaps({})).toHaveLength(1);
    expect(seizureGaps({})[0].label).toMatch(/answer "No"/);
  });
  it('"No" is a complete attestation', () => {
    expect(seizureGaps({ q30_seizureEvent: 'No' })).toEqual([]);
  });
  it('"Yes" with no entries is the legacy hole: blocked', () => {
    expect(seizureGaps({ q30_seizureEvent: 'Yes', q69_seizureCount: '0' })[0].label).toMatch(/At least one seizure/);
  });
  it('"Yes" with a complete entry passes; each missing required field is named', () => {
    expect(seizureGaps({ q30_seizureEvent: 'Yes', q69_seizureCount: '1', ...complete(1) })).toEqual([]);
    const gaps = seizureGaps({ q30_seizureEvent: 'Yes', q69_seizureCount: '1', ...entry(1, {}) });
    expect(gaps.map((g) => g.label)).toEqual([
      'Seizure 1: start time',
      'Seizure 1: end time or duration in seconds',
      'Seizure 1: seizure type',
      'Seizure 1: witnessed by',
    ]);
  });
  it('rescue med as an intervention requires the med name; 911/ER requires physician-notified', () => {
    const v = { q30_seizureEvent: 'Yes', q69_seizureCount: '1', ...complete(1, { interventions: 'Timed the seizure; Rescue medication given', response: 'Called 911' }) };
    expect(seizureGaps(v).map((g) => g.label)).toEqual([
      'Seizure 1: which rescue medication was given',
      'Seizure 1: physician notified? (required after 911 / ER)',
    ]);
    expect(seizureGaps({ ...v, ...complete(1, { interventions: 'Rescue medication given', rescueMed: 'Diastat 10 mg', response: 'Called 911', physicianNotified: 'Yes' }) })).toEqual([]);
  });
  it('checks every entry when there are several', () => {
    const v = { q30_seizureEvent: 'Yes', q69_seizureCount: '3', ...complete(1), ...complete(2), ...entry(3, { startTime: '22:00' }) };
    expect(seizureGaps(v).map((g) => g.label)).toEqual([
      'Seizure 3: end time or duration in seconds',
      'Seizure 3: seizure type',
      'Seizure 3: witnessed by',
    ]);
  });
});

describe('seizureAdvisories', () => {
  const e = (i: number, sec: string) => readSeizureEntries({ q69_seizureCount: String(i), ...Object.assign({}, ...Array.from({ length: i }, (_, k) => complete(k + 1, { durationSeconds: sec }))) });
  it('flags a 5-minute seizure and a 3-seizure cluster; silent otherwise', () => {
    expect(seizureAdvisories(e(1, '9'))).toEqual([]);
    expect(seizureAdvisories(e(1, '300'))[0]).toMatch(/5 minutes or longer/);
    expect(seizureAdvisories(e(3, '9'))[0]).toMatch(/cluster/);
  });
});

describe('sortSeizuresByStart', () => {
  it('orders chronologically, unparseable last', () => {
    const out = sortSeizuresByStart([{ startTime: '20:38' }, { startTime: '' }, { startTime: '09:49' }]);
    expect(out.map((x) => x.startTime)).toEqual(['09:49', '20:38', '']);
  });
});
