// Local Firestore emulator regression check. Never connects to production.
// Start a Firestore emulator, then run:
// FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/test-patient-roster-rules.mjs
// Uses the existing Firebase SDK dependencies; no emulator test package needed.
//
// Covers the roster read tiers and, since October 2026, the virtual-assistant
// grant: users/{uid}.clientAccess (mirrored from Settings > Assistant Client
// Access) lets an assistant read and maintain client records like staff,
// scoped to her program, and never delete, chart, or see billing rates.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDocFromServer, getDocsFromServer,
  getFirestore, orderBy, query, serverTimestamp, setDoc, terminate, updateDoc, where,
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
async function allowed(operation) {
  await operation();
  assertions++;
}

async function canReadRoster(db, expectedSize = 2) {
  for (const id of ['gapp-client', 'other-client']) {
    assert.equal((await getDocFromServer(doc(db, 'patients', id))).exists(), true);
    assertions++;
  }
  assert.equal((await getDocsFromServer(query(collection(db, 'patients'), orderBy('name')))).size, expectedSize);
  assertions++;
}

async function cannotReadRoster(db) {
  await denied(() => getDocFromServer(doc(db, 'patients', 'gapp-client')));
  await denied(() => getDocFromServer(doc(db, 'patients', 'other-client')));
  await denied(() => getDocsFromServer(query(collection(db, 'patients'), orderBy('name'))));
}

const authorizationLine = (patientId) => ({
  patientId, paNumber: '126101100192', kind: 'skilled', covers: 'shift', rateBasis: 'week', rateHours: 16,
  totalUnits: null, serviceCode: '', from: '2026-10-20', to: '2027-03-31', monthOverrides: { '2026-11': 69 }, note: '',
});
const documentMetadata = (uid, patientId, docId) => ({
  patientId, uploadedBy: uid, uploadedAt: serverTimestamp(), archived: false, category: 'Other', fileName: 'letter.pdf',
  contentType: 'application/pdf', storagePath: `patients/${patientId}/documents/${docId}/letter.pdf`, title: 'Letter',
});

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
  // Granted assistants: GAPP scope with editing + uploads; every client, view
  // only; GAPP scope, view only; and a granted but deactivated account.
  batch.set(adminDb.doc('users/va-gapp'), { role: 'va', active: true, clientAccess: { scope: 'gapp', editInfo: true, uploadDocuments: true } });
  batch.set(adminDb.doc('users/va-all'), { role: 'va', active: true, clientAccess: { scope: 'all', editInfo: false, uploadDocuments: false } });
  batch.set(adminDb.doc('users/va-view'), { role: 'va', active: true, clientAccess: { scope: 'gapp', editInfo: false, uploadDocuments: false } });
  batch.set(adminDb.doc('users/inactive-va-gapp'), { role: 'va', active: false, clientAccess: { scope: 'gapp', editInfo: true, uploadDocuments: true } });
  batch.set(adminDb.doc('patients/gapp-client'), { name: 'A Demo', dob: '2000-01-01', program: 'gapp' });
  batch.set(adminDb.doc('patients/other-client'), { name: 'B Demo', dob: '2000-01-01', program: 'now-comp' });
  batch.set(adminDb.doc('patients/gapp-client/clinical/profile'), { medicaidId: 'DEMO-ONLY' });
  batch.set(adminDb.doc('patients/gapp-client/clinical/physicians'), { list: [] });
  batch.set(adminDb.doc('patients/gapp-client/administrativeAudit/audit-entry'), { action: 'assistant-information-update', actorUid: 'va' });
  batch.set(adminDb.doc('hoursAuthorizations/existing-line'), authorizationLine('gapp-client'));
  batch.set(adminDb.doc('billingRates/rate'), { program: 'gapp', bucket: 'shift', ratePerUnit: 9.5 });
  await batch.commit();

  const activeClients = new Map();
  for (const role of ['admin', 'supervisor', 'nurse']) {
    const db = client(role);
    activeClients.set(role, db);
    await canReadRoster(db); // Nurses still query the whole roster for autofill.
  }
  const va = client('va');
  activeClients.set('va', va);
  await cannotReadRoster(va); // No grant, no client access at all.
  for (const role of ['admin', 'supervisor', 'nurse', 'va']) {
    await cannotReadRoster(client(`inactive-${role}`));
  }
  await cannotReadRoster(client('inactive-va-gapp'));
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

  // A GAPP-scoped assistant with editing: her program's clients, their
  // records, and the hours lines, all without a delete.
  const vaGapp = client('va-gapp');
  assert.equal((await getDocFromServer(doc(vaGapp, 'patients', 'gapp-client'))).exists(), true); assertions++;
  await denied(() => getDocFromServer(doc(vaGapp, 'patients', 'other-client')));
  assert.equal((await getDocsFromServer(query(collection(vaGapp, 'patients'), where('program', '==', 'gapp')))).size, 1); assertions++;
  await denied(() => getDocsFromServer(query(collection(vaGapp, 'patients'), orderBy('name'))));
  assert.equal((await getDocFromServer(doc(vaGapp, 'patients/gapp-client/clinical/profile'))).exists(), true); assertions++;
  await allowed(() => updateDoc(doc(vaGapp, 'patients', 'gapp-client'), { name: 'Updated by assistant' }));
  await allowed(() => setDoc(doc(vaGapp, 'patients/gapp-client/clinical/physicians'), { list: [{ id: 'p1', name: 'Dr. Demo', specialty: 'Primary Care' }] }));
  await allowed(() => setDoc(doc(vaGapp, 'patients', 'created-by-assistant'), { name: 'New Demo', dob: '2000-01-01', program: 'gapp', createdAt: serverTimestamp() }));
  await denied(() => deleteDoc(doc(vaGapp, 'patients', 'created-by-assistant')));
  await denied(() => deleteDoc(doc(vaGapp, 'patients/gapp-client/clinical/physicians')));
  assert.equal((await getDocsFromServer(query(collection(vaGapp, 'hoursAuthorizations'), where('patientId', '==', 'gapp-client')))).size, 1); assertions++;
  await allowed(() => setDoc(doc(vaGapp, 'hoursAuthorizations', 'assistant-line'), authorizationLine('gapp-client')));
  await allowed(() => updateDoc(doc(vaGapp, 'hoursAuthorizations', 'assistant-line'), { note: 'Letter signed 10/21/2026' }));
  await denied(() => deleteDoc(doc(vaGapp, 'hoursAuthorizations', 'existing-line')));
  await denied(() => getDocFromServer(doc(vaGapp, 'billingRates', 'rate')));
  await allowed(() => setDoc(doc(vaGapp, 'patientDocuments', 'assistant-upload'), documentMetadata('va-gapp', 'gapp-client', 'assistant-upload')));
  await denied(() => setDoc(doc(vaGapp, 'marOrders', 'forbidden'), { patientId: 'gapp-client', createdBy: 'va-gapp', createdAt: serverTimestamp(), status: 'active' }));
  await denied(() => setDoc(doc(vaGapp, 'marAdministrations', 'forbidden'), { patientId: 'gapp-client', documentedBy: 'va-gapp', at: serverTimestamp(), status: 'given' }));

  // Every client, view only: both clients and the unfiltered roster query,
  // but no edit and no upload.
  const vaAll = client('va-all');
  await canReadRoster(vaAll, 5); // the two fixtures plus the three clients created above
  await denied(() => updateDoc(doc(vaAll, 'patients', 'gapp-client'), { name: 'Forbidden' }));
  await denied(() => setDoc(doc(vaAll, 'patientDocuments', 'view-only-upload'), documentMetadata('va-all', 'gapp-client', 'view-only-upload')));
  await denied(() => setDoc(doc(vaAll, 'hoursAuthorizations', 'view-only-line'), authorizationLine('gapp-client')));

  // GAPP scope, view only.
  const vaView = client('va-view');
  assert.equal((await getDocFromServer(doc(vaView, 'patients', 'gapp-client'))).exists(), true); assertions++;
  assert.equal((await getDocFromServer(doc(vaView, 'patients/gapp-client/clinical/profile'))).exists(), true); assertions++;
  await denied(() => updateDoc(doc(vaView, 'patients', 'gapp-client'), { name: 'Forbidden' }));
  await denied(() => setDoc(doc(vaView, 'patients/gapp-client/clinical/physicians'), { list: [] }));

  // The administrative audit stays the owner's: no other role reads it, and no
  // browser writes it.
  activeClients.set('va-gapp', vaGapp);
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
