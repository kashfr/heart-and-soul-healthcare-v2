// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
vi.mock('@/lib/adminAuthGuard', () => ({ requireRole: vi.fn(), AdminAuthError: class extends Error { status = 403; } }));
vi.mock('@/lib/referralDocumentsServer', () => ({ replaceReferralDocument: vi.fn(), ReferralDocumentError: class extends Error { status = 409; } }));
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { replaceReferralDocument } from '@/lib/referralDocumentsServer';
import { PUT } from './route';
const params = Promise.resolve({ id: 'r1', docId: 'signed-ppot' });
const req = (body: Uint8Array | string, headers = {}) => new Request('http://localhost/api/test', { method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'If-Match': 'a'.repeat(64), ...headers }, body: body as BodyInit });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireRole).mockResolvedValue({ uid: 'u1', profile: { displayName: 'Staff' }, role: 'va' } as any); });
it('accepts a valid PDF for authorized staff', async () => {
  const pdf = await PDFDocument.create(); pdf.addPage();
  expect((await PUT(req(await pdf.save()), { params })).status).toBe(200);
  expect(requireRole).toHaveBeenCalledWith(expect.any(Request), ['admin', 'supervisor', 'va']);
  expect(replaceReferralDocument).toHaveBeenCalledWith(expect.objectContaining({ referralId: 'r1', docId: 'signed-ppot', by: { uid: 'u1', name: 'Staff', role: 'va' } }));
});
it('refuses unauthorized writes', async () => {
  vi.mocked(requireRole).mockRejectedValueOnce(new AdminAuthError(403, 'Forbidden'));
  expect((await PUT(req('fake'), { params })).status).toBe(403);
  expect(replaceReferralDocument).not.toHaveBeenCalled();
});
it('rejects malformed PDFs and missing version tokens', async () => {
  expect((await PUT(req('%PDF-fake'), { params })).status).toBe(400);
  expect((await PUT(req(''), { params })).status).toBe(400);
  expect((await PUT(req('fake', { 'If-Match': '' }), { params })).status).toBe(400);
  expect(replaceReferralDocument).not.toHaveBeenCalled();
});
it('enforces the actual body size rather than trusting content length', async () => {
  expect((await PUT(req(new Uint8Array(20 * 1024 * 1024 + 1)), { params })).status).toBe(413);
  expect(replaceReferralDocument).not.toHaveBeenCalled();
});
