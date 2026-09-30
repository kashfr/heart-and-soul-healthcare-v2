/**
 * Render tests for the Home Supervisory Visit form: staff-only access, the
 * paper form's sections, conditional explanations, and the submit flow
 * (save, file into Documents, complete the scheduled visit).
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
  getPatientClinical: vi.fn().mockResolvedValue(null),
  getPatients: vi.fn().mockResolvedValue([
    {
      id: 'p1',
      name: 'Neal Kelly',
      dob: '1985-06-07',
      program: 'now-comp',
      street: '12 Oak St',
      city: 'Atlanta',
      state: 'GA',
      zip: '30301',
      assignedNurseIds: ['n2'],
    },
    { id: 'p2', name: 'Tora Vinson', dob: '2015-01-01', program: 'gapp' },
  ]),
}));

const mockVisits = vi.hoisted(() => ({
  getActiveFieldStaff: vi.fn().mockResolvedValue([
    { uid: 'n1', name: 'Bea Cole', credential: 'LPN' },
    { uid: 'n2', name: 'Ann Lee', credential: 'CNA' },
  ]),
  completeScheduledSupervisoryVisit: vi.fn().mockResolvedValue(1),
}));
vi.mock('@/lib/patientVisits', () => mockVisits);

const mockSubmissions = vi.hoisted(() => ({
  saveSubmission: vi.fn().mockResolvedValue('note-id'),
  updateSubmission: vi.fn().mockResolvedValue(undefined),
  getSubmission: vi.fn().mockResolvedValue(null),
  findDuplicateSubmission: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/submissions', () => mockSubmissions);

const mockDrafts = vi.hoisted(() => ({
  saveSupervisoryDraft: vi.fn().mockResolvedValue(undefined),
  loadSupervisoryDraft: vi.fn().mockResolvedValue(null),
  clearSupervisoryDraft: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/drafts', () => mockDrafts);

vi.mock('@/lib/authedFetch', () => ({ authedFetch: vi.fn().mockResolvedValue({ ok: true }) }));
const mockDocuments = vi.hoisted(() => ({ fileNoteDocument: vi.fn(async () => {}) }));
vi.mock('@/lib/patientDocuments', () => mockDocuments);

// A stand-in pad: one click "signs".
vi.mock('@/components/SignatureCanvas', () => ({
  __esModule: true,
  default: ({ onChange }: { onChange: (d: string) => void }) => (
    <button type="button" onClick={() => onChange('data:image/png;base64,sig')}>
      test-sign
    </button>
  ),
}));

import SupervisoryVisitPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no scrolling; the required-field escort scrolls to the first gap.
  Element.prototype.scrollIntoView = vi.fn();
  mockSubmissions.getSubmission.mockResolvedValue(null);
  mockSubmissions.findDuplicateSubmission.mockResolvedValue(null);
  mockSubmissions.saveSubmission.mockResolvedValue('note-id');
  mockDrafts.loadSupervisoryDraft.mockResolvedValue(null);
  for (const k of Array.from(mockSearchParams.keys())) mockSearchParams.delete(k);
  mockAuth.useAuth.mockReturnValue({
    user: { uid: 'sup-uid' },
    profile: { displayName: 'Souz Payne', credential: 'RN' },
    role: 'supervisor',
  });
});

describe('SupervisoryVisitPage', () => {
  it("renders the paper form's sections for a supervisor, with the supervisor prefilled", async () => {
    render(<SupervisoryVisitPage />);
    for (const section of [
      'CLIENT & VISIT',
      'CLIENT QUESTIONS',
      'OVERALL ASSESSMENT OF CLIENT',
      'INTERVIEW WITH THE CLIENT',
      'RECOMMENDATIONS',
      'SUPERVISOR SIGNATURE',
    ]) {
      expect(screen.getByText(section)).toBeInTheDocument();
    }
    expect(screen.getByText(/What would you do if you had a complaint?/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText(/^Supervisor$/)).toHaveValue('Souz Payne');
    });
  });

  it('keeps the license to RN / LPN and carries longer credentials to the printed line', async () => {
    mockAuth.useAuth.mockReturnValue({
      user: { uid: 'sup-uid' },
      profile: { displayName: 'Ashley Turner', credential: 'DNP, RN' },
      role: 'supervisor',
    });
    render(<SupervisoryVisitPage />);
    await waitFor(() => expect(screen.getByLabelText(/^License/)).toHaveValue('RN'));
    expect(screen.getByLabelText(/Credentials as printed/)).toHaveValue('DNP, RN');
    // Name and credentials are the profile's, never typed.
    expect(screen.getByLabelText(/^Supervisor$/)).toHaveAttribute('readonly');
    expect(screen.getByLabelText(/^License/)).toHaveAttribute('readonly');
    expect(screen.getByLabelText(/Credentials as printed/)).toHaveAttribute('readonly');
  });

  it('blocks field staff (nurse role), even with an RN credential', () => {
    mockAuth.useAuth.mockReturnValue({
      user: { uid: 'rn-uid' },
      profile: { displayName: 'Rae Nurse', credential: 'RN' },
      role: 'nurse',
    });
    render(<SupervisoryVisitPage />);
    expect(screen.getByText(/completed by nurse supervisors and administrators/i)).toBeInTheDocument();
    expect(screen.queryByText('CLIENT QUESTIONS')).toBeNull();
  });

  it("fills the client's address and lists the client's assigned staff first", async () => {
    render(<SupervisoryVisitPage />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Neal Kelly' })).toBeInTheDocument());
    // Every program is listed; supervisory visits are not NOW/COMP-only.
    expect(screen.getByRole('option', { name: 'Tora Vinson' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Client name/), { target: { value: 'p1' } });
    expect(screen.getByLabelText(/^Address/)).toHaveValue('12 Oak St, Atlanta, GA 30301');
    await waitFor(() => expect(screen.getByRole('group', { name: 'Assigned to this client' })).toBeInTheDocument());
    const assigned = screen.getByRole('group', { name: 'Assigned to this client' });
    expect(assigned).toHaveTextContent('Ann Lee, CNA');
    expect(assigned).not.toHaveTextContent('Bea Cole');
  });

  it('shows the problems box only when problems were encountered', async () => {
    render(<SupervisoryVisitPage />);
    const group = document.getElementById('sv_problems')!;
    expect(screen.queryByLabelText(/Document the problems encountered/)).toBeNull();
    fireEvent.click(group.querySelector('input[value="Yes"]')!);
    await waitFor(() => expect(screen.getByLabelText(/Document the problems encountered/)).toBeInTheDocument());
  });

  it('blocks an incomplete submit and names what is missing', async () => {
    render(<SupervisoryVisitPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Submit Supervisory Visit' }));
    await waitFor(() => expect(screen.getByText(/Missing required fields/)).toBeInTheDocument());
    expect(screen.getByText('Select the client from the roster.')).toBeInTheDocument();
    expect(screen.getByText('Choose the staff member performing duties.')).toBeInTheDocument();
    expect(screen.getByText("Record the client's answer to the complaint question.")).toBeInTheDocument();
    expect(screen.getByText("Describe the client's general conditions.")).toBeInTheDocument();
    expect(screen.getByText("Document the client's progress.")).toBeInTheDocument();
    expect(mockSubmissions.saveSubmission).not.toHaveBeenCalled();
  });

  it('saves a complete visit, files it into Documents, and completes the scheduled visit', async () => {
    render(<SupervisoryVisitPage />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Neal Kelly' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Client name/), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText(/^Date \*/), { target: { value: '2026-09-28' } });
    fireEvent.change(screen.getByLabelText(/^Time in/), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText(/^Time out/), { target: { value: '10:45' } });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Ann Lee, CNA' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Staff performing duties/), { target: { value: 'n2' } });
    fireEvent.change(screen.getByLabelText(/^Temperature \(°F\)/), { target: { value: '98.4' } });
    fireEvent.change(screen.getByLabelText('Temperature route'), { target: { value: 'Oral' } });
    fireEvent.change(screen.getByLabelText('Systolic'), { target: { value: '118' } });
    fireEvent.change(screen.getByLabelText('Diastolic'), { target: { value: '76' } });
    fireEvent.change(document.getElementById('q18_pulse')!, { target: { value: '72' } });
    fireEvent.change(document.getElementById('q19_respiration')!, { target: { value: '16' } });
    fireEvent.change(document.getElementById('q20_oxygenSaturation')!, { target: { value: '98' } });
    fireEvent.change(document.getElementById('q21_oxygenSource')!, { target: { value: 'Room Air' } });
    fireEvent.change(screen.getByLabelText(/What would you do if you had a complaint/), { target: { value: 'Call the office.' } });
    fireEvent.change(screen.getByLabelText(/anything else you would like to tell me/), { target: { value: 'No.' } });
    fireEvent.change(screen.getByLabelText(/General conditions/), { target: { value: 'Alert, home clean.' } });
    fireEvent.change(screen.getByLabelText(/Document client progress/), { target: { value: 'Walking further.' } });
    const pick = (name: string, value: string) =>
      fireEvent.click(document.getElementById(name)!.querySelector(`input[value="${value}"]`)!);
    pick('sv_problems', 'No');
    pick('sv_rightsInformed', 'Yes');
    pick('sv_clientSatisfied', 'Yes');
    pick('sv_interviewMethod', 'In person');
    pick('sv_levelOfCare', 'Yes');
    pick('sv_satisfiedWithStaff', 'Yes');
    fireEvent.click(screen.getByRole('button', { name: 'test-sign' }));

    fireEvent.click(screen.getByRole('button', { name: 'Submit Supervisory Visit' }));

    await waitFor(() => expect(mockSubmissions.saveSubmission).toHaveBeenCalledTimes(1));
    const saved = mockSubmissions.saveSubmission.mock.calls[0][0];
    expect(saved).toMatchObject({
      noteType: 'home-supervisory-visit',
      patientId: 'p1',
      q3_clientName: 'Neal Kelly',
      sv_staffName: 'Ann Lee, CNA',
      sv_staffId: 'n2',
      q16_temperature: '98.4',
      q16_temperatureRoute: 'Oral',
      q17_bloodPressure: '118/76',
      q18_pulse: '72',
      q19_respiration: '16',
      q20_oxygenSaturation: '98',
      q21_oxygenSource: 'Room Air',
      q1_formRev: '2',
      sv_problems: 'No',
      sv_interviewMethod: 'In person',
      q11_nurseName: 'Souz Payne',
      q62_shiftEndDate: '2026-09-28',
    });
    await waitFor(() => expect(mockDocuments.fileNoteDocument).toHaveBeenCalledWith('note-id'));
    expect(mockVisits.completeScheduledSupervisoryVisit).toHaveBeenCalledWith('p1', '2026-09-28', {
      uid: 'sup-uid',
      name: 'Souz Payne',
    });
    expect(mockDrafts.clearSupervisoryDraft).toHaveBeenCalledWith('sup-uid');
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(expect.stringMatching(/^\/progress-note\/submitted\/note-id\?.*t=supervisory$/)),
    );
  });

  it("flags a vital outside its normal range for the client's age", async () => {
    render(<SupervisoryVisitPage />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Neal Kelly' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Client name/), { target: { value: 'p1' } });
    fireEvent.change(document.getElementById('q18_pulse')!, { target: { value: '140' } });
    await waitFor(() => expect(screen.getByText(/Pulse is high for/)).toBeInTheDocument());
  });

  it('refuses to amend a record of another type', async () => {
    mockSearchParams.set('edit', 'n9');
    mockSubmissions.getSubmission.mockResolvedValue({ noteType: 'rn-oversight-visit' });
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<SupervisoryVisitPage />);
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/admin/submissions/n9'));
    expect(alert).toHaveBeenCalled();
    alert.mockRestore();
  });
});
