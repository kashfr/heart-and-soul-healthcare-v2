// Local Firestore emulator regression check. Never connects to production.
// Start a Firestore emulator, then run:
// FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/test-patient-roster-rules.mjs
// Uses the existing Firebase SDK dependencies; no emulator test package needed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDocFromServer, getDocsFromServer,
  getFirestore, orderBy, query, serverTimestamp, setDoc, terminate, updateDoc,
} from 'firebase/firestore';

const projectId = 'demo-client-access';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
assert.match(emulatorHost || '', /^(127\.0\.0\.1|localhost):\d+$/, 'Set FIRESTORE_EMULATOR_HOST to a local emulator.');
const [host, portText] = emulatorHost.split(':');
const base = `http://${emulatorHost}`;
const response = await fetch(`${base}/emulator/v1/projects/${projectId}:securityRules`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') }] } }),
  signal: AbortSignal.timeout(15_000),
});
const rulesResult = await response.json();
assert.equal(response.ok, true, `Rules load failed: ${JSON.stringify(rulesResult)}`);
assert.equal((rulesResult.issues || []).some((issue) => issue.severity === 'ERROR'), false, `Invalid rules: ${JSON.stringify(rulesResult.issues)}`);

const adminApp = initializeAdminApp({ projectId }, 'roster-rules-seed');
const adminDb = getAdminFirestore(adminApp);
const apps = [];
let assertions = 0;

function client(uid) {
  const app = initializeApp({ projectId, apiKey: 'emulator-only' }, `roster-${uid || 'anonymous'}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, host, Number(portText), uid ? { mockUserToken: { sub: uid, user_id: uid } } : undefined);
  apps.push({ app, db });
  return db;
}

async function denied(operation) {
  await assert.rejects(operation, (error) => error?.code === 'permission-denied');
  assertions++;
}

async function canReadRoster(db) {
  for (const id of ['gapp-client', 'other-client']) {
    assert.equal((await getDocFromServer(doc(db, 'patients', id))).exists(), true);
    assertions++;
  }
  assert.equal((await getDocsFromServer(query(collection(db, 'patients'), orderBy('name')))).size, 2);
  assertions++;
}

async function cannotReadRoster(db) {
  await denied(() => getDocFromServer(doc(db, 'patients', 'gapp-client')));
  await denied(() => getDocFromServer(doc(db, 'patients', 'other-client')));
  await denied(() => getDocsFromServer(query(collection(db, 'patients'), orderBy('name'))));
}

try {
  // Clear only the dedicated demo emulator project; fixtures contain no real data.
  const cleared = await fetch(`${base}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {
    method: 'DELETE', signal: AbortSignal.timeout(15_000),
  });
  assert.equal(cleared.ok, true, 'Could not clear the demo emulator project.');
  const batch = adminDb.batch();
  for (const role of ['admin', 'supervisor', 'nurse', 'va']) {
    batch.set(adminDb.doc(`users/${role}`), { role, active: true });
    batch.set(adminDb.doc(`users/inactive-${role}`), { role, active: false });
  }
  batch.set(adminDb.doc('patients/gapp-client'), { name: 'A Demo', dob: '2000-01-01', program: 'gapp' });
  batch.set(adminDb.doc('patients/other-client'), { name: 'B Demo', dob: '2000-01-01', program: 'now-comp' });
  batch.set(adminDb.doc('patients/gapp-client/clinical/profile'), { medicaidId: 'DEMO-ONLY' });
  batch.set(adminDb.doc('patients/gapp-client/administrativeAudit/audit-entry'), { action: 'assistant-information-update', actorUid: 'va' });
  await batch.commit();

  const activeClients = new Map();
  for (const role of ['admin', 'supervisor', 'nurse']) {
    const db = client(role);
    activeClients.set(role, db);
    await canReadRoster(db); // Nurses still query the whole roster for autofill.
  }
  const va = client('va');
  activeClients.set('va', va);
  await cannotReadRoster(va); // All VA client access must go through scoped APIs.
  for (const role of ['admin', 'supervisor', 'nurse', 'va']) {
    await cannotReadRoster(client(`inactive-${role}`));
  }
  await cannotReadRoster(client('missing-profile'));
  await cannotReadRoster(client());
  await denied(() => getDocFromServer(doc(va, 'patients/gapp-client/clinical/profile')));
  await denied(() => updateDoc(doc(va, 'patients', 'gapp-client'), { name: 'Forbidden' }));
  await denied(() => updateDoc(doc(activeClients.get('nurse'), 'patients', 'gapp-client'), { name: 'Forbidden' }));
  for (const role of ['admin', 'supervisor']) {
    await updateDoc(doc(activeClients.get(role), 'patients', 'gapp-client'), { name: `Updated by ${role}` });
    assertions++;
    await setDoc(doc(activeClients.get(role), 'patients', `created-by-${role}`), {
      name: 'New Demo', dob: '2000-01-01', createdAt: serverTimestamp(),
    });
    assertions++;
  }
  for (const [role, db] of activeClients) {
    const audit = doc(db, 'patients/gapp-client/administrativeAudit/audit-entry');
    if (role === 'admin') {
      assert.equal((await getDocFromServer(audit)).exists(), true);
      assert.equal((await getDocsFromServer(collection(db, 'patients/gapp-client/administrativeAudit'))).size, 1);
      assertions += 2;
    } else {
      await denied(() => getDocFromServer(audit));
      await denied(() => getDocsFromServer(collection(db, 'patients/gapp-client/administrativeAudit')));
    }
    await denied(() => setDoc(doc(db, 'patients/gapp-client/administrativeAudit/forged-entry'), { actorUid: role }));
    await denied(() => updateDoc(audit, { actorUid: role }));
    await denied(() => deleteDoc(audit));
  }
  console.log(`Patient roster rules: ${assertions} assertions passed.`);
} finally {
  await Promise.all(apps.map(async ({ app, db }) => { await terminate(db); await deleteApp(app); }));
  await adminDb.terminate();
  await deleteAdminApp(adminApp);
}
