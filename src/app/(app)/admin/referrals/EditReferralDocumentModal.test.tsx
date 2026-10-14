import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import EditReferralDocumentModal from './EditReferralDocumentModal';
import { authedFetch } from '@/lib/authedFetch';
vi.mock('@/lib/authedFetch', () => ({ authedFetch: vi.fn() }));
const document = { id: 'signed-ppot', referralId: 'r1', kind: 'ppot' as const, title: 'Signed PPOT', category: 'ISP / Plan of Treatment', fileName: 'signed.pdf', size: 1, docDate: '2026-10-01', uploadedAt: null, uploadedByName: 'Staff', patientDocumentId: '', revision: 'a'.repeat(64) };
beforeEach(() => vi.clearAllMocks());
it('prefills the physician signed date and saves the correction without an upload', async () => {
  vi.mocked(authedFetch).mockResolvedValue(new Response(JSON.stringify({ ok: true })));
  const saved = vi.fn(); render(<EditReferralDocumentModal document={document} onClose={vi.fn()} onSaved={saved} />);
  expect(screen.getByLabelText('Date the physician signed')).toHaveValue('2026-10-01');
  expect(screen.queryByLabelText('Document title')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Date the physician signed'), { target: { value: '2026-09-30' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(authedFetch).toHaveBeenCalledWith('/api/admin/referrals/r1/documents/signed-ppot', expect.objectContaining({ method: 'PATCH', headers: { 'If-Match': document.revision } }));
  expect(JSON.parse(vi.mocked(authedFetch).mock.calls[0][1]!.body as string).docDate).toBe('2026-09-30');
});
it('offers title, category, and document date for ordinary records; cancel makes no changes', () => {
  const close = vi.fn(); render(<EditReferralDocumentModal document={{ ...document, id: 'd1', kind: undefined }} onClose={close} onSaved={vi.fn()} />);
  expect(screen.getByLabelText('Document title')).toHaveValue(document.title);
  expect(screen.getByLabelText('Category')).toHaveValue(document.category);
  expect(screen.getByLabelText('Document date')).toHaveValue(document.docDate);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(close).toHaveBeenCalledOnce(); expect(authedFetch).not.toHaveBeenCalled();
});
