// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';

vi.mock('server-only', () => ({}));
const saved: string[] = [];
const deleted: string[] = [];
let docs: Record<string, Record<string, unknown> | undefined>;
const updates: Array<[string, Record<string, unknown>]> = [];
vi.mock('./firebaseAdmin', () => ({
  adminBucket: () => ({ file: (p: string) => ({ save: async () => { saved.push(p); }, delete: async () => { deleted.push(p); } }) }),
  adminDb: () => ({
    collection: (c: string) => ({
      doc: (id: string) => ({
        path: `${c}/${id}`,
        get: async () => ({ exists: !!docs[`${c}/${id}`], data: () => docs[`${c}/${id}`] }),
        update: async (u: Record<string, unknown>) => { updates.push([`${c}/${id}`, u]); },
      }),
    }),
    runTransaction: async (fn: (tx: unknown) => unknown) => fn({
      get: async (r: { path: string }) => ({ exists: !!docs[r.path], data: () => docs[r.path] }),
      update: (r: { path: string }, u: Record<string, unknown>) => { updates.push([r.path, u]); },
    }),
  }),
}));
const added = vi.fn(async () => 'doc1');
vi.mock('./referralDocumentsServer', () => ({ addReferralDocument: (...a: unknown[]) => added(...(a as [])) }));
const activity = vi.fn(async () => undefined);
vi.mock('./referrals', () => ({ logReferralActivity: (...a: unknown[]) => activity(...(a as [])) }));

import { openPpotForReferral, uploadReferralDocument, uploadSignedPpotForReferral } from './referralUploadServer';
import type { AuthedCaller } from './adminAuthGuard';

const caller = { uid: 'u1', role: 'va', email: 'va@example.com', profile: { displayName: 'Vera Assistant' } } as unknown as AuthedCaller;
let pdf: Buffer;

beforeEach(async () => {
  saved.length = 0; deleted.length = 0; updates.length = 0; added.mockClear(); activity.mockClear();
  const d = await PDFDocument.create(); d.addPage();
  pdf = Buffer.from(await d.save());
  docs = {
    'referrals/r1': { clientName: 'Bronx Spry' },
    'ppotRequests/referral_r1': { subjectKind: 'referral', subjectId: 'r1', status: 'sent', recipientName: 'Dr. Ann Eggert' },
  };
});

describe('uploadReferralDocument', () => {
  it('files any PDF to the referral and notes it on the timeline', async () => {
    const r = await uploadReferralDocument({ referralId: 'r1', pdf, category: 'Consent / Release (ROI)', title: 'Georgia HIPAA Release', docDate: '2026-10-18', caller });
    expect(r).toEqual({ ok: true, documentId: 'doc1' });
    expect(added).toHaveBeenCalledWith(expect.objectContaining({ referralId: 'r1', category: 'Consent / Release (ROI)', fileName: 'Georgia_HIPAA_Release_10-18-2026.pdf' }));
    expect(activity).toHaveBeenCalledOnce();
  });
  it('refuses a converted referral, a file that is not a PDF, and a missing referral', async () => {
    docs['referrals/r1'] = { patientId: 'p1' };
    expect(await uploadReferralDocument({ referralId: 'r1', pdf, category: 'Other', title: 'x', docDate: '2026-10-18', caller })).toMatchObject({ ok: false, status: 409 });
    docs['referrals/r1'] = {};
    expect(await uploadReferralDocument({ referralId: 'r1', pdf: Buffer.from('hello'), category: 'Other', title: 'x', docDate: '2026-10-18', caller })).toMatchObject({ ok: false, status: 400 });
    expect(await uploadReferralDocument({ referralId: 'nope', pdf, category: 'Other', title: 'x', docDate: '2026-10-18', caller })).toMatchObject({ ok: false, status: 404 });
    expect(added).not.toHaveBeenCalled();
  });
});

describe('uploadSignedPpotForReferral', () => {
  it('marks the open request received with the uploaded copy', async () => {
    expect(await openPpotForReferral('r1')).toEqual({ open: true, recipientName: 'Dr. Ann Eggert' });
    const r = await uploadSignedPpotForReferral({ referralId: 'r1', pdf, signedDate: '2026-10-17', caller });
    expect(r.ok).toBe(true);
    const req = updates.find(([p]) => p === 'ppotRequests/referral_r1')![1] as { status: string; received: Record<string, unknown> };
    expect(req.status).toBe('received');
    expect(req.received).toMatchObject({ signedDate: '2026-10-17', source: 'upload', inboundFaxId: '', byName: 'Vera Assistant' });
    expect(String(req.received.storagePath)).toMatch(/^ppot\/signed\/referral_r1\/upload_[a-f0-9-]+\/Appendix_T_Signed_10-17-2026\.pdf$/);
    expect(saved).toEqual([req.received.storagePath]);
  });
  it('refuses when there is no open request, and removes the stored copy', async () => {
    docs['ppotRequests/referral_r1'] = { ...docs['ppotRequests/referral_r1'], status: 'received' };
    expect(await uploadSignedPpotForReferral({ referralId: 'r1', pdf, signedDate: '2026-10-17', caller })).toMatchObject({ ok: false, status: 409 });
    expect(deleted).toEqual(saved);
    delete docs['ppotRequests/referral_r1'];
    expect(await uploadSignedPpotForReferral({ referralId: 'r1', pdf, signedDate: '2026-10-17', caller })).toMatchObject({ ok: false, status: 404 });
    expect(await openPpotForReferral('r1')).toEqual({ open: false, recipientName: '' });
  });
});
