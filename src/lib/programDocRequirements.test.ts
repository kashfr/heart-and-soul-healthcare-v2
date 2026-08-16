import { describe, it, expect } from 'vitest';
import { getNoteDocRequirements } from './programDocRequirements';

describe('getNoteDocRequirements', () => {
  it('NOW/COMP gets the full QEPR set with choices and RN oversight required', () => {
    const r = getNoteDocRequirements('now-comp');
    expect(r.choices).toBe('required');
    expect(r.qeprEducationTopics).toBe('optional');
    expect(r.preferences).toBe('optional');
    expect(r.rnOversight).toBe('required');
  });

  it('GAPP hides every QEPR-driven section — the pediatric note must not change', () => {
    const r = getNoteDocRequirements('gapp');
    expect(r.choices).toBe('hidden');
    expect(r.qeprEducationTopics).toBe('hidden');
    expect(r.preferences).toBe('hidden');
    expect(r.rnOversight).toBe('hidden');
  });

  it.each(['edwp', 'icwp'])('%s shows sections as optional, RN oversight hidden', (p) => {
    const r = getNoteDocRequirements(p);
    expect(r.choices).toBe('optional');
    expect(r.qeprEducationTopics).toBe('optional');
    expect(r.preferences).toBe('optional');
    expect(r.rnOversight).toBe('hidden');
  });

  it.each([undefined, null, '', 'something-new'])(
    'unknown/missing program (%s) falls back to optional so no note is ever blocked',
    (p) => {
      const r = getNoteDocRequirements(p as string | null | undefined);
      expect(r.choices).toBe('optional');
      expect(r.rnOversight).toBe('hidden');
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
    q56_ordersReviewed: 'Yes',
    q56_marReviewed: 'Yes',
    q56_equipReviewed: 'Yes',
    q56_apptsReviewed: 'Yes',
    q56_oversightNotes: 'stale oversight notes',
  });

  it('GAPP: removes every QEPR field so nothing rides into the pediatric chart', async () => {
    const { stripInapplicableQeprFields } = await import('./programDocRequirements');
    const v = fullValues();
    stripInapplicableQeprFields(v, getNoteDocRequirements('gapp'), false);
    expect(Object.keys(v).filter((k) => k.startsWith('q42_') || k.startsWith('q56_'))).toEqual([]);
    expect(v.q3_clientName).toBe('Someone'); // untouched
  });

  it('NOW/COMP non-oversight visit: keeps choices, removes oversight answers', async () => {
    const { stripInapplicableQeprFields } = await import('./programDocRequirements');
    const v = fullValues();
    stripInapplicableQeprFields(v, getNoteDocRequirements('now-comp'), false);
    expect(v.q42_choicesMade).toBeDefined();
    expect(Object.keys(v).filter((k) => k.startsWith('q56_'))).toEqual([]);
  });

  it('NOW/COMP RN oversight visit: keeps everything', async () => {
    const { stripInapplicableQeprFields } = await import('./programDocRequirements');
    const v = fullValues();
    stripInapplicableQeprFields(v, getNoteDocRequirements('now-comp'), true);
    expect(v.q56_ordersReviewed).toBe('Yes');
    expect(v.q42_choicesMade).toBeDefined();
  });
});
