import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import type { CommunicationEntry } from './communicationsShared';

/**
 * The `communications` collection. Server-only (default deny in the rules):
 * automated senders write through recordCommunication, people log through the
 * API, and admins and supervisors read through the API. Lists sort in memory,
 * so no composite index is needed.
 */
const COL = 'communications';

function toIso(ts: unknown): string {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : '';
}

export type NewCommunication = Omit<CommunicationEntry, 'id' | 'occurredAt'> & { occurredAt?: string };

/** Write one entry. Never throws: a logging failure must not fail a send. */
export async function recordCommunication(entry: NewCommunication): Promise<string | null> {
  try {
    const ref = await adminDb().collection(COL).add({
      ...entry,
      occurredAt: entry.occurredAt || new Date().toISOString(),
      createdAt: FieldValue.serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    console.error('Communications log write failed:', err);
    return null;
  }
}

function serialize(id: string, d: FirebaseFirestore.DocumentData): CommunicationEntry {
  return {
    id,
    source: d.source === 'manual' ? 'manual' : 'automated',
    event: String(d.event || ''),
    direction: d.direction === 'inbound' ? 'inbound' : 'outbound',
    patientId: String(d.patientId || ''),
    patientName: String(d.patientName || ''),
    staffUid: String(d.staffUid || ''),
    staffName: String(d.staffName || ''),
    counterpartyName: String(d.counterpartyName || ''),
    summary: String(d.summary || ''),
    channels: Array.isArray(d.channels)
      ? d.channels.map((c: Record<string, unknown>) => ({
          channel: String(c.channel || 'other') as CommunicationEntry['channels'][number]['channel'],
          to: String(c.to || ''),
          ok: c.ok === true,
          skipped: c.skipped === true || undefined,
          error: c.error ? String(c.error) : undefined,
          subject: c.subject ? String(c.subject) : undefined,
          body: String(c.body || ''),
        }))
      : [],
    relatedVisitId: String(d.relatedVisitId || ''),
    occurredAt: String(d.occurredAt || '') || toIso(d.createdAt),
    loggedByUid: String(d.loggedByUid || ''),
    loggedByName: String(d.loggedByName || ''),
  };
}

/** Newest first. Filter by client or by staff member; unfiltered returns the latest 300. */
export async function listCommunications(f: { patientId?: string; staffUid?: string }): Promise<CommunicationEntry[]> {
  const col = adminDb().collection(COL);
  const snap = f.patientId
    ? await col.where('patientId', '==', f.patientId).get()
    : f.staffUid
      ? await col.where('staffUid', '==', f.staffUid).get()
      : await col.orderBy('createdAt', 'desc').limit(300).get();
  return snap.docs
    .map((d) => serialize(d.id, d.data()))
    .filter((e) => !f.staffUid || e.staffUid === f.staffUid)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
