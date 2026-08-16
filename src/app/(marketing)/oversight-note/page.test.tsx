/**
 * Render tests for the RN Oversight Visit Note form: RN gating, the
 * oversight-model client filter, and the presence of every section.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mockAuth = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));
vi.mock('@/components/AuthProvider', () => mockAuth);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/lib/patients', () => ({
  getPatients: vi.fn().mockResolvedValue([
    { id: 'p1', name: 'Neal Kelly', dob: '1985-06-07', program: 'now-comp', serviceLevel: 'rn-oversight' },
    { id: 'p2', name: 'Ann Torres', dob: '1980-08-03', program: 'now-comp', serviceLevel: 'rn-lpn-daily' },
    { id: 'p3', name: 'Tora Vinson', dob: '2015-01-01', program: 'gapp', serviceLevel: 'skilled-nursing-shifts' },
  ]),
}));

vi.mock('@/lib/submissions', () => ({
  saveSubmission: vi.fn().mockResolvedValue('note-id'),
}));

vi.mock('@/components/SignatureCanvas', () => ({
  __esModule: true,
  default: () => null,
}));

import OversightNotePage from './page';

const rnProfile = { displayName: 'Souz Payne', credential: 'RN' };

beforeEach(() => {
  mockAuth.useAuth.mockReturnValue({
    user: { uid: 'rn-uid' },
    profile: rnProfile,
    role: 'nurse',
  });
});

describe('OversightNotePage', () => {
  it('renders every oversight section for an RN', async () => {
    render(<OversightNotePage />);
    for (const section of [
      'CLIENT & VISIT',
      '1. INDIVIDUAL STATUS AND OBSERVATIONS',
      '2. HEALTHCARE PLAN (HCP)',
      '3. PHYSICIAN ORDERS AND MEDICATIONS',
      '4. MEDICAL APPOINTMENTS AND FOLLOW-UP SINCE LAST VISIT',
      '5. HEALTH DATA AND TRACKING LOGS',
      '6. EDUCATION PROVIDED THIS VISIT',
      '7. CHOICE AND PERSON-CENTERED CARE',
      '8. GOAL PROGRESS',
      '9. RECOMMENDATIONS, FOLLOW-UP, AND COMMUNICATION',
      'RN SIGNATURE',
    ]) {
      expect(screen.getByText(section)).toBeInTheDocument();
    }
    // RN identity prefilled and locked for nurses.
    await waitFor(() => {
      expect(screen.getByLabelText(/RN name/i)).toHaveValue('Souz Payne');
    });
  });

  it('defaults the client list to every NOW/COMP client regardless of staffing model', async () => {
    render(<OversightNotePage />);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Neal Kelly/ })).toBeInTheDocument();
    });
    // Every NOW/COMP client receives monthly RN oversight — a daily-LPN
    // staffing model must not exclude anyone from this list.
    expect(screen.getByRole('option', { name: /Ann Torres/ })).toBeInTheDocument();
    // Other programs stay hidden until the toggle is checked.
    expect(screen.queryByRole('option', { name: /Tora Vinson/ })).toBeNull();
  });

  it('the toggle reveals clients from other programs, labeled with the program', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    render(<OversightNotePage />);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Neal Kelly/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('checkbox', { name: /Show all clients/i }));
    expect(screen.getByRole('option', { name: /Tora Vinson\s+\(GAPP\)/ })).toBeInTheDocument();
  });

  it('blocks nurses whose credential is not RN', () => {
    mockAuth.useAuth.mockReturnValue({
      user: { uid: 'lpn-uid' },
      profile: { displayName: 'Makador', credential: 'LPN' },
      role: 'nurse',
    });
    render(<OversightNotePage />);
    expect(screen.getByText(/limited to staff with an\s*RN credential/i)).toBeInTheDocument();
    expect(screen.queryByText('CLIENT & VISIT')).toBeNull();
  });

  it('allows admins through the gate', () => {
    mockAuth.useAuth.mockReturnValue({
      user: { uid: 'admin-uid' },
      profile: { displayName: 'Kaheem Freeman', credential: '' },
      role: 'admin',
    });
    render(<OversightNotePage />);
    expect(screen.getByText('CLIENT & VISIT')).toBeInTheDocument();
  });
});
