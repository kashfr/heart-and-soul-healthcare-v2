import { authedFetch } from './authedFetch';
import type { CommunicationEntry, ManualCommInput } from './communicationsShared';

export type { CommunicationEntry } from './communicationsShared';

export interface CommsPayload {
  entries: CommunicationEntry[];
  staff: { uid: string; name: string; credential: string }[];
  clients: { id: string; name: string }[];
}

/** Browser API for the communications log (admins and supervisors). */
export async function getCommunications(f: { patientId?: string; staffUid?: string } = {}): Promise<CommsPayload> {
  const q = new URLSearchParams();
  if (f.patientId) q.set('patientId', f.patientId);
  if (f.staffUid) q.set('staffUid', f.staffUid);
  const res = await authedFetch(`/api/communications${q.toString() ? `?${q}` : ''}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data as CommsPayload;
}

/** On a 400 with field errors the thrown Error carries `fields`. */
export async function logCommunication(input: ManualCommInput): Promise<string> {
  const res = await authedFetch('/api/communications', { method: 'POST', body: JSON.stringify(input) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status}).`) as Error & { fields?: Record<string, string> };
    if (data.fields) err.fields = data.fields;
    throw err;
  }
  return String(data.id);
}
