const {test}=require('node:test');const assert=require('node:assert/strict');
const {capture,changes,targets,actorCandidate}=require('./audit');
const {Timestamp}=require('firebase-admin/firestore');
const stamp=Timestamp.now();
function fixture({before={name:'Old'},after={name:'New'},path='patients/client',authType='unknown',authId='admin'}={}){
 const writes=new Map(),records=new Map([['users/admin',{displayName:'Owner',role:'admin'}],['users/supervisor',{displayName:'Supervisor',role:'supervisor'}],['patients/client',{name:'New'}]]);
 const snap=(data)=>({exists:data!==null,data:()=>data,updateTime:stamp,ref:{path}});
 const event={id:'event-1',document:path,time:stamp.toDate().toISOString(),authType,authId,data:{before:snap(before),after:snap(after)}};
 const db={doc(path){return {async get(){const d=records.get(path);return {exists:!!d,data:()=>d,updateTime:stamp};},async create(d){if(writes.has(path))throw {code:6};writes.set(path,d);}}}};
 return {event,db,writes,records};
}
test('captures authenticated admin and supervisor edits and ignores forged actor metadata',async()=>{
 for(const uid of ['admin','supervisor']){const f=fixture({authId:uid,after:{name:'New',_auditActor:{uid:'someone-else',nonce:'fake'}}});await capture(f.event,f.db,Timestamp);assert.equal(f.writes.size,1);const entry=[...f.writes.values()][0];assert.equal(entry.actorUid,uid);assert.deepEqual(entry.before,{name:'Old'});assert.deepEqual(entry.after,{name:'New'});}
});
test('deduplicates event redelivery and does not capture audit records',async()=>{
 const f=fixture();await capture(f.event,f.db,Timestamp);await capture(f.event,f.db,Timestamp);assert.equal(f.writes.size,1);
 f.event.document='patients/client/administrativeAudit/event';await capture(f.event,f.db,Timestamp);assert.equal(f.writes.size,1);
});
test('records creation and deletion, including the name of a deleted client',async()=>{
 for(const [before,after,action]of [[null,{name:'New'},'record-created'],[{name:'Deleted client'},null,'record-deleted']]){const f=fixture({before,after});await capture(f.event,f.db,Timestamp);const entry=[...f.writes.values()][0];assert.equal(entry.action,action);assert.equal(entry.patientName,(after||before).name);}
});
test('captures both clients on a reassignment and covers linked chart collections',()=>{
 assert.deepEqual(targets('patientDocuments/doc',{patientId:'old'},{patientId:'new'}),['old','new']);
 for(const c of ['hoursAuthorizations','marOrders','progressNotes','servicePlans','careTasks'])assert.deepEqual(targets(c+'/x',{}, {patientId:'client'}),['client']);
 assert.deepEqual(targets('patients/client/clinical/guardian'),['client']);assert.deepEqual(targets('users/admin',{}, {patientId:'client'}),[]);
});
test('uses fresh server actor envelope and never reuses old authors',()=>{
 const f=fixture({authType:'service_account'});assert.equal(actorCandidate(f.event,{createdBy:'admin'},{createdBy:'admin'}),null);
 assert.equal(actorCandidate(f.event,{_auditActor:{uid:'admin',nonce:'old'}},{_auditActor:{uid:'admin',nonce:'old'}}),null);
 assert.equal(actorCandidate(f.event,{}, {_auditActor:{uid:'admin',nonce:'new'}}).uid,'admin');
});
test('preserves nested before/after differences, null removals, bounds large data, excludes credentials',()=>{
 const d=changes({contacts:[{name:'Old'}],remove:'value'},{contacts:[{name:'New',token:'hidden'}],secret:'hide',huge:'x'.repeat(100000)});
 assert.equal(d.before.remove,'value');assert.equal(d.after.remove,null);assert.equal(d.after.contacts[0].token,undefined);assert.equal(d.after.secret,undefined);assert.ok(d.after.huge.length<17000);assert.equal(d.after.contacts[0].name,'New');
});
test('skips same-commit assistant audit but not stale browser markers',async()=>{
 const f=fixture({authType:'service_account',after:{name:'New',auditEventId:'existing'}});f.records.set('patients/client/administrativeAudit/existing',{action:'assistant-information-update'});
 await capture(f.event,f.db,Timestamp);assert.equal(f.writes.size,0);
 f.event.authType='unknown';f.event.authId='admin';await capture(f.event,f.db,Timestamp);assert.equal(f.writes.size,1);
});
test('unattributed service actions are labeled explicitly without inventing a person',async()=>{
 const f=fixture({authType:'service_account'});await capture(f.event,f.db,Timestamp);assert.equal([...f.writes.values()][0].actorName,'System / unidentified actor');
});
