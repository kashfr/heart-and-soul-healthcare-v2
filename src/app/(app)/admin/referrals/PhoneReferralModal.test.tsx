import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import PhoneReferralModal from './PhoneReferralModal';
import { authedFetch } from '@/lib/authedFetch';
import { emptyPhoneReferral, toPhoneIntake } from '@/lib/phoneReferralShared';
const emptyIntake = () => toPhoneIntake(emptyPhoneReferral());
vi.mock('@/lib/authedFetch', () => ({ authedFetch: vi.fn() }));

const staff = [
  { uid: 'va1', displayName: 'Vera Assistant', role: 'va', active: true },
  { uid: 'n1', displayName: 'Nina Nurse', role: 'nurse', active: true },
];
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});

it('blocks an empty save and names each required field', () => {
  render(<PhoneReferralModal staff={staff} onClose={vi.fn()} onCreated={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Save Referral/ }));
  expect(screen.getByText('Enter the caller’s name.')).toBeInTheDocument();
  expect(screen.getByText('Enter a callback number.')).toBeInTheDocument();
  expect(screen.getByText('Enter the name of the person the referral is for.')).toBeInTheDocument();
  expect(authedFetch).not.toHaveBeenCalled();
});

it('offers only board staff as assignees, and saves the call', async () => {
  vi.mocked(authedFetch).mockResolvedValue(new Response(JSON.stringify({ ok: true, id: 'r9' })));
  const created = vi.fn();
  render(<PhoneReferralModal staff={staff} onClose={vi.fn()} onCreated={created} />);
  expect(screen.queryByRole('option', { name: 'Nina Nurse' })).toBeNull();
  fireEvent.change(screen.getByLabelText(/Caller's name/), { target: { value: 'Marcus Reed' } });
  fireEvent.change(screen.getByLabelText(/Callback number/), { target: { value: '4045551212' } });
  fireEvent.change(screen.getByLabelText(/Client's name/), { target: { value: 'Jayden Reed' } });
  fireEvent.change(screen.getByLabelText('Where is the client now?'), { target: { value: 'In the hospital now' } });
  fireEvent.change(screen.getByLabelText('Hospital'), { target: { value: 'CHOA Egleston' } });
  fireEvent.change(screen.getByLabelText(/^Assign to/), { target: { value: 'va1' } });
  fireEvent.click(screen.getByRole('button', { name: /Save Referral/ }));
  await waitFor(() => expect(created).toHaveBeenCalledWith('r9'));
  expect(JSON.parse(vi.mocked(authedFetch).mock.calls[0][1]!.body as string)).toMatchObject({
    callerName: 'Marcus Reed', clientName: 'Jayden Reed', hospitalName: 'CHOA Egleston', assigneeUid: 'va1',
  });
});

it('Enter in a text box does not save', () => {
  render(<PhoneReferralModal staff={staff} onClose={vi.fn()} onCreated={vi.fn()} />);
  const input = screen.getByLabelText(/Caller's name/);
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(authedFetch).not.toHaveBeenCalled();
  expect(screen.queryByText('Enter a callback number.')).toBeNull();
});

it('formats phone numbers as they are typed', () => {
  render(<PhoneReferralModal staff={staff} onClose={vi.fn()} onCreated={vi.fn()} />);
  const phone = screen.getByLabelText(/Callback number/) as HTMLInputElement;
  fireEvent.change(phone, { target: { value: '4707834812' } });
  expect(phone.value).toBe('(470) 783-4812');
  const doc = screen.getByLabelText('Physician phone') as HTMLInputElement;
  fireEvent.change(doc, { target: { value: '7705551234145' } });
  expect(doc.value).toBe('(770) 555-1234 ext. 145');
});

it('edits a saved phone referral in place', async () => {
  vi.mocked(authedFetch).mockResolvedValue(new Response(JSON.stringify({ ok: true, changed: ['county'] })));
  const saved = vi.fn();
  const intake = { ...emptyIntake(), callerName: 'Marcus Reed', callerPhone: '(404) 555-1212', clientName: 'Jayden Reed', county: 'Gwinnett' };
  render(<PhoneReferralModal staff={staff} editing={{ referralId: 'r9', intake }} onClose={vi.fn()} onCreated={saved} />);
  expect(screen.getByText('Edit Phone Referral')).toBeInTheDocument();
  expect(screen.queryByLabelText(/^Assign to/)).toBeNull();
  expect((screen.getByLabelText(/Client's name/) as HTMLInputElement).value).toBe('Jayden Reed');
  fireEvent.change(screen.getByLabelText('County'), { target: { value: 'Fulton' } });
  fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));
  await waitFor(() => expect(saved).toHaveBeenCalledWith('r9'));
  const [url, init] = vi.mocked(authedFetch).mock.calls[0];
  expect(url).toBe('/api/admin/referrals/r9/phone');
  expect(init!.method).toBe('PUT');
  expect(JSON.parse(init!.body as string)).toMatchObject({ clientName: 'Jayden Reed', county: 'Fulton' });
});
