import { describe, it, expect } from 'vitest';
import { getNoteDocRequirements } from './programDocRequirements';

describe('getNoteDocRequirements', () => {
  it('NOW/COMP gets the full QEPR set with choices and RN oversight required', () => {
    const r = getNoteDocRequirements('now-comp');
    expect(r.choices).toBe('required');
    expect(r.qeprEducationTopics).toBe('optional');
    expect(r.preferences).toBe('optional');
  });

  it('GAPP hides every QEPR-driven section — the pediatric note must not change', () => {
    const r = getNoteDocRequirements('gapp');
    expect(r.choices).toBe('hidden');
    expect(r.qeprEducationTopics).toBe('hidden');
    expect(r.preferences).toBe('hidden');
  });

  it.each(['edwp', 'icwp'])('%s shows sections as optional, RN oversight hidden', (p) => {
    const r = getNoteDocRequirements(p);
    expect(r.choices).toBe('optional');
    expect(r.qeprEducationTopics).toBe('optional');
    expect(r.preferences).toBe('optional');
  });

  it.each([undefined, null, '', 'something-new'])(
    'unknown/missing program (%s) falls back to optional so no note is ever blocked',
    (p) => {
      const r = getNoteDocRequirements(p as string | null | undefined);
      expect(r.choices).toBe('optional');
    },
  );
});

describe('stripInapplicableQeprFields', () => {
  const fullValues = (): Record<string, string> => ({
    q3_clientName: 'Someone',
    q42_choicesMade: 'stale choice text from a previous client',
    q42_choicesOffered: 'stale',
    q42_choicesInfoProvided: 'stale',
    q42_preferencesHonored: 'stale',
  });

  it('GAPP: removes every choice field so nothing rides into the pediatric chart', async () => {
    const { stripInapplicableQeprFields } = await import('./programDocRequirements');
    const v = fullValues();
    stripInapplicableQeprFields(v, getNoteDocRequirements('gapp'));
    expect(Object.keys(v).filter((k) => k.startsWith('q42_'))).toEqual([]);
    expect(v.q3_clientName).toBe('Someone'); // untouched
  });

  it('NOW/COMP: keeps the choice fields', async () => {
    const { stripInapplicableQeprFields } = await import('./programDocRequirements');
    const v = fullValues();
    stripInapplicableQeprFields(v, getNoteDocRequirements('now-comp'));
    expect(v.q42_choicesMade).toBeDefined();
    expect(v.q42_preferencesHonored).toBeDefined();
  });
});
