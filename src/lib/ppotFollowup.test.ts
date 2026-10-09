// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type { AuthedCaller } from './adminAuthGuard';
vi.mock('server-only', () => ({}));
const m = vi.hoisted(() => ({ db: vi.fn(), send: vi.fn(), config: vi.fn(), settings: vi.fn(), referral: vi.fn() }));
vi.mock('./firebaseAdmin', () => ({ adminDb: m.db, adminBucket: vi.fn() }));
vi.mock('./faxCenterServer', () => ({ sendOutboundFax: m.send }));
vi.mock('./fax/srfax', () => ({ srfaxConfig: m.config }));
vi.mock('./settingsServer', () => ({ getServerSettings: m.settings }));
vi.mock('./referrals', () => ({ getReferral: m.referral }));
vi.mock('./verbalOrderServer', () => ({ agencyTodayISO: () => '2026-10-08' }));
vi.mock('./notificationsServer', () => ({ createPortalNotification: vi.fn() }));
import { sendPpotFollowup } from './ppotServer';
let row: Record<string, unknown>;
const caller = { uid: 'va1', email: 'va@example.test', role: 'va', profile: { displayName: 'Test VA' } } as AuthedCaller;
beforeEach(() => {
  vi.clearAllMocks();
  row = { status: 'sent', subjectKind: 'referral', subjectId: 'r1', memberName: 'Test Referral', toNumber: '7705550100', recipientName: 'Test Physician', date: '2026-09-28' };
  const ref = { get: async () => ({ exists: true, data: () => ({ ...row }) }), update: async (patch: object) => { Object.assign(row, patch); } };
  let queue = Promise.resolve();
  m.db.mockReturnValue({ collection: () => ({ doc: () => ref }), runTransaction: (fn: (tx: unknown) => Promise<unknown>) => {
    const run = queue.then(() => fn({ get: () => ref.get(), update: (_ref: unknown, patch: object) => Object.assign(row, patch) }));
    queue = run.then(() => undefined); return run;
  } });
  m.config.mockReturnValue({});
  m.settings.mockResolvedValue({ fax: { enabled: true, ppotPrefillIdentity: false } });
  m.referral.mockResolvedValue({ id: 'r1', clientName: 'Test Referral', details: [] });
  m.send.mockResolvedValue({ ok: true, fax: { id: 'f1' } });
});
it('submits to the saved physician with the staff sender and leaves the original date intact', async () => {
  expect(await sendPpotFollowup('referral_r1', caller)).toEqual({ ok: true });
  expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ caller, input: expect.objectContaining({ toNumber: '7705550100', recipientName: 'Test Physician', note: expect.stringContaining('Follow-up request.') }) }));
  expect(row).toMatchObject({ date: '2026-09-28', followupDate: '2026-10-08', followupPending: false, followupByName: 'Test VA' });
});
it('prevents duplicate concurrent sends and a scheduled reminder after manual submission', async () => {
  const results = await Promise.all([sendPpotFollowup('referral_r1', caller), sendPpotFollowup('referral_r1', caller)]);
  expect(results.filter(x => x.ok)).toHaveLength(1);
  expect(m.send).toHaveBeenCalledOnce();
  row.followupAttemptDate = '2026-10-07';
  expect(await sendPpotFollowup('referral_r1', undefined, true)).toMatchObject({ ok: false, status: 409 });
});
it('rejects completed/cancelled requests and disabled fax service', async () => {
  for (const status of ['received', 'cancelled']) { row.status = status; expect((await sendPpotFollowup('referral_r1', caller)).ok).toBe(false); }
  row.status = 'sent'; m.config.mockReturnValue(null);
  expect(await sendPpotFollowup('referral_r1', caller)).toMatchObject({ status: 503 });
  expect(m.send).not.toHaveBeenCalled();
});
it('does not report a failed submission as a successful follow-up', async () => {
  m.send.mockResolvedValue({ ok: false, status: 502, fax: { id: 'failed1' }, error: 'Provider refused' });
  expect(await sendPpotFollowup('referral_r1', caller)).toMatchObject({ ok: false, status: 502 });
  expect(row.followupDate).toBeUndefined();
  expect(row).toMatchObject({ followupPending: false, followupFaxId: 'failed1', followupError: 'Provider refused' });
});
it('retains the claim when the outcome is unknown', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  m.send.mockRejectedValue(new Error('network lost'));
  expect((await sendPpotFollowup('referral_r1', caller)).ok).toBe(false);
  expect(row.followupPending).toBe(true);
  expect(row.followupDate).toBeUndefined();
  log.mockRestore();
});
