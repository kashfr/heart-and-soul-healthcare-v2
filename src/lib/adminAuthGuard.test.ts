// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  profiles: new Map<string, Record<string, unknown>>(),
  verify: vi.fn(),
  settings: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('./firebaseAdmin', () => ({
  adminAuth: () => ({ verifyIdToken: fake.verify }),
  adminDb: () => ({ collection: () => ({ doc: (uid: string) => ({ get: async () => ({ exists: fake.profiles.has(uid), data: () => fake.profiles.get(uid) }) }) }) }),
}));
vi.mock('./settingsServer', () => ({ getServerSettings: fake.settings }));
import { requireRole, requireStaffOrAssistant } from './adminAuthGuard';
import { DEFAULT_SETTINGS } from './settings';

const request = (uid: string, method = 'GET') => new Request('https://example.com/api/x', { method, headers: { Authorization: `Bearer token-${uid}` } });
const grant = { uid: 'rose', scope: 'gapp' as const, editInfo: true, uploadDocuments: true };

beforeEach(() => {
  fake.profiles.clear();
  fake.profiles.set('owner', { role: 'admin', active: true, displayName: 'Owner' });
  fake.profiles.set('rose', { role: 'va', active: true, displayName: 'Rose' });
  fake.profiles.set('nurse', { role: 'nurse', active: true, displayName: 'Nurse' });
  fake.verify.mockReset().mockImplementation(async (token: string) => ({ uid: token.replace('token-', ''), email: null }));
  fake.settings.mockReset().mockResolvedValue({ ...DEFAULT_SETTINGS, assistantClients: { grants: [grant] } });
});

describe('requireRole', () => {
  it('verifies the token, loads the profile, and checks the role', async () => {
    await expect(requireRole(request('owner'), ['admin'])).resolves.toMatchObject({ uid: 'owner', role: 'admin' });
    await expect(requireRole(request('nurse'), ['admin'])).rejects.toMatchObject({ status: 403 });
    await expect(requireRole(new Request('https://example.com'), ['admin'])).rejects.toMatchObject({ status: 401 });
    await expect(requireRole(request('nobody'), ['admin'])).rejects.toMatchObject({ status: 403 });
  });
});

describe('requireStaffOrAssistant', () => {
  it('passes core staff through without reading settings', async () => {
    await expect(requireStaffOrAssistant(request('owner', 'DELETE'))).resolves.toMatchObject({ role: 'admin' });
    expect(fake.settings).not.toHaveBeenCalled();
    await expect(requireStaffOrAssistant(request('nurse'))).rejects.toMatchObject({ status: 403 });
  });
  it('admits a granted assistant for reads and, with editInfo, writes; never a delete', async () => {
    await expect(requireStaffOrAssistant(request('rose'))).resolves.toMatchObject({ uid: 'rose', role: 'va' });
    await expect(requireStaffOrAssistant(request('rose', 'POST'), { write: true })).resolves.toMatchObject({ uid: 'rose' });
    await expect(requireStaffOrAssistant(request('rose', 'DELETE'))).rejects.toMatchObject({ status: 403, message: expect.stringContaining('delete') });
    fake.settings.mockResolvedValue({ ...DEFAULT_SETTINGS, assistantClients: { grants: [{ ...grant, editInfo: false }] } });
    await expect(requireStaffOrAssistant(request('rose'))).resolves.toMatchObject({ uid: 'rose' });
    await expect(requireStaffOrAssistant(request('rose', 'PATCH'), { write: true })).rejects.toMatchObject({ status: 403 });
  });
  it('refuses an assistant without a grant or without an active profile', async () => {
    fake.settings.mockResolvedValue({ ...DEFAULT_SETTINGS, assistantClients: { grants: [] } });
    await expect(requireStaffOrAssistant(request('rose'))).rejects.toMatchObject({ status: 403, message: expect.stringContaining('Client access') });
    fake.settings.mockResolvedValue({ ...DEFAULT_SETTINGS, assistantClients: { grants: [grant] } });
    fake.profiles.set('rose', { role: 'va', active: false });
    await expect(requireStaffOrAssistant(request('rose'))).rejects.toMatchObject({ status: 403 });
  });
});
