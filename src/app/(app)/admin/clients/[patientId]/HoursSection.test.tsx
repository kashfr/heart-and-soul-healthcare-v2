/**
 * The Hours tab for a granted assistant (October 2026): she adds and edits
 * authorization lines but never sees billing rates or dollars, and never
 * deletes. A View As preview of her is read-only.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const lib = vi.hoisted(() => ({
  getBillingRates: vi.fn(),
  getHoursAuthorizationsForPatient: vi.fn(),
}));
vi.mock('@/lib/billingRates', () => ({ getBillingRates: lib.getBillingRates }));
vi.mock('@/lib/hoursAuthorizations', () => ({
  getHoursAuthorizationsForPatient: lib.getHoursAuthorizationsForPatient,
  addHoursAuthorization: vi.fn(),
  updateHoursAuthorization: vi.fn(),
  deleteHoursAuthorization: vi.fn(),
}));
vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
import HoursSection from './HoursSection';

const line = {
  id: 'a1', patientId: 'kai', paNumber: '126101100192', kind: 'skilled', covers: 'shift', rateBasis: 'week', rateHours: 16,
  from: '2026-10-20', to: '2027-03-31', monthOverrides: { '2026-11': 69 }, totalUnits: null, serviceCode: '', note: '',
};
const props = { patientId: 'kai', patientName: 'Kai Schamberger', program: 'gapp', notes: [], uid: 'rose', todayISO: '2026-10-28' };

beforeEach(() => {
  vi.clearAllMocks();
  lib.getBillingRates.mockResolvedValue([]);
  lib.getHoursAuthorizationsForPatient.mockResolvedValue([line]);
});

it('lets an assistant add and edit lines with no dollars and no delete', async () => {
  render(<HoursSection {...props} canSeeDollars={false} canDelete={false} />);
  expect((await screen.findAllByText(/PA 126101100192/)).length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: /Add Authorization/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /\$ (On|Off)/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/billing rate/i)).not.toBeInTheDocument();
  expect(lib.getBillingRates).not.toHaveBeenCalled();
});

it('shows a View As preview with no Add, Edit, or Delete', async () => {
  render(<HoursSection {...props} canSeeDollars={false} canDelete={false} readOnly />);
  expect((await screen.findAllByText(/PA 126101100192/)).length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: /Add Authorization|^Edit$|^Delete$/ })).not.toBeInTheDocument();
});

it('keeps the owner view unchanged', async () => {
  render(<HoursSection {...props} />);
  expect((await screen.findAllByText(/PA 126101100192/)).length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /\$ Off/ })).toBeInTheDocument();
  expect(lib.getBillingRates).toHaveBeenCalled();
});
