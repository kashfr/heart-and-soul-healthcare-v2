// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => {
  const records = new Map<string, Record<string, unknown>>();
  let nextId = 0;
  const writes: { path: string; data: Record<string, unknown>; method: string }[] = [];
  function reference(path: string) {
    return {
      id: path.split('/').pop()!, path,
      get: async () => snapshot(path),
      collection: (name: string) => collection(`${path}/${name}`),
    };
  }
  function snapshot(path: string) {
    const value = records.get(path);
    return { id: path.split('/').pop()!, exists: !!value, data: () => value,
      updateTime: value ? { seconds: Number(value._version || 1), nanoseconds: 0 } : undefined,
    };
  }
  function collection(path: string, filter?: [string, unknown]) {
    return {
      doc: (id?: string) => reference(`${path}/${id || `new${++nextId}`}`),
      where: (field: string, _operator: string, value: unknown) => collection(path, [field, value]),
      get: async () => ({ docs: [...records].filter(([key, value]) => key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1 && (!filter || value[filter[0]] === filter[1])).map(([key]) => snapshot(key)) }),
    };
  }
  const tx = {
    get: async (ref: { path: string }) => snapshot(ref.path),
    update: (ref: { path: string }, data: Record<string, unknown>) => { writes.push({ path: ref.path, data, method: 'update' }); records.set(ref.path, { ...records.get(ref.path), ...data, _version: 2 }); },
    set: (ref: { path: string }, data: Record<string, unknown>, options?: { merge: boolean }) => { writes.push({ path: ref.path, data, method: 'set' }); records.set(ref.path, { ...(options?.merge ? records.get(ref.path) : {}), ...data, _version: 2 }); },
    create: (ref: { path: string }, data: Record<string, unknown>) => { writes.push({ path: ref.path, data, method: 'create' }); records.set(ref.path, data); },
  };
  const object = { save: vi.fn(async () => undefined), delete: vi.fn(async () => undefined), getMetadata: vi.fn(async () => [{ contentType: 'application/pdf', size: 10 }]), download: vi.fn(async () => [Buffer.from('pdf')]) };
  const file = vi.fn(() => object);
  return { records, writes, object, file, db: { collection, doc: reference, runTransaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } };
});
vi.mock('server-only', () => ({}));
vi.mock('./firebaseAdmin', () => ({ adminDb: () => fake.db, adminBucket: () => ({ file: fake.file }) }));
vi.mock('./adminAuthGuard', () => ({ requireRole: vi.fn(), AdminAuthError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
vi.mock('./settingsServer', () => ({ getServerSettings: vi.fn() }));
import { requireRole, type AuthedCaller } from './adminAuthGuard';
import { getServerSettings } from './settingsServer';
import { DEFAULT_SETTINGS } from './settings';
import {
  getAssistantClient, listAssistantClients, readAssistantDocument, requireAssistant,
  updateAssistantClient, uploadAssistantDocument, validateAdministrativePatch, validateAssistantUpload, type AssistantContext,
} from './assistantClientsServer';
const grant = { uid: 'assistant', scope: 'gapp' as const, editInfo: true, uploadDocuments: true };
const caller = { uid: 'assistant', role: 'va', email: 'assistant@example.com', profile: { active: true, role: 'va', displayName: 'Assistant' } } as AuthedCaller;
const context: AssistantContext = { caller, grant };
const settings = () => ({ ...DEFAULT_SETTINGS, assistantClients: { grants: [grant] } });
const patch = async (data: Record<string, unknown>) => ({ revision: (await getAssistantClient(context, 'gapp1')).client.revision, ...data });
beforeEach(() => {
  vi.clearAllMocks(); fake.records.clear(); fake.writes.length = 0;
  fake.records.set('users/assistant', caller.profile as unknown as Record<string, unknown>);
  fake.records.set('settings/global', settings());
  fake.records.set('patients/gapp1', { name: 'Client', dob: '2015-01-01', program: 'gapp', street: 'Address', diagnosis: 'Private', assignedNurseIds: ['nurse'], requiresMar: true });
  fake.records.set('patients/other', { name: 'Other', dob: '1990-01-01', program: 'now-comp' });
  fake.records.set('patients/gapp1/clinical/profile', { medicaidId: '123456', physicianName: 'Doctor', allergies: 'Hidden', diet: 'Hidden', vitalsBaselines: { hidden: true } });
  fake.records.set('patients/gapp1/clinical/guardian', { decisionMaker: 'parent', contacts: [{ id: 'mother', role: 'Parent', name: 'Parent', phone: '5551234567', notes: 'Hidden notes' }] });
  vi.mocked(requireRole).mockResolvedValue(caller);
  vi.mocked(getServerSettings).mockResolvedValue(settings());
  fake.object.save.mockResolvedValue(undefined);
  fake.object.getMetadata.mockResolvedValue([{ contentType: 'application/pdf', size: 10 }]);
});
describe('assistant client authorization and projections', () => {
  it('requires active VA and checks fresh permission on every request', async () => {
    expect((await requireAssistant(new Request('https://example.com'))).grant).toEqual(grant);
    expect(requireRole).toHaveBeenCalledWith(expect.any(Request), ['va', 'admin']);
    vi.mocked(getServerSettings).mockResolvedValue({ ...DEFAULT_SETTINGS, assistantClients: { grants: [] } });
    await expect(requireAssistant(new Request('https://example.com'))).rejects.toMatchObject({ status: 403 });
    vi.mocked(getServerSettings).mockResolvedValue(settings());
    vi.mocked(requireRole).mockResolvedValue({ ...caller, profile: { ...caller.profile, active: undefined } } as unknown as AuthedCaller);
    await expect(requireAssistant(new Request('https://example.com'))).rejects.toMatchObject({ status: 403 });
  });
  it('lets an admin preview an assistant read-only through the View As header, from her live profile', async () => {
    const admin = { uid: 'owner', role: 'admin', email: 'owner@example.com', profile: { active: true, role: 'admin', displayName: 'Owner' } } as AuthedCaller;
    vi.mocked(requireRole).mockResolvedValue(admin);
    const preview = (method = 'GET', uid = 'assistant') => new Request('https://example.com', { method, headers: { 'X-View-As': uid } });
    // No header: an admin token on its own is not an assistant.
    await expect(requireAssistant(new Request('https://example.com'))).rejects.toMatchObject({ status: 403 });
    const context = await requireAssistant(preview());
    expect(context).toEqual({ caller: expect.objectContaining({ uid: 'assistant', role: 'va' }), grant, preview: { adminUid: 'owner' } });
    expect((await listAssistantClients(context)).clients.map(c => c.id)).toEqual(['gapp1']);
    // Reads only: the header never unlocks a write, on the guard or the services.
    await expect(requireAssistant(preview('PATCH'))).rejects.toMatchObject({ status: 403 });
    await expect(updateAssistantClient(context, 'gapp1', await patch({ name: 'Renamed' }))).rejects.toMatchObject({ status: 403 });
    await expect(uploadAssistantDocument(context, 'gapp1', new File(['x'], 'a.pdf', { type: 'application/pdf' }), { title: 'T', category: 'Other', docDate: '' })).rejects.toMatchObject({ status: 403 });
    expect(fake.writes).toEqual([]);
    expect(fake.object.save).not.toHaveBeenCalled();
    // The previewed account must be a live, active, granted assistant.
    await expect(requireAssistant(preview('GET', 'owner'))).rejects.toMatchObject({ status: 403 });
    await expect(requireAssistant(preview('GET', 'nobody'))).rejects.toMatchObject({ status: 403 });
    fake.records.set('users/nurse', { active: true, role: 'nurse', displayName: 'Nurse' });
    await expect(requireAssistant(preview('GET', 'nurse'))).rejects.toMatchObject({ status: 403 });
    fake.records.set('users/assistant', { ...caller.profile, active: false });
    await expect(requireAssistant(preview())).rejects.toMatchObject({ status: 403 });
    fake.records.set('users/assistant', caller.profile as unknown as Record<string, unknown>);
    vi.mocked(getServerSettings).mockResolvedValue({ ...DEFAULT_SETTINGS, assistantClients: { grants: [] } });
    await expect(requireAssistant(preview())).rejects.toMatchObject({ status: 403, message: expect.stringContaining('Assistant Client Access') });
  });
  it('lists only GAPP clients and never projects diagnoses, clinical instructions or contact notes', async () => {
    expect((await listAssistantClients(context)).clients.map(c => c.id)).toEqual(['gapp1']);
    const data = await getAssistantClient(context, 'gapp1');
    const serialized = JSON.stringify(data);
    expect(serialized).toContain('123456'); expect(serialized).toContain('Parent');
    for (const prohibited of ['diagnosis', 'assignedNurseIds', 'allergies', 'diet', 'vitalsBaselines', 'decisionMaker', 'notes']) expect(serialized).not.toContain(prohibited);
    await expect(getAssistantClient(context, 'other')).rejects.toMatchObject({ status: 404 });
  });
  it('permits all programs only with an explicit all-program grant', async () => {
    expect((await listAssistantClients({ ...context, grant: { ...grant, scope: 'all' } })).clients).toHaveLength(2);
  });
});
describe('safe information updates', () => {
  it.each(['program', 'diagnosis', 'requiresMar', 'assignedNurseIds', 'authorizations', 'allergies', 'vitalsBaselines', 'updatedBy'])('rejects protected field %s', field => {
    expect(() => validateAdministrativePatch({ revision: 'a'.repeat(64), [field]: 'changed' })).toThrow('administrative');
  });
  it('validates real dates and rejects forged contact notes or missing contact identity', () => {
    expect(() => validateAdministrativePatch({ revision: 'a'.repeat(64), dob: '2026-02-30' })).toThrow('birth date');
    expect(() => validateAdministrativePatch({ revision: 'a'.repeat(64), guardianContacts: [{ id: 'mother', name: 'Name', role: 'Parent', phone: '555', notes: 'changed' }] })).toThrow('contact details');
    expect(() => validateAdministrativePatch({ revision: 'a'.repeat(64), guardianContacts: [{ name: 'Name', role: 'Parent', phone: '555' }] })).toThrow('identifier');
  });
  it('preserves clinical fields, guardian notes and legal decision maker, and audits the actual caller', async () => {
    await updateAssistantClient(context, 'gapp1', await patch({ name: 'Changed', medicaidId: '999', guardianContacts: [{ id: 'mother', role: 'Parent', name: 'Parent', phone: '5559998888' }] }));
    expect(fake.records.get('patients/gapp1')).toMatchObject({ name: 'Changed', program: 'gapp', requiresMar: true, assignedNurseIds: ['nurse'] });
    expect(fake.records.get('patients/gapp1/clinical/profile')).toMatchObject({ medicaidId: '999', allergies: 'Hidden', diet: 'Hidden' });
    expect(fake.records.get('patients/gapp1/clinical/guardian')).toMatchObject({ decisionMaker: 'parent', contacts: [expect.objectContaining({ phone: '5559998888', notes: 'Hidden notes' })] });
    const audit = fake.writes.find(w => w.path.includes('/administrativeAudit/'));
    expect(audit?.data).toMatchObject({ actorUid: 'assistant', actorRole: 'va', before: { name: 'Client', medicaidId: '123456' }, after: { name: 'Changed', medicaidId: '999' } });
  });
  it('blocks stale saves and does not overwrite another staff edit', async () => {
    const input = await patch({ name: 'Changed' });
    fake.records.set('patients/gapp1', { ...fake.records.get('patients/gapp1'), _version: 2, name: 'Staff change' });
    await expect(updateAssistantClient(context, 'gapp1', input)).rejects.toMatchObject({ status: 409 });
    expect(fake.writes).toHaveLength(0);
  });
  it.each(['revoked', 'inactive', 'role-changed', 'program-changed'])('rechecks %s inside the write transaction', async condition => {
    const input = await patch({ name: 'Changed' });
    if (condition === 'revoked') fake.records.set('settings/global', { assistantClients: { grants: [] } });
    if (condition === 'inactive') fake.records.set('users/assistant', { ...caller.profile, active: false });
    if (condition === 'role-changed') fake.records.set('users/assistant', { ...caller.profile, role: 'nurse' });
    if (condition === 'program-changed') fake.records.set('patients/gapp1', { ...fake.records.get('patients/gapp1'), program: 'now-comp' });
    await expect(updateAssistantClient(context, 'gapp1', input)).rejects.toMatchObject({ status: condition === 'program-changed' ? 404 : 403 });
    expect(fake.writes).toHaveLength(0);
  });
  it('preserves the required parent role even when contact details are editable', async () => {
    await expect(updateAssistantClient(context, 'gapp1', await patch({ guardianContacts: [{ id: 'mother', role: 'Other', name: 'Parent', phone: '5551234567' }] }))).rejects.toMatchObject({ status: 400 });
    expect(fake.writes).toHaveLength(0);
  });
  it('requires the edit grant and prevents removing established guardian contacts', async () => {
    await expect(updateAssistantClient({ ...context, grant: { ...grant, editInfo: false } }, 'gapp1', await patch({ name: 'Changed' }))).rejects.toMatchObject({ status: 403 });
    await expect(updateAssistantClient(context, 'gapp1', await patch({ guardianContacts: [] }))).rejects.toMatchObject({ status: 400 });
    expect(fake.writes).toHaveLength(0);
  });
});
describe('document access', () => {
  const file = () => new File(['%PDF-1.7'], 'letter.pdf', { type: 'application/pdf' });
  const details = { title: 'Authorization', category: 'Authorization / Letter of Notification', docDate: '2026-10-15' };
  it('rejects executable types, invalid category, invalid dates and oversized documents', () => {
    expect(() => validateAssistantUpload(new File(['<html>'], 'x.html', { type: 'text/html' }), 'Title', 'Other', '')).toThrow('PDF');
    expect(() => validateAssistantUpload(file(), 'Title', 'made up', '')).toThrow('category');
    expect(() => validateAssistantUpload(file(), 'Title', 'Other', '2026-02-30')).toThrow('date');
    expect(() => validateAssistantUpload({ size: 20 * 1024 * 1024 } as File, 'Title', 'Other', '')).toThrow('20 MB');
  });
  it('rejects future document dates using agency time, including before midnight in New York', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-16T01:00:00Z'));
      expect(() => validateAssistantUpload(file(), 'Title', 'Other', '2026-10-16')).toThrow('future');
      expect(() => validateAssistantUpload(file(), 'Title', 'Other', '2099-01-01')).toThrow('future');
      expect(validateAssistantUpload(file(), 'Title', 'Other', '2026-10-15').docDate).toBe('2026-10-15');
      expect(validateAssistantUpload(file(), 'Title', 'Other', '').docDate).toBe('');
    } finally { vi.useRealTimers(); }
  });
  it('uploads immutable bytes and records caller identity in document and audit', async () => {
    const result = await uploadAssistantDocument(context, 'gapp1', file(), details);
    expect(fake.object.save).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ preconditionOpts: { ifGenerationMatch: 0 } }));
    const create = fake.writes.find(w => w.method === 'create');
    expect(create?.data).toMatchObject({ patientId: 'gapp1', uploadedBy: 'assistant', uploadedByRole: 'va', archived: false });
    expect(fake.writes.find(w => w.path.includes('/administrativeAudit/'))?.data).toMatchObject({ actorUid: 'assistant', action: 'assistant-document-upload' });
    expect(result.document).not.toHaveProperty('storagePath');
  });
  it('denies unauthorized upload and removes orphaned bytes if access is revoked mid-upload', async () => {
    await expect(uploadAssistantDocument({ ...context, grant: { ...grant, uploadDocuments: false } }, 'gapp1', file(), details)).rejects.toMatchObject({ status: 403 });
    expect(fake.object.save).not.toHaveBeenCalled();
    fake.object.save.mockImplementationOnce(async () => { fake.records.set('settings/global', { assistantClients: { grants: [] } }); });
    await expect(uploadAssistantDocument(context, 'gapp1', file(), details)).rejects.toMatchObject({ status: 403 });
    expect(fake.object.delete).toHaveBeenCalledWith({ ignoreNotFound: true }); expect(fake.writes).toHaveLength(0);
  });
  it('denies cross-client IDs, tampered paths, archived files and unsafe metadata MIME', async () => {
    const data = { patientId: 'other', storagePath: 'patients/other/documents/d1/letter.pdf', contentType: 'application/pdf' };
    fake.records.set('patientDocuments/d1', data);
    await expect(readAssistantDocument(context, 'gapp1', 'd1')).rejects.toMatchObject({ status: 404 });
    fake.records.set('patientDocuments/d1', { ...data, patientId: 'gapp1' });
    await expect(readAssistantDocument(context, 'gapp1', 'd1')).rejects.toMatchObject({ status: 404 });
    fake.records.set('patientDocuments/d1', { ...data, patientId: 'gapp1', storagePath: 'patients/gapp1/documents/d1/letter.pdf', archived: true });
    await expect(readAssistantDocument(context, 'gapp1', 'd1')).rejects.toMatchObject({ status: 404 });
    expect(fake.file).not.toHaveBeenCalled();
    fake.records.set('patientDocuments/d1', { ...data, patientId: 'gapp1', storagePath: 'patients/gapp1/documents/d1/letter.pdf', contentType: 'text/html' });
    expect((await readAssistantDocument(context, 'gapp1', 'd1')).contentType).toBe('application/pdf');
    fake.object.getMetadata.mockResolvedValueOnce([{ contentType: 'text/html', size: 10 }]);
    expect((await readAssistantDocument(context, 'gapp1', 'd1')).contentType).toBe('application/octet-stream');
  });
});
