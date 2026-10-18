// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { AuthedCaller } from './adminAuthGuard';
import { validateRoiInput } from './roiShared';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ db: vi.fn(), referral: vi.fn(), activity: vi.fn(), addDoc: vi.fn(), moveDocs: vi.fn() }));
vi.mock('./firebaseAdmin', () => ({ adminDb: mocks.db, adminBucket: vi.fn() }));
vi.mock('./referrals', () => ({ getReferral: mocks.referral, logReferralActivity: mocks.activity }));
vi.mock('./referralDocumentsServer', () => ({ addReferralDocument: mocks.addDoc, moveReferralDocumentsToPatient: mocks.moveDocs }));
vi.mock('./faxCenterServer', () => ({ sendOutboundFax: vi.fn() }));
vi.mock('./verbalOrderServer', () => ({ agencyTodayISO: () => '2026-10-07', returnFaxNumber: async () => '6785550100' }));
import { createRoi, editRoi, fileSignedRoi, listRois } from './roiServer';

const caller = { uid: 'va1', email: 'va@example.test', role: 'va', profile: { displayName: 'Test VA' } } as AuthedCaller;
let rows: Map<string, Record<string, unknown>>;
let where: ReturnType<typeof vi.fn>;
const referral = { id: 'ref1', clientName: 'Test Referral', program: 'GAPP', stage: 'new', details: [{ label: 'Date of birth', value: '03/14/2015' }], patientId: '' };
const input = () => validateRoiInput({ referralId: 'ref1', formType: 'choa', direction: 'to-us', duration: 'year', choa: { location: '', dateFrom: '2026-01-01', dateTo: '2026-10-07', recordTypes: ['routine'] } }).value!;

beforeEach(() => {
  vi.clearAllMocks();
  rows = new Map();
  where = vi.fn((_field: string, _op: string, id: string) => ({ get: async () => ({ docs: [...rows].filter(([, x]) => x.referralId === id).map(([id, x]) => ({ id, data: () => x })) }) }));
  mocks.db.mockReturnValue({ collection: (name: string) => {
    if (name !== 'roiRequests') throw new Error(`Unexpected collection: ${name}`);
    return { where, doc: (id = 'roi1') => ({ id,
      get: async () => ({ exists: rows.has(id), data: () => rows.get(id) }),
      set: async (data: Record<string, unknown>) => { rows.set(id, data); },
      update: async (data: Record<string, unknown>) => { rows.set(id, { ...rows.get(id), ...data }); },
    }) };
  } });
  mocks.referral.mockResolvedValue(referral);
  mocks.addDoc.mockResolvedValue('doc1');
  mocks.moveDocs.mockResolvedValue(1);
  mocks.activity.mockResolvedValue(undefined);
});

it('snapshots the referral identity and lists only its releases without loading the patient directory', async () => {
  const result = await createRoi(input(), caller);
  expect(result.ok).toBe(true);
  expect(rows.get('roi1')).toMatchObject({ patientId: '', referralId: 'ref1', memberName: 'Test Referral', dob: '2015-03-14', formType: 'choa' });
  rows.set('other', { referralId: 'other', memberName: 'Other Referral' });
  const listed = await listRois('ref1');
  expect(listed.rois).toHaveLength(1);
  expect(listed.subject?.id).toBe('ref1');
  expect(listed.clients).toEqual([]);
});

it('requires missing DOB and refuses a closed referral', async () => {
  mocks.referral.mockResolvedValue({ ...referral, details: [] });
  expect(await createRoi(input(), caller)).toMatchObject({ ok: false, status: 400 });
  expect((await createRoi({ ...input(), referralDob: '2015-03-14' }, caller)).ok).toBe(true);
  mocks.referral.mockResolvedValue({ ...referral, stage: 'closed' });
  expect(await createRoi(input(), caller)).toMatchObject({ ok: false, status: 409 });
});

it('files a signed authorization with the referral before a client exists', async () => {
  await createRoi(input(), caller);
  const pdf = await PDFDocument.create(); pdf.addPage();
  const result = await fileSignedRoi({ id: 'roi1', pdf: Buffer.from(await pdf.save()), signedDate: '2026-10-07', caller });
  expect(result.ok).toBe(true);
  expect(mocks.addDoc).toHaveBeenCalledWith(expect.objectContaining({ referralId: 'ref1', category: 'Consent / Release (ROI)' }));
  expect(rows.get('roi1')).toMatchObject({ status: 'signed', signed: { documentId: 'doc1', storagePath: 'referrals/ref1/documents/doc1/Release_of_Information_Signed_10-07-2026.pdf' } });
  expect(mocks.moveDocs).not.toHaveBeenCalled();
});

it('copies the signed release into the client record when conversion happened after preparation', async () => {
  await createRoi(input(), caller);
  mocks.referral.mockResolvedValue({ ...referral, patientId: 'patient1' });
  const pdf = await PDFDocument.create(); pdf.addPage();
  await fileSignedRoi({ id: 'roi1', pdf: Buffer.from(await pdf.save()), signedDate: '2026-10-07', caller });
  expect(mocks.moveDocs).toHaveBeenCalledWith('ref1', 'patient1', expect.objectContaining({ uid: 'va1' }));
  expect(rows.get('roi1')).toMatchObject({ patientId: 'patient1', status: 'signed' });
});

it('edits a release signed elsewhere: adds the fax, re-dates it, and notes it on the referral', async () => {
  rows.set('roi9', {
    formType: 'ga-hipaa', referralId: 'ref1', patientId: '', memberName: 'Bronx Spry', direction: 'to-us', duration: 'transactions', status: 'signed',
    facility: { name: 'Peachtree Pediatrics', address: '12 Eastbrook Bend', phone: '7704873330', fax: '' },
    information: 'As listed on the signed authorization.', purpose: 'As listed on the signed authorization.',
    signed: { documentId: 'd1', signedDate: '2026-10-07', expiresOn: '2028-10-07', byName: 'Test VA' }, faxes: [],
  });
  const result = await editRoi('roi9', { facilityFax: '(770) 487-7736', signedDate: '2026-10-06' }, caller);
  expect(result).toMatchObject({ ok: true, changed: 2 });
  const row = rows.get('roi9')!;
  expect(row.facility).toMatchObject({ fax: '7704877736', phone: '7704873330', name: 'Peachtree Pediatrics' });
  expect(row['signed.signedDate']).toBe('2026-10-06');
  expect(row['signed.expiresOn']).toBe('2028-10-06');
  expect(mocks.activity).toHaveBeenCalledWith('ref1', expect.objectContaining({ text: expect.stringContaining('Fax (blank) → (770) 487-7736') }));
});

it('keeps a signed DBHDD release’s name as signed, and refuses a cancelled one', async () => {
  rows.set('roi8', {
    formType: 'dbhdd', referralId: 'ref1', memberName: 'X', direction: 'to-us', duration: 'year', status: 'signed',
    facility: { name: 'Magnolia Manor', address: '', phone: '', fax: '' }, information: 'i', purpose: 'p',
    signed: { documentId: 'd', signedDate: '2026-10-01', expiresOn: '2027-10-01', byName: '' }, faxes: [],
  });
  const result = await editRoi('roi8', { facilityName: 'Renamed', facilityFax: '7705550000' }, caller);
  expect(result).toMatchObject({ ok: true, changed: 1 });
  expect(rows.get('roi8')!.facility).toMatchObject({ name: 'Magnolia Manor', fax: '7705550000' });
  rows.set('roi7', { ...rows.get('roi8'), status: 'cancelled' });
  expect(await editRoi('roi7', { facilityFax: '7705551111' }, caller)).toMatchObject({ ok: false, status: 409 });
});
