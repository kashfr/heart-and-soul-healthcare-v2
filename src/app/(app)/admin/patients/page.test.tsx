/**
 * Regression tests for the edit-patient modal's clinical sub-record loading.
 * The sensitive clinical fields (Sex / Allergies / Physician / Diet) load
 * asynchronously after the modal opens; they must stay disabled until the
 * fetch resolves so nothing typed early is wiped by the arriving record, and
 * a save during the fetch must not touch the clinical sub-record at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { PatientClinical } from '@/lib/patients';

const mockPatients = vi.hoisted(() => ({
  getPatients: vi.fn(),
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

import AdminPatientsPage from './page';

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

/** Renders the roster and opens ZZ Test Client's edit modal. */
async function openEditModal() {
  render(<AdminPatientsPage />);
  const editBtn = await screen.findByRole('button', { name: 'Edit ZZ Test Client' });
  fireEvent.click(editBtn);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPatients.getPatients.mockResolvedValue([zzTestClient]);
  mockPatients.updatePatient.mockResolvedValue(undefined);
  mockPatients.savePatientClinical.mockResolvedValue(undefined);
  mockAuthedFetch.authedFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ users: [] }),
  });
});

describe('AdminPatientsPage edit modal — clinical sub-record loading', () => {
  it('disables the clinical fields until the fetch resolves, then shows the record', async () => {
    let resolveClinical!: (v: PatientClinical | null) => void;
    mockPatients.getPatientClinical.mockImplementation(
      () => new Promise<PatientClinical | null>((res) => (resolveClinical = res)),
    );

    await openEditModal();

    const allergies = screen.getByLabelText('Allergies / adverse reactions');
    const sex = screen.getByLabelText('Sex');
    const physician = screen.getByLabelText('Attending physician');
    const diet = screen.getByLabelText('Diet / special instructions');
    expect(allergies).toBeDisabled();
    expect(sex).toBeDisabled();
    expect(physician).toBeDisabled();
    expect(diet).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/loading this client/i);

    resolveClinical({ sex: 'Female', allergies: 'Penicillin (rash)' });

    await waitFor(() => expect(allergies).toBeEnabled());
    expect(allergies).toHaveValue('Penicillin (rash)');
    expect(sex).toHaveValue('Female');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('skips the clinical write when saving while the fetch is still in flight', async () => {
    mockPatients.getPatientClinical.mockImplementation(
      () => new Promise<PatientClinical | null>(() => {}), // never resolves
    );

    await openEditModal();
    fireEvent.click(screen.getByRole('button', { name: 'Update patient' }));

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

    await openEditModal();
    const allergies = screen.getByLabelText('Allergies / adverse reactions');
    await waitFor(() => expect(allergies).toBeEnabled());

    fireEvent.change(allergies, { target: { value: 'Penicillin (rash); latex' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update patient' }));

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
});
