import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RoiSection from './RoiSection';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('@/lib/authedFetch', () => ({ authedFetch: fetchMock }));
vi.mock('@/lib/physicians', () => ({ getPhysicians: vi.fn(async () => null) }));
vi.mock('@/lib/dayProgram', () => ({ getDayProgram: vi.fn(async () => null) }));
vi.mock('@/lib/supportCoordinator', () => ({ getSupportCoordinator: vi.fn(async () => null) }));
vi.mock('@/components/PdfPreviewModal', () => ({ default: () => <div>Prepared PDF preview</div> }));

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url: string, options?: RequestInit) => ({
    ok: true,
    json: async () => options?.method === 'POST'
      ? { roi: { id: 'request1', memberName: 'Sample Patient', formType: 'choa', facility: { name: 'CHOA' } } }
      : { rois: [], clients: [{ id: 'client1', name: 'Sample Patient', dob: '03/14/2015', program: 'gapp' }] },
  }));
});

it('prepares a CHOA request with the selected patient, dates, and records', async () => {
  const props = { refreshKey: 0, faxConfigured: true, onFaxSent: vi.fn() };
  const view = render(<RoiSection {...props} openRequest={0} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  view.rerender(<RoiSection {...props} openRequest={1} />);
  fireEvent.change(screen.getByLabelText('Authorization form'), { target: { value: 'choa' } });
  expect(screen.queryByText('Which way do the records go?')).not.toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText('Search a client by name or DOB'), { target: { value: 'Sample' } });
  fireEvent.click(await screen.findByRole('button', { name: /Sample Patient/ }));
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01' } });
  fireEvent.change(screen.getByLabelText('Through'), { target: { value: '2026-10-06' } });
  fireEvent.click(screen.getByLabelText('Lab reports'));
  fireEvent.click(screen.getByRole('button', { name: 'Prepare and Preview' }));
  await screen.findByText('Prepared PDF preview');
  const post = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
  expect(JSON.parse(post![1].body)).toMatchObject({
    formType: 'choa', patientId: 'client1', direction: 'to-us', duration: 'year',
    choa: { location: '', dateFrom: '2026-01-01', dateTo: '2026-10-06', recordTypes: ['routine', 'labs'] },
  });
  expect(screen.getByRole('status')).toHaveTextContent('patient or authorized representative');
  expect(screen.getByRole('status')).not.toHaveTextContent("guardian's initials");
});

it('prepares from a referral without a client record and requests the missing DOB', async () => {
  fetchMock.mockImplementation(async (_url: string, options?: RequestInit) => ({
    ok: true,
    json: async () => options?.method === 'POST'
      ? { roi: { id: 'request2', memberName: 'Test Referral', formType: 'choa', facility: { name: 'CHOA' }, referralId: 'ref1' } }
      : { rois: [], clients: [], subject: { id: 'ref1', name: 'Test Referral', dob: '', program: 'gapp' }, faxConfigured: false },
  }));
  render(<RoiSection referralId="ref1" refreshKey={0} openRequest={0} faxConfigured={false} onFaxSent={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Prepare a Release' })).toBeEnabled());
  expect(fetchMock).toHaveBeenCalledWith('/api/fax/roi?referralId=ref1');
  fireEvent.click(screen.getByRole('button', { name: 'Prepare a Release' }));
  expect(screen.getByLabelText('Authorization form')).toHaveValue('choa');
  expect(screen.queryByPlaceholderText('Search a client by name or DOB')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01' } });
  fireEvent.change(screen.getByLabelText('Through'), { target: { value: '2026-10-06' } });
  fireEvent.click(screen.getByRole('button', { name: 'Prepare and Preview' }));
  expect(screen.getByText('Enter the date of birth for this release.')).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([, opts]) => opts?.method === 'POST')).toBe(false);
  fireEvent.change(screen.getByLabelText(/Date of birth/), { target: { value: '2015-03-14' } });
  fireEvent.click(screen.getByRole('button', { name: 'Prepare and Preview' }));
  await screen.findByText('Prepared PDF preview');
  const post = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
  expect(JSON.parse(post![1].body)).toMatchObject({ referralId: 'ref1', referralDob: '2015-03-14', formType: 'choa' });
  expect(JSON.parse(post![1].body)).not.toHaveProperty('patientId');
});
