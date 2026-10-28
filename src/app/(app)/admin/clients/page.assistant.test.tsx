/**
 * A granted virtual assistant gets the staff roster (October 2026): her
 * program's clients, Add and Edit, never Remove. Without a grant she sees
 * the access notice and nothing is fetched.
 */
import React from 'react';
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mockPatients = vi.hoisted(() => ({
  getPatients: vi.fn(),
  getPatientsForNurse: vi.fn(),
  getPatientsForProgram: vi.fn(),
  getPatientClinical: vi.fn(),
  addPatient: vi.fn(),
  updatePatient: vi.fn(),
  removePatient: vi.fn(),
  savePatientClinical: vi.fn(),
}));
vi.mock('@/lib/patients', () => mockPatients);
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ arrayUnion: vi.fn(), arrayRemove: vi.fn(), doc: vi.fn(), updateDoc: vi.fn() }));
vi.mock('@/lib/authedFetch', () => ({ authedFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ users: [] }) }) }));
const hours = vi.hoisted(() => ({ getAllHoursAuthorizations: vi.fn(), getDayHoursByPatientSince: vi.fn() }));
vi.mock('@/lib/hoursAuthorizations', () => ({ getAllHoursAuthorizations: hours.getAllHoursAuthorizations }));
vi.mock('@/lib/submissions', () => ({ getDayHoursByPatientSince: hours.getDayHoursByPatientSince }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/components/AuthGuard', () => ({ AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const state = vi.hoisted(() => ({ grants: [] as Array<{ uid: string; scope: string; editInfo: boolean; uploadDocuments: boolean }> }));
vi.mock('@/components/AuthProvider', () => ({
  useEffectiveUser: () => ({ uid: 'rose', role: 'va', isViewingAs: false }),
  useAuth: () => ({ profile: { role: 'va', displayName: 'Rosita Lee' } }),
}));
vi.mock('@/components/SettingsProvider', () => ({
  useSettings: () => ({ settings: { assistantClients: { grants: state.grants } }, ready: true, refresh: vi.fn() }),
}));

import ClientsRosterPage from './page';

const kai = { id: 'kai', name: 'Kai Schamberger', dob: '2018-10-08', diagnosis: 'Autism', program: 'gapp', street: '', city: '', state: '', zip: '', mrn: '22' };

beforeEach(() => {
  vi.clearAllMocks();
  state.grants = [];
  mockPatients.getPatientsForProgram.mockResolvedValue([kai]);
  mockPatients.getPatients.mockResolvedValue([kai]);
  hours.getAllHoursAuthorizations.mockResolvedValue(new Map());
  hours.getDayHoursByPatientSince.mockResolvedValue(new Map());
});

it('lists only her program with Add and Edit, and no Remove, for a GAPP-scoped grant with editing', async () => {
  state.grants = [{ uid: 'rose', scope: 'gapp', editInfo: true, uploadDocuments: true }];
  render(<ClientsRosterPage />);
  expect(await screen.findByRole('button', { name: 'Edit Kai Schamberger' })).toBeInTheDocument();
  expect(mockPatients.getPatientsForProgram).toHaveBeenCalledWith('gapp');
  expect(mockPatients.getPatients).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Remove Kai Schamberger' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Add Patient/i })).toBeInTheDocument();
  await waitFor(() => expect(hours.getAllHoursAuthorizations).toHaveBeenCalled());
});

it('loads every client without edit controls for an all-clients, view-only grant', async () => {
  state.grants = [{ uid: 'rose', scope: 'all', editInfo: false, uploadDocuments: false }];
  render(<ClientsRosterPage />);
  expect(await screen.findByText('Kai Schamberger')).toBeInTheDocument();
  expect(mockPatients.getPatients).toHaveBeenCalled();
  expect(mockPatients.getPatientsForProgram).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /Edit Kai|Remove Kai|Add Patient/i })).not.toBeInTheDocument();
});

it('shows the access notice and fetches nothing without a grant', () => {
  render(<ClientsRosterPage />);
  expect(screen.getByText(/Client access has not been enabled for your account/)).toBeInTheDocument();
  expect(mockPatients.getPatients).not.toHaveBeenCalled();
  expect(mockPatients.getPatientsForProgram).not.toHaveBeenCalled();
});
