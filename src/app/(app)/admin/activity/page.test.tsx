import React from 'react';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
vi.mock('@/components/AuthGuard',()=>({AuthGuard:({children,allow}:{children:React.ReactNode;allow:string[]})=><div data-testid="guard">{allow.join(',')}{children}</div>}));
vi.mock('@/components/ClientActivityLog',()=>({ClientActivityLog:({actorUid,onStaffLoaded}:{actorUid:string;onStaffLoaded:(s:unknown[])=>void})=>{
 const [confirm,setConfirm]=React.useState(false);
 React.useEffect(()=>{onStaffLoaded([{uid:'rose',name:'Rosita Lee',active:true}]);},[onStaffLoaded]);
 return <div><span>Filter: {actorUid||'all'}</span><button onClick={()=>setConfirm(true)}>Select undo</button>{confirm&&<span>Pending confirmation</span>}</div>;
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
