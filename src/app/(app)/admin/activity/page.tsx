'use client';
import { useState } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { ClientActivityLog, type ActivityStaff } from '@/components/ClientActivityLog';
function ActivityOverview() {
  const [staff, setStaff] = useState<ActivityStaff[]>([]);
  const [actorUid, setActorUid] = useState('');
  return <main style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
    <h1 style={{ fontSize: 26, fontWeight: 700 }}>Client Activity</h1>
    <p style={{ margin: '10px 0 20px', color: '#64748b' }}>Review recorded changes across all clients, including changes by admins, supervisors, nurses, and assistants. Filter by staff member to see who changed what.</p>
    <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>Staff
      <select value={actorUid} onChange={e => setActorUid(e.target.value)} style={{ padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, background: 'white' }}>
        <option value="">All staff</option>
        {staff.map(person => <option key={person.uid} value={person.uid}>{person.name}{person.active ? '' : ' (inactive)'}</option>)}
      </select>
    </label>
    <ClientActivityLog key={actorUid} actorUid={actorUid} onStaffLoaded={setStaff} />
  </main>;
}
export default function ActivityPage() { return <AuthGuard allow={['admin']}><ActivityOverview /></AuthGuard>; }
