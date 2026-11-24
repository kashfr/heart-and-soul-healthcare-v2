import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const store: { data: Record<string, unknown> | null } = { data: null };
const saveMock = vi.fn(async (_id: string, d: Record<string, unknown>, by: string) => {
  store.data = { ...d, updatedByName: by };
});
vi.mock('@/lib/groupHome', () => ({
  getGroupHome: vi.fn(async () => store.data),
  saveGroupHome: (...args: [string, Record<string, unknown>, string]) => saveMock(...args),
}));

import GroupHomeSection from './GroupHomeSection';

beforeEach(() => {
  store.data = null;
  saveMock.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});

describe('GroupHomeSection', () => {
  it('shows the stored home read-only for a nurse (no edit button)', async () => {
    store.data = {
      livesIn: 'yes',
      provider: 'Maple Grove Residential, Inc.',
      address: '123 Main St, Decatur, GA 30032',
      contactName: 'Pat Example',
      contactTitle: 'Manager',
      cell: '404-555-0123',
    };
    render(<GroupHomeSection patientId="p1" canEdit={false} actorName="" onToast={() => {}} />);
    expect(await screen.findByText('Maple Grove Residential, Inc.')).toBeInTheDocument();
    expect(screen.getByText('123 Main St, Decatur, GA 30032')).toBeInTheDocument();
    expect(screen.getByText('404-555-0123')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
  });

  it('blocks an incomplete save with field messages, then saves when fixed', async () => {
    const toast = vi.fn();
    render(<GroupHomeSection patientId="p1" canEdit actorName="Kaheem Freeman" onToast={toast} />);
    fireEvent.click(await screen.findByRole('button', { name: /add/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/choose whether this client lives in a group home/i)).toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter the residential provider.')).toBeInTheDocument();
    expect(screen.getByText(/at least one way to reach the contact/i)).toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();

    const input = (field: string) => document.querySelector(`#gh-field-${field} input`) as HTMLInputElement;
    fireEvent.change(input('provider'), { target: { value: 'Maple Grove Residential, Inc.' } });
    fireEvent.change(input('address'), { target: { value: '123 Main St, Decatur, GA 30032' } });
    fireEvent.change(input('contactName'), { target: { value: 'Pat Example' } });
    fireEvent.change(input('contact'), { target: { value: '4045550123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0][2]).toBe('Kaheem Freeman');
    expect(await screen.findByText('Maple Grove Residential, Inc.')).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith('Group home saved.');
  });

  it('records "does not live in a group home" without requiring details', async () => {
    render(<GroupHomeSection patientId="p1" canEdit actorName="Admin" onToast={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /add/i }));
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Does not live in a group home.')).toBeInTheDocument();
  });
});
