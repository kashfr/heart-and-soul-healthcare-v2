import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import UndoReferralPpotModal from './UndoReferralPpotModal';
import { authedFetch } from '@/lib/authedFetch';
vi.mock('@/lib/authedFetch', () => ({ authedFetch: vi.fn() }));
const document = { id: 'signed-ppot', referralId: 'r1', kind: 'ppot' as const, title: 'Signed PPOT', category: 'ISP', fileName: 'signed.pdf', size: 1, docDate: '2026-10-01', uploadedAt: null, uploadedByName: 'Staff', patientDocumentId: '', revision: 'a'.repeat(64) };
beforeEach(() => vi.clearAllMocks());
it('requires explicit confirmation and preserves the selected document details', async () => {
  vi.mocked(authedFetch).mockResolvedValue(new Response(JSON.stringify({ ok: true })));
  const saved = vi.fn(); render(<UndoReferralPpotModal document={document} onClose={vi.fn()} onSaved={saved} />);
  expect(screen.getByRole('button', { name: 'Undo and file as document' })).toBeDisabled();
  expect(screen.getByText(/Scheduled follow-up faxes may resume/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Document title'), { target: { value: 'Office notes' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Undo and file as document' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(JSON.parse(vi.mocked(authedFetch).mock.calls[0][1]!.body as string)).toMatchObject({ title: 'Office notes', revision: document.revision, docDate: '2026-10-01' });
});
it('cancel makes no changes', () => {
  const close = vi.fn(); render(<UndoReferralPpotModal document={document} onClose={close} onSaved={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(close).toHaveBeenCalledOnce(); expect(authedFetch).not.toHaveBeenCalled();
});
