// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
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
vi.mock('./firebaseAdmin', () => ({ adminDb: () => fake.db }));
vi.mock('./assistantClientsServer', () => ({ assertAssistantId: (id: string) => { if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Invalid identifier'); }, AssistantClientError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
vi.mock('./adminAuthGuard', () => ({ requireRole: vi.fn(), AdminAuthError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
import { type AuthedCaller, requireRole } from './adminAuthGuard';
import { undoClientActivity, requireActivityAdmin } from './clientActivityServer';
const caller = { uid: 'owner', role: 'admin', email: 'owner@example.com', profile: { active: true, role: 'admin', displayName: 'Owner' } } as AuthedCaller;
const path='patients/client/administrativeAudit/change';
const at={seconds:1,nanoseconds:0};
beforeEach(()=>{
 vi.clearAllMocks();fake.records.clear();fake.writes.length=0;
 fake.records.set('users/owner',caller.profile as unknown as Record<string,unknown>);
 fake.records.set('patients/client',{name:'New name',dob:'2016-01-01',program:'gapp',diagnosis:'Protected',assignedNurseIds:['nurse']});
 fake.records.set('patients/client/clinical/profile',{medicaidId:'222',allergies:'Protected'});
 fake.records.set(path,{action:'assistant-information-update',actorUid:'rosita',actorName:'Rosita Lee',at,before:{name:'Old name',dob:'2016-01-01',medicaidId:'111'},after:{name:'New name',dob:'2016-01-01',medicaidId:'222'}});
});
it('restores changed values, preserves unrelated data, and audits the admin',async()=>{
 await undoClientActivity('client','change',caller);
 expect(fake.records.get('patients/client')).toMatchObject({name:'Old name',diagnosis:'Protected',assignedNurseIds:['nurse']});
 expect(fake.records.get('patients/client/clinical/profile')).toMatchObject({medicaidId:'111',allergies:'Protected'});
 expect(fake.records.get(path)).toMatchObject({revertedBy:'owner',revertedByName:'Owner'});
 const reversal=fake.writes.find(w=>w.method==='create');
 expect(reversal?.data).toMatchObject({action:'admin-undo',actorUid:'owner',originalActivityId:'change',before:{name:'New name',medicaidId:'222'},after:{name:'Old name',medicaidId:'111'}});
 expect((reversal?.data.after as Record<string,unknown>).dob).toBeUndefined();
});
it.each(['newer-write','changed-value','already-undone','inactive','not-admin'])('blocks %s without writing',async(condition)=>{
 if(condition==='newer-write')fake.records.set('patients/client',{...fake.records.get('patients/client'),_version:2});
 if(condition==='changed-value')fake.records.set('patients/client',{...fake.records.get('patients/client'),name:'Someone else'});
 if(condition==='already-undone')fake.records.set(path,{...fake.records.get(path),revertedAt:at});
 if(condition==='inactive')fake.records.set('users/owner',{role:'admin',active:false});
 if(condition==='not-admin')fake.records.set('users/owner',{role:'va',active:true});
 await expect(undoClientActivity('client','change',caller)).rejects.toMatchObject({status:['inactive','not-admin'].includes(condition)?403:409});
 expect(fake.writes).toHaveLength(0);
});
it('will not undo a reversal or an unchanged save',async()=>{
 fake.records.set(path,{...fake.records.get(path),action:'admin-undo'});
 await expect(undoClientActivity('client','change',caller)).rejects.toMatchObject({status:400});
 fake.records.set(path,{...fake.records.get(path),action:'assistant-information-update',before:{name:'New name'},after:{name:'New name'}});
 await expect(undoClientActivity('client','change',caller)).rejects.toMatchObject({status:400});
 expect(fake.writes).toHaveLength(0);
});
it('archives an upload without deleting its metadata or file',async()=>{
 const after={title:'Letter',category:'Other',fileName:'letter.pdf',size:100,docDate:'2026-10-15'};
 fake.records.set(path,{action:'assistant-document-upload',actorUid:'rosita',documentId:'doc1',at,after});
 fake.records.set('patientDocuments/doc1',{...after,patientId:'client',uploadedBy:'rosita',archived:false,storagePath:'original/file.pdf'});
 await undoClientActivity('client','change',caller);
 expect(fake.records.get('patientDocuments/doc1')).toMatchObject({archived:true,archivedBy:'owner',storagePath:'original/file.pdf'});
});
it.each(['moved','modified','archived'])('refuses to archive a %s upload',async(condition)=>{
 const after={title:'Letter'};
 fake.records.set(path,{action:'assistant-document-upload',actorUid:'rosita',documentId:'doc1',at,after});
 fake.records.set('patientDocuments/doc1',{title:condition==='modified'?'Changed':'Letter',patientId:condition==='moved'?'other':'client',uploadedBy:'rosita',archived:condition==='archived'});
 await expect(undoClientActivity('client','change',caller)).rejects.toMatchObject({status:409});
 expect(fake.writes).toHaveLength(0);
});
it('restores contacts while preserving legal decision maker and contact notes',async()=>{
 const contact={id:'parent',role:'Parent',name:'Parent',relationship:'Mother',phone:'5551234567',email:'',address:''};
 fake.records.set(path,{action:'assistant-information-update',at,before:{guardianContacts:[contact]},after:{guardianContacts:[{...contact,phone:'5559999999'}]}});
 fake.records.set('patients/client/clinical/guardian',{decisionMaker:'parent',contacts:[{...contact,phone:'5559999999',notes:'Protected note'}]});
 await undoClientActivity('client','change',caller);
 expect(fake.records.get('patients/client/clinical/guardian')).toMatchObject({decisionMaker:'parent',contacts:[{...contact,notes:'Protected note'}]});
});
it('requires active admin at the route guard',async()=>{
 vi.mocked(requireRole).mockResolvedValue({...caller,profile:{...caller.profile,active:false}});
 await expect(requireActivityAdmin(new Request('https://example.com'))).rejects.toMatchObject({status:403});
 expect(requireRole).toHaveBeenCalledWith(expect.any(Request),['admin']);
});

it('uses the audit commit timestamp rather than the displayed server timestamp',async()=>{
 fake.records.set(path,{...fake.records.get(path),at:{seconds:0,nanoseconds:999000000}});
 await undoClientActivity('client','change',caller);
 expect(fake.records.get('patients/client')?.name).toBe('Old name');
});
it('undoes an assistant diagnosis edit on the roster record and an allergy edit on the profile',async()=>{
 fake.records.set('patients/client',{...fake.records.get('patients/client'),diagnosis:'F84.0'});
 fake.records.set('patients/client/clinical/profile',{medicaidId:'222',allergies:'Penicillin'});
 fake.records.set(path,{action:'assistant-information-update',actorUid:'rosita',at,before:{diagnosis:'',allergies:'NKDA'},after:{diagnosis:'F84.0',allergies:'Penicillin'}});
 await undoClientActivity('client','change',caller);
 expect(fake.records.get('patients/client')).toMatchObject({diagnosis:''});
 expect(fake.records.get('patients/client/clinical/profile')).toMatchObject({allergies:'NKDA'});
 expect(fake.records.get('patients/client/clinical/profile')).not.toHaveProperty('diagnosis');
});
it('keeps assistant card and authorization saves review-only',async()=>{
 fake.records.set(path,{action:'assistant-record-update',record:'physicians',actorUid:'rosita',at,before:{list:[]},after:{list:[{id:'p1',name:'Dr. Soto'}]}});
 await expect(undoClientActivity('client','change',caller)).rejects.toMatchObject({status:400});
 expect(fake.writes).toHaveLength(0);
});
