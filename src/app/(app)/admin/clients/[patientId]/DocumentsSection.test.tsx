import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const fileNoteMock = vi.fn<(noteId: string) => Promise<void>>(async () => {});
const syncMock = vi.fn<(patientId: string, opts?: { refresh?: boolean }) => Promise<{ filed: number; refreshed: number; skipped: number; errors: string[] }>>(async () => ({ filed: 0, refreshed: 0, skipped: 0, errors: [] }));

vi.mock('@/lib/patientDocuments', async () => {
  const cats = await import('@/lib/docCategories');
  return {
    ...cats,
    CORE_DOC_CATEGORIES: ['Plan of Care (485)', 'Initial Assessment', 'Supervisory Visit', 'RN Oversight'],
    ALLOWED_DOC_TYPES: { 'application/pdf': 'PDF' },
    deletePatientDocument: vi.fn(),
    fileNoteDocument: (noteId: string) => fileNoteMock(noteId),
    getDocumentBlob: vi.fn(),
    movePatientDocument: vi.fn(),
    renderDocumentInWindow: vi.fn(),
    replaceDocumentFile: vi.fn(),
    setDocumentArchived: vi.fn(),
    syncNoteDocuments: (patientId: string, opts?: { refresh?: boolean }) => syncMock(patientId, opts),
    updateDocumentDetails: vi.fn(),
    uploadPatientDocument: vi.fn(),
  };
});
vi.mock('@/lib/patients', () => ({ getPatients: vi.fn(async () => []) }));

import DocumentsSection from './DocumentsSection';
import type { PatientDocument } from '@/lib/patientDocuments';

const base = {
  patientId: 'p1',
  fileName: 'x.pdf',
  storagePath: 'patients/p1/documents/d/x.pdf',
  contentType: 'application/pdf',
  size: 1000,
  uploadedBy: 'u1',
  uploadedByName: 'Ashley Turner',
  uploadedByRole: 'nurse',
  archived: false,
};

const fromNote: PatientDocument = {
  ...base,
  id: 'doc-note',
  category: 'Supervisory Visit',
  title: 'Home Supervisory Visit, 09/22/2026, Ashley Turner',
  docDate: '2026-09-22',
  autoFiled: true,
  sourceNoteId: 'note-1',
  sourceNoteType: 'home-supervisory-visit',
};

const uploaded: PatientDocument = {
  ...base,
  id: 'doc-upload',
  category: 'Plan of Care (485)',
  title: 'Plan of care',
  docDate: '2026-09-01',
};

function renderSection(documents: PatientDocument[], opts: { isStaff?: boolean; isAdmin?: boolean } = {}) {
  const onToast = vi.fn();
  const onChanged = vi.fn();
  render(
    <DocumentsSection
      patientId="p1"
      documents={documents}
      canUpload
      isStaff={opts.isStaff ?? true}
      isAdmin={opts.isAdmin ?? false}
      uploader={{ uid: 'staff', name: 'Kaheem Freeman', role: 'admin' } as never}
      onChanged={onChanged}
      onToast={onToast}
    />,
  );
  return { onToast, onChanged };
}

beforeEach(() => {
  fileNoteMock.mockClear();
  syncMock.mockClear();
});

describe('DocumentsSection, entries filed from a note', () => {
  it('offers Amend Note and Refresh PDF instead of Edit', () => {
    renderSection([fromNote]);
    const amend = screen.getByRole('link', { name: /amend note/i });
    expect(amend).toHaveAttribute('href', '/supervisory-visit?edit=note-1');
    expect(screen.getByRole('button', { name: /refresh pdf/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
  });

  it('keeps Edit (and no note buttons) on an uploaded file', () => {
    renderSection([uploaded]);
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /amend note/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /refresh pdf/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /refresh visit pdfs/i })).toBeNull();
  });

  it('Refresh PDF re-files the note and reloads the list', async () => {
    const { onToast, onChanged } = renderSection([fromNote]);
    fireEvent.click(screen.getByRole('button', { name: /refresh pdf/i }));
    await waitFor(() => expect(fileNoteMock).toHaveBeenCalledWith('note-1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/re-rendered/i));
  });

  it('a nurse sees Amend Note but not Refresh PDF', () => {
    renderSection([fromNote], { isStaff: false });
    expect(screen.getByRole('link', { name: /amend note/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /refresh pdf/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /sync visit notes/i })).toBeNull();
  });

  it('Refresh Visit PDFs asks first, then syncs in refresh mode and reports the count', async () => {
    syncMock.mockResolvedValueOnce({ filed: 0, refreshed: 3, skipped: 0, errors: [] });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { onToast, onChanged } = renderSection([fromNote]);
    fireEvent.click(screen.getByRole('button', { name: /refresh visit pdfs/i }));
    await waitFor(() => expect(syncMock).toHaveBeenCalledWith('p1', { refresh: true }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(onToast).toHaveBeenCalledWith('Re-rendered 3 visit PDFs.');
    confirm.mockRestore();
  });

  it('Refresh Visit PDFs does nothing when the confirmation is declined', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderSection([fromNote]);
    fireEvent.click(screen.getByRole('button', { name: /refresh visit pdfs/i }));
    expect(syncMock).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('Sync Visit Notes files only what is missing and never asks', async () => {
    syncMock.mockResolvedValueOnce({ filed: 1, refreshed: 0, skipped: 2, errors: [] });
    const confirm = vi.spyOn(window, 'confirm');
    const { onToast } = renderSection([fromNote]);
    fireEvent.click(screen.getByRole('button', { name: /sync visit notes/i }));
    await waitFor(() => expect(syncMock).toHaveBeenCalledWith('p1', { refresh: false }));
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('Filed 1 visit note (2 already on file).'));
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
