// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
vi.mock('@/lib/adminAuthGuard', () => ({ AdminAuthError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
vi.mock('@/lib/fax/srfax', () => ({ srfaxConfigured: vi.fn() }));
vi.mock('@/lib/verbalOrderServer', () => ({ returnFaxNumber: vi.fn() }));
vi.mock('@/lib/faxCenterServer', () => ({ requireFaxAccess: vi.fn(), sendOutboundFax: vi.fn(), listOutboundFaxes: vi.fn(), pollInFlightFaxes: vi.fn() }));
import { requireFaxAccess, sendOutboundFax } from '@/lib/faxCenterServer';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { POST } from './route';
const input = { recipientName: 'Test office', recipientOrg: '', toNumber: '4045551234', confirmNumber: '4045551234', regarding: 'Test', note: '', includeCover: true };
const request = (body: unknown) => new Request('http://localhost/api/fax', { method: 'POST', body: JSON.stringify(body) });
async function attachment(width: number) { const d = await PDFDocument.create(); d.addPage([width, 200]); return { fileName: 'test.pdf', pdfBase64: Buffer.from(await d.save()).toString('base64') }; }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireFaxAccess).mockResolvedValue({ uid: 'test' } as any); vi.mocked(sendOutboundFax).mockResolvedValue({ ok: true }); });
it('submits the ordered packet exactly once through the existing send path', async () => {
  expect((await POST(request({ ...input, attachments: [await attachment(101), await attachment(202)] }))).status).toBe(200);
  expect(sendOutboundFax).toHaveBeenCalledOnce();
  const sent = vi.mocked(sendOutboundFax).mock.calls[0][0];
  expect((await PDFDocument.load(sent.pdf)).getPages().map((p) => p.getWidth())).toEqual([101, 202]);
  expect(sent.input.includeCover).toBe(true);
});
it('accepts older single-file browser requests', async () => {
  expect((await POST(request({ ...input, ...await attachment(101) }))).status).toBe(200);
  expect(sendOutboundFax).toHaveBeenCalledOnce();
});
it('never sends a partial packet when a file is invalid', async () => {
  expect((await POST(request({ ...input, attachments: [await attachment(101), { fileName: 'bad.pdf', pdfBase64: 'bad' }] }))).status).toBe(400);
  expect(sendOutboundFax).not.toHaveBeenCalled();
});
it('retains access and destination confirmation checks', async () => {
  vi.mocked(requireFaxAccess).mockRejectedValueOnce(new AdminAuthError(403, 'Forbidden'));
  expect((await POST(request(input))).status).toBe(403);
  expect((await POST(request({ ...input, confirmNumber: '7705551234', attachments: [await attachment(101)] }))).status).toBe(400);
  expect(sendOutboundFax).not.toHaveBeenCalled();
});
it('bounds actual request size even without content-length', async () => {
  expect((await POST(new Request('http://localhost/api/fax', { method: 'POST', body: ' '.repeat(15 * 1024 * 1024) }))).status).toBe(413);
  expect(sendOutboundFax).not.toHaveBeenCalled();
});
