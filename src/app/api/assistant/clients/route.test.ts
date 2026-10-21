// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/adminAuthGuard', () => ({ AdminAuthError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
vi.mock('@/lib/assistantClientsServer', () => ({
  AssistantClientError: class extends Error { constructor(public status: number, message: string) { super(message); } },
  requireAssistant: vi.fn(), listAssistantClients: vi.fn(), getAssistantClient: vi.fn(),
  updateAssistantClient: vi.fn(), uploadAssistantDocument: vi.fn(), readAssistantDocument: vi.fn(),
}));
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireAssistant, listAssistantClients, getAssistantClient, updateAssistantClient, uploadAssistantDocument, readAssistantDocument, AssistantClientError, type AssistantContext } from '@/lib/assistantClientsServer';
import { GET as list } from './route';
import { GET as detail, PATCH as edit } from './[id]/route';
import { POST as upload } from './[id]/documents/route';
import { GET as download } from './[id]/documents/[docId]/route';
const context = { caller: { uid: 'assistant' }, grant: { uid: 'assistant', scope: 'gapp', editInfo: true, uploadDocuments: true } } as AssistantContext;
const params = Promise.resolve({ id: 'client1' });
const documentParams = Promise.resolve({ id: 'client1', docId: 'document1' });
const request = (method = 'GET', body?: string) => new Request('https://example.com/api/assistant/clients/client1', { method, ...(body ? { body } : {}) });
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(requireAssistant).mockResolvedValue(context);
  vi.mocked(listAssistantClients).mockResolvedValue({ clients: [], grant: context.grant });
  vi.mocked(getAssistantClient).mockResolvedValue({ client: { id: 'client1' }, documents: [], grant: context.grant } as unknown as Awaited<ReturnType<typeof getAssistantClient>>);
  vi.mocked(updateAssistantClient).mockResolvedValue({ client: { id: 'client1' }, grant: context.grant } as unknown as Awaited<ReturnType<typeof updateAssistantClient>>);
  vi.mocked(readAssistantDocument).mockResolvedValue({ bytes: Buffer.from('%PDF'), contentType: 'application/pdf', fileName: 'letter.pdf' });
});
it('requires authentication and permission for list, detail, edit, upload, and file reads', async () => {
  vi.mocked(requireAssistant).mockRejectedValue(new AdminAuthError(403, 'Permission denied'));
  expect((await list(request())).status).toBe(403);
  expect((await detail(request(), { params })).status).toBe(403);
  expect((await edit(request('PATCH', '{}'), { params })).status).toBe(403);
  expect((await upload(request('POST'), { params })).status).toBe(403);
  expect((await download(request(), { params: documentParams })).status).toBe(403);
  for (const call of [listAssistantClients, getAssistantClient, updateAssistantClient, uploadAssistantDocument, readAssistantDocument]) expect(call).not.toHaveBeenCalled();
});
it('passes the authorized identity and id through to safe projections, with private no-store headers', async () => {
  const response = await detail(request(), { params });
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(getAssistantClient).toHaveBeenCalledWith(context, 'client1');
  expect((await list(request())).status).toBe(200);
  expect(listAssistantClients).toHaveBeenCalledWith(context);
});
it('rejects malformed JSON, and reports optimistic conflicts without treating them as success', async () => {
  expect((await edit(request('PATCH', '{bad'), { params })).status).toBe(400);
  expect(updateAssistantClient).not.toHaveBeenCalled();
  vi.mocked(updateAssistantClient).mockRejectedValue(new AssistantClientError(409, 'Reload client'));
  expect((await edit(request('PATCH', '{"name":"Name","revision":"old"}'), { params })).status).toBe(409);
  expect(updateAssistantClient).toHaveBeenCalledWith(context, 'client1', { name: 'Name', revision: 'old' });
});
it('rejects absent file and view-only upload before storage service runs', async () => {
  vi.mocked(requireAssistant).mockResolvedValue({ ...context, grant: { ...context.grant, uploadDocuments: false } });
  expect((await upload(request('POST'), { params })).status).toBe(403);
  vi.mocked(requireAssistant).mockResolvedValue(context);
  const body = new FormData(); body.set('title', 'Title');
  expect((await upload(new Request('https://example.com', { method: 'POST', body }), { params })).status).toBe(400);
  expect(uploadAssistantDocument).not.toHaveBeenCalled();
});
it('serves protected bytes without token URLs, with no-store and nosniff', async () => {
  const response = await download(request(), { params: documentParams });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('content-type')).toBe('application/pdf');
  expect(response.headers.get('content-disposition')).toBe('attachment; filename="letter.pdf"');
  expect(await response.text()).toBe('%PDF');
  expect(readAssistantDocument).toHaveBeenCalledWith(context, 'client1', 'document1');
});
