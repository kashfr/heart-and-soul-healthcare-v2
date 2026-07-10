import 'server-only';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';

/**
 * Server-side writer for in-portal notifications (the bell). Rules deny all
 * client creates, so every notification flows through here (Admin SDK). The
 * text lives behind the login, so naming the client is fine — this is the
 * channel that carries the detail the PHI-free SMS/email deliberately omit.
 */
export async function createPortalNotification(
  db: Firestore,
  params: { userId: string; kind: string; text: string; href?: string },
): Promise<void> {
  try {
    await db.collection('notifications').add({
      userId: params.userId,
      kind: params.kind,
      text: params.text,
      href: params.href || '',
      createdAt: FieldValue.serverTimestamp(),
      readAt: null,
    });
  } catch (err) {
    // Best-effort like the other channels — never fail the caller.
    console.error('Portal notification write failed:', err);
  }
}
