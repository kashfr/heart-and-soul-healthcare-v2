import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import { normalizeCounty, SERVICE_KEYS, type GappServiceKey } from './georgia';
import type { AuthedCaller } from './adminAuthGuard';

// Reusable directory of partner agencies we share referrals with. One record per
// agency (deduped by email), so the share box can autocomplete instead of making
// staff retype the same name/email every time, and so an agency's details (e.g.
// a corrected email) can be edited in one place. All access is Admin-SDK only.

const COLLECTION = 'partnerAgencies';

const MAX = { name: 200, email: 320, phone: 40, contact: 200, notes: 2000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface PartnerAgency {
  id: string;
  name: string;
  email: string;
  phone: string;
  contactName: string;
  notes: string;
  /** Georgia counties this agency serves (canonical names from GA_COUNTIES). */
  counties: string[];
  /** GAPP service lines offered (keys from SERVICE_KEYS). */
  services: GappServiceKey[];
  shareCount: number;
  lastSharedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PartnerAgencyInput {
  name: string;
  email: string;
  phone?: string;
  contactName?: string;
  notes?: string;
  counties?: string[];
  services?: string[];
}

/** Normalize + dedupe a county list against the canonical 159; drops unknowns. */
function sanitizeCounties(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const v of value) {
    const c = normalizeCounty(v);
    if (c) out.add(c);
  }
  return [...out].sort();
}

/** Keep only known GAPP service keys, deduped, in canonical order. */
function sanitizeServices(value: string[] | undefined): GappServiceKey[] {
  if (!Array.isArray(value)) return [];
  const set = new Set(value.map((v) => String(v ?? '').trim().toLowerCase()));
  return SERVICE_KEYS.filter((k) => set.has(k));
}

function clamp(value: string | undefined, max: number): string {
  const s = String(value ?? '').trim();
  return s.length > max ? s.slice(0, max) : s;
}
function normEmail(email: string | undefined): string {
  return clamp(email, MAX.email).toLowerCase();
}
function toIso(ts: unknown): string | null {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : null;
}

function serialize(id: string, data: FirebaseFirestore.DocumentData): PartnerAgency {
  return {
    id,
    name: data.name ?? '',
    email: data.email ?? '',
    phone: data.phone ?? '',
    contactName: data.contactName ?? '',
    notes: data.notes ?? '',
    counties: sanitizeCounties(data.counties),
    services: sanitizeServices(data.services),
    shareCount: typeof data.shareCount === 'number' ? data.shareCount : 0,
    lastSharedAt: toIso(data.lastSharedAt),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

/** First non-archived agency doc with this email, or null. */
async function findByEmail(email: string): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .where('email', '==', email)
    .limit(5)
    .get();
  const live = snap.docs.find((d) => d.data().archived !== true);
  return live ?? null;
}

/** All non-archived agencies, sorted by name (sorted in memory — no index needed). */
export async function listPartnerAgencies(): Promise<PartnerAgency[]> {
  const snap = await adminDb().collection(COLLECTION).get();
  return snap.docs
    .filter((d) => d.data().archived !== true)
    .map((d) => serialize(d.id, d.data()))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export async function getPartnerAgency(id: string): Promise<PartnerAgency | null> {
  const snap = await adminDb().collection(COLLECTION).doc(id).get();
  if (!snap.exists || snap.data()?.archived === true) return null;
  return serialize(snap.id, snap.data() as FirebaseFirestore.DocumentData);
}

/** Manually create an agency from the directory page. Rejects duplicate emails. */
export async function createPartnerAgency(
  input: PartnerAgencyInput,
  caller: AuthedCaller
): Promise<PartnerAgency> {
  const name = clamp(input.name, MAX.name);
  const email = normEmail(input.email);
  if (!name) throw new Error('Agency name is required.');
  if (!EMAIL_RE.test(email)) throw new Error('A valid email is required.');
  if (await findByEmail(email)) {
    throw new Error('An agency with that email already exists.');
  }

  const ref = await adminDb().collection(COLLECTION).add({
    name,
    email,
    phone: clamp(input.phone, MAX.phone),
    contactName: clamp(input.contactName, MAX.contact),
    notes: clamp(input.notes, MAX.notes),
    counties: sanitizeCounties(input.counties),
    services: sanitizeServices(input.services),
    shareCount: 0,
    lastSharedAt: null,
    archived: false,
    createdBy: caller.uid,
    createdByName: caller.profile.displayName || '',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return serialize(ref.id, snap.data() as FirebaseFirestore.DocumentData);
}

/** Edit an agency's fields (only provided keys change). Guards email uniqueness. */
export async function updatePartnerAgency(
  id: string,
  patch: Partial<PartnerAgencyInput>,
  caller: AuthedCaller
): Promise<PartnerAgency | null> {
  const ref = adminDb().collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.archived === true) return null;

  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: caller.uid,
  };
  if (patch.name !== undefined) {
    const name = clamp(patch.name, MAX.name);
    if (!name) throw new Error('Agency name cannot be empty.');
    update.name = name;
  }
  if (patch.email !== undefined) {
    const email = normEmail(patch.email);
    if (!EMAIL_RE.test(email)) throw new Error('A valid email is required.');
    if (email !== (snap.data()?.email ?? '')) {
      const dup = await findByEmail(email);
      if (dup && dup.id !== id) throw new Error('Another agency already uses that email.');
    }
    update.email = email;
  }
  if (patch.phone !== undefined) update.phone = clamp(patch.phone, MAX.phone);
  if (patch.contactName !== undefined) update.contactName = clamp(patch.contactName, MAX.contact);
  if (patch.notes !== undefined) update.notes = clamp(patch.notes, MAX.notes);
  if (patch.counties !== undefined) update.counties = sanitizeCounties(patch.counties);
  if (patch.services !== undefined) update.services = sanitizeServices(patch.services);

  await ref.update(update);
  const fresh = await ref.get();
  return serialize(id, fresh.data() as FirebaseFirestore.DocumentData);
}

/** Soft-delete (archive) — keeps share history intact, drops it from lists. */
export async function archivePartnerAgency(id: string, caller: AuthedCaller): Promise<boolean> {
  const ref = adminDb().collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.update({
    archived: true,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: caller.uid,
  });
  return true;
}

/**
 * Remember an agency from a share: if one with this email exists, bump its
 * share stats; otherwise create it. Best-effort — used by the share flow so
 * agencies are captured automatically. Returns the agency id (or null on no-op).
 */
export async function rememberAgencyFromShare(
  input: { name: string; email: string },
  caller: AuthedCaller
): Promise<string | null> {
  const name = clamp(input.name, MAX.name);
  const email = normEmail(input.email);
  if (!name || !EMAIL_RE.test(email)) return null;

  const existing = await findByEmail(email);
  if (existing) {
    await existing.ref.update({
      shareCount: FieldValue.increment(1),
      lastSharedAt: FieldValue.serverTimestamp(),
      // Backfill a name if the directory entry somehow lacks one.
      ...(existing.data().name ? {} : { name }),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return existing.id;
  }

  const ref = await adminDb().collection(COLLECTION).add({
    name,
    email,
    phone: '',
    contactName: '',
    notes: '',
    shareCount: 1,
    lastSharedAt: FieldValue.serverTimestamp(),
    archived: false,
    createdBy: caller.uid,
    createdByName: caller.profile.displayName || '',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}
