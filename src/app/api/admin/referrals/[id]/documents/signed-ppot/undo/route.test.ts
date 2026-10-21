// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/adminAuthGuard', () => ({ requireRole: vi.fn(), AdminAuthError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
vi.mock('@/lib/referralDocumentsServer', () => ({ ReferralDocumentError: class extends Error { constructor(message: string, public status: number) { super(message); } } }));
vi.mock('@/lib/undoReferralPpotServer', () => ({ undoReferralPpot: vi.fn() }));
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { undoReferralPpot } from '@/lib/undoReferralPpotServer';
import { POST } from './route';
const params = Promise.resolve({ id: 'r1' });
const body = { revision: 'a'.repeat(64), title: 'Records', category: 'Other', docDate: '2026-10-01' };
const req = (value: unknown) => new Request('http://localhost/test', { method: 'POST', body: JSON.stringify(value) });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireRole).mockResolvedValue({ uid: 'u1', role: 'va', profile: { displayName: 'Staff' } } as any); vi.mocked(undoReferralPpot).mockResolvedValue('d1'); });
it('authorizes the same staff roles as referral document filing', async () => {
  expect((await POST(req(body), { params })).status).toBe(200);
  expect(requireRole).toHaveBeenCalledWith(expect.any(Request), ['admin', 'supervisor', 'va']);
  expect(undoReferralPpot).toHaveBeenCalledWith(expect.objectContaining({ ...body, referralId: 'r1', by: { uid: 'u1', name: 'Staff', role: 'va' } }));
});
it('refuses unauthorized corrections', async () => {
  vi.mocked(requireRole).mockRejectedValueOnce(new AdminAuthError(403, 'Forbidden'));
  expect((await POST(req(body), { params })).status).toBe(403);
  expect(undoReferralPpot).not.toHaveBeenCalled();
});
it.each([null, { ...body, docDate: '2026-99-01' }, { ...body, docDate: '2026-02-30' }, { ...body, title: ' ' }, { ...body, category: 'invalid' }, { ...body, revision: '' }])('rejects invalid input before changing any records', async (value) => {
  expect((await POST(req(value), { params })).status).toBe(400);
  expect(undoReferralPpot).not.toHaveBeenCalled();
});
