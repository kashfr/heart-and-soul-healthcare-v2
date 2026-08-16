/**
 * Render tests for the RN Oversight Visit Note form: RN gating, the
 * oversight-model client filter, and the presence of every section.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const mockAuth = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));
vi.mock('@/components/AuthProvider', () => mockAuth);

const mockRouter = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const mockSearchParams = vi.hoisted(() => new URLSearchParams());
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/lib/patients', () => ({
  getPatients: vi.fn().mockResolvedValue([
    { id: 'p1', name: 'Neal Kelly', dob: '1985-06-07', program: 'now-comp', serviceLevel: 'rn-oversight' },
    { id: 'p2', name: 'Ann Torres', dob: '1980-08-03', program: 'now-comp', serviceLevel: 'rn-lpn-daily' },
    { id: 'p3', name: 'Tora Vinson', dob: '2015-01-01', program: 'gapp', serviceLevel: 'skilled-nursing-shifts' },
  ]),
}));

const mockSubmissions = vi.hoisted(() => ({
  saveSubmission: vi.fn().mockResolvedValue('note-id'),
  updateSubmission: vi.fn().mockResolvedValue(undefined),
  getSubmission: vi.fn().mockResolvedValue(null),
  findDuplicateSubmission: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/submissions', () => mockSubmissions);

const mockDrafts = vi.hoisted(() => ({
  saveOversightDraft: vi.fn().mockResolvedValue(undefined),
  loadOversightDraft: vi.fn().mockResolvedValue(null),
  clearOversightDraft: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/drafts', () => mockDrafts);

const mockAuthedFetch = vi.hoisted(() => ({
  authedFetch: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('@/lib/authedFetch', () => mockAuthedFetch);

vi.mock('@/components/SignatureCanvas', () => ({
  __esModule: true,
  default: () => null,
}));

import OversightNotePage from './page';

const rnProfile = { displayName: 'Souz Payne', credential: 'RN' };

beforeEach(() => {
  vi.clearAllMocks();
  mockSubmissions.getSubmission.mockResolvedValue(null);
  mockDrafts.loadOversightDraft.mockResolvedValue(null);
  for (const k of Array.from(mockSearchParams.keys())) mockSearchParams.delete(k);
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

describe('OversightNotePage — client details', () => {
  it('renders the date of birth in US format', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    render(<OversightNotePage />);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Neal Kelly/ })).toBeInTheDocument();
    });
    // Select by role — "Individual" also labels an education-recipient checkbox.
    await user.selectOptions(screen.getByRole('combobox'), 'p1');
    // Roster stores ISO (1985-06-07); nurses read US format.
    expect(screen.getByDisplayValue('06/07/1985')).toBeInTheDocument();
  });
});

describe('OversightNotePage — edit mode', () => {
  it('loads a stored oversight note and switches to Update', async () => {
    mockSubmissions.getSubmission.mockResolvedValue({
      noteType: 'rn-oversight-visit',
      q3_clientName: 'Neal Kelly',
      q6_dateofService: '2026-08-14',
      ov_location: "Individual's home",
      ov_generalCondition: 'Stable since last visit.',
      ov_visitType: 'Routine oversight',
    });
    mockSearchParams.set('edit', 'note-123');
    render(<OversightNotePage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Stable since last visit.')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Update Oversight Note/i })).toBeInTheDocument();
    // Amending must never autosave over the nurse's draft.
    expect(mockDrafts.saveOversightDraft).not.toHaveBeenCalled();
  });

  it('refuses to edit a shift note opened on this route', async () => {
    mockSubmissions.getSubmission.mockResolvedValue({
      q3_clientName: 'Ann Torres',
      q6_dateofService: '2026-08-14',
    });
    mockSearchParams.set('edit', 'shift-note');
    render(<OversightNotePage />);
    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/admin/submissions/shift-note');
    });
  });
});

describe('OversightNotePage — amend fidelity', () => {
  it('re-checks education topics whose values contain ", " and keeps the documenting RN', async () => {
    mockSubmissions.getSubmission.mockResolvedValue({
      noteType: 'rn-oversight-visit',
      q3_clientName: 'Neal Kelly',
      q11_nurseName: 'Angela Walker', // a DIFFERENT RN documented this visit
      q6_dateofService: '2026-08-14',
      ov_generalCondition: 'Stable.',
      // Both values contain ", " — a naive split shatters them.
      ov_educationTopics:
        'Maintaining personal health (diet, exercise, self-management), Abuse, neglect, and exploitation: prevention and reporting',
    });
    mockSearchParams.set('edit', 'note-abc');
    render(<OversightNotePage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Stable.')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /Maintaining personal health/i }),
      ).toBeChecked();
    });
    expect(screen.getByRole('checkbox', { name: /ANE prevention and reporting/i })).toBeChecked();
    // Unrelated topic stays unchecked.
    expect(screen.getByRole('checkbox', { name: /Rights and responsibilities/i })).not.toBeChecked();
    // The amender's name must not overwrite the RN who did the visit.
    expect(screen.getByLabelText(/RN name/i)).toHaveValue('Angela Walker');
  });
});

describe('OversightNotePage — autosave', () => {
  const typeInto = (label: RegExp, text: string) => {
    fireEvent.change(screen.getByLabelText(label), { target: { value: text } });
  };

  it('saves once per burst of typing and never loops', async () => {
    render(<OversightNotePage />);
    // Autosave stays parked until the stored-draft lookup resolves.
    await waitFor(() => expect(mockDrafts.loadOversightDraft).toHaveBeenCalled());
    vi.useFakeTimers();

    typeInto(/General condition/i, 'Stable today.');
    typeInto(/Conversations, interactions/i, 'Chatted about her garden.');

    await vi.advanceTimersByTimeAsync(3000);
    expect(mockDrafts.saveOversightDraft).toHaveBeenCalledTimes(1);

    // No further input. The first build re-armed the timer on every render and
    // wrote to Firestore every 2.5s forever; this must stay at one call.
    await vi.advanceTimersByTimeAsync(20000);
    expect(mockDrafts.saveOversightDraft).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('does not autosave before the stored-draft lookup resolves', async () => {
    let resolveLookup: (v: unknown) => void = () => {};
    mockDrafts.loadOversightDraft.mockReturnValue(
      new Promise((res) => {
        resolveLookup = res;
      }),
    );
    render(<OversightNotePage />);
    vi.useFakeTimers();
    typeInto(/General condition/i, 'Typed while the lookup is in flight.');
    await vi.advanceTimersByTimeAsync(6000);
    // Saving now would clobber whatever the lookup is about to return.
    expect(mockDrafts.saveOversightDraft).not.toHaveBeenCalled();
    vi.useRealTimers();
    resolveLookup(null);
  });
});
