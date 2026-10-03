import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const fileNoteMock = vi.fn<(noteId: string) => Promise<void>>(async () => {});
const refreshPlanMock = vi.fn<(id: string) => Promise<void>>(async () => {});
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
    refreshServicePlanDocumentPdf: (id: string) => refreshPlanMock(id),
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
  it('offers Edit beside Amend Note and Refresh PDF, and the dialog explains the difference', () => {
    renderSection([fromNote]);
    const amend = screen.getByRole('link', { name: /amend note/i });
    expect(amend).toHaveAttribute('href', '/supervisory-visit?edit=note-1');
    expect(screen.getByRole('button', { name: /refresh pdf/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(screen.getByText(/The visit note keeps its own date and wording/)).toBeInTheDocument();
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

describe('Document filters and sorting', () => {
  it('combines category selections, searches filenames, and clears back to the default', () => {
    renderSection([fromNote, uploaded, { ...uploaded, id: 'other', title: 'Supply order', category: 'Physician Orders', fileName: 'gloves.pdf' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Supervisory Visit (1)' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Plan of Care (485) (1)' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'GLOVES' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Supply order')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('status')).toHaveTextContent('Showing 3 of 3 documents');
  });
  it('changes sort order without altering the documents', () => {
    renderSection([fromNote, uploaded]);
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent(fromNote.title);
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'date-asc' } });
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent(uploaded.title);
  });
  it('filters archived-only records and shows a helpful empty result', () => {
    renderSection([{ ...uploaded, archived: true }]);
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'archived' } });
    expect(screen.getByText(uploaded.title)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'notes' } });
    expect(screen.getByText(/No documents match your filters/)).toBeInTheDocument();
  });
  it('reports invalid date ranges and applies inclusive date boundaries', () => {
    renderSection([fromNote, uploaded]);
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.change(screen.getByLabelText('Document date from'), { target: { value: '2026-09-22' } });
    fireEvent.change(screen.getByLabelText('Document date to'), { target: { value: '2026-09-22' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Document date to'), { target: { value: '2026-09-01' } });
    expect(screen.getByRole('alert')).toHaveTextContent('The from date must be on or before the to date.');
  });
  it('hides archived metadata and the status picker from nonstaff', () => {
    renderSection([uploaded, { ...uploaded, id: 'archived', category: 'Secret category', archived: true }], { isStaff: false });
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Secret category/ })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 1 documents');
  });
});

describe('DocumentsSection, entries filed from a service plan', () => {
  const planReview: PatientDocument = {
    ...base,
    id: 'doc-review',
    category: 'Service Plan',
    title: 'Service Plan Review, 09/28/2026 (plan signed 09/28/2026), no changes',
    docDate: '2026-09-28',
    autoFiled: true,
    servicePlanId: 'plan-1',
    servicePlanReviewId: 'review-1',
  };
  it('offers Refresh PDF, which re-renders the stored copy in place', async () => {
    const { onToast, onChanged } = renderSection([planReview]);
    expect(screen.queryByRole('link', { name: /amend note/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /refresh pdf/i }));
    await waitFor(() => expect(refreshPlanMock).toHaveBeenCalledWith('doc-review'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/current layout/i));
    expect(fileNoteMock).not.toHaveBeenCalled();
  });
});

