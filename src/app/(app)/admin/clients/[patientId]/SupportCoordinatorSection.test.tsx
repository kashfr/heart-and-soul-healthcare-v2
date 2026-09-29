import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const store: { data: Record<string, unknown> | null } = { data: null };
const saveMock = vi.fn(async (_id: string, d: Record<string, unknown>, by: string) => { store.data = { ...d, updatedByName: by }; });
vi.mock('@/lib/supportCoordinator', () => ({
  getSupportCoordinator: vi.fn(async () => store.data),
  saveSupportCoordinator: (...args: [string, Record<string, unknown>, string]) => saveMock(...args),
}));

const agencies: Array<Record<string, string>> = [];
vi.mock('@/components/SettingsProvider', () => ({
  useSettings: () => ({ settings: { supportCoordination: { agencies } } }),
}));

import SupportCoordinatorSection from './SupportCoordinatorSection';

beforeEach(() => { agencies.length = 0; store.data = null; saveMock.mockClear(); Element.prototype.scrollIntoView = vi.fn(); });

describe('SupportCoordinatorSection', () => {
  it('shows the coordinator read-only for a nurse', async () => {
    store.data = { name: 'Jasmine Lawrence', title: 'Intensive Support Coordinator', agency: 'Benchmark Human Services', email: 'jlawrence@benchmarkhs.com' };
    render(<SupportCoordinatorSection patientId="p1" canEdit={false} actorName="" onToast={() => {}} />);
    expect(await screen.findByText('Jasmine Lawrence')).toBeInTheDocument();
    expect(screen.getByText('Benchmark Human Services')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
  });

  it('blocks an incomplete save, then saves', async () => {
    const toast = vi.fn();
    render(<SupportCoordinatorSection patientId="p1" canEdit actorName="Kaheem Freeman" onToast={toast} />);
    fireEvent.click(await screen.findByRole('button', { name: /add/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText("Enter the coordinator's name.")).toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();
    const input = (f: string) => document.querySelector(`#sc-field-${f} input`) as HTMLInputElement;
    fireEvent.change(input('name'), { target: { value: 'Jasmine Lawrence' } });
    fireEvent.change(input('agency'), { target: { value: 'Benchmark Human Services' } });
    fireEvent.change(input('email'), { target: { value: 'jlawrence@benchmarkhs.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Jasmine Lawrence')).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith('Support coordinator saved.');
  });

  it('picks the agency from the Settings list and fills its address', async () => {
    agencies.push({ id: 'ccs', name: 'Creative Consulting Services', address: '353 Resource Pkwy, Winder, GA 30680', phone: '', fax: '', afterHours: '(770) 849-7629', notes: '' });
    render(<SupportCoordinatorSection patientId="p1" canEdit actorName="Kaheem Freeman" onToast={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /add/i }));
    fireEvent.change(document.querySelector('#sc-field-agency select')!, { target: { value: 'ccs' } });
    fireEvent.change(document.querySelector('#sc-field-name input')!, { target: { value: 'Timothy Harbison' } });
    fireEvent.change(document.querySelector('#sc-field-contact input')!, { target: { value: '6789439600' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0][1]).toMatchObject({
      agency: 'Creative Consulting Services',
      address: '353 Resource Pkwy, Winder, GA 30680',
      phone: '(678) 943-9600',
      notes: 'After-hours line: (770) 849-7629.',
    });
  });
});
