import { describe, it, expect } from 'vitest';
import { browseDocuments, DEFAULT_DOCUMENT_FILTERS as defaults } from './documentBrowse';
import type { PatientDocument } from './patientDocuments';
const doc = (id: string, fields: Partial<PatientDocument> = {}): PatientDocument => ({
  id, patientId: 'p', title: id, category: 'Physician Orders', fileName: `${id}.pdf`, storagePath: '', contentType: 'application/pdf', size: 1,
  docDate: '2026-09-01', uploadedBy: 'u', uploadedByName: 'Example Nurse', uploadedByRole: 'nurse', archived: false, ...fields,
});
const ids = (docs: PatientDocument[]) => docs.map((d) => d.id);
describe('document browsing', () => {
  it('sorts by document date then upload time, without mutating input', () => {
    const docs = [doc('old', { docDate: '2026-08-01' }), doc('new'), doc('newer upload', { uploadedAt: { toMillis: () => 1000 } })];
    expect(ids(browseDocuments(docs, defaults, true))).toEqual(['newer upload', 'new', 'old']);
    expect(ids(docs)).toEqual(['old', 'new', 'newer upload']);
  });
  it('keeps missing dates last for both date directions and supports serialized upload times', () => {
    const docs = [doc('missing', { docDate: '' }), doc('older', { docDate: '2026-08-01', uploadedAt: { seconds: 2 } }), doc('newer', { uploadedAt: { toMillis: () => 4000 } })];
    expect(ids(browseDocuments(docs, { ...defaults, sort: 'date-asc' }, true))).toEqual(['older', 'newer', 'missing']);
    expect(ids(browseDocuments(docs, defaults, true))).toEqual(['newer', 'older', 'missing']);
    expect(ids(browseDocuments(docs, { ...defaults, sort: 'upload-asc' }, true))).toEqual(['older', 'newer', 'missing']);
    expect(ids(browseDocuments(docs, { ...defaults, sort: 'upload-desc' }, true))).toEqual(['newer', 'older', 'missing']);
  });
  it('combines case-insensitive search, inclusive dates and multiple categories', () => {
    const docs = [doc('a', { fileName: 'supplies.pdf' }), doc('b', { category: 'Medication List', fileName: 'supplies.pdf' }), doc('c', { category: 'Other', fileName: 'supplies.pdf' }), doc('d', { docDate: '2026-09-02' })];
    expect(ids(browseDocuments(docs, { ...defaults, search: ' SUPPLIES nurse ', categories: ['Physician Orders', 'Medication List'], from: '2026-09-01', to: '2026-09-01' }, true))).toEqual(['a', 'b']);
  });
  it('distinguishes uploads, notes and generated service plans', () => {
    const docs = [doc('upload'), doc('note', { autoFiled: true, sourceNoteId: 'n' }), doc('plan', { autoFiled: true, servicePlanId: 's' })];
    for (const [source, id] of [['uploaded', 'upload'], ['notes', 'note'], ['generated', 'plan']] as const) {
      expect(ids(browseDocuments(docs, { ...defaults, source }, true))).toEqual([id]);
    }
  });
  it('never exposes archives to nonstaff, even if all or archived is requested', () => {
    const docs = [doc('active'), doc('archive', { archived: true })];
    expect(ids(browseDocuments(docs, { ...defaults, status: 'all' }, false))).toEqual(['active']);
    expect(browseDocuments(docs, { ...defaults, status: 'archived' }, false)).toEqual([]);
    expect(ids(browseDocuments(docs, { ...defaults, status: 'archived' }, true))).toEqual(['archive']);
  });
  it('sorts titles alphabetically with natural number ordering', () => {
    const docs = [doc('Order 10'), doc('order 2'), doc('Apple')];
    expect(ids(browseDocuments(docs, { ...defaults, sort: 'title-asc' }, true))).toEqual(['Apple', 'order 2', 'Order 10']);
    expect(ids(browseDocuments(docs, { ...defaults, sort: 'title-desc' }, true))).toEqual(['Order 10', 'order 2', 'Apple']);
  });
});
