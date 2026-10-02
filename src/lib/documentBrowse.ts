import type { PatientDocument } from './patientDocuments';
import { isNoteFiledDocument } from './noteDocLinks';
export interface DocumentFilters {
  search: string; categories: string[]; from: string; to: string;
  source: 'all' | 'uploaded' | 'notes' | 'generated';
  status: 'active' | 'archived' | 'all';
  sort: 'date-desc' | 'date-asc' | 'upload-desc' | 'upload-asc' | 'title-asc' | 'title-desc';
}
export const DEFAULT_DOCUMENT_FILTERS: DocumentFilters = {
  search: '', categories: [], from: '', to: '', source: 'all', status: 'active', sort: 'date-desc',
};
function uploadTime(d: PatientDocument): number {
  const t = d.uploadedAt as { toMillis?: () => number; seconds?: number } | undefined;
  return t?.toMillis?.() ?? (t?.seconds != null ? t.seconds * 1000 : 0);
}
export function browseDocuments(documents: PatientDocument[], f: DocumentFilters, isStaff: boolean): PatientDocument[] {
  const terms = f.search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return documents.filter((d) => {
    if (!isStaff && d.archived) return false;
    if (f.status === 'active' && d.archived) return false;
    if (f.status === 'archived' && !d.archived) return false;
    if (f.categories.length && !f.categories.includes(d.category)) return false;
    if (f.from && (!d.docDate || d.docDate < f.from)) return false;
    if (f.to && (!d.docDate || d.docDate > f.to)) return false;
    if (f.source === 'uploaded' && d.autoFiled) return false;
    if (f.source === 'notes' && !isNoteFiledDocument(d)) return false;
    if (f.source === 'generated' && (!d.autoFiled || isNoteFiledDocument(d))) return false;
    const text = [d.title, d.fileName, d.uploadedByName].join(' ').toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  }).sort((a, b) => {
    const direction = f.sort.endsWith('asc') ? 1 : -1;
    let order = 0;
    if (f.sort.startsWith('title')) order = a.title.localeCompare(b.title, 'en', { sensitivity: 'base', numeric: true }) * direction;
    else if (f.sort.startsWith('upload')) {
      const ta = uploadTime(a), tb = uploadTime(b);
      if (!ta !== !tb) return ta ? -1 : 1;
      order = (ta - tb) * direction;
    } else {
      // Missing dates always sort last, including oldest first.
      if (!a.docDate !== !b.docDate) return a.docDate ? -1 : 1;
      order = (a.docDate || '').localeCompare(b.docDate || '') * direction;
    }
    return order || uploadTime(b) - uploadTime(a) || a.title.localeCompare(b.title) || (a.id || '').localeCompare(b.id || '');
  });
}
