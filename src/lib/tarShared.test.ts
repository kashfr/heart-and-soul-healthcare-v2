import { describe, expect, it } from 'vitest';
import {
  buildTarEntryFields,
  indexTarEntriesByCell,
  resolveCurrentTarEntries,
  tarCellKey,
  tarCellLabel,
  taskAppliesOn,
  type TarEntryFieldInput,
  type TarEntryFieldMeta,
} from './tarShared';

const meta: TarEntryFieldMeta = {
  patientId: 'pat-1',
  date: '2026-07-26',
  documenter: { uid: 'uid-9', name: 'Souz Payne', credential: 'RN' },
};

function input(overrides: Partial<TarEntryFieldInput> = {}): TarEntryFieldInput {
  return {
    taskId: 'task-1',
    slotIndex: 0,
    status: 'done',
    performedByType: 'nurse',
    performerName: '',
    initials: 'sp',
    time: '09:15',
    reason: '',
    note: '',
    taskNameSnapshot: 'Feeding tube site care',
    categoryLabelSnapshot: 'Nutrition / Feeding',
    frequencySnapshot: 'Daily',
    levelSnapshot: 'skilled',
    ...overrides,
  };
}

describe('buildTarEntryFields', () => {
  it('pins identity and documenter from meta, never from the row', () => {
    const f = buildTarEntryFields(input(), meta);
    expect(f.patientId).toBe('pat-1');
    expect(f.date).toBe('2026-07-26');
    expect(f.documentedBy).toBe('uid-9');
    expect(f.documentedByName).toBe('Souz Payne');
    expect(f.documentedByCredential).toBe('RN');
  });

  it('uppercases initials and snapshots the task', () => {
    const f = buildTarEntryFields(input(), meta);
    expect(f.initials).toBe('SP');
    expect(f.taskNameSnapshot).toBe('Feeding tube site care');
    expect(f.levelSnapshot).toBe('skilled');
  });

  it('blanks performerName when the documenting nurse did it herself', () => {
    expect(
      buildTarEntryFields(input({ performedByType: 'nurse', performerName: 'X' }), meta).performerName,
    ).toBe('');
  });

  it('keeps the performer name (trimmed) when family did the care', () => {
    const f = buildTarEntryFields(
      input({ performedByType: 'family', performerName: '  Paula Krone  ' }),
      meta,
    );
    expect(f.performedByType).toBe('family');
    expect(f.performerName).toBe('Paula Krone');
  });

  it('keeps the reason only for a not-done entry, and drops the time', () => {
    const nd = buildTarEntryFields(
      input({ status: 'not-done', reason: ' Client refused ', time: '09:15' }),
      meta,
    );
    expect(nd.reason).toBe('Client refused');
    expect(nd.time).toBe('');
    expect(nd.performedByType).toBe('');
  });

  it('drops a reason that was typed against a DONE entry', () => {
    expect(buildTarEntryFields(input({ reason: 'should be dropped' }), meta).reason).toBe('');
  });

  it('defaults the performer to nurse when none was chosen on a done entry', () => {
    expect(buildTarEntryFields(input({ performedByType: '' }), meta).performedByType).toBe('nurse');
  });

  it('normalises a nonsense slot index to 0', () => {
    expect(buildTarEntryFields(input({ slotIndex: -3 }), meta).slotIndex).toBe(0);
    expect(buildTarEntryFields(input({ slotIndex: 2 }), meta).slotIndex).toBe(2);
  });
});

describe('tarCellLabel', () => {
  it('shows initials for a completed treatment', () => {
    expect(tarCellLabel({ taskId: 't', date: 'd', status: 'done', initials: 'SP' })).toBe('SP');
  });
  it('marks not-done and N/A distinctly, and empty when nothing is charted', () => {
    expect(tarCellLabel({ taskId: 't', date: 'd', status: 'not-done' })).toBe('R');
    expect(tarCellLabel({ taskId: 't', date: 'd', status: 'na' })).toBe('N/A');
    expect(tarCellLabel(undefined)).toBe('');
  });
});

describe('resolveCurrentTarEntries', () => {
  it('keeps only the live entry of a correction chain', () => {
    const list = [
      { id: 'a', amends: undefined },
      { id: 'b', amends: 'a' },
      { id: 'c', amends: 'b' },
      { id: 'd', amends: undefined },
    ];
    expect(resolveCurrentTarEntries(list).map((e) => e.id).sort()).toEqual(['c', 'd']);
  });
});

describe('indexTarEntriesByCell', () => {
  const base = { status: 'done' as const, initials: 'SP' };

  it('separates slots within the same day', () => {
    const map = indexTarEntriesByCell([
      { ...base, taskId: 't1', date: '2026-07-01', slotIndex: 0, initials: 'AA' },
      { ...base, taskId: 't1', date: '2026-07-01', slotIndex: 1, initials: 'BB' },
    ]);
    expect(tarCellLabel(map.get(tarCellKey('t1', '2026-07-01', 0)))).toBe('AA');
    expect(tarCellLabel(map.get(tarCellKey('t1', '2026-07-01', 1)))).toBe('BB');
  });

  it('treats a missing slotIndex as slot 0', () => {
    const map = indexTarEntriesByCell([{ ...base, taskId: 't1', date: '2026-07-01' }]);
    expect(map.has(tarCellKey('t1', '2026-07-01', 0))).toBe(true);
  });

  it('last entry wins for the same cell', () => {
    const map = indexTarEntriesByCell([
      { ...base, taskId: 't1', date: '2026-07-01', slotIndex: 0, initials: 'AA' },
      { ...base, taskId: 't1', date: '2026-07-01', slotIndex: 0, initials: 'ZZ' },
    ]);
    expect(tarCellLabel(map.get(tarCellKey('t1', '2026-07-01', 0)))).toBe('ZZ');
  });
});

describe('taskAppliesOn', () => {
  it('excludes days before the task existed', () => {
    const t = { status: 'active', createdAtISO: '2026-07-10' };
    expect(taskAppliesOn(t, '2026-07-09')).toBe(false);
    expect(taskAppliesOn(t, '2026-07-10')).toBe(true);
  });

  it('keeps a discontinued task visible on the days it was active', () => {
    const t = { status: 'discontinued', createdAtISO: '2026-07-01', discontinuedAtISO: '2026-07-15' };
    expect(taskAppliesOn(t, '2026-07-15')).toBe(true);
    expect(taskAppliesOn(t, '2026-07-16')).toBe(false);
  });

  it('applies everywhere when the task carries no dates', () => {
    expect(taskAppliesOn({ status: 'active' }, '2020-01-01')).toBe(true);
  });
});
