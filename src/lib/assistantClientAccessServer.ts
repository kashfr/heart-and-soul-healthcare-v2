import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import { mergeAssistantClients, type AssistantClientsSettings } from './assistantClientAccess';

/**
 * Copy the Assistant Client Access grants onto the assistants' own profiles
 * as users/{uid}.clientAccess, which is what firestore.rules and storage.rules
 * read (they already load the caller's profile for the role, so the grant
 * costs them nothing extra). Called after every settings save; a VA with no
 * grant has the field removed so a revoked grant closes the door at once.
 *
 * Idempotent, and safe to run as a backfill. Returns the uids it granted.
 */
export async function mirrorAssistantClientAccess(settings: AssistantClientsSettings | undefined): Promise<string[]> {
  const grants = mergeAssistantClients(settings).grants;
  const db = adminDb();
  const assistants = await db.collection('users').where('role', '==', 'va').get();
  const batch = db.batch();
  const granted: string[] = [];
  for (const snap of assistants.docs) {
    const grant = grants.find((g) => g.uid === snap.id);
    if (grant) {
      granted.push(snap.id);
      batch.update(snap.ref, { clientAccess: { scope: grant.scope, editInfo: grant.editInfo, uploadDocuments: grant.uploadDocuments } });
    } else if (snap.data().clientAccess !== undefined) {
      batch.update(snap.ref, { clientAccess: FieldValue.delete() });
    }
  }
  await batch.commit();
  return granted;
}
