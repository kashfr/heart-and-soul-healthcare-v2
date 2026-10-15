'use strict';
const { createHash } = require('node:crypto');
const LABELS = {patients:'Client information',clinical:'Clinical profile',patientDocuments:'Document',hoursAuthorizations:'Hours authorization',progressNotes:'Progress note',marOrders:'Medication order',marAdministrations:'Medication administration',marChangeRequests:'Medication change request',careTasks:'Care task',careTaskAdministrations:'Care task administration',patientVisits:'Visit',quickNotes:'Communication',handoffs:'Handoff',verbalOrders:'Verbal order',medErrorReports:'Medication error report',seizureEvents:'Seizure event',servicePlans:'Service plan',ppotRequests:'Plan of treatment',roiRequests:'Release of information'};
const IGNORE = /^(?:updatedAt|createdAt|uploadedAt|archivedAt|replacedAt|detailsEditedAt|refreshedAt|updatedBy|updatedByName|auditEventId|_auditActor)$/;
const PRIVATE = /token|password|secret|privatekey|downloadurl|signedurl|storagepath|signature|pdf(base64|bytes)/i;
function canonical(value) {
 if(value === undefined) return null;
 if(value?.toDate) return value.toDate().toISOString();
 if(value?.path && value?.firestore) return value.path;
 if(Buffer.isBuffer(value)) return '[Binary data]';
 if(Array.isArray(value)) return value.map(canonical);
 if(value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function safe(value,depth=0) {
 if(depth>12)return '[Nested content omitted]';
 if(value?.toDate)return value.toDate().toISOString();
 if(value?.path && value?.firestore)return value.path;
 if(Buffer.isBuffer(value))return '[Binary data omitted]';
 if(Array.isArray(value))return value.slice(0,200).map(v=>safe(v,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!PRIVATE.test(k)).map(([k,v])=>[k,safe(v,depth+1)]));
 if(typeof value==='string'&&value.length>16000)return value.slice(0,16000)+'… [truncated]';
 return value??null;
}
function changes(before={},after={}) {
 const old={},next={}; let bytes=0,truncated=false;
 for(const key of [...new Set([...Object.keys(before),...Object.keys(after)])].sort()) {
  if(IGNORE.test(key)||PRIVATE.test(key)||(same(before[key],after[key])&&Object.hasOwn(before,key)===Object.hasOwn(after,key)))continue;
  let a=safe(before[key]),b=safe(after[key]);
  if(!same(before[key],a)||!same(after[key],b))truncated=true;
  const size=Buffer.byteLength(JSON.stringify([key,a,b]));
  if(size>64000||bytes+size>350000){a='[Changed content too large to display]';b=a;truncated=true;}else bytes+=size;
  old[key]=a;next[key]=b;
 }
 return {before:old,after:next,truncated};
}
function targets(path,before={},after={}) {
 const parts=path.split('/');
 if(parts[0]==='patients')return parts.length===2||parts[2]==='clinical'?[parts[1]]:[];
 if(parts.length!==2||!LABELS[parts[0]])return [];
 return [...new Set([before.patientId,after.patientId].filter(id=>typeof id==='string'&&/^[\w-]{1,128}$/.test(id)))];
}
// Never reuse a record's historical author as the actor for a later edit.
function serverPrincipal(event) {
 return event.authType==='service_account'||event.authType==='system'||(typeof event.authId==='string'&&/^[^/\s]+@[^/\s]+\.gserviceaccount\.com$/.test(event.authId));
}
function actorCandidate(event,before={},after={}) {
 if(!serverPrincipal(event)&&event.authId)return {uid:event.authId,source:'authentication'};
 if(!serverPrincipal(event))return null;
 if(after._auditActor?.uid && after._auditActor?.nonce && before._auditActor?.nonce!==after._auditActor.nonce)return {uid:after._auditActor.uid,source:'server'};
 for(const [stamp,uid] of [['lastOfferedAt','offeredBy'],['detailsEditedAt','detailsEditedBy'],['archivedAt','archivedBy'],['replacedAt','replacedBy'],['movedAt','movedBy'],['signedAt','signedBy'],['reviewedAt','reviewedBy'],['cancelledAt','cancelledBy'],['sentAt','byUid']]) {
  if(after[stamp]&&!same(before[stamp],after[stamp])&&typeof after[uid]==='string')return {uid:after[uid],source:'server'};
 }
 if(!event.data.before.exists)for(const key of ['createdBy','uploadedBy','submittedBy','performedBy','byUid'])if(typeof after[key]==='string')return {uid:after[key],source:'server'};
 return null;
}
async function capture(event,db,Timestamp) {
 if(!event.data)return;
 const before=event.data.before.data()||{},after=event.data.after.data()||{};
 const path=event.document||event.data.after.ref.path;
 let ids=targets(path,before,after);
 if(/^servicePlans\/[^/]+\/reviews\/[^/]+$/.test(path)) { const parent=await db.doc(path.split('/').slice(0,2).join('/')).get(); const pid=parent.data()?.patientId;if(typeof pid==='string'&&/^[\w-]{1,128}$/.test(pid))ids=[pid]; }
 if(!ids.length)return;
 const diff=changes(before,after);
 const fieldPresence={before:Object.keys(diff.before).filter(k=>Object.hasOwn(before,k)),after:Object.keys(diff.after).filter(k=>Object.hasOwn(after,k))};if(!Object.keys(diff.before).length && event.data.before.exists===event.data.after.exists)return;
 const candidate=actorCandidate(event,before,after);
 let actor={actorUid:'',actorName:'System / unidentified actor',actorRole:'system',actorSource:'unidentified'};
 if(candidate && /^[\w-]{1,128}$/.test(candidate.uid)) {
  const user=await db.doc('users/'+candidate.uid).get();
  if(user.exists)actor={actorUid:candidate.uid,actorName:String(user.data().displayName||'Staff member'),actorRole:String(user.data().role||'staff'),actorSource:candidate.source};
 }
 // An existing assistant/undo event already records this exact atomic write.
 if(serverPrincipal(event) && after.auditEventId && before.auditEventId!==after.auditEventId && /^[\w-]{1,128}$/.test(after.auditEventId)) {
  const existing=await db.doc(`patients/${ids[0]}/administrativeAudit/${after.auditEventId}`).get();
  if(existing.exists && existing.updateTime.isEqual(event.data.after.updateTime))return;
 }
 // Server document deletions carry their verified actor in the same-commit tombstone.
 if(serverPrincipal(event) && !event.data.after.exists && (path.startsWith('patientDocuments/')||path.startsWith('progressNotes/')||path.startsWith('marAdministrations/'))) {
  const tombstone=path.startsWith('patientDocuments/')?'deletedDocuments/'+path.split('/')[1]:path.startsWith('progressNotes/')?'deletedNotes/'+path.split('/')[1]:before.sourceNoteId?'deletedNotes/'+before.sourceNoteId:null;
  const deleted=tombstone?await db.doc(tombstone).get():{exists:false};
  if(deleted.exists && deleted.data().deletedAt?.toMillis && Math.abs(deleted.data().deletedAt.toMillis()-Date.parse(event.time))<1000) {
   const d=deleted.data();actor={actorUid:String(d.deletedBy||''),actorName:String(d.deletedByName||'Administrator'),actorRole:String(d.deletedByRole||'admin'),actorSource:'server'};
  }
 }
 const action=!event.data.before.exists?'record-created':!event.data.after.exists?'record-deleted':'record-updated';
 const parts=path.split('/');
 const recordLabel=parts[0]==='patients'&&parts[2]==='clinical'?(parts[3]==='guardian'?'Guardian contacts':'Clinical profile'):(LABELS[parts[0]]||'Client record');
 const eventId='capture-'+createHash('sha256').update(event.id).digest('hex');
 const at=event.data.after.updateTime||Timestamp.fromDate(new Date(event.time));
 for(const patientId of ids) {
  const patient=parts[0]==='patients'&&parts.length===2?(event.data.after.exists?after:before):(await db.doc('patients/'+patientId).get()).data();
  try {await db.doc(`patients/${patientId}/administrativeAudit/${eventId}`).create({action,...actor,at,...diff,fieldPresence,sourcePath:path,recordLabel,patientName:String(patient?.name||'Unavailable client'),capturedAt:Timestamp.now(),sourceEventId:event.id,principalType:event.authType||'unknown',serverPrincipal:serverPrincipal(event)});}
  catch(e){if(e.code!==6&&e.code!=='already-exists')throw e;}
 }
}
module.exports={capture,changes,targets,actorCandidate};
