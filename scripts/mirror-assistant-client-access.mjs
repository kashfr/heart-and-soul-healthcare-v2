// One-off / repair: copy Settings > Assistant Client Access grants onto the
// assistants' profiles (users/{uid}.clientAccess), which firestore.rules and
// storage.rules read. The settings route does this on every save; run this
// after the first rules deploy, or whenever a profile looks out of step.
//
//   node --env-file=.env.local scripts/mirror-assistant-client-access.mjs
//
// Prints what it granted; writes nothing else.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});
const db = getFirestore();
const settings = (await db.doc('settings/global').get()).data() || {};
const grants = Array.isArray(settings.assistantClients?.grants) ? settings.assistantClients.grants : [];
const assistants = await db.collection('users').where('role', '==', 'va').get();
const batch = db.batch();
for (const snap of assistants.docs) {
  const g = grants.find((x) => x && x.uid === snap.id && (x.scope === 'gapp' || x.scope === 'all'));
  if (g) {
    batch.update(snap.ref, { clientAccess: { scope: g.scope, editInfo: g.editInfo === true, uploadDocuments: g.uploadDocuments === true } });
    console.log('granted', snap.id, snap.data().displayName, g.scope, 'edit', g.editInfo === true, 'upload', g.uploadDocuments === true);
  } else if (snap.data().clientAccess !== undefined) {
    batch.update(snap.ref, { clientAccess: FieldValue.delete() });
    console.log('cleared', snap.id, snap.data().displayName);
  }
}
await batch.commit();
console.log('done');
