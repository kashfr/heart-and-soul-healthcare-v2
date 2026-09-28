import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { CommunicationEntry } from '@/lib/communicationsShared';

const store: { entries: CommunicationEntry[] } = { entries: [] };
const logMock = vi.fn(async () => 'new-id');
vi.mock('@/lib/communications', () => ({
  getCommunications: vi.fn(async () => ({
    entries: store.entries,
    staff: [{ uid: 'ashley', name: 'Ashley Turner', credential: 'RN' }],
    clients: [{ id: 'p1', name: 'ZZ Test Client' }],
  })),
  logCommunication: (...a: unknown[]) => logMock(...(a as [])),
}));

import CommunicationsLog from './CommunicationsLog';

const notice: CommunicationEntry = {
  id: 'c1',
  source: 'automated',
  event: 'visit-assigned',
  direction: 'outbound',
  patientId: 'p1',
  patientName: 'ZZ Test Client',
  staffUid: 'ashley',
  staffName: 'Ashley Turner',
  counterpartyName: '',
  summary: 'Supervisory visit assigned to you for ZZ Test Client: Fri, Oct 2',
  channels: [
    { channel: 'email', to: 'ashley@example.com', ok: true, subject: 'New supervisory visit assigned: Fri, Oct 2', body: 'Hi Ashley,\n\nA supervisory visit was assigned to you for Fri, Oct 2.' },
    { channel: 'sms', to: '(404) 555-0100', ok: false, skipped: true, error: 'Quo SMS is not configured.', body: 'Heart & Soul Healthcare: a supervisory visit was assigned to you for Fri, Oct 2.' },
  ],
  relatedVisitId: 'v1',
  occurredAt: '2026-09-28T17:51:00.000Z',
  loggedByUid: 'k',
  loggedByName: 'Kaheem Freeman',
};

beforeEach(() => {
  store.entries = [];
  logMock.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});

describe('CommunicationsLog', () => {
  it('lists a notice with its delivery status and shows each channel word for word', async () => {
    store.entries = [notice];
    render(<CommunicationsLog />);
    expect(await screen.findByText('Visit assigned')).toBeInTheDocument();
    expect(screen.getByText('Partly delivered')).toBeInTheDocument();
    expect(screen.getByText('ZZ Test Client')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('Subject: New supervisory visit assigned: Fri, Oct 2')).toBeInTheDocument();
    expect(screen.getByText(/A supervisory visit was assigned to you for Fri, Oct 2\./)).toBeInTheDocument();
    expect(screen.getByText(/Not sent: Quo SMS is not configured\./)).toBeInTheDocument();
  });

  it('logs a message by hand, blocking until the required fields are filled', async () => {
    const toast = vi.fn();
    render(<CommunicationsLog patientId="p1" onToast={toast} />);
    fireEvent.click(await screen.findByRole('button', { name: /log a message/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Log message' }));
    expect(await screen.findByText('Choose how it was sent.')).toBeInTheDocument();
    expect(screen.getByText('Choose a staff member or type who it was with.')).toBeInTheDocument();
    expect(logMock).not.toHaveBeenCalled();

    const sel = (id: string) => document.querySelector(`#comm-field-${id} select`) as HTMLSelectElement;
    fireEvent.change(sel('channel'), { target: { value: 'email' } });
    fireEvent.change(screen.getByDisplayValue('Not a staff member'), { target: { value: 'ashley' } });
    fireEvent.change(screen.getByPlaceholderText(/paste the email/i), { target: { value: 'Hi Ashley, please complete the visit.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log message' }));
    await waitFor(() => expect(logMock).toHaveBeenCalledTimes(1));
    expect(logMock.mock.calls[0]).toEqual([expect.objectContaining({ channel: 'email', staffUid: 'ashley', patientId: 'p1' })]);
    expect(toast).toHaveBeenCalledWith('Message logged.');
  });

  it('hides "Log a message" when read-only', async () => {
    render(<CommunicationsLog readOnly />);
    expect(await screen.findByText('Nothing logged yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log a message/i })).toBeNull();
  });
});
