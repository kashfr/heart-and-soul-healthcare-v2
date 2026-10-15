import {expect,it} from 'vitest';
import {capturedUndoFields,isCapturedUpload,type ClientActivity} from './clientActivity';
const entry: ClientActivity={id:'change',actorName:'Supervisor',at:null,revertedAt:null,action:'record-updated',actorRole:'supervisor',sourcePath:'patients/client',before:{name:'Old',diagnosis:'Old'},after:{name:'New',diagnosis:'New'}};
it('restricts capture undo to basic fields, roles, exact paths, and complete snapshots',()=>{
 expect(capturedUndoFields(entry)).toEqual(['name']);
 for(const patch of [{actorRole:'nurse'},{sourcePath:'patients/client/clinical/other'},{truncated:true},{action:'record-deleted'}])expect(capturedUndoFields({...entry,...patch})).toEqual([]);
 expect(capturedUndoFields({...entry,before:{name:null}})).toEqual([]);
 expect(capturedUndoFields({...entry,before:{name:null},fieldPresence:{before:[],after:['name']}})).toEqual(['name']);
});
it('keeps guardian notes and legal decisions out of undo',()=>{
 const before={contacts:[{id:'a',name:'Old',notes:'Keep'}]},after={contacts:[{id:'a',name:'New',notes:'Keep'}]};
 expect(capturedUndoFields({...entry,sourcePath:'patients/client/clinical/guardian',before,after})).toEqual(['contacts']);
 expect(capturedUndoFields({...entry,sourcePath:'patients/client/clinical/guardian',before,after:{contacts:[{id:'a',name:'New',notes:'Changed'}]}})).toEqual([]);
});
it('only treats creation of a client document as an upload',()=>{
 const upload={...entry,action:'record-created',sourcePath:'patientDocuments/doc',after:{patientId:'client'}};
 expect(isCapturedUpload(upload)).toBe(true);
 for(const patch of [{action:'record-updated'},{actorRole:'nurse'},{sourcePath:'progressNotes/doc'},{after:{patientId:'client',archived:true}}])expect(isCapturedUpload({...upload,...patch})).toBe(false);
});
