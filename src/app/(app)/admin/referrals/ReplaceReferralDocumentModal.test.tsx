import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import ReplaceReferralDocumentModal from './ReplaceReferralDocumentModal';
import { authedFetch } from '@/lib/authedFetch';
vi.mock('@/lib/authedFetch', () => ({ authedFetch: vi.fn() }));
const document = { id: 'signed-ppot', referralId: 'r1', kind: 'ppot' as const, title: 'Signed PPOT', category: 'ISP', fileName: 'signed.pdf', size: 1, docDate: '2026-10-01', uploadedAt: null, uploadedByName: 'Staff', patientDocumentId: '', revision: 'a'.repeat(64) };
beforeEach(() => { vi.clearAllMocks(); URL.createObjectURL = vi.fn(() => 'blob:preview'); URL.revokeObjectURL = vi.fn(); });
it('previews before saving and sends only the selected correction with its version', async () => {
  vi.mocked(authedFetch).mockResolvedValue(new Response(JSON.stringify({ ok: true })));
  const saved = vi.fn(); render(<ReplaceReferralDocumentModal document={document} onClose={vi.fn()} onSaved={saved} />);
  expect(screen.getByRole('button', { name: 'Save replacement' })).toBeDisabled();
  const file = new File(['%PDF-test'], 'corrected.pdf', { type: 'application/pdf' });
  fireEvent.change(screen.getByLabelText('Corrected PDF'), { target: { files: [file] } });
  expect(await screen.findByTitle('Corrected PDF preview')).toBeInTheDocument();
  expect(authedFetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save replacement' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(authedFetch).toHaveBeenCalledWith('/api/admin/referrals/r1/documents/signed-ppot', expect.objectContaining({ method: 'PUT', body: file, headers: { 'Content-Type': 'application/pdf', 'If-Match': document.revision } }));
});
it('keeps the dialog open when the server rejects a stale version', async () => {
  vi.mocked(authedFetch).mockResolvedValue(new Response(JSON.stringify({ error: 'This document changed. Refresh first.' }), { status: 409 }));
  const saved = vi.fn();render(<ReplaceReferralDocumentModal document={document} onClose={vi.fn()} onSaved={saved} />);
  fireEvent.change(screen.getByLabelText('Corrected PDF'), { target: { files: [new File(['pdf'], 'corrected.pdf')] } });
  fireEvent.click(screen.getByRole('button', { name: 'Save replacement' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This document changed');
  expect(saved).not.toHaveBeenCalled();
});
