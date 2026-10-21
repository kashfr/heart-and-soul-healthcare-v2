import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
vi.mock('@/lib/authedFetch', () => ({ authedFetch: vi.fn() }));
import { authedFetch } from '@/lib/authedFetch';
import { ClientActivityLog } from './ClientActivityLog';
const entry = { id: 'change', action: 'assistant-information-update', actorName: 'Rosita Lee', actorRole: 'va', at: '2026-10-15T18:00:00Z', before: { name: 'Previous Name' }, after: { name: 'Corrected Name' }, revertedAt: null };
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
beforeEach(()=>{vi.clearAllMocks();vi.mocked(authedFetch).mockResolvedValue(response({entries:[entry],nextCursor:null}));});
it('shows actor, US date, and old/new values and requires confirmation before undo',async()=>{
 const onUndone=vi.fn(); render(<ClientActivityLog patientId="client" onUndone={onUndone}/>);
 expect(await screen.findByText('Rosita Lee')).toBeInTheDocument();
 expect(screen.getByText(/10\/15\/2026/)).toBeInTheDocument();
 expect(screen.getByText('Previous Name')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Undo change'}));
 expect(authedFetch).toHaveBeenCalledTimes(1);
 expect(screen.getByRole('region',{name:'Confirm undo'})).toHaveTextContent('Previous Name');
 vi.mocked(authedFetch).mockResolvedValueOnce(response({ok:true})).mockResolvedValueOnce(response({entries:[{...entry,revertedAt:'2026-10-15T19:00:00Z',revertedByName:'Owner'}],nextCursor:null}));
 fireEvent.click(screen.getByRole('button',{name:'Confirm undo'}));
 await waitFor(()=>expect(onUndone).toHaveBeenCalledOnce());
 expect(authedFetch).toHaveBeenCalledWith('/api/admin/clients/client/activity/change/undo',{method:'POST'});
 expect(await screen.findByText(/Undone by Owner/)).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Undo change'})).not.toBeInTheDocument();
});
it('shows conflict and does not report a successful reversal',async()=>{
 render(<ClientActivityLog patientId="client"/>);await screen.findByText('Rosita Lee');
 fireEvent.click(screen.getByRole('button',{name:'Undo change'}));
 vi.mocked(authedFetch).mockResolvedValueOnce(response({error:'Newer changes exist; nothing was undone.'},409));
 fireEvent.click(screen.getByRole('button',{name:'Confirm undo'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('nothing was undone');
 expect(screen.queryByText('Change undone. The previous information has been restored.')).not.toBeInTheDocument();
});
it('explains that undoing an upload preserves the file',async()=>{
 vi.mocked(authedFetch).mockResolvedValueOnce(response({entries:[{...entry,action:'assistant-document-upload',before:{},after:{title:'Letter'}}],nextCursor:null}));
 render(<ClientActivityLog patientId="client"/>);await screen.findByText('Rosita Lee');
 fireEvent.click(screen.getByRole('button',{name:'Undo change'}));
 expect(screen.getByRole('region',{name:'Confirm undo'})).toHaveTextContent('file will be kept');
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
 expect(authedFetch).toHaveBeenCalledTimes(1);
});

it('shows client names globally and sends undo to the selected client',async()=>{
 vi.mocked(authedFetch).mockResolvedValueOnce(response({entries:[{...entry,patientId:'second-client',patientName:'Second Client',patientExists:true}],nextCursor:'second-client:change',staff:[]}));
 render(<ClientActivityLog actorUid="rosita"/>);
 expect(await screen.findByRole('link',{name:'Second Client'})).toHaveAttribute('href','/admin/clients/second-client?tab=activity');
 expect(authedFetch).toHaveBeenCalledWith('/api/admin/client-activity?staff=rosita&client=&from=&through=&type=',{cache:'no-store'});
 fireEvent.click(screen.getByRole('button',{name:'Undo change'}));
 expect(screen.getByRole('region',{name:'Confirm undo'})).toHaveTextContent('Client: Second Client');
 vi.mocked(authedFetch).mockResolvedValueOnce(response({ok:true})).mockResolvedValueOnce(response({entries:[],nextCursor:null}));
 fireEvent.click(screen.getByRole('button',{name:'Confirm undo'}));
 await waitFor(()=>expect(authedFetch).toHaveBeenCalledWith('/api/admin/clients/second-client/activity/change/undo',{method:'POST'}));
});
it('preserves the actor filter when loading older entries and disables undo for missing clients',async()=>{
 vi.mocked(authedFetch).mockResolvedValueOnce(response({entries:[{...entry,patientId:'deleted',patientName:'Unavailable client',patientExists:false}],nextCursor:'deleted:change'}));
 render(<ClientActivityLog actorUid="rosita" filterClient="deleted" from="2026-10-01" through="2026-10-31" changeType="information"/>);await screen.findByText('Rosita Lee');
 expect(screen.queryByRole('button',{name:'Undo change'})).not.toBeInTheDocument();
 vi.mocked(authedFetch).mockResolvedValueOnce(response({entries:[],nextCursor:null}));
 fireEvent.click(screen.getByRole('button',{name:'Load older activity'}));
 await waitFor(()=>expect(authedFetch).toHaveBeenCalledWith('/api/admin/client-activity?staff=rosita&client=deleted&from=2026-10-01&through=2026-10-31&type=information&cursor=deleted%3Achange',{cache:'no-store'}));
});

it('displays non-administrative field changes by supervisors without offering unsafe undo',async()=>{
 vi.mocked(authedFetch).mockResolvedValueOnce(response({entries:[{...entry,action:'record-updated',actorName:'Example Supervisor',actorRole:'supervisor',recordLabel:'Clinical profile',before:{allergies:'None',vitalsBaselines:{pulse:60}},after:{allergies:'Penicillin',vitalsBaselines:{pulse:70}}}],nextCursor:null}));
 render(<ClientActivityLog patientId="client"/>);
 expect(await screen.findByText('Example Supervisor')).toBeInTheDocument();
 expect(screen.getByText('Updated Clinical profile')).toBeInTheDocument();
 expect(screen.getByText('Penicillin')).toBeInTheDocument();
 expect(screen.getByText(/"pulse": 70/)).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Undo change'})).not.toBeInTheDocument();
});

it('confirms only basic fields for mixed supervisor edits',async()=>{
 vi.mocked(authedFetch).mockResolvedValueOnce(response({entries:[{...entry,action:'record-updated',actorRole:'supervisor',sourcePath:'patients/client/clinical/profile',before:{physicianName:'Old doctor',allergies:'None'},after:{physicianName:'New doctor',allergies:'New allergy'}}],nextCursor:null}));
 render(<ClientActivityLog patientId="client"/>);
 fireEvent.click(await screen.findByRole('button',{name:'Undo change'}));
 const confirmation=screen.getByRole('region',{name:'Confirm undo'});
 expect(confirmation).toHaveTextContent('Old doctor');
 expect(confirmation).not.toHaveTextContent('New allergy');
 expect(confirmation).toHaveTextContent('Only the basic information fields');
});
it('offers archive confirmation for captured admin uploads',async()=>{
 vi.mocked(authedFetch).mockResolvedValueOnce(response({entries:[{...entry,action:'record-created',actorRole:'admin',sourcePath:'patientDocuments/doc',before:{},after:{patientId:'client',title:'Authorization'}}],nextCursor:null}));
 render(<ClientActivityLog patientId="client"/>);
 fireEvent.click(await screen.findByRole('button',{name:'Undo change'}));
 expect(screen.getByRole('region',{name:'Confirm undo'})).toHaveTextContent('Archive this uploaded document?');
});
