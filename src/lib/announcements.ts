import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import { authedFetch } from './authedFetch';
import type { Announcement } from './announcementShared';

/**
 * Client API. Reads go straight to Firestore under firestore.rules (active
 * posts are readable by every signed-in user; staff also read retired ones
 * for the receipts view). Every write goes through the API routes.
 */

function toAnnouncement(id: string, d: Record<string, unknown>): Announcement {
  return {
    id,
    title: String(d.title || ''),
    items: Array.isArray(d.items) ? (d.items as Announcement['items']).map((it) => ({ label: String(it?.label || ''), text: String(it?.text || '') })) : [],
    footer: String(d.footer || ''),
    audience: Array.isArray(d.audience) ? (d.audience as Announcement['audience']) : [],
    active: d.active === true,
    publishedAt: d.publishedAt,
    publishedBy: String(d.publishedBy || ''),
    publishedByName: String(d.publishedByName || ''),
    acks: (d.acks as Announcement['acks']) || {},
    ackCount: typeof d.ackCount === 'number' ? d.ackCount : 0,
    retiredAt: d.retiredAt,
    retiredBy: d.retiredBy ? String(d.retiredBy) : undefined,
  };
}

/** Live list of ACTIVE announcements (the gate filters audience + acks itself). */
export function subscribeActiveAnnouncements(onChange: (list: Announcement[]) => void, onError?: (e: Error) => void): () => void {
  const q = query(collection(db, 'announcements'), where('active', '==', true));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => toAnnouncement(d.id, d.data() as Record<string, unknown>))),
    (err) => onError?.(err),
  );
}

/** Staff view: every announcement, newest first. */
export function subscribeAllAnnouncements(onChange: (list: Announcement[]) => void, onError?: (e: Error) => void): () => void {
  const q = query(collection(db, 'announcements'), orderBy('publishedAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => toAnnouncement(d.id, d.data() as Record<string, unknown>))),
    (err) => onError?.(err),
  );
}

async function post(url: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await authedFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = new Error(String(data.error || `Request failed (${res.status}).`)) as Error & { field?: string };
    if (typeof data.field === 'string') err.field = data.field;
    throw err;
  }
  return data;
}

export async function publishAnnouncement(input: Omit<Announcement, 'id' | 'active' | 'publishedAt' | 'publishedBy' | 'publishedByName' | 'acks' | 'ackCount'>): Promise<string> {
  const data = await post('/api/announcements', input);
  return String(data.id);
}

export async function acknowledgeAnnouncement(id: string): Promise<void> {
  await post(`/api/announcements/${encodeURIComponent(id)}/ack`);
}

export async function retireAnnouncement(id: string): Promise<void> {
  await post(`/api/announcements/${encodeURIComponent(id)}/retire`);
}
