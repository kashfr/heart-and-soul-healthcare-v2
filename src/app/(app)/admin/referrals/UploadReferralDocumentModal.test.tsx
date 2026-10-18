import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import UploadReferralDocumentModal from './UploadReferralDocumentModal';
import { authedFetch } from '@/lib/authedFetch';
vi.mock('@/lib/authedFetch', () => ({ authedFetch: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});
const pdf = () => new File(['%PDF-1.4 test'], 'Georgia-HIPAA-Medical-Release-Form.pdf', { type: 'application/pdf' });

it('blocks an empty upload and names each missing field', () => {
  render(<UploadReferralDocumentModal referralId="r1" openPpot={null} onClose={vi.fn()} onSaved={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /^Upload$/ }));
  expect(screen.getByText('Choose the PDF.')).toBeInTheDocument();
  expect(screen.getByText('Choose a category.')).toBeInTheDocument();
  expect(screen.getByText('Enter the document date.')).toBeInTheDocument();
  expect(screen.queryByText(/signed Appendix T/)).toBeNull();
  expect(authedFetch).not.toHaveBeenCalled();
});

it('uploads a document with its category, date, and a title from the file name', async () => {
  vi.mocked(authedFetch).mockResolvedValue(new Response(JSON.stringify({ ok: true, documentId: 'd1' })));
  const saved = vi.fn();
  render(<UploadReferralDocumentModal referralId="r1" openPpot={null} onClose={vi.fn()} onSaved={saved} />);
  fireEvent.change(screen.getByLabelText('PDF'), { target: { files: [pdf()] } });
  expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Georgia HIPAA Medical Release Form');
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Consent / Release (ROI)' } });
  fireEvent.change(screen.getByLabelText('Document date'), { target: { value: '2026-10-18' } });
  fireEvent.click(screen.getByRole('button', { name: /^Upload$/ }));
  await waitFor(() => expect(saved).toHaveBeenCalledWith(false));
  const [url, init] = vi.mocked(authedFetch).mock.calls[0];
  expect(url).toBe('/api/admin/referrals/r1/documents');
  expect(JSON.parse(init!.body as string)).toMatchObject({ title: 'Georgia HIPAA Medical Release Form', category: 'Consent / Release (ROI)', docDate: '2026-10-18' });
});

it('files a signed Appendix T against the open PPOT request', async () => {
  vi.mocked(authedFetch).mockResolvedValue(new Response(JSON.stringify({ ok: true, documentId: 'signed-ppot' })));
  const saved = vi.fn();
  render(<UploadReferralDocumentModal referralId="r1" openPpot={{ recipientName: 'Dr. Ann Eggert' }} onClose={vi.fn()} onSaved={saved} />);
  fireEvent.change(screen.getByLabelText('PDF'), { target: { files: [pdf()] } });
  fireEvent.click(screen.getByRole('checkbox'));
  expect(screen.queryByLabelText('Category')).toBeNull();
  fireEvent.change(screen.getByLabelText('Date the physician signed'), { target: { value: '2026-10-17' } });
  fireEvent.click(screen.getByRole('button', { name: /File Signed Appendix T/ }));
  await waitFor(() => expect(saved).toHaveBeenCalledWith(true));
  const body = JSON.parse(vi.mocked(authedFetch).mock.calls[0][1]!.body as string);
  expect(body).toMatchObject({ asSignedPpot: true, docDate: '2026-10-17' });
  expect(body).not.toHaveProperty('category');
});
