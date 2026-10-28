/**
 * Regression tests for the edit-client modal's clinical sub-record loading.
 * The sensitive clinical fields (Sex / Allergies / Physician / Medicaid ID /
 * Diet / vitals baselines) load asynchronously after the modal opens; they
 * must stay disabled until the fetch resolves so nothing typed early is wiped
 * by the arriving record, and a save during the fetch must not touch the
 * clinical sub-record at all.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { PatientClinical } from '@/lib/patients';

const mockPatients = vi.hoisted(() => ({
  getPatients: vi.fn(),
  getPatientsForNurse: vi.fn(),
  getPatientClinical: vi.fn(),
  addPatient: vi.fn(),
  updatePatient: vi.fn().mockResolvedValue(undefined),
  removePatient: vi.fn(),
  savePatientClinical: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/patients', () => mockPatients);

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn().mockResolvedValue(undefined),
}));

const mockAuthedFetch = vi.hoisted(() => ({
  authedFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ users: [] }),
  }),
}));
vi.mock('@/lib/authedFetch', () => mockAuthedFetch);

vi.mock('@/lib/hoursAuthorizations', () => ({ getAllHoursAuthorizations: vi.fn() }));
vi.mock('@/lib/submissions', () => ({ getDayHoursByPatientSince: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/components/AuthGuard', () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/SettingsProvider', () => ({ useSettings: () => ({ settings: { assistantClients: { grants: [] } }, ready: true, refresh: vi.fn() }) }));
// A supervisor: manages the roster, but isn't the hours-badge owner, so the
// page skips the admin-only hours fetch.
vi.mock('@/components/AuthProvider', () => ({
  useEffectiveUser: () => ({ uid: 'supervisor-uid', role: 'supervisor', isViewingAs: false }),
  useAuth: () => ({ profile: { role: 'supervisor', displayName: 'Test Supervisor' } }),
}));

import ClientsRosterPage from './page';

const zzTestClient = {
  id: 'zz-test-client',
  name: 'ZZ Test Client',
  dob: '2015-01-01',
  diagnosis: 'Test chart',
  street: '',
  city: '',
  state: '',
  zip: '',
  mrn: '999',
};

const zzTestClient2 = { ...zzTestClient, id: 'zz-test-client-2', name: 'ZZ Test Client 2', mrn: '998' };

/** Renders the roster and opens the named client's edit modal. */
async function openEditModal(name = 'ZZ Test Client') {
  fireEvent.click(await screen.findByRole('button', { name: `Edit ${name}` }));
}

function clinicalInputs() {
  return [
    screen.getByLabelText('Sex'),
    screen.getByLabelText('Allergies / adverse reactions'),
    screen.getByLabelText('Attending physician'),
    screen.getByLabelText('Physician phone'),
    screen.getByLabelText('Physician fax'),
    screen.getByLabelText('Medicaid ID'),
    screen.getByLabelText('Diet / special instructions'),
    screen.getByLabelText('Where the baselines are documented'),
    ...screen.getAllByLabelText(/ baseline (low|high)$/),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPatients.getPatients.mockResolvedValue([zzTestClient, zzTestClient2]);
  mockPatients.updatePatient.mockResolvedValue(undefined);
  mockPatients.savePatientClinical.mockResolvedValue(undefined);
  mockAuthedFetch.authedFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ users: [] }),
  });
});

describe('ClientsRosterPage edit modal — clinical sub-record loading', () => {
  it('disables the clinical fields until the fetch resolves, then shows the record', async () => {
    let resolveClinical!: (v: PatientClinical | null) => void;
    mockPatients.getPatientClinical.mockImplementation(
      () => new Promise<PatientClinical | null>((res) => (resolveClinical = res)),
    );

    render(<ClientsRosterPage />);
    await openEditModal();

    for (const input of clinicalInputs()) expect(input).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/loading this client/i);

    resolveClinical({
      sex: 'Female',
      allergies: 'Penicillin (rash)',
      medicaidId: 'ABC123',
      vitalsBaselines: { pulse: { low: 100, high: 110 } },
      vitalsBaselinesNote: 'care plan dated 03/2026',
    });

    const allergies = screen.getByLabelText('Allergies / adverse reactions');
    await waitFor(() => expect(allergies).toBeEnabled());
    for (const input of clinicalInputs()) expect(input).toBeEnabled();
    expect(allergies).toHaveValue('Penicillin (rash)');
    expect(screen.getByLabelText('Sex')).toHaveValue('Female');
    expect(screen.getByLabelText('Medicaid ID')).toHaveValue('ABC123');
    expect(screen.getByLabelText('Pulse baseline low')).toHaveValue(100);
    expect(screen.getByLabelText('Where the baselines are documented')).toHaveValue('care plan dated 03/2026');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('skips the clinical write when saving while the fetch is still in flight', async () => {
    // A mid-fetch save would otherwise send vitalsBaselines: {} and a blank
    // baselines note, wiping whatever the stored record holds.
    mockPatients.getPatientClinical.mockImplementation(
      () => new Promise<PatientClinical | null>(() => {}), // never resolves
    );

    render(<ClientsRosterPage />);
    await openEditModal();
    fireEvent.click(screen.getByRole('button', { name: 'Update Patient' }));

    await waitFor(() =>
      expect(mockPatients.updatePatient).toHaveBeenCalledWith(
        'zz-test-client',
        expect.objectContaining({ name: 'ZZ Test Client' }),
      ),
    );
    expect(mockPatients.savePatientClinical).not.toHaveBeenCalled();
  });

  it('keeps the two-write order on a normal save: patient doc, then clinical', async () => {
    mockPatients.getPatientClinical.mockResolvedValue({ allergies: 'Penicillin (rash)' });

    render(<ClientsRosterPage />);
    await openEditModal();
    const allergies = screen.getByLabelText('Allergies / adverse reactions');
    await waitFor(() => expect(allergies).toBeEnabled());

    fireEvent.change(allergies, { target: { value: 'Penicillin (rash); latex' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Patient' }));

    await waitFor(() =>
      expect(mockPatients.savePatientClinical).toHaveBeenCalledWith(
        'zz-test-client',
        expect.objectContaining({ allergies: 'Penicillin (rash); latex' }),
      ),
    );
    expect(mockPatients.updatePatient.mock.invocationCallOrder[0]).toBeLessThan(
      mockPatients.savePatientClinical.mock.invocationCallOrder[0],
    );
  });

  it("doesn't show the previously opened client's record while the next one loads", async () => {
    mockPatients.getPatientClinical.mockImplementation((id: string) =>
      id === 'zz-test-client'
        ? Promise.resolve({ allergies: 'Penicillin (rash)', medicaidId: 'ABC123' })
        : new Promise<PatientClinical | null>(() => {}), // second client never resolves
    );

    render(<ClientsRosterPage />);
    await openEditModal();
    const allergies = screen.getByLabelText('Allergies / adverse reactions');
    await waitFor(() => expect(allergies).toHaveValue('Penicillin (rash)'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await openEditModal('ZZ Test Client 2');
    expect(screen.getByLabelText('Allergies / adverse reactions')).toHaveValue('');
    expect(screen.getByLabelText('Medicaid ID')).toHaveValue('');
    expect(screen.getByLabelText('Allergies / adverse reactions')).toBeDisabled();
  });
});
