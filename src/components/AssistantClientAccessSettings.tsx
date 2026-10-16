'use client';
import { withSelectChevron } from '@/lib/selectChevron';

import type { AssistantClientGrant, AssistantClientsSettings } from '@/lib/assistantClientAccess';

export function AssistantClientAccessSettings({ value, staff, onChange }: {
  value: AssistantClientsSettings;
  staff: Array<{ uid: string; displayName: string; role: string }>;
  onChange: (value: AssistantClientsSettings) => void;
}) {
  const assistants = staff.filter((person) => person.role === 'va');
  function update(uid: string, grant: AssistantClientGrant | null) {
    onChange({ grants: [...value.grants.filter((g) => g.uid !== uid), ...(grant ? [grant] : [])] });
  }
  return <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, marginBottom: 20 }}>
    <h2 style={{ fontSize: 19, fontWeight: 700, color: '#1a3a5c', marginBottom: 8 }}>Assistant Client Access</h2>
    <p style={{ color: '#5c6b7a', fontSize: 14, marginBottom: 16 }}>
      Give individual virtual assistants access to client information and documents. Choose their client scope,
      then enable editing and uploads as needed. Save settings to apply changes. Clinical charting, medications,
      care plans, client deletion, and staff permissions remain restricted. New clients in the chosen scope are included automatically.
    </p>
    {assistants.map((person) => {
      const grant = value.grants.find((g) => g.uid === person.uid);
      return <div key={person.uid} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 10 }}>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 600 }}>
          <input type="checkbox" checked={!!grant} onChange={(e) => update(person.uid, e.target.checked
            ? { uid: person.uid, scope: 'gapp', editInfo: false, uploadDocuments: false } : null)} />
          {person.displayName}
          <span style={{ color: '#5c6b7a', fontSize: 13, fontWeight: 400 }}>Virtual Assistant</span>
        </label>
        {grant && <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>Clients
            <select aria-label={`Client scope for ${person.displayName}`} value={grant.scope}
              onChange={(e) => update(person.uid, { ...grant, scope: e.target.value as AssistantClientGrant['scope'] })}
              style={withSelectChevron({ padding: 8, border: '1px solid #cbd5e1', borderRadius: 6 })}>
              <option value="gapp">GAPP clients</option><option value="all">All clients</option>
            </select>
          </label>
          <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={grant.editInfo}
            onChange={(e) => update(person.uid, { ...grant, editInfo: e.target.checked })} />Edit client information</label>
          <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={grant.uploadDocuments}
            onChange={(e) => update(person.uid, { ...grant, uploadDocuments: e.target.checked })} />Upload documents</label>
          <span style={{ color: '#5c6b7a', fontSize: 13 }}>Viewing client information and documents is included.</span>
        </div>}
      </div>;
    })}
    {assistants.length === 0 && <p>No active virtual assistants available, or the staff list could not be loaded.</p>}
  </section>;
}
