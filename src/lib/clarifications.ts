/**
 * Nurse-facing clarification notifications.
 *
 * A reviewer (RN / supervisor / admin) can flag a nurse's note "for
 * clarification." The nurse must SEE and RESPOND to it — a small row pill was
 * too easy to ignore, so this powers a blocking login gate + live count badge.
 *
 * The clarification thread itself lives on each progressNote doc
 * (`clarification` field, see NoteClarification in submissions.ts). This module
 * just exposes a cheap live view of a single nurse's OPEN ones.
 */
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';

export interface OpenClarification {
  noteId: string;
  clientName: string;
  dateOfService: string;
  /** The reviewer's question. */
  message: string;
  flaggedByName: string;
  /** True once the nurse has typed a response (flag may still be `open` until a reviewer resolves). */
  hasResponse: boolean;
}

/**
 * Live-subscribe to the signed-in nurse's notes that have an OPEN clarification.
 * Mirrors subscribePendingDupCount in drafts.ts. Returns an unsubscribe fn.
 *
 * Uses a single-field `nurseId ==` query (no composite index, allowed by the
 * progressNotes read rule) and filters `clarification.status === 'open'`
 * client-side. A nurse's note set is small, so this is cheap.
 *
 * Fails OPEN: on any error it emits an empty list, so a query hiccup can never
 * lock a nurse out of the portal behind the gate.
 */
export function subscribeMyOpenClarifications(
  uid: string,
  cb: (items: OpenClarification[]) => void,
): () => void {
  if (!uid) {
    cb([]);
    return () => {};
  }
  const q = query(collection(db, 'progressNotes'), where('nurseId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const items: OpenClarification[] = [];
      snap.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        const clar = data.clarification as
          | { status?: string; message?: string; flaggedByName?: string; response?: string }
          | undefined;
        if (clar?.status !== 'open') return;
        items.push({
          noteId: d.id,
          clientName: String(data.q3_clientName || ''),
          dateOfService: String(data.q6_dateofService || ''),
          message: String(clar.message || ''),
          flaggedByName: String(clar.flaggedByName || ''),
          hasResponse: typeof clar.response === 'string' && clar.response.trim().length > 0,
        });
      });
      // Stable order: oldest service date first so she works through them in order.
      items.sort((a, b) => a.dateOfService.localeCompare(b.dateOfService));
      cb(items);
    },
    (err) => {
      console.error('Open-clarifications subscription failed:', err);
      cb([]);
    },
  );
}
