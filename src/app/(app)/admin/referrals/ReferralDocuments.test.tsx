import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import ReferralDocuments from './ReferralDocuments';
import { authedFetch } from '@/lib/authedFetch';
vi.mock('@/lib/authedFetch', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/physicians', () => ({ getPhysicians: vi.fn() }));
vi.mock('@/lib/dayProgram', () => ({ getDayProgram: vi.fn() }));
vi.mock('@/lib/supportCoordinator', () => ({ getSupportCoordinator: vi.fn() }));

const doc = (over: Record<string, unknown>) => ({ referralId: 'r1', category: 'Consent / Release (ROI)', title: 'T', fileName: 'f.pdf', size: 1, docDate: '2026-10-18', uploadedAt: null, uploadedByName: 'K', patientDocumentId: '', revision: 'a'.repeat(64), ...over });
const roi = {
  id: 'roi1', formType: 'ga-hipaa', patientId: '', referralId: 'r1', memberName: 'Bronx Spry', direction: 'to-us',
  facility: { name: 'Peachtree Pediatrics', address: '', phone: '7704873330', fax: '' }, information: 'i', purpose: 'p', duration: 'transactions',
  status: 'signed', createdAt: null, createdByName: '', signed: { documentId: 'doc1', signedDate: '2026-10-18', expiresOn: '2028-10-18', byName: '' }, faxes: [], hidden: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authedFetch).mockImplementation(async (url: RequestInfo | URL) => new Response(JSON.stringify(
    String(url).startsWith('/api/fax/roi')
      ? { rois: [roi] }
      : { documents: [doc({ id: 'doc1', title: 'Release of Information', roiId: 'roi1' }), doc({ id: 'doc2', title: 'Office Visit' })], openPpot: { open: false } },
  )));
});

it('opens the release editor from a release’s row, and keeps Edit details for other documents', async () => {
  render(<ReferralDocuments referralId="r1" patientId={null} refreshKey="1" />);
  await screen.findByText('Release of Information');
  expect(screen.getAllByRole('button', { name: 'Edit Release' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'Edit details' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Edit Release' }));
  await waitFor(() => expect(screen.getByText('Edit Release of Information')).toBeInTheDocument());
  expect((screen.getByLabelText(/^Facility/) as HTMLInputElement).value).toBe('Peachtree Pediatrics');
  expect((screen.getByLabelText(/^Fax/) as HTMLInputElement).value).toBe('');
});
