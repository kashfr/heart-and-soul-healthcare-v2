import { describe, it, expect } from 'vitest';
import {
  buildCareTasksMeta,
  parseCareTasksMeta,
  parseCareTaskCharting,
  unansweredCareTasks,
  type CareTaskMetaEntry,
} from './careTaskCharting';

const META: CareTaskMetaEntry[] = [
  { id: 'abc123', name: 'Tracheostomy site care', categoryLabel: 'Respiratory / Airway', frequency: 'Every shift', level: 'skilled' },
  { id: 'def456', name: 'Repositioned / turned', categoryLabel: 'Skin / Positioning', frequency: 'Every 2 hours', level: 'any' },
];

describe('careTasksMeta round-trip', () => {
  it('round-trips through build + parse', () => {
    expect(parseCareTasksMeta(buildCareTasksMeta(META))).toEqual(META);
  });

  it('returns [] for missing, empty, or corrupt values', () => {
    expect(parseCareTasksMeta(undefined)).toEqual([]);
    expect(parseCareTasksMeta('')).toEqual([]);
    expect(parseCareTasksMeta('not json {')).toEqual([]);
    expect(parseCareTasksMeta('{"a":1}')).toEqual([]);
    expect(parseCareTasksMeta(42)).toEqual([]);
  });

  it('drops malformed entries but keeps valid ones', () => {
    const raw = JSON.stringify([META[0], { name: 'no id' }, null, 'string']);
    expect(parseCareTasksMeta(raw)).toEqual([META[0]]);
  });

  it('defaults missing optional fields to empty strings', () => {
    const raw = JSON.stringify([{ id: 'x1', name: 'Bare task' }]);
    expect(parseCareTasksMeta(raw)).toEqual([
      { id: 'x1', name: 'Bare task', categoryLabel: '', frequency: '', level: '' },
    ]);
  });
});

describe('parseCareTaskCharting', () => {
  it('joins statuses and notes onto the snapshot', () => {
    const data = {
      careTasksMeta: buildCareTasksMeta(META),
      careTask_abc123: 'Completed',
      careTask_def456: 'Not completed',
      careTask_def456_note: 'Client at appointment most of shift',
    };
    const parsed = parseCareTaskCharting(data);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ id: 'abc123', status: 'Completed', note: '' });
    expect(parsed[1]).toMatchObject({
      id: 'def456',
      status: 'Not completed',
      note: 'Client at appointment most of shift',
    });
  });

  it('treats missing statuses as unanswered', () => {
    const data = { careTasksMeta: buildCareTasksMeta(META), careTask_abc123: 'Completed' };
    expect(unansweredCareTasks(data)).toEqual([{ ...META[1], status: '', note: '' }]);
  });

  it('is empty-safe on notes with no care tasks (historical notes)', () => {
    expect(parseCareTaskCharting({})).toEqual([]);
    expect(unansweredCareTasks({ q3_clientName: 'Old Note' })).toEqual([]);
  });
});
