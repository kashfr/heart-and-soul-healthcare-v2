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

/**
 * Title, category and date for a note-filed entry: the note's own, unless
 * staff edited the entry by hand (detailsEditedAt), in which case theirs stay.
 */
export function noteDocDetails(
  prior: Record<string, unknown> | null,
  fromNote: { title: string; category: string; docDate: string },
): { title: string; category: string; docDate: string } {
  if (!prior || prior.detailsEditedAt == null) return fromNote;
  return {
    title: String(prior.title || fromNote.title),
    category: String(prior.category || fromNote.category),
    docDate: typeof prior.docDate === 'string' ? prior.docDate : fromNote.docDate,
  };
}
