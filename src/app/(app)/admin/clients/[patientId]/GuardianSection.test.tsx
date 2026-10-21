import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const store: { data: Record<string, unknown> | null } = { data: null };
const saveMock = vi.fn(async (_id: string, rec: { decisionMaker?: string; contacts: unknown[] }, by: string) => {
  const { normalizeGuardian } = await import('@/lib/guardianShared');
  store.data = { ...normalizeGuardian(rec as never), updatedByName: by };
});
vi.mock('@/lib/guardian', () => ({
  getGuardian: vi.fn(async () => store.data),
  saveGuardian: (...args: [string, { decisionMaker?: string; contacts: unknown[] }, string]) => saveMock(...args),
}));

import GuardianSection from './GuardianSection';

beforeEach(() => {
  store.data = null;
  saveMock.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});

describe('GuardianSection', () => {
  it('shows the guardian read-only for a nurse', async () => {
    store.data = { decisionMaker: 'guardian', contacts: [{ id: 'g', role: 'Legal guardian', name: 'Jordan Welch', relationship: 'State (DHS representative)', phone: '(404) 683-2947' }] };
    render(<GuardianSection patientId="p1" canEdit={false} actorName="" onToast={() => {}} />);
    expect(await screen.findByText('Jordan Welch')).toBeInTheDocument();
    expect(screen.getByText('Has a legal guardian')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
  });

  it('adds a guardian row when "Has a legal guardian" is picked, and blocks until it is filled', async () => {
    const toast = vi.fn();
    render(<GuardianSection patientId="p1" canEdit actorName="Kaheem Freeman" onToast={toast} />);
    fireEvent.click(await screen.findByRole('button', { name: /add/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/who makes legal decisions/i, { selector: '[role="alert"]' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Has a legal guardian' }));
    expect((document.querySelector('[id$="-role"] select') as HTMLSelectElement).value).toBe('Legal guardian');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();

    fireEvent.change(document.querySelector('[id$="-name"] input')!, { target: { value: 'Jordan Welch' } });
    fireEvent.change(document.querySelector('[id$="-reach"] input')!, { target: { value: '404-683-2947' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Jordan Welch')).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith('Guardian information saved.');
  });
});
