import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const store: { data: Record<string, unknown> | null } = { data: null };
const saveMock = vi.fn(async (_id: string, list: unknown[], by: string) => {
  const { normalizePhysicians } = await import('@/lib/physiciansShared');
  store.data = { list: normalizePhysicians(list as never), updatedByName: by };
});
vi.mock('@/lib/physicians', () => ({
  getPhysicians: vi.fn(async () => store.data),
  savePhysicians: (...args: [string, unknown[], string]) => saveMock(...args),
}));

import PhysiciansSection from './PhysiciansSection';

beforeEach(() => {
  store.data = null;
  saveMock.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});

describe('PhysiciansSection', () => {
  it('lists doctors read-only for a nurse', async () => {
    store.data = { list: [{ id: 'e', name: 'Dr. Jennifer Gilligan', specialty: 'Endocrinology', practice: 'Piedmont Physicians Endocrinology Buckhead', phone: '404-367-3210', fax: '(404) 367-3215' }] };
    render(<PhysiciansSection patientId="p1" canEdit={false} actorName="" onToast={() => {}} />);
    expect(await screen.findByText('Dr. Jennifer Gilligan')).toBeInTheDocument();
    expect(screen.getByText('Fax (404) 367-3215')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
  });

  it('blocks a row missing name/specialty or with a bad fax, then saves', async () => {
    const toast = vi.fn();
    render(<PhysiciansSection patientId="p1" canEdit actorName="Kaheem Freeman" onToast={toast} />);
    fireEvent.click(await screen.findByRole('button', { name: /add/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText("Enter the doctor's name.")).toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();

    const row = (field: string) => document.querySelector(`[id$="-${field}"] input, [id$="-${field}"] select`) as HTMLInputElement;
    fireEvent.change(row('name'), { target: { value: 'Dr. Jennifer Gilligan' } });
    fireEvent.change(row('specialty'), { target: { value: 'Endocrinology' } });
    fireEvent.change(row('fax'), { target: { value: '367-3215' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a 10-digit fax number.')).toBeInTheDocument();

    fireEvent.change(row('fax'), { target: { value: '4043673215' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Fax (404) 367-3215')).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith('Physicians saved.');
  });
});
