import { describe, expect, it } from 'vitest';
import { noteDocDetails } from './noteDocLinks';

describe('noteDocDetails', () => {
  const fromNote = { title: 'Home Supervisory Visit, 08/31/2026, Ashley Turner', category: 'Supervisory Visit', docDate: '2026-08-31' };
  it("uses the note's details for a new entry or one never edited by hand", () => {
    expect(noteDocDetails(null, fromNote)).toEqual(fromNote);
    expect(noteDocDetails({ title: 'Old', category: 'Other', docDate: '2026-01-01' }, fromNote)).toEqual(fromNote);
  });
  it('keeps the title, category and date staff set by hand', () => {
    const prior = { title: 'Supervisory visit (August)', category: 'Other', docDate: '2026-08-30', detailsEditedAt: { seconds: 1 } };
    expect(noteDocDetails(prior, fromNote)).toEqual({ title: 'Supervisory visit (August)', category: 'Other', docDate: '2026-08-30' });
  });
});
