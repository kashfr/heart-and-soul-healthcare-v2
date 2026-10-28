import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const req=createRequire(import.meta.url);
const {initializeApp,deleteApp}=req('firebase-admin/app');
const {getFirestore,FieldValue}=req('firebase-admin/firestore');
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8184'||process.env.GCLOUD_PROJECT!=='demo-client-access')throw new Error('Local demo emulator only');
const fixture='undo-'+randomUUID();const app=initializeApp({projectId:'demo-client-access'},fixture);const db=getFirestore(app);
const mocks=vi.hoisted(()=>({db:null as unknown}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/firebaseAdmin',()=>({adminDb:()=>mocks.db,adminBucket:()=>{throw new Error('No Storage access');}}));
import {listClientActivity,listAllClientActivity,undoClientActivity} from '@/lib/clientActivityServer';
import type {AuthedCaller} from '@/lib/adminAuthGuard';
mocks.db=db;
const admin={uid:fixture+'-owner',email:'owner@example.invalid',role:'admin',profile:{active:true,role:'admin',displayName:'Emulator Owner'}} as AuthedCaller;
const grant={uid:fixture,scope:'gapp' as const,editInfo:true,uploadDocuments:true};
const assistant={caller:{uid:fixture,email:'va@example.invalid',role:'va',profile:{active:true,role:'va',displayName:'Emulator VA'}},grant};
const patient=db.doc('patients/'+fixture);let oldSettings:unknown;
beforeAll(async()=>{
 oldSettings=(await db.doc('settings/global').get()).data();
 await db.doc('settings/global').set({assistantClients:{grants:[grant]}},{merge:true});
 await db.doc('users/'+fixture).set(assistant.caller.profile);await db.doc('users/'+admin.uid).set(admin.profile);
 await patient.set({name:'Original',dob:'2016-01-01',program:'gapp',diagnosis:'Keep'});
 await patient.collection('clinical').doc('profile').set({medicaidId:'111',allergies:'Keep'});
});
afterAll(async()=>{
 await db.recursiveDelete(patient);await db.doc('users/'+fixture).delete();await db.doc('users/'+admin.uid).delete();await db.doc('patientDocuments/'+fixture).delete();
 if(oldSettings)await db.doc('settings/global').set(oldSettings);else await db.doc('settings/global').delete();await deleteApp(app);
});
it('lists real audit events, safely reverses values and upload metadata, and blocks stale/repeated undo',async()=>{
 // The assistant's edit, as the retired assistant API recorded it: the change
 // and its audit entry in one commit, stamped with the entry's id.
 const assistantEdit=async(before:Record<string,unknown>,after:Record<string,unknown>)=>{
  const entry=patient.collection('administrativeAudit').doc();
  await db.runTransaction(async(tx: import('firebase-admin/firestore').Transaction)=>{
   const stamp={auditEventId:entry.id,updatedAt:FieldValue.serverTimestamp(),updatedBy:fixture,updatedByName:'Emulator VA'};
   if('name' in after)tx.update(patient,{name:String(after.name),...stamp});
   if('medicaidId' in after)tx.set(patient.collection('clinical').doc('profile'),{medicaidId:String(after.medicaidId),...stamp},{merge:true});
   tx.set(entry,{action:'assistant-information-update',before,after,actorUid:fixture,actorName:'Emulator VA',actorRole:'va',at:FieldValue.serverTimestamp()});
  });
 };
 await assistantEdit({name:'Original',medicaidId:'111'},{name:'Changed',medicaidId:'222'});
 let log=await listClientActivity(fixture);expect(log.entries).toHaveLength(1);
 const id=log.entries[0].id;expect(log.entries[0].actorName).toBe('Emulator VA');
 await undoClientActivity(fixture,id,admin);
 expect((await patient.get()).data()).toMatchObject({name:'Original',diagnosis:'Keep'});
 expect((await patient.collection('clinical').doc('profile').get()).data()).toMatchObject({medicaidId:'111',allergies:'Keep'});
 expect((await listClientActivity(fixture)).entries).toHaveLength(2);
 await expect(undoClientActivity(fixture,id,admin)).rejects.toMatchObject({status:409});
 await assistantEdit({name:'Original'},{name:'Changed again'});
 log=await listClientActivity(fixture);const second=log.entries.find(x=>x.action==='assistant-information-update'&&!x.revertedAt)!;
 await patient.update({name:'Newer'});await patient.update({name:'Changed again'});
 await expect(undoClientActivity(fixture,second.id,admin)).rejects.toMatchObject({status:409});
 const upload=patient.collection('administrativeAudit').doc();const doc=db.doc('patientDocuments/'+fixture);
 await db.runTransaction(async(tx: import('firebase-admin/firestore').Transaction)=>{
  tx.create(doc,{patientId:fixture,uploadedBy:fixture,title:'Test upload',archived:false,storagePath:'keep/file.pdf'});
  tx.create(upload,{action:'assistant-document-upload',actorUid:fixture,documentId:fixture,at:FieldValue.serverTimestamp(),after:{title:'Test upload'}});
 });
 await undoClientActivity(fixture,upload.id,admin);
 expect((await doc.get()).data()).toMatchObject({archived:true,storagePath:'keep/file.pdf'});
});

it('paginates history without skipping entries sharing a timestamp',async()=>{
 const batch=db.batch();
 for(let i=0;i<55;i++)batch.set(patient.collection('administrativeAudit').doc('page'+String(i).padStart(2,'0')),{action:'admin-undo',actorName:'Owner',at:FieldValue.serverTimestamp()});
 await batch.commit();
 const first=await listClientActivity(fixture);expect(first.entries).toHaveLength(50);expect(first.nextCursor).toBeTruthy();
 const second=await listClientActivity(fixture,first.nextCursor);expect(second.entries.length).toBeGreaterThan(0);
 const all=[...first.entries,...second.entries].map(e=>e.id);expect(new Set(all).size).toBe(all.length);
 expect((await patient.collection('administrativeAudit').get()).size).toBe(all.length);
});


it('combines clients, filters by actor, paginates tied timestamps, and rejects mismatched cursors', async () => {
 const other = db.doc('patients/' + fixture + '-other');
 const actor = fixture + '-global';
 try {
  await other.set({name:'Second client'});
  const batch = db.batch();
  for (let i=0;i<55;i++) batch.set((i%2 ? patient : other).collection('administrativeAudit').doc(actor + i), {
   actorUid:actor,actorName:'Global assistant',action:'assistant-information-update',at:FieldValue.serverTimestamp(),before:{city:'Old'},after:{city:'New'},
  });
  await batch.commit();
  const first = await listAllClientActivity(actor);
  expect(first.entries).toHaveLength(50);
  expect(new Set(first.entries.map(e=>e.patientId)).size).toBe(2);
  expect(first.entries.find(e=>e.patientId===other.id)).toMatchObject({patientName:'Second client',patientExists:true});
  const second = await listAllClientActivity(actor,first.nextCursor);
  expect(second.entries).toHaveLength(5);expect(second.nextCursor).toBeNull();
  expect(new Set([...first.entries,...second.entries].map(e=>e.patientId+':'+e.id)).size).toBe(55);
  expect([...first.entries,...second.entries].every(e=>e.actorUid===actor)).toBe(true);
  await expect(listAllClientActivity(fixture,first.nextCursor)).rejects.toMatchObject({status:400});
  await expect(listAllClientActivity(actor,'bad')).rejects.toMatchObject({status:400});
  await expect(listAllClientActivity(actor,'bad:missing')).rejects.toMatchObject({status:400});
  const all = await listAllClientActivity();
  expect(all.entries.length).toBeGreaterThan(0);
  expect(all.staff.find(s=>s.uid===fixture)).toMatchObject({name:'Emulator VA',active:true});
  await other.delete();
  const deleted = await listAllClientActivity(actor);
  expect(deleted.entries.find(e=>e.patientId===other.id)).toMatchObject({patientExists:false,patientName:'Unavailable client'});
 } finally { await db.recursiveDelete(other); }
});

it('captures database events with verified staff identity and serializes all changed fields',async()=>{
 const {capture}=req('../functions/audit.js');
 const {Timestamp}=req('firebase-admin/firestore');
 const before=await patient.get();await patient.update({diagnosis:'Synthetic revised diagnosis'});const after=await patient.get();
 const event={id:fixture+'-capture',document:patient.path,authType:'unknown',authId:admin.uid,time:new Date().toISOString(),data:{before,after}};
 await capture(event,db,Timestamp);await capture(event,db,Timestamp);
 const entries=(await listAllClientActivity(admin.uid)).entries.filter(e=>e.action==='record-updated'&&e.patientId===fixture);
 expect(entries).toHaveLength(1);expect(entries[0]).toMatchObject({actorName:'Emulator Owner',recordLabel:'Client information',before:{diagnosis:'Keep'},after:{diagnosis:'Synthetic revised diagnosis'}});
 await expect(undoClientActivity(fixture,entries[0].id,admin)).rejects.toMatchObject({status:400});
});

it('combines client, actor and inclusive Eastern dates across all pages', async () => {
 const ref=db.doc('patients/'+fixture+'-filtered');
 const other=db.doc('patients/'+fixture+'-other');
 const actor=fixture+'-filter-actor';
 try {
  await ref.set({name:'Filter client'}); await other.set({name:'Other client'});
  const batch=db.batch();
  for(let i=0;i<55;i++)batch.set(ref.collection('administrativeAudit').doc('filter'+i),{actorUid:actor,at:new Date('2026-11-01T04:00:00Z')});
  batch.set(ref.collection('administrativeAudit').doc('before'),{actorUid:actor,at:new Date('2026-11-01T03:59:59Z')});
  batch.set(ref.collection('administrativeAudit').doc('after'),{actorUid:actor,at:new Date('2026-11-02T05:00:00Z')});
  batch.set(ref.collection('administrativeAudit').doc('last'),{actorUid:actor,at:new Date('2026-11-02T04:59:59.999Z')});
  batch.set(ref.collection('administrativeAudit').doc('wrong-actor'),{actorUid:'someone-else',at:new Date('2026-11-01T12:00:00Z')});
  batch.set(other.collection('administrativeAudit').doc('wrong-client'),{actorUid:actor,at:new Date('2026-11-01T12:00:00Z')});
  await batch.commit();
  const filters={client:ref.id,from:'2026-11-01',through:'2026-11-01'};
  const first=await listAllClientActivity(actor,null,filters);
  const second=await listAllClientActivity(actor,first.nextCursor,filters);
  expect(first.entries).toHaveLength(50);
  expect(second.entries).toHaveLength(6);
  expect(new Set([...first.entries,...second.entries].map(e=>e.id)).size).toBe(56);
  expect(first.clients).toContainEqual({id:ref.id,name:'Filter client'});
  await expect(listAllClientActivity(actor,first.nextCursor,{...filters,client:other.id})).rejects.toMatchObject({status:400});
  await expect(listAllClientActivity(actor,first.nextCursor,{...filters,from:'2026-11-02',through:'2026-11-02'})).rejects.toMatchObject({status:400});
  await expect(listAllClientActivity(actor,null,{from:'bad'})).rejects.toMatchObject({status:400});
  const global=await listAllClientActivity(actor,null,{from:'2026-11-01',through:'2026-11-01'});
  expect(global.entries.some(e=>e.id==='wrong-client')).toBe(true);
 } finally {await db.recursiveDelete(ref);await db.recursiveDelete(other);}
});

it('undoes captured admin and supervisor basic edits without touching clinical fields; blocks later writes', async()=>{
 const {capture}=req('../functions/audit.js');const {Timestamp}=req('firebase-admin/firestore');
 const ref=db.doc('patients/'+fixture+'-staff-undo');
 const supervisor=fixture+'-supervisor';await db.doc('users/'+supervisor).set({role:'supervisor',displayName:'Supervisor',active:true});
 let seq=0;
 async function change(target: typeof ref, patch: Record<string,unknown>, uid=admin.uid) {
  const before=await target.get();await target.set(patch,{merge:true});const after=await target.get();
  await capture({id:fixture+'-undo-'+(++seq),document:target.path,authType:'unknown',authId:uid,time:new Date().toISOString(),data:{before,after}},db,Timestamp);
  const log=await listClientActivity(ref.id);
  return log.entries.find(e=>e.action==='record-updated'&&!e.revertedAt)!;
 }
 try {
  await ref.set({name:'Before',program:'gapp',diagnosis:'Original'});
  let entry=await change(ref,{name:'After',diagnosis:'New clinical value'},supervisor);
  await undoClientActivity(ref.id,entry.id,admin);
  expect((await ref.get()).data()).toMatchObject({name:'Before',diagnosis:'New clinical value'});
  await expect(undoClientActivity(ref.id,entry.id,admin)).rejects.toMatchObject({status:409});
  entry=await change(ref,{city:'New city'});
  await undoClientActivity(ref.id,entry.id,admin);
  expect((await ref.get()).data()).not.toHaveProperty('city');
  await ref.update({city:null});
  entry=await change(ref,{city:'City from null'});
  await undoClientActivity(ref.id,entry.id,admin);
  expect((await ref.get()).data()?.city).toBeNull();
  entry=await change(ref,{city:FieldValue.delete()});
  await undoClientActivity(ref.id,entry.id,admin);
  expect((await ref.get()).data()).toHaveProperty('city',null);
  entry=await change(ref,{name:'Later'});
  await ref.update({name:'Other'});await ref.update({name:'Later'});
  await expect(undoClientActivity(ref.id,entry.id,admin)).rejects.toMatchObject({status:409});
  const profile=ref.collection('clinical').doc('profile');await profile.set({medicaidId:'111',allergies:'None'});
  entry=await change(profile,{medicaidId:'222',allergies:'Keep this allergy'});
  await undoClientActivity(ref.id,entry.id,admin);
  expect((await profile.get()).data()).toMatchObject({medicaidId:'111',allergies:'Keep this allergy'});
  const guardian=ref.collection('clinical').doc('guardian');
  const contact={id:'parent',role:'Parent',name:'Parent',phone:'555-555-0100',notes:'Keep notes'};
  await guardian.set({decisionMaker:'parent',contacts:[contact]});
  entry=await change(guardian,{contacts:[{...contact,phone:'555-555-0200'}]},supervisor);
  await undoClientActivity(ref.id,entry.id,admin);
  expect((await guardian.get()).data()?.contacts).toEqual([contact]);
 } finally {await db.recursiveDelete(ref);await db.doc('users/'+supervisor).delete();}
});

it('archives captured staff uploads and rejects changed, moved and clinical records',async()=>{
 const {capture}=req('../functions/audit.js');const {Timestamp}=req('firebase-admin/firestore');
 const ref=db.doc('patientDocuments/'+fixture+'-staff-upload');
 try {
  const before=await ref.get();await ref.set({patientId:fixture,title:'Synthetic upload',storagePath:'preserved/test.pdf',uploadedBy:admin.uid,archived:false});
  const after=await ref.get();
  await capture({id:fixture+'-upload',document:ref.path,authType:'unknown',authId:admin.uid,time:new Date().toISOString(),data:{before,after}},db,Timestamp);
  const entry=(await listClientActivity(fixture)).entries.find(e=>e.sourcePath===ref.path)!;
  await expect(undoClientActivity(fixture+'-wrong',entry.id,admin)).rejects.toMatchObject({status:404});
  await undoClientActivity(fixture,entry.id,admin);
  expect((await ref.get()).data()).toMatchObject({archived:true,storagePath:'preserved/test.pdf'});
  await expect(undoClientActivity(fixture,entry.id,admin)).rejects.toMatchObject({status:409});
  // A later metadata edit must block the exact original creation event.
  const audit=patient.collection('administrativeAudit').doc('stale-upload');
  await audit.set({action:'record-created',actorRole:'supervisor',sourcePath:ref.path,at:after.updateTime,before:{},after:after.data()});
  await expect(undoClientActivity(fixture,audit.id,admin)).rejects.toMatchObject({status:409});
 } finally {await ref.delete();}
});

it('filters legacy and captured change types with sparse pagination and combined filters',async()=>{
 const ref=db.doc('patients/'+fixture+'-types');const actor=fixture+'-types';
 try {
  await ref.set({name:'Types client'});
  const batch=db.batch();
  for(let i=0;i<120;i++)batch.set(ref.collection('administrativeAudit').doc('event'+String(i).padStart(3,'0')),{actorUid:actor,action:i%2?'record-created':'assistant-document-upload',sourcePath:i%2?'progressNotes/clinical':'',at:new Date('2026-10-15T12:00:00Z')});
  batch.set(ref.collection('administrativeAudit').doc('captured-upload'),{actorUid:actor,action:'record-created',sourcePath:'patientDocuments/file',at:new Date('2026-10-15T12:00:00Z')});
  batch.set(ref.collection('administrativeAudit').doc('info'),{actorUid:actor,action:'record-updated',sourcePath:ref.path,at:new Date('2026-10-15T12:00:00Z')});
  batch.set(ref.collection('administrativeAudit').doc('undo'),{actorUid:actor,action:'admin-undo',at:new Date('2026-10-15T12:00:00Z')});
  await batch.commit();
  const filters={client:ref.id,from:'2026-10-15',through:'2026-10-15',type:'uploads'};
  const first=await listAllClientActivity(actor,null,filters);const second=await listAllClientActivity(actor,first.nextCursor,filters);
  expect(first.entries).toHaveLength(50);expect(second.entries).toHaveLength(11);
  expect(new Set([...first.entries,...second.entries].map(e=>e.id)).size).toBe(61);
  expect((await listAllClientActivity(actor,null,{...filters,type:'information'})).entries.map(e=>e.id)).toEqual(['info']);
  expect((await listAllClientActivity(actor,null,{type:'undo'})).entries.map(e=>e.id)).toEqual(['undo']);
  await expect(listAllClientActivity(actor,null,{type:'unknown'})).rejects.toMatchObject({status:400});
 } finally {await db.recursiveDelete(ref);}
});

it('returns a continuation when a sparse type search reaches its scan budget',async()=>{
 const ref=db.doc('patients/'+fixture+'-sparse');
 try {
  await ref.set({name:'Sparse test'});
  for(let offset=0;offset<520;offset+=260){
   const batch=db.batch();
   for(let i=offset;i<offset+260;i++)batch.set(ref.collection('administrativeAudit').doc('noise'+i),{action:'record-created',sourcePath:'progressNotes/note',at:new Date('2026-10-15T12:00:00Z')});
   await batch.commit();
  }
  await ref.collection('administrativeAudit').doc('match').set({action:'record-created',sourcePath:'patientDocuments/doc',at:new Date('2026-10-14T12:00:00Z')});
  const filters={client:ref.id,type:'uploads'};
  const first=await listAllClientActivity(null,null,filters);
  expect(first.entries).toHaveLength(0);expect(first.nextCursor).toBeTruthy();
  const second=await listAllClientActivity(null,first.nextCursor,filters);
  expect(second.entries.map(e=>e.id)).toEqual(['match']);expect(second.nextCursor).toBeNull();
 } finally {await db.recursiveDelete(ref);}
});
