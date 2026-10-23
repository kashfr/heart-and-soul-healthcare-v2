import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantClientDetails, AssistantClientsRoster, parseUSDate } from './AssistantClients';

const state = vi.hoisted(() => ({
  user: { uid: 'assistant', role: 'va', isViewingAs: false },
  grant: { uid: 'assistant', scope: 'gapp', editInfo: true, uploadDocuments: true },
  enabled: true,
  fetch: vi.fn(),
  // The Overview cards' own requests (records and authorizations), kept apart
  // so the client/document request sequence in each test stays exact.
  cards: vi.fn(),
}));
vi.mock('./AuthProvider', () => ({ useEffectiveUser: () => state.user }));
vi.mock('./SettingsProvider', () => ({ useSettings: () => ({ ready: true, refresh: vi.fn(), settings: { assistantClients: { grants: state.enabled ? [state.grant] : [] } } }) }));
vi.mock('@/lib/authedFetch', () => ({
  authedFetch: (url: string, init?: RequestInit) => (/\/(records|authorizations)(\/|$)/.test(url) ? state.cards(url, init) : state.fetch(url, init)),
}));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }));
vi.mock('@/lib/patientDocuments', () => ({ ALLOWED_DOC_TYPES: { 'application/pdf': 'PDF' }, MAX_DOC_BYTES: 20 * 1024 * 1024, renderDocumentInWindow: vi.fn() }));

const client = {
  id: 'client-1', name: 'Test Client', dob: '2015-02-28', program: 'gapp',
  street: '100 Main Street', city: 'Atlanta', state: 'GA', zip: '30301',
  medicaidId: '123456789012', physicianName: 'Dr. Test', physicianPhone: '', physicianFax: '',
  diagnosis: 'Autism spectrum disorder (F84.0)', allergies: 'NKDA', revision: 'revision-1',
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const detail = () => ({ client, grant: state.grant, documents: [] });

beforeEach(() => {
  state.fetch.mockReset();
  state.cards.mockReset();
  state.cards.mockImplementation(async (url: string) => response(url.includes('/authorizations') ? { authorizations: [] } : { record: null, revision: 'new' }));
  state.enabled = true;
  state.user.isViewingAs = false;
  state.grant.editInfo = true;
  state.grant.uploadDocuments = true;
  state.grant.scope = 'gapp';
});

describe('assistant client workspace', () => {
  it('does not load clients for an ungranted assistant, and tells a previewing admin where to grant access', () => {
    state.enabled = false;
    const { unmount } = render(<AssistantClientsRoster />);
    expect(screen.getByText(/Client access has not been enabled for your account/)).toBeInTheDocument();
    expect(state.fetch).not.toHaveBeenCalled();
    unmount();
    state.user.isViewingAs = true;
    render(<AssistantClientDetails patientId="client-1" />);
    expect(screen.getByText(/has not been enabled for this assistant.*Settings > Assistant Client Access/)).toBeInTheDocument();
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it('renders the assistant\'s roster and client under View As with the write controls inert', async () => {
    state.user.isViewingAs = true;
    state.fetch.mockResolvedValueOnce(response({ clients: [client], grant: state.grant }));
    const { unmount } = render(<AssistantClientsRoster />);
    expect(await screen.findByRole('link', { name: /Test Client/ })).toHaveAttribute('href', '/admin/clients/client-1');
    unmount();
    state.fetch.mockResolvedValueOnce(response(detail()));
    render(<AssistantClientDetails patientId="client-1" />);
    expect(await screen.findByText('123456789012')).toBeInTheDocument();
    const edit = screen.getByRole('button', { name: 'Edit client information' });
    const upload = screen.getByRole('button', { name: 'Upload documents' });
    expect(edit).toBeDisabled();
    expect(upload).toBeDisabled();
    expect(edit).toHaveAttribute('title', expect.stringMatching(/Read-only in View As/));
    fireEvent.click(edit);
    expect(screen.queryByRole('button', { name: 'Save client information' })).not.toBeInTheDocument();
    expect(state.fetch).toHaveBeenCalledTimes(2);
  });

  it('shows granted clients with US dates and the ordinary client link', async () => {
    state.fetch.mockResolvedValue(response({ clients: [client], grant: state.grant }));
    render(<AssistantClientsRoster />);
    expect(await screen.findByRole('link', { name: /Test Client/ })).toHaveAttribute('href', '/admin/clients/client-1');
    expect(screen.getByText('DOB 02/28/2015')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search clients' }), { target: { value: 'No match' } });
    expect(screen.getByText('No clients match your search.')).toBeInTheDocument();
  });

  it('honors the live read-only grant and exposes no clinical or destructive controls', async () => {
    state.grant.editInfo = false;
    state.grant.uploadDocuments = false;
    state.fetch.mockResolvedValue(response(detail()));
    render(<AssistantClientDetails patientId="client-1" />);
    expect(await screen.findByText('123456789012')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit client information|Upload document|Delete|Archive/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /MAR|Progress Note|Manage Record/ })).not.toBeInTheDocument();
  });

  it('clears loaded data and rechecks the server when settings narrow the grant', async () => {
    state.grant.scope = 'all';
    state.fetch.mockResolvedValueOnce(response(detail()));
    const { rerender } = render(<AssistantClientDetails patientId="client-1" />);
    await screen.findByText('123456789012');
    state.grant.scope = 'gapp';
    state.fetch.mockImplementationOnce(() => new Promise(() => {}));
    rerender(<AssistantClientDetails patientId="client-1" />);
    expect(screen.queryByText('123456789012')).not.toBeInTheDocument();
    expect(screen.getByText('Loading client…')).toBeInTheDocument();
    expect(state.fetch).toHaveBeenCalledTimes(2);
  });

  it('validates US dates and submits only the administrative fields with the revision', async () => {
    state.fetch.mockResolvedValueOnce(response(detail()));
    render(<AssistantClientDetails patientId="client-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit client information' }));
    const dob = screen.getByRole('textbox', { name: 'Date of birth (MM/DD/YYYY)' });
    expect(dob).toHaveValue('02/28/2015');
    fireEvent.change(dob, { target: { value: '02/29/2025' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Save client information' }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid date of birth');
    expect(state.fetch).toHaveBeenCalledTimes(1);
    state.fetch.mockResolvedValueOnce(response({ client, grant: state.grant }));
    fireEvent.change(dob, { target: { value: '2/28/2015' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Save client information' }).closest('form')!);
    await screen.findByText('Client information saved.');
    const [, init] = state.fetch.mock.calls[1];
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({
      name: client.name, dob: client.dob, street: client.street, city: client.city, state: client.state, zip: client.zip,
      medicaidId: client.medicaidId, physicianName: client.physicianName, physicianPhone: '', physicianFax: '',
      diagnosis: client.diagnosis, allergies: client.allergies, revision: 'revision-1',
    });
  });

  it('clears the record when permission is revoked while editing', async () => {
    state.fetch.mockResolvedValueOnce(response(detail()));
    render(<AssistantClientDetails patientId="client-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit client information' }));
    state.fetch.mockResolvedValueOnce(response({ error: 'Your client access has been removed.' }, 403));
    fireEvent.submit(screen.getByRole('button', { name: 'Save client information' }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Your client access has been removed.');
    expect(screen.queryByText('123456789012')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Test Client' })).not.toBeInTheDocument();
  });

  it('uploads an additional document with an ISO transport date and displays a US date', async () => {
    state.fetch.mockResolvedValueOnce(response(detail()));
    render(<AssistantClientDetails patientId="client-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Upload documents' }));
    const file = new File(['pdf contents'], 'Letter.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/Choose documents or photos/), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText('Date for Letter.pdf'), { target: { value: '10/15/2026' } });
    state.fetch.mockResolvedValueOnce(response({ document: { id: 'doc-1', title: 'Letter.pdf', fileName: 'Letter.pdf', category: 'Other', docDate: '2026-10-15', size: 12 } }));
    fireEvent.click(screen.getByRole('button', { name: 'Upload pending files' }));
    await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(2));
    const [path, init] = state.fetch.mock.calls[1];
    expect(path).toBe('/api/assistant/clients/client-1/documents');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get('docDate')).toBe('2026-10-15');
    expect(init.body.get('file').name).toBe('Letter.pdf');
    expect(await screen.findByText('Other · 10/15/2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Letter.pdf' })).toBeInTheDocument();
  });
});

describe('fixed US date input', () => {
  it('validates real calendar dates without interpreting day/month or ISO input', () => {
    expect(parseUSDate('2/29/2024')).toBe('2024-02-29');
    expect(parseUSDate('02/29/2025')).toBeNull();
    expect(parseUSDate('13/01/2026')).toBeNull();
    expect(parseUSDate('2026-10-15')).toBeNull();
    expect(parseUSDate('04/31/2026')).toBeNull();
  });
  it('shows the Overview cards and saves a card through the audited API with its revision', async () => {
    state.cards.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/records/physicians') && init?.method === 'PUT') return response({ record: { list: [] }, revision: 'r2' });
      if (url.endsWith('/records/physicians')) return response({ record: { list: [{ id: 'p1', name: 'Dr. Maria Soto', specialty: 'Primary Care', phone: '(678) 407-4489' }], updatedAt: '2026-10-21T20:00:00.000Z', updatedByName: 'Rose' }, revision: 'r1' });
      return response(url.includes('/authorizations') ? { authorizations: [] } : { record: null, revision: 'new' });
    });
    state.fetch.mockResolvedValueOnce(response(detail()));
    render(<AssistantClientDetails patientId="client-1" />);
    expect(await screen.findByText('Dr. Maria Soto')).toBeInTheDocument();
    expect(screen.getByText('Autism spectrum disorder (F84.0)')).toBeInTheDocument();
    for (const title of ['Physicians', 'Guardian', 'Support Coordinator', 'Day Program', 'Hours Authorizations']) {
      expect(screen.getAllByText(new RegExp(title)).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText(/\$|Dollars|Billing|Hours worked/)).not.toBeInTheDocument();
    const physiciansCard = screen.getByText('Dr. Maria Soto').closest('section')!;
    fireEvent.click(within(physiciansCard).getByRole('button', { name: /Edit/ }));
    fireEvent.click(within(physiciansCard).getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(state.cards).toHaveBeenCalledWith('/api/assistant/clients/client-1/records/physicians', expect.objectContaining({ method: 'PUT' })));
    const put = state.cards.mock.calls.find(([, init]) => init?.method === 'PUT')!;
    expect(JSON.parse(put[1].body)).toMatchObject({ revision: 'r1', record: { list: [expect.objectContaining({ name: 'Dr. Maria Soto' })] } });
  });

  it('hides card edit controls without the edit grant', async () => {
    state.grant.editInfo = false;
    state.cards.mockImplementation(async (url: string) => response(url.includes('/authorizations')
      ? { authorizations: [{ id: 'a1', revision: 'r1', patientId: 'client-1', paNumber: '126101100192', kind: 'skilled', covers: 'shift', rateBasis: 'week', rateHours: 16, from: '2026-10-20', to: '2027-03-31', monthOverrides: { '2026-11': 69 }, totalUnits: null, serviceCode: '', note: '' }] }
      : { record: null, revision: 'new' }));
    state.fetch.mockResolvedValueOnce(response(detail()));
    render(<AssistantClientDetails patientId="client-1" />);
    expect(await screen.findByText(/PA 126101100192/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add|Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });
});
