'use client';
import { useState } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { ClientActivityLog, type ActivityClient, type ActivityStaff } from '@/components/ClientActivityLog';
import { formatDateUS } from '@/lib/dateFormat';
import { ACTIVITY_TYPES, activityDateBounds, parseActivityUSDate } from '@/lib/activityFilters';
function ActivityOverview() {
  const [staff, setStaff] = useState<ActivityStaff[]>([]);
  const [actorUid, setActorUid] = useState('');
  const [clients, setClients] = useState<ActivityClient[]>([]);
  const [changeType, setChangeType] = useState('');
  const [client, setClient] = useState('');
  const [fromText, setFromText] = useState('');
  const [throughText, setThroughText] = useState('');
  const [range, setRange] = useState({ from: '', through: '' });
  const [error, setError] = useState('');
  const inputStyle = { padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, background: 'white', maxWidth: '100%' };
  function applyDates(event: React.FormEvent) {
    event.preventDefault();
    const from = fromText.trim() ? parseActivityUSDate(fromText) : '';
    const through = throughText.trim() ? parseActivityUSDate(throughText) : '';
    if (from === null || through === null) { setError('Enter valid dates in MM/DD/YYYY format.'); return; }
    try { activityDateBounds(from, through); } catch (err) { setError((err as Error).message); return; }
    setError(''); setRange({ from, through });
  }
  return <main style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
    <h1 style={{ fontSize: 26, fontWeight: 700 }}>Client Activity</h1>
    <p style={{ margin: '10px 0 20px', color: '#64748b' }}>Review recorded changes across all clients, including changes by admins, supervisors, nurses, and assistants. Filter by staff member, client, change type, and date range to find a specific change.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
    <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>Staff
      <select value={actorUid} onChange={e => setActorUid(e.target.value)} style={{ padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, background: 'white' }}>
        <option value="">All staff</option>
        {staff.map(person => <option key={person.uid} value={person.uid}>{person.name}{person.active ? '' : ' (inactive)'}</option>)}
      </select>
    </label>
    <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>Client
      <select value={client} onChange={e => setClient(e.target.value)} style={inputStyle}>
        <option value="">All clients</option>
        {clients.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
      </select>
    </label>
    <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>Change type
      <select value={changeType} onChange={e => setChangeType(e.target.value)} style={inputStyle}>
        <option value="">All changes</option>
        {ACTIVITY_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
      </select>
    </label>
    </div>
    <form onSubmit={applyDates} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 12, marginTop: 16 }}>
      <label style={{ display: 'grid', gap: 6 }}>From (MM/DD/YYYY)<input value={fromText} onChange={e => setFromText(e.target.value)} placeholder="MM/DD/YYYY" maxLength={10} style={inputStyle} /></label>
      <label style={{ display: 'grid', gap: 6 }}>Through (MM/DD/YYYY)<input value={throughText} onChange={e => setThroughText(e.target.value)} placeholder="MM/DD/YYYY" maxLength={10} style={inputStyle} /></label>
      <button type="submit" style={inputStyle}>Apply dates</button>
      <button type="button" style={inputStyle} onClick={() => { setActorUid(''); setClient(''); setChangeType(''); setFromText(''); setThroughText(''); setRange({ from: '', through: '' }); setError(''); }}>Clear filters</button>
    </form>
    <p style={{ color: '#64748b', marginTop: 8 }}>Dates include the whole day in Eastern time. Leave either date blank for an open-ended range.</p>
    <p style={{ marginTop: 8 }}>Showing: {range.from ? formatDateUS(range.from) : 'Any start date'} through {range.through ? formatDateUS(range.through) : 'Any end date'}.</p>
    {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
    <ClientActivityLog key={JSON.stringify([actorUid, client, range, changeType])} actorUid={actorUid} changeType={changeType} filterClient={client} from={range.from} through={range.through} onStaffLoaded={setStaff} onClientsLoaded={setClients} />
  </main>;
}
export default function ActivityPage() { return <AuthGuard allow={['admin']}><ActivityOverview /></AuthGuard>; }
