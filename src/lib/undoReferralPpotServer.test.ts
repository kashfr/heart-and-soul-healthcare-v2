// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
vi.mock('server-only', () => ({}));
vi.mock('./firebaseAdmin', () => ({ adminDb: vi.fn(), adminBucket: vi.fn() }));
import { adminDb } from './firebaseAdmin';
import { undoReferralPpot } from './undoReferralPpotServer';
const received = { storagePath: 'referrals/r1/replacements/trimmed.pdf', inboundFaxId: '123', signedDate: '2026-10-01', size: 123 };
const args = { referralId: 'r1', revision: createHash('sha256').update(received.storagePath).digest('hex'), title: 'Medical records', category: 'Other', docDate: '2026-10-01', by: { uid: 'u1', name: 'Staff', role: 'va' } };
let records: Record<string, any>;
const writes = vi.fn();
const ref = (path: string): any => ({ path, id: path.split('/').pop(), collection: (c: string) => ({ doc: (id: string) => ref(`${path}/${c}/${id}`) }) });
beforeEach(() => {
  writes.mockClear();
  records = { 'referrals/r1': {}, 'ppotRequests/referral_r1': { subjectKind: 'referral', subjectId: 'r1', status: 'received', received, date: '2026-09-28', followup: { date: '2026-10-01' }, listHidden: true }, 'verbalOrderInbound/123': { status: 'filed', matchedPpotKey: 'referral_r1' } };
  vi.mocked(adminDb).mockReturnValue({ collection: (c: string) => ({ doc: (id = 'newdoc') => ref(`${c}/${id}`) }), runTransaction: (fn: any) => fn({ get: async (r: any) => ({ exists: !!records[r.path], data: () => records[r.path] }), set: writes, update: writes }) } as any);
});
it('keeps the trimmed copy as an ordinary document, reopens the request, and records the correction atomically', async () => {
  expect(await undoReferralPpot(args)).toBe('newdoc');
  const byPath = Object.fromEntries(writes.mock.calls.map(([r, data]) => [r.path, data]));
  expect(byPath['referralDocuments/newdoc']).toMatchObject({ title: 'Medical records', storagePath: received.storagePath, category: 'Other', inboundFaxId: '123', patientDocumentId: '' });
  expect(byPath['ppotRequests/referral_r1']).toEqual({ status: 'sent', received: null, listHidden: false });
  expect(byPath['ppotRequests/referral_r1']).not.toHaveProperty('date');
  expect(byPath['ppotRequests/referral_r1']).not.toHaveProperty('followup');
  expect(byPath['ppotRequests/referral_r1/filingCorrections/newdoc']).toMatchObject({ previousReceived: received, byUid: 'u1' });
  expect(byPath['verbalOrderInbound/123']).toMatchObject({ filedReferralId: 'r1', filedDocumentId: 'newdoc' });
  expect(byPath['verbalOrderInbound/123']).not.toHaveProperty('status');
  expect(byPath['referrals/r1/activity/newdoc'].text).toContain('PPOT request returned to Waiting on Physicians');
});
it.each([
  ['conversion', () => { records['referrals/r1'].patientId = 'p1'; }],
  ['moved request', () => { records['ppotRequests/referral_r1'].movedToPatientId = 'p1'; }],
  ['duplicate undo', () => { records['ppotRequests/referral_r1'].status = 'sent'; }],
  ['metadata changed', () => { records['ppotRequests/referral_r1'].received = { ...received, revisionId: 'changed' }; }],
  ['another replacement', () => { records['ppotRequests/referral_r1'].received = { ...received, storagePath: 'new.pdf' }; }],
  ['fax refiled elsewhere', () => { records['verbalOrderInbound/123'].filedDocumentId = 'another'; }],
  ['fax no longer filed', () => { records['verbalOrderInbound/123'].status = 'filing'; }],
  ['wrong request link', () => { records['verbalOrderInbound/123'].matchedPpotKey = 'referral_r2'; }],
])('rejects %s without partial changes', async (_name, change) => {
  change(); await expect(undoReferralPpot(args)).rejects.toMatchObject({ status: 409 }); expect(writes).not.toHaveBeenCalled();
});
it('undoes an Appendix T uploaded on the card, which has no fax behind it', async () => {
  records['ppotRequests/referral_r1'].received = { ...received, inboundFaxId: '', source: 'upload' };
  delete records['verbalOrderInbound/123'];
  expect(await undoReferralPpot(args)).toBe('newdoc');
  const byPath = Object.fromEntries(writes.mock.calls.map(([r, data]) => [r.path, data]));
  expect(byPath['ppotRequests/referral_r1']).toEqual({ status: 'sent', received: null, listHidden: false });
  expect(Object.keys(byPath).some((p) => p.startsWith('verbalOrderInbound/'))).toBe(false);
  expect(byPath['referrals/r1/activity/newdoc'].text).toContain('upload refiled as');
});
