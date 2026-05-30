// One-off maintenance: recompute q5_ageYears for progress notes whose stored
// age no longer matches the age implied by q4_dateofBirth as-of
// q6_dateofService. This drift happened when a prior backfill corrected a
// note's DOB but left the previously-computed age string in place
// (e.g. Yanira Fernando-Bautista showing "0 days" with a 2022 DOB).
//
// DRY RUN by default — prints every proposed change and writes nothing.
// Pass --apply to actually update Firestore.
//
//   node src/scripts/fix-note-ages.mjs            # preview only
//   node src/scripts/fix-note-ages.mjs --apply    # write changes
//
// Auth: uses the Firebase Admin service account from .env.local
// (FIREBASE_ADMIN_PROJECT_ID / _CLIENT_EMAIL / _PRIVATE_KEY). No browser
// sign-in required.

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');

// The worktree has no .env.local; fall back to the main checkout's copy.
const ENV_CANDIDATES = [
  path.resolve(process.cwd(), '.env.local'),
  '/Users/kfreeman/projects/heart-and-soul-healthcare-v2/.env.local',
];
const envPath = ENV_CANDIDATES.find((p) => fs.existsSync(p));
if (!envPath) {
  console.error('Could not find .env.local in any known location.');
  process.exit(1);
}
const env = dotenv.parse(fs.readFileSync(envPath));

const projectId = env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing FIREBASE_ADMIN_* env vars in', envPath);
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
}
const db = getFirestore();

// Parse a stored date string into a Date anchored at noon (matches the form's
// `new Date(dob + 'T12:00:00')` convention so day-boundary math is identical).
// Accepts YYYY-MM-DD (the storage format) and tolerates MM/DD/YYYY just in case.
function parseDate(s) {
  if (!s || typeof s !== 'string') return null;
  const trimmed = s.trim();
  let y, m, d;
  let match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    [, y, m, d] = match;
  } else {
    match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      [, m, d, y] = match;
    } else {
      return null;
    }
  }
  const date = new Date(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00`);
  return isNaN(date.getTime()) ? null : date;
}

// EXACT replica of FormPageOne.calculateAge(dob, asOfDate) so the stored value
// matches what the form would have produced at submission time.
function computeAge(dobStr, asOfStr) {
  const birthDate = parseDate(dobStr);
  const asOf = parseDate(asOfStr);
  if (!birthDate || !asOf) return null;

  let years = asOf.getFullYear() - birthDate.getFullYear();
  const monthDiff = asOf.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < birthDate.getDate())) {
    years--;
  }
  if (years >= 1) return String(years);

  let months = (asOf.getFullYear() - birthDate.getFullYear()) * 12 + (asOf.getMonth() - birthDate.getMonth());
  if (asOf.getDate() < birthDate.getDate()) months--;
  if (months >= 1) return `${months} mo`;

  const diffMs = asOf.getTime() - birthDate.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return `${days} day${days !== 1 ? 's' : ''}`;
}

async function main() {
  console.log(`\n=== fix-note-ages (${APPLY ? 'APPLY' : 'DRY RUN'}) ===`);
  console.log(`Project: ${projectId}\n`);

  const snap = await db.collection('progressNotes').get();
  console.log(`Scanned ${snap.size} progress notes.\n`);

  const changes = [];
  const skippedNoDob = [];
  const skippedNoService = [];
  const skippedBadDate = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const dob = (data.q4_dateofBirth || '').trim();
    const svc = (data.q6_dateofService || '').trim();
    const stored = (data.q5_ageYears || '').trim();
    const name = data.q3_clientName || '(no name)';

    if (!dob) { skippedNoDob.push({ id: doc.id, name }); continue; }
    if (!svc) { skippedNoService.push({ id: doc.id, name, dob, stored }); continue; }

    const expected = computeAge(dob, svc);
    if (expected === null) { skippedBadDate.push({ id: doc.id, name, dob, svc }); continue; }

    if (stored !== expected) {
      changes.push({ id: doc.id, name, dob, svc, stored: stored || '(empty)', expected, ref: doc.ref });
    }
  }

  if (changes.length === 0) {
    console.log('No age mismatches found. Nothing to fix.');
  } else {
    console.log(`Found ${changes.length} note(s) with an incorrect age:\n`);
    for (const c of changes) {
      console.log(
        `  ${c.id}  ${c.name}\n` +
        `      DOB ${c.dob} | service ${c.svc} | age "${c.stored}" -> "${c.expected}"`
      );
    }
  }

  // Report skips so nothing is silently ignored.
  console.log('');
  if (skippedNoService.length) {
    console.log(`Skipped ${skippedNoService.length} note(s) with a DOB but NO date of service (can't compute as-of age):`);
    for (const s of skippedNoService) console.log(`  ${s.id}  ${s.name}  (dob ${s.dob}, stored age "${s.stored}")`);
  }
  if (skippedBadDate.length) {
    console.log(`Skipped ${skippedBadDate.length} note(s) with an unparseable DOB/service date:`);
    for (const s of skippedBadDate) console.log(`  ${s.id}  ${s.name}  (dob "${s.dob}", svc "${s.svc}")`);
  }
  if (skippedNoDob.length) {
    console.log(`Skipped ${skippedNoDob.length} note(s) with no DOB at all (nothing to base age on).`);
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — no changes written. Re-run with --apply to write ${changes.length} change(s).`);
    return;
  }

  if (changes.length === 0) return;

  console.log(`\nApplying ${changes.length} change(s)...`);
  const BATCH_LIMIT = 450;
  let batch = db.batch();
  let pending = 0;
  for (const c of changes) {
    batch.update(c.ref, {
      q5_ageYears: c.expected,
      ageRecalculatedAt: FieldValue.serverTimestamp(),
      ageRecalculatedFrom: c.stored === '(empty)' ? '' : c.stored,
    });
    pending++;
    if (pending >= BATCH_LIMIT) { await batch.commit(); batch = db.batch(); pending = 0; }
  }
  if (pending > 0) await batch.commit();
  console.log(`Done. Updated ${changes.length} note(s).`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
