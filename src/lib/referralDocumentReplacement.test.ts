// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
vi.mock('server-only', () => ({}));
vi.mock('./firebaseAdmin', () => ({ adminDb: vi.fn(), adminBucket: vi.fn() }));
import { adminDb, adminBucket } from './firebaseAdmin';
import { replaceReferralDocument, editReferralDocumentDetails, documentRevision } from './referralDocumentsServer';

const original = { storagePath: 'ppot/signed/original.pdf', signedDate: '2026-10-01', inboundFaxId: '123', byName: 'Original staff' };
const revision = createHash('sha256').update(original.storagePath).digest('hex');
const args = { referralId: 'r1', docId: 'signed-ppot', revision, pdf: Buffer.from('%PDF-test'), by: { uid: 'u1', name: 'Staff', role: 'va' } };
let referral: Record<string, unknown>;
let document: Record<string, unknown>;
let duringTransaction: (() => void) | undefined;
const update = vi.fn(); const set = vi.fn(); const save = vi.fn();
const snapshot = (data: Record<string, unknown>) => ({ exists: true, data: () => data });
const ref = (path: string): any => ({ path, get: async () => snapshot(path === 'referrals/r1' ? referral : document), collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }) });
beforeEach(() => {
  vi.clearAllMocks(); duringTransaction = undefined;
  referral = {}; document = { status: 'received', received: { ...original } };
  vi.mocked(adminBucket).mockReturnValue({ file: () => ({ save }) } as any);
  vi.mocked(adminDb).mockReturnValue({
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: async (cb: any) => { duringTransaction?.(); return cb({ get: (r: any) => r.get(), update, set }); },
  } as any);
});
describe('referral PDF replacement', () => {
  it('replaces the PPOT file without changing receipt, signature date, or inbound source; retains original history', async () => {
    await replaceReferralDocument(args);
    expect(save).toHaveBeenCalledOnce();
    expect(update.mock.calls[0][1].received).toMatchObject({ ...original, storagePath: expect.stringContaining('/replacements/'), size: args.pdf.length });
    expect(update.mock.calls[0][1]).not.toHaveProperty('status');
    expect(set.mock.calls[0][1]).toMatchObject({ previous: original, replacedBy: 'u1' });
    expect(update.mock.calls[1][0].path).toBe('referrals/r1');
    expect(set.mock.calls[1][0].path).toContain('/activity/');
  });
  it('also replaces ordinary referral documents without changing title/category/date', async () => {
    document = { ...original, referralId: 'r1', title: 'Records', category: 'Other', docDate: '2026-10-01' };
    await replaceReferralDocument({ ...args, docId: 'd1' });
    expect(update.mock.calls[0][1]).toMatchObject({ storagePath: expect.stringContaining('/replacements/'), fileName: 'document.pdf' });
    expect(update.mock.calls[0][1]).not.toHaveProperty('title');
    expect(set.mock.calls[0][1].previous).toMatchObject({ title: 'Records', category: 'Other' });
  });
  it('rejects a document belonging to another referral', async () => {
    document = { ...original, referralId: 'r2' };
    await expect(replaceReferralDocument({ ...args, docId: 'd1' })).rejects.toMatchObject({ status: 404 });
    expect(save).not.toHaveBeenCalled();
  });
  it('rejects an already converted referral before uploading', async () => {
    referral = { patientId: 'p1' };
    await expect(replaceReferralDocument(args)).rejects.toMatchObject({ status: 409 });
    expect(save).not.toHaveBeenCalled();
  });
  it('rejects conversion that wins while the upload is in flight', async () => {
    duringTransaction = () => { referral = { patientId: 'p1' }; };
    await expect(replaceReferralDocument(args)).rejects.toMatchObject({ status: 409 });
    expect(update).not.toHaveBeenCalled(); expect(set).not.toHaveBeenCalled();
  });
  it('rejects another staff replacement that wins while uploading', async () => {
    duringTransaction = () => { document = { status: 'received', received: { ...original, storagePath: 'new.pdf' } }; };
    await expect(replaceReferralDocument(args)).rejects.toMatchObject({ status: 409 });
    expect(update).not.toHaveBeenCalled();
  });
  it('does not change the document when storage fails', async () => {
    save.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(replaceReferralDocument(args)).rejects.toThrow('storage unavailable');
    expect(update).not.toHaveBeenCalled();
  });
});

const detailArgs = { ...args, title: 'Corrected title', category: 'Other', docDate: '2026-09-30' };
it('corrects a PPOT signed date while preserving receipt status, PDF, and original filing metadata', async () => {
  await editReferralDocumentDetails(detailArgs);
  expect(update.mock.calls[0][1].received).toMatchObject({ ...original, signedDate: '2026-09-30', revisionId: expect.any(String) });
  expect(update.mock.calls[0][1]).not.toHaveProperty('status');
  expect(set.mock.calls[0][1]).toMatchObject({ previous: original, change: 'details', editedBy: 'u1' });
  expect(save).not.toHaveBeenCalled();
});
it('edits ordinary document metadata without replacing its PDF', async () => {
  document = { ...original, referralId: 'r1', title: 'Old title', category: 'Other', docDate: '2026-10-01' };
  await editReferralDocumentDetails({ ...detailArgs, docId: 'd1' });
  expect(update.mock.calls[0][1]).toMatchObject({ title: 'Corrected title', category: 'Other', docDate: '2026-09-30' });
  expect(update.mock.calls[0][1]).not.toHaveProperty('storagePath');
});
it('rejects stale metadata edits and replacement uploads after another edit', async () => {
  document = { status: 'received', received: { ...original, revisionId: 'new-version' } };
  await expect(editReferralDocumentDetails(detailArgs)).rejects.toMatchObject({ status: 409 });
  await expect(replaceReferralDocument(args)).rejects.toMatchObject({ status: 409 });
  expect(update).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  expect(documentRevision(original.storagePath, 'new-version')).not.toBe(revision);
});
it('rejects edits after conversion without writing history or metadata', async () => {
  referral = { patientId: 'p1' };
  await expect(editReferralDocumentDetails(detailArgs)).rejects.toMatchObject({ status: 409 });
  expect(update).not.toHaveBeenCalled(); expect(set).not.toHaveBeenCalled();
});
