import {
  arrayRemove,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { authedFetch } from './authedFetch';
import type { Handoff, HandoffSource } from './handoffShared';

export type { Handoff } from './handoffShared';

/**
 * Handoff client API. Posts are created ONLY server-side (POST /api/handoffs,
 * Admin SDK) so the recipient list is computed from the care team on the
 * server, the bells are written (rules deny client notification creates),
 * and an urgent post can text the recipients. Reads and the one permitted
 * write — a recipient acknowledging her own copy — go straight to Firestore
 * under firestore.rules.
 */

export interface PostHandoffResult {
  id: string;
  recipients: number;
  bells: number;
  sms: number;
  /** True when this call found an existing post for the same note and returned it. */
  existing?: boolean;
  /** True when the note's plan was a placeholder ("N/A") and nothing was posted. */
  skipped?: boolean;
}

export async function postHandoff(params: {
  patientId: string;
  text: string;
  urgent?: boolean;
  source: HandoffSource;
  sourceNoteId?: string;
  shiftDate?: string;
}): Promise<PostHandoffResult> {
  const res = await authedFetch('/api/handoffs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<PostHandoffResult> & { error?: string };
  if (!res.ok) throw new Error(data.error || `Handoff post failed (${res.status}).`);
  return {
    id: String(data.id || ''),
    recipients: Number(data.recipients || 0),
    bells: Number(data.bells || 0),
    sms: Number(data.sms || 0),
    existing: !!data.existing,
    skipped: !!(data as { skipped?: boolean }).skipped,
  };
}

function toHandoff(id: string, data: Record<string, unknown>): Handoff {
  return {
    id,
    patientId: String(data.patientId || ''),
    patientName: String(data.patientName || ''),
    authorId: String(data.authorId || ''),
    authorName: String(data.authorName || ''),
    authorCredential: String(data.authorCredential || ''),
    text: String(data.text || ''),
    urgent: !!data.urgent,
    source: data.source === 'note' ? 'note' : 'board',
    sourceNoteId: String(data.sourceNoteId || ''),
    shiftDate: String(data.shiftDate || ''),
    recipientIds: Array.isArray(data.recipientIds) ? (data.recipientIds as string[]) : [],
    recipientNames: (data.recipientNames as Record<string, string>) || {},
    pendingIds: Array.isArray(data.pendingIds) ? (data.pendingIds as string[]) : [],
    acks: (data.acks as Record<string, unknown>) || {},
    createdAt: data.createdAt,
  };
}

/** Live: every handoff still waiting on THIS user, newest first. */
export function subscribePendingHandoffs(
  uid: string,
  cb: (items: Handoff[], error?: Error) => void,
): () => void {
  const q = query(
    collection(db, 'handoffs'),
    where('pendingIds', 'array-contains', uid),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => toHandoff(d.id, d.data() as Record<string, unknown>))),
    (err) => {
      // Surface the failure: an empty list here must NOT read as "caught up".
      console.error('Pending handoffs subscription failed:', err);
      cb([], err);
    },
  );
}

/** Every handoff ever addressed to this user (pending or acknowledged), newest first. */
export async function getMyHandoffs(uid: string, max = 60): Promise<Handoff[]> {
  const q = query(
    collection(db, 'handoffs'),
    where('recipientIds', 'array-contains', uid),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => toHandoff(d.id, d.data() as Record<string, unknown>));
}

/** Staff view: the latest handoffs across every client. */
export async function getRecentHandoffs(max = 100): Promise<Handoff[]> {
  const q = query(collection(db, 'handoffs'), orderBy('createdAt', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toHandoff(d.id, d.data() as Record<string, unknown>));
}

/** The client board: every handoff on one client, newest first. */
export async function getHandoffsForPatient(patientId: string, max = 60): Promise<Handoff[]> {
  const q = query(
    collection(db, 'handoffs'),
    where('patientId', '==', patientId),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => toHandoff(d.id, d.data() as Record<string, unknown>));
}

export async function getHandoff(id: string): Promise<Handoff | null> {
  try {
    const snap = await getDoc(doc(db, 'handoffs', id));
    if (!snap.exists()) return null;
    return toHandoff(snap.id, snap.data() as Record<string, unknown>);
  } catch (err) {
    console.error('Handoff load failed:', err);
    return null;
  }
}

/**
 * The read receipt. Removes the caller from pendingIds and stamps
 * acks.{uid} with the server time; rules allow exactly that change and
 * nothing else, and only for a uid still in pendingIds.
 */
export async function acknowledgeHandoff(id: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'handoffs', id), {
    pendingIds: arrayRemove(uid),
    [`acks.${uid}`]: serverTimestamp(),
  });
}
