import { describe, expect, it } from 'vitest';
import { isNoteFiledDocument, noteAmendHref } from './noteDocLinks';

describe('noteAmendHref', () => {
  it('sends a supervisory visit to the supervisory form in amend mode', () => {
    expect(noteAmendHref({ sourceNoteId: 'n1', sourceNoteType: 'home-supervisory-visit', category: 'Supervisory Visit' })).toBe('/supervisory-visit?edit=n1');
  });

  it('sends an oversight visit to the oversight form in amend mode', () => {
    expect(noteAmendHref({ sourceNoteId: 'n2', sourceNoteType: 'rn-oversight-visit', category: 'RN Oversight' })).toBe('/oversight-note?edit=n2');
  });

  it('falls back to the filing category for entries filed before the type was stored', () => {
    expect(noteAmendHref({ sourceNoteId: 'old1', category: 'Supervisory Visit' })).toBe('/supervisory-visit?edit=old1');
    expect(noteAmendHref({ sourceNoteId: 'old2', category: 'RN Oversight' })).toBe('/oversight-note?edit=old2');
  });

  it('trusts the stored type over a category someone relabelled', () => {
    expect(noteAmendHref({ sourceNoteId: 'n3', sourceNoteType: 'rn-oversight-visit', category: 'Supervisory Visit' })).toBe('/oversight-note?edit=n3');
  });

  it('sends an unknown type to the note page, which offers the right Amend link', () => {
    expect(noteAmendHref({ sourceNoteId: 'n4', category: 'Other' })).toBe('/admin/submissions/n4');
  });

  it('is null for documents that were not filed from a note', () => {
    expect(noteAmendHref({ category: 'Plan of Care (485)' })).toBeNull();
    expect(noteAmendHref({ sourceNoteId: '  ' })).toBeNull();
  });
});

describe('isNoteFiledDocument', () => {
  it('is true only for auto-filed entries that point at a note', () => {
    expect(isNoteFiledDocument({ autoFiled: true, sourceNoteId: 'n1' })).toBe(true);
    expect(isNoteFiledDocument({ autoFiled: true })).toBe(false); // a signed service plan
    expect(isNoteFiledDocument({ sourceNoteId: 'n1' })).toBe(false);
    expect(isNoteFiledDocument({})).toBe(false);
  });
});
