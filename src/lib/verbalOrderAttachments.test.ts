// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
vi.mock('server-only', () => ({}));
const m = vi.hoisted(() => ({ db: vi.fn(), bucket: vi.fn(), render: vi.fn(), queue: vi.fn() }));
vi.mock('./firebaseAdmin', () => ({ adminDb: m.db, adminBucket: m.bucket }));
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: m.render }));
vi.mock('./pdf/VerbalOrderPDF', () => ({ default: () => null }));
vi.mock('./settingsServer', () => ({ getServerSettings: async () => ({ verbalOrders: { returnFax: '7705550199' } }) }));
vi.mock('./fax/srfax', () => ({ srfaxConfig: () => ({}), srfaxQueueFax: m.queue }));
import { faxVerbalOrder } from './verbalOrderServer';
let row: Record<string, unknown>;
let stored: Record<string, Buffer>;
async function pdf(widths: number[]) { const d = await PDFDocument.create(); widths.forEach(w => d.addPage([w, 200])); return Buffer.from(await d.save()); }
beforeEach(async () => {
  vi.clearAllMocks();
  row = { status: 'taken', physicianFax: '7705550100', supportingStoragePath: 'original' };
  stored = { original: await pdf([111]) };
  const ref = { get: async () => ({ exists: true, id: 'order1', data: () => ({ ...row }) }), set: async (patch: object) => Object.assign(row, patch) };
  m.db.mockReturnValue({ collection: (name: string) => name === 'verbalOrders' ? { doc: () => ref } : { where: () => ({ limit: () => ({ get: async () => ({ empty: true }) }) }) }, runTransaction: async (fn: (tx: unknown) => Promise<void>) => fn({ get: () => ref.get(), update: (_ref: unknown, patch: object) => Object.assign(row, patch) }) });
  m.bucket.mockReturnValue({ file: (path: string) => ({ download: async () => [stored[path]], save: async (bytes: Buffer) => { stored[path] = bytes; } }) });
  m.render.mockResolvedValue(await pdf([100]));
  m.queue.mockResolvedValue({ ok: true, faxDetailsId: 'fax1' });
});
it('appends new files after saved supports and retains them for later reminders', async () => {
  expect((await faxVerbalOrder('order1', { uid: 'staff', name: 'Staff' }, await pdf([222]))).ok).toBe(true);
  expect((await PDFDocument.load(m.queue.mock.calls[0][0].pdf)).getPages().map(p => p.getWidth())).toEqual([100, 111, 222]);
  expect((await faxVerbalOrder('order1', { uid: '', name: 'Reminder' })).ok).toBe(true);
  expect((await PDFDocument.load(m.queue.mock.calls[1][0].pdf)).getPages().map(p => p.getWidth())).toEqual([100, 111, 222]);
});
it('rejects an oversized packet without submitting or changing saved attachments', async () => {
  await expect(faxVerbalOrder('order1', { uid: 'staff', name: 'Staff' }, await pdf(Array(49).fill(222)))).rejects.toThrow('50 pages');
  expect(row.supportingStoragePath).toBe('original');
  expect(m.queue).not.toHaveBeenCalled();
});
