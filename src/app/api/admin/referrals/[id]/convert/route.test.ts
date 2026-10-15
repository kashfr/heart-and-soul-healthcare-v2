// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/adminAuthGuard', () => ({ requireRole: vi.fn(), AdminAuthError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
vi.mock('@/lib/settingsServer', () => ({ getServerSettings: vi.fn() }));
vi.mock('@/lib/referralConvertServer', () => ({ previewReferralConversion: vi.fn(), convertReferralToClient: vi.fn() }));
import { requireRole, AdminAuthError, type AuthedCaller } from '@/lib/adminAuthGuard';
import { getServerSettings } from '@/lib/settingsServer';
import { previewReferralConversion, convertReferralToClient } from '@/lib/referralConvertServer';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { GET, POST } from './route';
const params = Promise.resolve({ id: 'referral1' });
const request = () => new Request('https://example.com/api/convert', { method: 'POST', body: '{}' });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ uid: 'va1', role: 'va', profile: { displayName: 'Assistant' } } as AuthedCaller);
  vi.mocked(getServerSettings).mockResolvedValue({ ...DEFAULT_SETTINGS, referralConversion: { userUids: [] } });
  vi.mocked(previewReferralConversion).mockResolvedValue({ ok: true });
  vi.mocked(convertReferralToClient).mockResolvedValue({ ok: true, patientId: 'client1' });
});
it('blocks both preview and create for an unselected VA before reading referral data', async () => {
  expect((await GET(request(), { params })).status).toBe(403);
  expect((await POST(request(), { params })).status).toBe(403);
  expect(previewReferralConversion).not.toHaveBeenCalled();
  expect(convertReferralToClient).not.toHaveBeenCalled();
});
it('permits the selected VA and checks revocation again at submission', async () => {
  vi.mocked(getServerSettings).mockResolvedValueOnce({ ...DEFAULT_SETTINGS, referralConversion: { userUids: ['va1'] } });
  expect((await GET(request(), { params })).status).toBe(200);
  expect((await POST(request(), { params })).status).toBe(403);
  expect(convertReferralToClient).not.toHaveBeenCalled();
});
it('passes the authorized VA identity to the conversion audit', async () => {
  vi.mocked(getServerSettings).mockResolvedValue({ ...DEFAULT_SETTINGS, referralConversion: { userUids: ['va1'] } });
  expect((await POST(request(), { params })).status).toBe(200);
  expect(convertReferralToClient).toHaveBeenCalledWith('referral1', {}, expect.objectContaining({ uid: 'va1', role: 'va' }));
});
it('still rejects inactive or unauthenticated users through the shared guard', async () => {
  vi.mocked(requireRole).mockRejectedValue(new AdminAuthError(403, 'Account deactivated'));
  expect((await POST(request(), { params })).status).toBe(403);
  expect(getServerSettings).not.toHaveBeenCalled();
  expect(convertReferralToClient).not.toHaveBeenCalled();
});

it.each(['admin', 'supervisor'] as const)('enforces %s revocation on preview and submission', async (role) => {
  vi.mocked(requireRole).mockResolvedValue({ uid: 'staff', role, profile: { displayName: 'Staff' } } as AuthedCaller);
  vi.mocked(getServerSettings).mockResolvedValueOnce({ ...DEFAULT_SETTINGS, referralConversion: { userUids: [] } });
  expect((await GET(request(), { params })).status).toBe(200);
  vi.mocked(getServerSettings).mockResolvedValue({ ...DEFAULT_SETTINGS, referralConversion: { userUids: [], excludedUserUids: ['staff'] } });
  expect((await GET(request(), { params })).status).toBe(403);
  expect((await POST(request(), { params })).status).toBe(403);
  expect(convertReferralToClient).not.toHaveBeenCalled();
});
