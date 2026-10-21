import React from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('@/lib/authedFetch', () => ({ authedFetch: fetchMock }));
vi.mock('./FileToClientModal', () => ({ default: () => null }));
vi.mock('./UploadFaxModal', () => ({ default: () => null }));
vi.mock('@/components/PdfPreviewModal', () => ({ default: () => null }));
import PpotInbox from './PpotInbox';
const row = { key: 'referral_test', memberName: 'Test Referral', subjectKind: 'referral', requestType: 'new', recipientName: 'Test Physician', toNumber: '7705550100', date: '2026-09-28', remindedDate: '' };
beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ faxConfigured: true, openRequests: [row], incoming: [], received: [] }) });
});
afterEach(() => vi.restoreAllMocks());
it('confirms the physician and number, then submits the follow-up action', async () => {
  render(<PpotInbox refreshKey={0} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Send Follow-up Fax' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Test Physician');
  expect(screen.getByRole('dialog')).toHaveTextContent('(770) 555-0100');
  fireEvent.click(screen.getByRole('button', { name: 'Send fax' }));
  await screen.findByRole('status');
  expect(fetchMock).toHaveBeenCalledWith('/api/fax/ppot/requests/referral_test', expect.objectContaining({ method: 'POST', body: '{"action":"followup","attachments":[]}' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Check Sent Faxes for delivery');
});
it('does not submit when staff cancel confirmation', async () => {
  vi.mocked(window.confirm).mockReturnValue(false);
  render(<PpotInbox refreshKey={0} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Send Follow-up Fax' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('disables follow-up sending when the server has no fax credentials', async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ faxConfigured: false, openRequests: [row] }) });
  render(<PpotInbox refreshKey={0} />);
  expect(await screen.findByRole('button', { name: 'Send Follow-up Fax' })).toBeDisabled();
});
