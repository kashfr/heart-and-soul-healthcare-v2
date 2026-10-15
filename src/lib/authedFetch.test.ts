import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authedFetch } from './authedFetch';

vi.mock('./firebase', () => ({ auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('test-token') } } }));
const fetchMock = vi.fn();
beforeEach(() => { sessionStorage.clear(); fetchMock.mockReset().mockResolvedValue(new Response('{}')); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });

describe('authedFetch upload headers', () => {
  it('leaves multipart Content-Type to the browser and still authenticates the request', async () => {
    const body = new FormData();
    body.set('file', new File(['pdf'], 'test.pdf', { type: 'application/pdf' }));
    await authedFetch('/api/assistant/clients/client-1/documents', { method: 'POST', body });
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.get('Content-Type')).toBeNull();
    expect(init.headers.get('Authorization')).toBe('Bearer test-token');
    expect(init.body).toBe(body);
  });
  it('preserves JSON defaults and refuses multipart writes during View As', async () => {
    await authedFetch('/api/test', { method: 'PATCH', body: '{}' });
    expect(fetchMock.mock.calls[0][1].headers.get('Content-Type')).toBe('application/json');
    fetchMock.mockClear();
    sessionStorage.setItem('view-as-target', 'assistant');
    const response = await authedFetch('/api/assistant/clients/client-1/documents', { method: 'POST', body: new FormData() });
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
