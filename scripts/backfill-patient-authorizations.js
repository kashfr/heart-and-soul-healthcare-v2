// One-time backfill: mirror each client's Therap Service Authorization lines
// onto their patient record, so the reconciliation check has something to
// compare the hand-entered service level against.
//
// LOCAL ONLY. This reads the authorization PDFs out of the OneDrive client
// folders and needs `pdftotext` (poppler) on PATH. It is not something the
// deployed app runs; Therap remains the system of record and this is a mirror
// of the few fields that drive a decision.
//
// Dry run:  node scripts/backfill-patient-authorizations.js
// Apply:    node scripts/backfill-patient-authorizations.js --apply

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const admin = require('firebase-admin');

const ROOT = path.join(__dirname, '..');
const CLIENTS = path.join(
  process.env.HOME,
  'Library/CloudStorage/OneDrive-hshcga.org/CLIENTS/NOW-COMP',
);

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
const APPLY = process.argv.includes('--apply');

/** 'LALANI, LAHIN' -> 'Lahin Lalani'. Folder names are LAST, FIRST. */
function folderToName(folder) {
  const [last, first] = folder.split(',').map((s) => s.trim());
  if (!first) return null;
  const title = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return `${first.split(/\s+/).map(title).join(' ')} ${last.split(/\s+/).map(title).join(' ')}`;
}

/** MM/DD/YYYY -> YYYY-MM-DD. */
function toISO(us) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(us);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : undefined;
}

function textOf(file) {
  try {
    return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  } catch {
    return '';
  }
}

/** Pull every Service Authorization line out of one PDF. */
function parseAuthorizations(file) {
  const t = textOf(file);
  const out = [];
  for (const m of t.matchAll(/Service\s+(N[LR]\d|T\d{4})\s*-\s*Nursing/g)) {
    const win = t.slice(Math.max(0, m.index - 1000), m.index + 1400);
    const grab = (re) => {
      const g = re.exec(win);
      return g ? g[1] : undefined;
    };
    const from = toISO(grab(/Service From Date\s+([\d/]+)/) ?? '');
    const to = toISO(grab(/Service To Date\s+([\d/]+)/) ?? '');
    const amount = grab(/Service Amount\s+([\d.]+)/);
    const frequency = grab(/Frequency\s+(\w+)/);
    if (!from || !frequency) continue;
    out.push({
      serviceCode: m[1],
      frequency,
      ...(amount ? { amount: Number(amount) } : {}),
      from,
      ...(to ? { to } : {}),
    });
  }
  // De-duplicate: the same authorization is often filed in more than one place.
  const seen = new Set();
  return out.filter((a) => {
    const k = `${a.serviceCode}|${a.frequency}|${a.from}|${a.to}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

(async () => {
  console.log(`project: ${PROJECT}   mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);
  const snap = await db.collection('patients').get();
  // Keyed case-insensitively: folder names are LAST, FIRST in caps, and
  // title-casing them mangles internal capitals ("McCallister" -> "Mccallister").
  const byName = new Map(snap.docs.map((d) => [String(d.data().name).toLowerCase(), d]));

  const folders = fs
    .readdirSync(CLIENTS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.includes(','))
    .map((e) => e.name);

  const writes = [];
  let unmatched = 0;
  for (const folder of folders.sort()) {
    const name = folderToName(folder);
    const doc = name ? byName.get(name.toLowerCase()) : undefined;
    if (!doc) {
      // Prospects and former referrals have folders but no patient record.
      console.log(`${folder.slice(0, 30).padEnd(32)}(no patient record, skipped)`);
      unmatched++;
      continue;
    }
    const dir = path.join(CLIENTS, folder);
    const pdfs = [];
    (function walk(p) {
      for (const e of fs.readdirSync(p, { withFileTypes: true })) {
        const full = path.join(p, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.toLowerCase().endsWith('.pdf') && /auth/i.test(full)) pdfs.push(full);
      }
    })(dir);

    const auths = [];
    const seen = new Set();
    for (const f of pdfs) {
      for (const a of parseAuthorizations(f)) {
        const k = `${a.serviceCode}|${a.frequency}|${a.from}|${a.to}`;
        if (!seen.has(k)) {
          seen.add(k);
          auths.push(a);
        }
      }
    }
    auths.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.serviceCode.localeCompare(b.serviceCode)));

    const desc = auths.length
      ? auths.map((a) => `${a.serviceCode} ${a.frequency}${a.amount ? ` ${a.amount}h` : ''} ${a.from}..${a.to ?? '?'}`).join('; ')
      : '(none found)';
    // Print the record's own spelling, not the derived one.
    console.log(`${String(doc.data().name).padEnd(26)}${String(auths.length).padStart(2)}  ${desc}`);
    if (auths.length) writes.push([doc.ref, auths]);
  }

  console.log(`\n${writes.length} clients with authorizations, ${unmatched} folders without a patient record`);
  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write.');
    return;
  }
  const batch = db.batch();
  writes.forEach(([ref, authorizations]) => batch.set(ref, { authorizations }, { merge: true }));
  await batch.commit();
  console.log('\nWritten.');
})()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(String(e.message || e));
    process.exit(1);
  });
