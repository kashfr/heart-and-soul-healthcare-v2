// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/adminAuthGuard', () => ({ AdminAuthError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
vi.mock('@/lib/assistantClientsServer', () => ({
  AssistantClientError: class extends Error { constructor(public status: number, message: string) { super(message); } },
  requireAssistant: vi.fn(),
}));
vi.mock('@/lib/assistantClientRecordsServer', () => ({
  isAssistantRecordKind: (k: string) => ['physicians', 'guardian', 'supportCoordinator', 'dayProgram'].includes(k),
  getAssistantRecord: vi.fn(), saveAssistantRecord: vi.fn(), listAssistantAuthorizations: vi.fn(), saveAssistantAuthorization: vi.fn(),
}));
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireAssistant, type AssistantContext } from '@/lib/assistantClientsServer';
import { getAssistantRecord, saveAssistantRecord, listAssistantAuthorizations, saveAssistantAuthorization } from '@/lib/assistantClientRecordsServer';
import { GET, PUT } from './route';
import { GET as listAuths, POST as createAuth } from '../../authorizations/route';
import { PUT as editAuth } from '../../authorizations/[authId]/route';
const context = { caller: { uid: 'assistant' }, grant: { uid: 'assistant', scope: 'gapp', editInfo: true, uploadDocuments: true } } as AssistantContext;
const req = (method = 'GET', body?: string) => new Request('https://example.com/x', { method, ...(body ? { body } : {}) });
const kind = (k: string) => ({ params: Promise.resolve({ id: 'client1', kind: k }) });
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(requireAssistant).mockResolvedValue(context);
  vi.mocked(getAssistantRecord).mockResolvedValue({ record: null, revision: 'new' });
  vi.mocked(saveAssistantRecord).mockResolvedValue({ record: null, revision: 'new' });
  vi.mocked(listAssistantAuthorizations).mockResolvedValue({ authorizations: [] });
  vi.mocked(saveAssistantAuthorization).mockResolvedValue({ authorizations: [] });
});
it('authenticates before touching any record or authorization', async () => {
  vi.mocked(requireAssistant).mockRejectedValue(new AdminAuthError(403, 'Permission denied'));
  expect((await GET(req(), kind('physicians'))).status).toBe(403);
  expect((await PUT(req('PUT', '{}'), kind('physicians'))).status).toBe(403);
  expect((await listAuths(req(), { params: Promise.resolve({ id: 'client1' }) })).status).toBe(403);
  expect((await createAuth(req('POST', '{}'), { params: Promise.resolve({ id: 'client1' }) })).status).toBe(403);
  expect((await editAuth(req('PUT', '{}'), { params: Promise.resolve({ id: 'client1', authId: 'a1' }) })).status).toBe(403);
  for (const fn of [getAssistantRecord, saveAssistantRecord, listAssistantAuthorizations, saveAssistantAuthorization]) expect(fn).not.toHaveBeenCalled();
});
it('serves only the four Overview records, privately, and passes ids through', async () => {
  expect((await GET(req(), kind('profile'))).status).toBe(404);
  expect((await GET(req(), kind('notes'))).status).toBe(404);
  const ok = await GET(req(), kind('guardian'));
  expect(ok.status).toBe(200); expect(ok.headers.get('cache-control')).toBe('private, no-store');
  expect(getAssistantRecord).toHaveBeenCalledWith(context, 'client1', 'guardian');
  expect((await PUT(req('PUT', 'not json'), kind('guardian'))).status).toBe(400);
  await PUT(req('PUT', '{"revision":"new","record":{}}'), kind('dayProgram'));
  expect(saveAssistantRecord).toHaveBeenCalledWith(context, 'client1', 'dayProgram', { revision: 'new', record: {} });
  await editAuth(req('PUT', '{"authorization":{}}'), { params: Promise.resolve({ id: 'client1', authId: 'a1' }) });
  expect(saveAssistantAuthorization).toHaveBeenCalledWith(context, 'client1', 'a1', { authorization: {} });
  await createAuth(req('POST', '{"authorization":{}}'), { params: Promise.resolve({ id: 'client1' }) });
  expect(saveAssistantAuthorization).toHaveBeenLastCalledWith(context, 'client1', null, { authorization: {} });
});
