// One-time backfill: classify every existing client by program + service level.
//
// The mapping below came from Kaheem on 2026-08-10. NOW/COMP is the default for
// anyone not named in a GAPP list, and RN oversight only is the default service
// level, because the daily-LPN caseload is the short, explicitly-known list.
//
// Dry run (prints the plan, writes nothing):   node scripts/backfill-patient-programs.js
// Apply:                                       node scripts/backfill-patient-programs.js --apply
//
// Safe to re-run: it skips any client already carrying the intended values, and
// it hard-aborts if it sees a name it has no mapping for rather than guessing.

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const ROOT = path.join(__dirname, '..');
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

/** Georgia Pediatric Program members. Everyone else on the roster is NOW/COMP. */
const GAPP = [
  'Yanira Fernando-Bautista',
  'Tora Vinson',
  'Cataleya Plaza',
  'Sapphire Simmons',
  'Piper Young',
];

/** Clients staffed with daily LPN services on top of RN oversight. */
const DAILY_LPN = ['Kimberly Guffey', 'Ann Torres', 'Danielle Hall', 'Joy Daughtrey'];

/** Test logins are deliberately left unclassified so they never skew a filter. */
const SKIP = ['ZZ Test Client'];

const APPLY = process.argv.includes('--apply');

function classify(name) {
  if (SKIP.includes(name)) return null;
  const program = GAPP.includes(name) ? 'gapp' : 'now-comp';
  // GAPP is staffed as daily skilled nursing shifts, confirmed by Kaheem
  // 2026-08-10. The oversight-only default below applies to NOW/COMP only.
  if (program === 'gapp') return { program, serviceLevel: 'skilled-nursing-shifts' };
  return {
    program,
    serviceLevel: DAILY_LPN.includes(name) ? 'rn-lpn-daily' : 'rn-oversight',
  };
}

(async () => {
  console.log(`project: ${PROJECT}   mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);
  const snap = await db.collection('patients').orderBy('name').get();

  // Fail loudly if a roster name is missing from the mapping lists, rather than
  // silently defaulting someone into NOW/COMP oversight.
  const known = new Set([...GAPP, ...DAILY_LPN, ...SKIP]);
  const unknownGapp = [...GAPP, ...DAILY_LPN].filter(
    (n) => !snap.docs.some((d) => d.data().name === n),
  );
  if (unknownGapp.length) {
    throw new Error(`ABORT: mapped names not found on the roster: ${unknownGapp.join(', ')}`);
  }

  let planned = 0;
  let skipped = 0;
  console.log('name'.padEnd(26) + 'program'.padEnd(12) + 'service level'.padEnd(24) + 'action');
  console.log('-'.repeat(82));

  const writes = [];
  for (const d of snap.docs) {
    const p = d.data();
    const want = classify(p.name);
    if (!want) {
      console.log(`${String(p.name).padEnd(26)}${'—'.padEnd(12)}${'—'.padEnd(24)}skip (test account)`);
      skipped++;
      continue;
    }
    const same =
      p.program === want.program &&
      (want.serviceLevel === undefined || p.serviceLevel === want.serviceLevel);
    const note = known.has(p.name) ? '' : ' (defaulted)';
    console.log(
      String(p.name).padEnd(26) +
        want.program.padEnd(12) +
        (want.serviceLevel ?? 'NEEDS INPUT').padEnd(24) +
        (same ? 'already set' : `set${note}`),
    );
    if (!same) {
      planned++;
      writes.push([d.ref, want]);
    }
  }

  console.log(`\n${planned} to write, ${skipped} skipped, ${snap.size - planned - skipped} already correct`);
  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write.');
    return;
  }

  const batch = db.batch();
  writes.forEach(([ref, want]) => batch.set(ref, want, { merge: true }));
  await batch.commit();

  const after = await db.collection('patients').orderBy('name').get();
  const bad = after.docs.filter((d) => {
    const want = classify(d.data().name);
    if (!want) return false;
    if (d.data().program !== want.program) return true;
    return want.serviceLevel !== undefined && d.data().serviceLevel !== want.serviceLevel;
  });
  console.log(bad.length === 0 ? '\nVERIFIED: all clients classified as planned.' : `\nWARNING: ${bad.length} did not take.`);
})()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(String(e.message || e));
    process.exit(1);
  });
