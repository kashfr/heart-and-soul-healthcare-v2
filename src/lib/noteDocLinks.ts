/**
 * Where a Documents entry filed from a note is amended. The stored PDF is a
 * snapshot of the note, so its date, wording and signature block are fixed
 * on the note itself (through the amend form), never on the Documents card.
 * No Firebase imports: shared by the Documents tab and its tests.
 */

export interface NoteFiledDocument {
  sourceNoteId?: string;
  sourceNoteType?: string;
  category?: string;
}

/** True for entries the server filed from a submitted note (not a service plan). */
export function isNoteFiledDocument(d: NoteFiledDocument & { autoFiled?: boolean }): boolean {
  return Boolean(d.autoFiled && d.sourceNoteId);
}

/**
 * The amend URL for the note behind a filed document, or null when the
 * document did not come from a note. Entries filed before `sourceNoteType`
 * was stored are recognised by their filing category.
 */
export function noteAmendHref(d: NoteFiledDocument): string | null {
  const id = String(d.sourceNoteId || '').trim();
  if (!id) return null;
  const type = String(d.sourceNoteType || '').trim();
  const category = String(d.category || '').trim();
  if (type === 'home-supervisory-visit' || (!type && category === 'Supervisory Visit')) {
    return `/supervisory-visit?edit=${encodeURIComponent(id)}`;
  }
  if (type === 'rn-oversight-visit' || (!type && category === 'RN Oversight')) {
    return `/oversight-note?edit=${encodeURIComponent(id)}`;
  }
  // Unknown type: the note's own page offers the right Amend link.
  return `/admin/submissions/${encodeURIComponent(id)}`;
}
