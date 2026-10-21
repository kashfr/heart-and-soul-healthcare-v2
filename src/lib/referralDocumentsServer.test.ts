// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./firebaseAdmin', () => ({ adminDb: vi.fn(), adminBucket: vi.fn() }));

import { SIGNED_PPOT_DOC_ID, listReferralDocuments, signedPpotRow } from './referralDocumentsServer';
import { adminDb } from './firebaseAdmin';

const received = {
  status: 'received',
  requestType: 'new',
  recipientName: 'Dr. Sherrod MD',
  received: { storagePath: 'ppot/signed/referral_r1/up_x/Appendix_T_Signed_10-01-2026.pdf', signedDate: '2026-10-01', byName: 'Kaheem Freeman', documentId: '' },
};

describe('signedPpotRow', () => {
  it('lists a signed Appendix T filed against the referral', () => {
    const row = signedPpotRow('r1', received);
    expect(row).toMatchObject({
      id: SIGNED_PPOT_DOC_ID,
      kind: 'ppot',
      category: 'ISP / Plan of Treatment',
      title: 'Signed Appendix T (PPOT), new case: Dr. Sherrod MD (10/01/2026)',
      fileName: 'Appendix_T_Signed_10-01-2026.pdf',
      docDate: '2026-10-01',
      uploadedByName: 'Kaheem Freeman',
      patientDocumentId: '',
    });
  });
  it('carries the Documents copy once the client record exists', () => {
    expect(signedPpotRow('r1', received, 'doc9')?.patientDocumentId).toBe('doc9');
  });
  it('shows nothing while the request is only sent, or has no file', () => {
    expect(signedPpotRow('r1', { ...received, status: 'sent' })).toBeNull();
    expect(signedPpotRow('r1', { ...received, received: { signedDate: '2026-10-01' } })).toBeNull();
    expect(signedPpotRow('r1', undefined)).toBeNull();
  });
  it('names a recertification', () => {
    expect(signedPpotRow('r1', { ...received, requestType: 'recert', recipientName: '' })?.title).toBe('Signed Appendix T (PPOT), recertification (10/01/2026)');
  });
});

describe('listReferralDocuments', () => {
  it('marks a signed release’s copy so the card can open the release editor', async () => {
    const q = (docs: Array<[string, Record<string, unknown>]>) => ({ get: async () => ({ docs: docs.map(([id, d]) => ({ id, data: () => d })) }) });
    vi.mocked(adminDb).mockReturnValue({
      collection: (name: string) => ({
        where: () => (name === 'roiRequests'
          ? q([['roi1', { status: 'signed', signed: { documentId: 'doc1' } }], ['roi2', { status: 'cancelled', signed: { documentId: 'doc2' } }]])
          : q([['doc1', { referralId: 'r1', title: 'Release', docDate: '2026-10-18', storagePath: 'a' }], ['doc2', { referralId: 'r1', title: 'Labs', docDate: '2026-10-01', storagePath: 'b' }]])),
        doc: () => ({ get: async () => ({ exists: false, data: () => undefined }) }),
      }),
    } as never);
    const docs = await listReferralDocuments('r1');
    expect(docs.find((d) => d.id === 'doc1')?.roiId).toBe('roi1');
    expect(docs.find((d) => d.id === 'doc2')?.roiId).toBeUndefined();
  });
});
