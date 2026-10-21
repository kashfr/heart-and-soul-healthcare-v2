import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import EditReferralModal from './EditReferralModal';
import { authedFetch } from '@/lib/authedFetch';
import type { Referral } from './types';
vi.mock('@/lib/authedFetch', () => ({ authedFetch: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});

const referral = {
  id: 'r1', source: 'gapp-website', stage: 'assessment', status: 'contacted', order: 0,
  assigneeUid: null, assigneeName: null, statusUpdatedBy: null,
  clientName: 'Jazz King', clientEmail: '', clientPhone: '(828) 508-8228', county: 'Gwinnett', program: 'GAPP', referrerName: 'Ariel King',
  details: [{ label: 'Seeking paid caregiver', value: 'No' }, { label: "Member's Medicaid ID", value: 'Will provide later' }],
} as unknown as Referral & { source: 'gapp-website' };

it('adds a Medicaid ID and sends only the editable fields', async () => {
  vi.mocked(authedFetch).mockResolvedValue(new Response(JSON.stringify({ ok: true, changed: 1 })));
  const saved = vi.fn();
  render(<EditReferralModal referral={referral} onClose={vi.fn()} onSaved={saved} />);
  expect(screen.getByText(/can’t be changed here|can't be changed here/)).toBeInTheDocument();
  expect(screen.queryByLabelText(/Seeking paid caregiver/)).toBeNull();
  const medicaid = screen.getByLabelText('Medicaid ID') as HTMLInputElement;
  expect(medicaid.value).toBe('Will provide later');
  fireEvent.change(medicaid, { target: { value: '222120339644' } });
  fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  const [url, init] = vi.mocked(authedFetch).mock.calls[0];
  expect(url).toBe('/api/admin/referrals/r1/details');
  const values = JSON.parse(init!.body as string).values;
  expect(values["row:Member's Medicaid ID"]).toBe('222120339644');
  expect(values).not.toHaveProperty('row:Seeking paid caregiver');
});

it('formats phones as typed and blocks clearing a required field', () => {
  render(<EditReferralModal referral={referral} onClose={vi.fn()} onSaved={vi.fn()} />);
  const phone = screen.getByLabelText(/^Phone/) as HTMLInputElement;
  fireEvent.change(phone, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));
  expect(screen.getByText('Enter a phone number.')).toBeInTheDocument();
  fireEvent.change(phone, { target: { value: '4045551212' } });
  expect(phone.value).toBe('(404) 555-1212');
  expect(authedFetch).not.toHaveBeenCalled();
});

const withAnswers = {
  ...referral,
  intakeAnswers: {
    relationship: 'parent', fullName: 'Jazz King', dob: '2015-03-01', diagnosis: 'Asthma', diagnoses: [], equipment: ['trach'],
    careNeeds: 'nursing', seekingPaidCaregiver: 'no', wantsAgencyStaff: 'yes',
  },
} as unknown as Referral & { source: 'gapp-website' };

it('shows the website’s refusal as soon as an answer it would refuse is picked, and does not save', () => {
  render(<EditReferralModal referral={withAnswers} onClose={vi.fn()} onSaved={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Wants agency staff in the home'), { target: { value: 'no' } });
  expect(screen.getByText(/The website would refuse these answers/)).toBeInTheDocument();
  expect(screen.getByText(/section 604.2/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));
  expect(authedFetch).not.toHaveBeenCalled();
});

it('sends an accepted screened change', async () => {
  vi.mocked(authedFetch).mockResolvedValue(new Response(JSON.stringify({ ok: true, changed: 1 })));
  const saved = vi.fn();
  render(<EditReferralModal referral={withAnswers} onClose={vi.fn()} onSaved={saved} />);
  fireEvent.change(screen.getByLabelText('Seeking paid caregiver'), { target: { value: 'yes' } });
  expect(screen.queryByText(/The website would refuse/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(JSON.parse(vi.mocked(authedFetch).mock.calls[0][1]!.body as string).screened).toEqual({ seekingPaidCaregiver: 'yes' });
});

it('explains why older referrals can’t change screened answers', () => {
  render(<EditReferralModal referral={referral} onClose={vi.fn()} onSaved={vi.fn()} />);
  expect(screen.getByText(/came in before the website saved its answers/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Seeking paid caregiver')).toBeNull();
});
