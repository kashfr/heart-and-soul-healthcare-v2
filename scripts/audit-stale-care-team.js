// Audit: find care-team entries (patients.assignedNurseIds) that point at a
// deactivated account or at a uid with no users doc at all.
//
// Deactivation scrubs care teams automatically since #152, but staff
// deactivated before that left their uid behind. Those entries grant nothing
// while the account is inactive (Firestore rules require an active profile),
// but they silently restore chart access if the account is ever reactivated.
//
// Removing an entry only takes that uid off the team. It never touches the
// deactivated nurse's notes: care-team nurses read a note because THEY are on
// the note's patient's team, not because its author is.
//
// Needs .env.local with the FIREBASE_ADMIN_* service-account vars.
//
// Dry run:  node scripts/audit-stale-care-team.js
// Apply:    node scripts/audit-stale-care-team.js --apply

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');

const raw = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const env = {};
raw.replace(/^([A-Z_]+)=(?:"((?:[^"\\]|\\.)*)"|(.*))$/gm, (_, k, q, plain) => {
  env[k] = q !== undefined ? q.replace(/\\n/g, '\n') : plain;
});

const PROJECT = 'heart-and-soul-hc';
if (env.FIREBASE_ADMIN_PROJECT_ID !== PROJECT) {
  throw new Error(`ABORT: expected project ${PROJECT}, got ${env.FIREBASE_ADMIN_PROJECT_ID}`);
}
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY,
  }),
});
const db = admin.firestore();

async function main() {
  console.log(`project: ${PROJECT}   mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  const users = new Map();
  (await db.collection('users').get()).forEach((d) => users.set(d.id, d.data()));

  const stale = []; // { ref, patient, uid, why, who }
  const patients = await db.collection('patients').get();
  patients.forEach((d) => {
    const team = Array.isArray(d.data().assignedNurseIds) ? d.data().assignedNurseIds : [];
    for (const uid of team) {
      const u = users.get(uid);
      if (!u) {
        stale.push({ ref: d.ref, patient: d.data().name, uid, why: 'no users doc', who: '(unknown)' });
      } else if (u.active === false) {
        const who = `${u.displayName || u.email || '(no name)'}${u.credential ? ` (${u.credential})` : ''}${u.isTestAccount ? ' [TEST]' : ''}`;
        stale.push({ ref: d.ref, patient: d.data().name, uid, why: 'deactivated', who });
      }
    }
  });

  if (stale.length === 0) {
    console.log(`No stale entries across ${patients.size} clients.`);
    return;
  }
  for (const s of stale) {
    console.log(`${String(s.patient).padEnd(28)}${s.who.padEnd(36)}${s.why.padEnd(14)}${s.uid}`);
  }
  const clients = new Set(stale.map((s) => s.ref.id)).size;
  console.log(`\n${stale.length} stale entries on ${clients} of ${patients.size} clients`);

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to remove them.');
    return;
  }
  const batch = db.batch();
  for (const s of stale) {
    batch.update(s.ref, { assignedNurseIds: admin.firestore.FieldValue.arrayRemove(s.uid) });
  }
  await batch.commit();
  console.log('\nRemoved.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
