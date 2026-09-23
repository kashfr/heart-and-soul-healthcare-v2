import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const store: { data: Record<string, unknown> | null } = { data: null };
const saveMock = vi.fn(async (_id: string, d: Record<string, unknown>, by: string) => {
  store.data = { ...d, updatedByName: by };
});
vi.mock('@/lib/dayProgram', () => ({
  getDayProgram: vi.fn(async () => store.data),
  saveDayProgram: (...args: [string, Record<string, unknown>, string]) => saveMock(...args),
}));

import DayProgramSection from './DayProgramSection';

beforeEach(() => {
  store.data = null;
  saveMock.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});

describe('DayProgramSection', () => {
  it('shows the stored program read-only for a nurse (no edit button)', async () => {
    store.data = {
      attends: 'yes',
      programName: "Treasure's Box",
      operator: 'Seabreeze Retreat, Inc.',
      address: '3893 Covington Hwy, Decatur, GA 30032',
      contactName: 'Chequita Brown',
      contactTitle: 'CLS Manager',
      cell: '678-778-6120',
      email: 'chequitabrown@seabreezeretreat.com',
    };
    render(<DayProgramSection patientId="p1" canEdit={false} actorName="" onToast={() => {}} />);
    expect(await screen.findByText("Treasure's Box")).toBeInTheDocument();
    expect(screen.getByText('3893 Covington Hwy, Decatur, GA 30032')).toBeInTheDocument();
    expect(screen.getByText('Operated by Seabreeze Retreat, Inc.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
  });

  it('blocks an incomplete save with field messages, then saves when fixed', async () => {
    const toast = vi.fn();
    render(<DayProgramSection patientId="p1" canEdit actorName="Kaheem Freeman" onToast={toast} />);
    fireEvent.click(await screen.findByRole('button', { name: /add/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/choose whether this client attends/i)).toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter the day program name.')).toBeInTheDocument();
    expect(screen.getByText(/at least one way to reach the contact/i)).toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("e.g. Treasure's Box"), { target: { value: "Treasure's Box" } });
    fireEvent.change(screen.getByPlaceholderText('Street, city, state ZIP'), { target: { value: '3893 Covington Hwy, Decatur, GA 30032' } });
    const input = (field: string) => document.querySelector(`#dp-field-${field} input`) as HTMLInputElement;
    fireEvent.change(input('contactName'), { target: { value: 'Chequita Brown' } });
    fireEvent.change(input('email'), { target: { value: 'chequitabrown@seabreezeretreat.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0][2]).toBe('Kaheem Freeman');
    expect(await screen.findByText("Treasure's Box")).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith('Day program saved.');
  });

  it('records "does not attend" without requiring program details', async () => {
    render(<DayProgramSection patientId="p1" canEdit actorName="Admin" onToast={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /add/i }));
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Does not attend a day program.')).toBeInTheDocument();
  });
});
