// @vitest-environment node
// Fax Center send path (also used by ROI and PPOT faxes): the cover sheet and
// the SRFax header both carry the sender, and the header always names the org.
import { beforeEach, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
vi.mock('server-only', () => ({}));
const m = vi.hoisted(() => ({ db: vi.fn(), bucket: vi.fn(), render: vi.fn(), queue: vi.fn(), cover: vi.fn() }));
vi.mock('./firebaseAdmin', () => ({ adminDb: m.db, adminBucket: m.bucket }));
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: m.render }));
vi.mock('./pdf/FaxCoverPDF', () => ({ default: m.cover }));
vi.mock('./settingsServer', () => ({ getServerSettings: vi.fn() }));
vi.mock('./notificationsServer', () => ({ createPortalNotification: vi.fn() }));
vi.mock('./verbalOrderServer', () => ({ returnFaxNumber: async () => '4705550100' }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => null, increment: (n: number) => n } }));
vi.mock('./fax/srfax', () => ({ srfaxConfig: () => ({}), srfaxQueueFax: m.queue, srfaxGetFaxStatus: vi.fn() }));
import { retryOutboundFax, sendOutboundFax, type FaxSender } from './faxCenterServer';
import type { AuthedCaller } from './adminAuthGuard';

let row: Record<string, unknown>;
async function pdf() { const d = await PDFDocument.create(); d.addPage([100, 100]); return Buffer.from(await d.save()); }
const input = { recipientName: 'Test Office', recipientOrg: '', toNumber: '4045550100', confirmNumber: '4045550100', regarding: 'Test', note: '', includeCover: true };
beforeEach(async () => {
  vi.clearAllMocks();
  row = {};
  const ref = { id: 'fax1', get: async () => ({ exists: true, id: 'fax1', data: () => ({ ...row }) }), set: async (d: object) => { row = { ...d }; }, update: async (d: object) => Object.assign(row, d) };
  m.db.mockReturnValue({ collection: () => ({ doc: () => ref }) });
  const saved = await pdf();
  m.bucket.mockReturnValue({ file: () => ({ save: async () => {}, download: async () => [saved] }) });
  m.render.mockResolvedValue(await pdf());
  m.cover.mockReturnValue(null);
  m.queue.mockResolvedValue({ ok: true, faxDetailsId: 'srf1' });
});

it('sends the signed-in sender to the cover and the header', async () => {
  const caller: FaxSender = { uid: 'u1', email: 'u1@example.test', profile: { displayName: 'Test Sender' } };
  expect((await sendOutboundFax({ input, pdf: await pdf(), fileName: 'x.pdf', caller })).ok).toBe(true);
  expect(m.render.mock.calls[0][0].props.senderName).toBe('Test Sender');
  expect(m.queue.mock.calls[0][0].senderName).toBe('Test Sender');
});

it('sends with the organization alone when an automatic reminder has no sender name', async () => {
  const caller: FaxSender = { uid: '', email: null, profile: { displayName: '' } };
  await sendOutboundFax({ input, pdf: await pdf(), fileName: 'x.pdf', caller });
  expect(m.queue.mock.calls[0][0].senderName).toBe('');
});

it('a retry keeps the original sender on the header, not whoever pressed Resend', async () => {
  row = { sentStatus: 'Failed', toNumber: '4045550100', fileName: 'x.pdf', storagePath: 'p', sentByName: 'Original Sender' };
  const caller = { uid: 'u2', email: null, role: 'admin', profile: { displayName: 'Someone Else' } } as unknown as AuthedCaller;
  await retryOutboundFax('fax1', caller);
  expect(m.queue.mock.calls[0][0].senderName).toBe('Original Sender');
});
