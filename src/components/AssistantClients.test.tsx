import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantClientDetails, AssistantClientsRoster, parseUSDate } from './AssistantClients';

const state = vi.hoisted(() => ({
  user: { uid: 'assistant', role: 'va', isViewingAs: false },
  grant: { uid: 'assistant', scope: 'gapp', editInfo: true, uploadDocuments: true },
  enabled: true,
  fetch: vi.fn(),
}));
vi.mock('./AuthProvider', () => ({ useEffectiveUser: () => state.user }));
vi.mock('./SettingsProvider', () => ({ useSettings: () => ({ ready: true, refresh: vi.fn(), settings: { assistantClients: { grants: state.enabled ? [state.grant] : [] } } }) }));
vi.mock('@/lib/authedFetch', () => ({ authedFetch: state.fetch }));
vi.mock('@/lib/patientDocuments', () => ({ ALLOWED_DOC_TYPES: { 'application/pdf': 'PDF' }, MAX_DOC_BYTES: 20 * 1024 * 1024, renderDocumentInWindow: vi.fn() }));

const client = {
  id: 'client-1', name: 'Test Client', dob: '2015-02-28', program: 'gapp',
  street: '100 Main Street', city: 'Atlanta', state: 'GA', zip: '30301',
  medicaidId: '123456789012', physicianName: 'Dr. Test', physicianPhone: '', physicianFax: '',
  guardianContacts: [], revision: 'revision-1',
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const detail = () => ({ client, grant: state.grant, documents: [] });

beforeEach(() => {
  state.fetch.mockReset();
  state.enabled = true;
  state.user.isViewingAs = false;
  state.grant.editInfo = true;
  state.grant.uploadDocuments = true;
  state.grant.scope = 'gapp';
});

describe('assistant client workspace', () => {
  it('does not load clients for an ungranted assistant or a View As session', () => {
    state.enabled = false;
    const { unmount } = render(<AssistantClientsRoster />);
    expect(screen.getByText(/Client access has not been enabled/)).toBeInTheDocument();
    expect(state.fetch).not.toHaveBeenCalled();
    unmount();
    state.enabled = true;
    state.user.isViewingAs = true;
    render(<AssistantClientDetails patientId="client-1" />);
    expect(screen.getByText(/preview is unavailable in View As/)).toBeInTheDocument();
    expect(state.fetch).not.toHaveBeenCalled();
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
      medicaidId: client.medicaidId, physicianName: client.physicianName, physicianPhone: '', physicianFax: '', guardianContacts: [], revision: 'revision-1',
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
    fireEvent.click(await screen.findByRole('button', { name: 'Upload document' }));
    const file = new File(['pdf contents'], 'Letter.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/Document file/), { target: { files: [file] } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Document date (MM/DD/YYYY)' }), { target: { value: '10/15/2026' } });
    state.fetch.mockResolvedValueOnce(response({ document: { id: 'doc-1', title: 'Letter.pdf', fileName: 'Letter.pdf', category: 'Other', docDate: '2026-10-15', size: 12 } }));
    fireEvent.submit(screen.getByRole('button', { name: 'Save document' }).closest('form')!);
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
});
