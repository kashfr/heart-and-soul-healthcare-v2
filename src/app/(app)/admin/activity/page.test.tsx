import React from 'react';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
vi.mock('@/components/AuthGuard',()=>({AuthGuard:({children,allow}:{children:React.ReactNode;allow:string[]})=><div data-testid="guard">{allow.join(',')}{children}</div>}));
vi.mock('@/components/ClientActivityLog',()=>({ClientActivityLog:({actorUid,onStaffLoaded,onClientsLoaded,filterClient,from,through}:{actorUid:string;onStaffLoaded:(s:unknown[])=>void;onClientsLoaded:(s:unknown[])=>void;filterClient:string;from:string;through:string})=>{
 const [confirm,setConfirm]=React.useState(false);
 React.useEffect(()=>{onStaffLoaded([{uid:'rose',name:'Rosita Lee',active:true}]);onClientsLoaded([{id:'client-a',name:'Example Client'}]);},[onStaffLoaded,onClientsLoaded]);
 return <div><span>Filter: {actorUid||'all'}</span><span>Range: {filterClient}/{from}/{through}</span><button onClick={()=>setConfirm(true)}>Select undo</button>{confirm&&<span>Pending confirmation</span>}</div>;
}}));
import ActivityPage from './page';
it('guards the overview for admins and clears pending undo when staff changes',async()=>{
 render(<ActivityPage/>);
 expect(screen.getByTestId('guard')).toHaveTextContent('admin');
 await screen.findByRole('option',{name:'Rosita Lee'});
 fireEvent.click(screen.getByRole('button',{name:'Select undo'}));
 expect(screen.getByText('Pending confirmation')).toBeInTheDocument();
 fireEvent.change(screen.getByRole('combobox',{name:'Staff'}),{target:{value:'rose'}});
 expect(screen.getByText('Filter: rose')).toBeInTheDocument();
 expect(screen.queryByText('Pending confirmation')).not.toBeInTheDocument();
});

it('combines filters, validates dates, and clears filters and pending undo',async()=>{
 render(<ActivityPage/>);
 await screen.findByRole('option',{name:'Example Client'});
 fireEvent.change(screen.getByRole('combobox',{name:'Client'}),{target:{value:'client-a'}});
 fireEvent.change(screen.getByRole('textbox',{name:'From (MM/DD/YYYY)'}),{target:{value:'11/02/2026'}});
 fireEvent.change(screen.getByRole('textbox',{name:'Through (MM/DD/YYYY)'}),{target:{value:'11/01/2026'}});
 fireEvent.click(screen.getByRole('button',{name:'Apply dates'}));
 expect(screen.getByRole('alert')).toHaveTextContent('on or before');
 fireEvent.change(screen.getByRole('textbox',{name:'From (MM/DD/YYYY)'}),{target:{value:'11/01/2026'}});
 fireEvent.click(screen.getByRole('button',{name:'Select undo'}));
 fireEvent.click(screen.getByRole('button',{name:'Apply dates'}));
 expect(screen.queryByText('Pending confirmation')).not.toBeInTheDocument();
 expect(screen.getByText('Range: client-a/2026-11-01/2026-11-01')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Clear filters'}));
 expect(screen.getByText('Range: //')).toBeInTheDocument();
});

it('resets pending undo on change type and clears the selected type',async()=>{
 render(<ActivityPage/>);
 fireEvent.click(screen.getByRole('button',{name:'Select undo'}));
 fireEvent.change(screen.getByRole('combobox',{name:'Change type'}),{target:{value:'uploads'}});
 expect(screen.queryByText('Pending confirmation')).not.toBeInTheDocument();
 expect(screen.getByRole('combobox',{name:'Change type'})).toHaveValue('uploads');
 fireEvent.click(screen.getByRole('button',{name:'Clear filters'}));
 expect(screen.getByRole('combobox',{name:'Change type'})).toHaveValue('');
});
