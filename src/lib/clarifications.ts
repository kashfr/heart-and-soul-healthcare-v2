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
import { clarificationMessages, clarificationAwaitsNurse, type NoteClarification, type ClarificationMessage } from './submissions';
import { hasCriticalVital } from './criticalVitals';

export interface OpenClarification {
  noteId: string;
  clientName: string;
  dateOfService: string;
  /** The full back-and-forth, oldest first. */
  thread: ClarificationMessage[];
  /** The reviewer who opened the thread. */
  flaggedByName: string;
  /** The reviewer's most recent question (the latest reviewer message). */
  latestReviewerMessage: string;
  /** Whether this note crossed a critical-vital threshold — drives priority order. */
  hasCriticalVitals: boolean;
  /**
   * True when the most recent message is from a REVIEWER (not the nurse), i.e.
   * the nurse owes a reply. This is what arms the blocking gate. False once she
   * has replied (last message is hers) — until a reviewer messages again.
   */
  awaitsNurse: boolean;
  /**
   * Millisecond timestamp of the latest message, so the gate's per-session
   * "cleared" flag can key off it: dismissing suppresses only the message she's
   * seen; a NEWER reviewer message produces a new key and re-arms the gate.
   */
  latestAt: number;
  /** When the clarification was first raised (ms) — tiebreak for priority sort. */
  flaggedAt: number;
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
      const toMs = (ts: unknown): number =>
        ts && typeof (ts as { toMillis?: () => number }).toMillis === 'function'
          ? (ts as { toMillis: () => number }).toMillis()
          : 0;

      const items: OpenClarification[] = [];
      snap.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        const clar = data.clarification as NoteClarification | undefined;
        if (clar?.status !== 'open') return;
        const msgs = clarificationMessages(clar);
        const last = msgs[msgs.length - 1];
        // Latest message authored by a reviewer (the question she owes a reply to).
        const lastReviewer = [...msgs].reverse().find((m) => m.byRole !== 'nurse');
        items.push({
          noteId: d.id,
          clientName: String(data.q3_clientName || ''),
          dateOfService: String(data.q6_dateofService || ''),
          thread: msgs,
          flaggedByName: String(clar.flaggedByName || ''),
          latestReviewerMessage: lastReviewer?.text || clar.message || '',
          hasCriticalVitals: hasCriticalVital(data),
          awaitsNurse: clarificationAwaitsNurse(clar),
          latestAt: toMs(last?.at),
          flaggedAt: toMs(clar.flaggedAt),
        });
      });
      // Priority order: critical-vital notes first, then oldest flag first (FIFO).
      items.sort((a, b) => {
        if (a.hasCriticalVitals !== b.hasCriticalVitals) return a.hasCriticalVitals ? -1 : 1;
        return a.flaggedAt - b.flaggedAt;
      });
      cb(items);
    },
    (err) => {
      console.error('Open-clarifications subscription failed:', err);
      cb([]);
    },
  );
}
