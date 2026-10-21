import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

/**
 * In-portal notifications (the bell). Documents are written ONLY server-side
 * (Admin SDK — visit assignment/cancel/restore and the day-of reminder cron);
 * the client may read its own and flip readAt, nothing else (see
 * firestore.rules). Unlike SMS/email these live behind the login, so the text
 * may name the client — that's the point: the off-portal message says "sign
 * in", the bell says exactly what and who.
 */
export interface PortalNotification {
  id?: string;
  userId: string; // recipient uid
  kind: string; // 'visit-assigned' | 'visit-cancelled' | 'visit-restored' | 'visit-reminder' | future kinds
  text: string;
  href?: string; // in-app deep link (e.g. /admin/clients/{id}?tab=schedule)
  createdAt?: Timestamp;
  readAt?: Timestamp | null;
  /** Set when the recipient clears it from the bell. Hidden, never deleted. */
  dismissedAt?: Timestamp | null;
}

/** How many notifications the bell shows at once. */
const SHOWN = 25;

/**
 * Live subscription to the caller's latest notifications, newest first,
 * minus any she has dismissed. Firestore can't match a field that is absent
 * on older docs, so dismissed ones are filtered here; the query over-fetches
 * so clearing a batch still leaves a full list behind it.
 */
export function subscribeNotifications(
  uid: string,
  cb: (items: PortalNotification[]) => void,
): () => void {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(SHOWN * 3),
  );
  return onSnapshot(
    q,
    (snap) =>
      cb(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as PortalNotification)
          .filter((n) => !n.dismissedAt)
          .slice(0, SHOWN),
      ),
    (err) => {
      console.error('Notifications subscription failed:', err);
      cb([]);
    },
  );
}

export async function markNotificationRead(id: string): Promise<void> {
  await updateDoc(doc(db, 'notifications', id), { readAt: serverTimestamp() });
}

/** Clear one notification from the bell. Also marks it read so it stops
 *  counting toward the badge. */
export async function dismissNotification(n: PortalNotification): Promise<void> {
  if (!n.id) return;
  await updateDoc(doc(db, 'notifications', n.id), {
    dismissedAt: serverTimestamp(),
    ...(n.readAt ? {} : { readAt: serverTimestamp() }),
  });
}

/** Clear every notification that has already been read. */
export async function dismissReadNotifications(items: PortalNotification[]): Promise<void> {
  await Promise.all(items.filter((n) => n.readAt).map(dismissNotification));
}

export async function markAllNotificationsRead(items: PortalNotification[]): Promise<void> {
  await Promise.all(
    items.filter((n) => n.id && !n.readAt).map((n) => markNotificationRead(n.id as string)),
  );
}
