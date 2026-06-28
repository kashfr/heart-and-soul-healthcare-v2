import 'server-only';
import { randomBytes, createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import { getReferral, logReferralActivity, type ReferralDetail } from './referrals';
import { rememberAgencyFromShare } from './partnerAgencies';
import {
  deriveShareStatus,
  foldShareSummaries,
  type ShareStatus,
  type ShareSummaryRow,
  type ReferralShareSummary,
} from './referralShareSummary';
import type { AuthedCaller } from './adminAuthGuard';

// Re-export the pure share helpers/types so existing importers of this module
// keep working; the logic itself lives in referralShareSummary.ts (testable,
// no 'server-only').
export { deriveShareStatus, foldShareSummaries };
export type { ShareStatus, ShareSummaryRow, ReferralShareSummary } from './referralShareSummary';

// Agency sharing: hand a referral to an external partner agency via a secure,
// expiring, revocable link — no partner login. The raw token lives only in the
// emailed link; we store its SHA-256 hash as the document id, so the database
// never holds anything that can reconstruct a working link (like a password).
// Every open is audited (view count + timestamps). All access is server-side
// (Admin SDK); partners never touch the client SDK.

const COLLECTION = 'referralShares';

const MAX = { agency: 200, email: 320 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A share as shown to the admin who manages it. Includes the raw `token` so the
 * link can be re-copied anytime (Option 2). This is admin-only data — the token
 * is returned solely from the admin-gated list endpoint and never from any
 * public route. (Storing the token plaintext is the deliberate tradeoff for a
 * re-copyable share link; access is Admin-SDK + default-deny rules.)
 */
export interface ReferralShare {
  id: string;
  referralId: string;
  partnerAgency: string;
  partnerEmail: string;
  /** True for a "referred out, no link emailed" manual record. */
  manual: boolean;
  createdByName: string;
  createdAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  status: ShareStatus;
  /** Raw token for re-copying the link; null for shares created before this. */
  token: string | null;
}

/** The read-only referral payload a partner sees on the shared link. */
export interface SharedReferralView {
  partnerAgency: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  county: string;
  program: string;
  referrerName: string;
  details: ReferralDetail[];
  submittedAt: string | null;
}

export type ResolveResult =
  | { ok: true; referral: SharedReferralView }
  | { ok: false; reason: 'not_found' | 'expired' | 'revoked' };

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

// Full SHA-256 (no truncation) so the id space matches the token's full entropy
// and create() collisions stay astronomically improbable.
function shareDocId(token: string): string {
  return `sh_${createHash('sha256').update(token).digest('hex')}`;
}

function isAlreadyExists(err: unknown): boolean {
  const e = err as { code?: number | string; message?: string };
  return e?.code === 6 || /already exists/i.test(e?.message ?? '');
}

function clamp(value: string, max: number): string {
  const s = String(value ?? '').trim();
  return s.length > max ? s.slice(0, max) : s;
}

function toIso(ts: unknown): string | null {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : null;
}
function toMillis(ts: unknown): number | null {
  const t = ts as { toMillis?: () => number } | null | undefined;
  return t && typeof t.toMillis === 'function' ? t.toMillis() : null;
}

function serializeShare(id: string, data: FirebaseFirestore.DocumentData, nowMs: number): ReferralShare {
  const revokedAtMs = toMillis(data.revokedAt);
  const expiresAtMs = toMillis(data.expiresAt);
  const viewCount = typeof data.viewCount === 'number' ? data.viewCount : 0;
  return {
    id,
    referralId: data.referralId ?? '',
    partnerAgency: data.partnerAgency ?? '',
    partnerEmail: data.partnerEmail ?? '',
    createdByName: data.createdByName ?? '',
    createdAt: toIso(data.createdAt),
    expiresAt: toIso(data.expiresAt),
    revokedAt: toIso(data.revokedAt),
    viewCount,
    lastViewedAt: toIso(data.lastViewedAt),
    manual: data.manual ?? false,
    status: deriveShareStatus(revokedAtMs, expiresAtMs, viewCount, nowMs),
    token: data.token ?? null,
  };
}

export interface CreateShareInput {
  partnerAgency: string;
  partnerEmail: string;
  /** Link lifetime in days (default 14). */
  expiresInDays?: number;
  /**
   * A manual "referred out" record (handed off by phone/fax/email outside the
   * portal): email becomes optional and no link is emailed. The share doc + token
   * are still created so the agency is captured and a link can be copied later.
   */
  manual?: boolean;
}

/**
 * Create a share link for a referral. Returns the raw token ONCE (for the
 * emailed link / copy-to-clipboard); it is never retrievable again.
 */
export async function createReferralShare(
  referralId: string,
  input: CreateShareInput,
  caller: AuthedCaller
): Promise<{ token: string; share: ReferralShare }> {
  const partnerAgency = clamp(input.partnerAgency, MAX.agency);
  const partnerEmail = clamp(input.partnerEmail, MAX.email).toLowerCase();
  if (!partnerAgency) throw new Error('Partner agency name is required.');
  if (input.manual) {
    if (partnerEmail && !EMAIL_RE.test(partnerEmail)) {
      throw new Error('Enter a valid email or leave it blank.');
    }
  } else if (!EMAIL_RE.test(partnerEmail)) {
    throw new Error('A valid partner email is required.');
  }

  const referral = await getReferral(referralId);
  if (!referral) throw new Error('Referral not found.');

  const days = Number.isFinite(input.expiresInDays) ? Number(input.expiresInDays) : 14;
  const clampedDays = Math.min(Math.max(Math.round(days), 1), 90);
  const expiresAt = Timestamp.fromMillis(Date.now() + clampedDays * 86_400_000);

  // Remember the agency in the reusable directory so it autocompletes next time.
  // Best-effort: a directory hiccup must never block the actual share.
  // Save to the reusable directory only when we have an email to dedupe on.
  let agencyId: string | null = null;
  if (partnerEmail) {
    try {
      agencyId = await rememberAgencyFromShare({ name: partnerAgency, email: partnerEmail }, caller);
    } catch (err) {
      console.error('rememberAgencyFromShare failed (non-fatal):', err);
    }
  }

  const docData = {
    referralId,
    agencyId,
    partnerAgency,
    partnerEmail,
    manual: !!input.manual,
    createdBy: caller.uid,
    createdByName: caller.profile.displayName || '',
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    revokedAt: null,
    revokedBy: null,
    viewCount: 0,
    lastViewedAt: null,
    firstViewedAt: null,
  };

  // create() rejects if the id already exists. Collisions are astronomically
  // improbable, but on the off chance, regenerate the token and retry.
  let token = '';
  let id = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    token = generateToken();
    id = shareDocId(token);
    try {
      // Store the raw token so the link stays re-copyable (admin-only read).
      await adminDb().collection(COLLECTION).doc(id).create({ ...docData, token });
      break;
    } catch (err) {
      if (attempt === 2 || !isAlreadyExists(err)) throw err;
    }
  }
  const ref = adminDb().collection(COLLECTION).doc(id);

  await logReferralActivity(referralId, {
    type: 'share',
    text: input.manual ? `Referred to ${partnerAgency}` : `Shared with ${partnerAgency}`,
    byUid: caller.uid,
    byName: caller.profile.displayName || '',
    byRole: caller.role,
  });

  const snap = await ref.get();
  return { token, share: serializeShare(id, snap.data() as FirebaseFirestore.DocumentData, Date.now()) };
}

/**
 * Create a share for each of several referrals with the same agency, in one
 * action. Reuses createReferralShare per referral (so each link is independently
 * viewable/revocable/audited and the agency directory is updated). Validate the
 * agency/email at the route before calling this. Returns the created shares
 * (with client name + token for building links/emails) and any ids that failed.
 */
export async function createReferralSharesBatch(
  referralIds: string[],
  input: CreateShareInput,
  caller: AuthedCaller
): Promise<{
  created: { referralId: string; clientName: string; token: string; share: ReferralShare }[];
  failed: string[];
}> {
  const created: { referralId: string; clientName: string; token: string; share: ReferralShare }[] = [];
  const failed: string[] = [];
  for (const id of referralIds) {
    try {
      const referral = await getReferral(id);
      if (!referral) {
        failed.push(id);
        continue;
      }
      const { token, share } = await createReferralShare(id, input, caller);
      created.push({ referralId: id, clientName: referral.clientName, token, share });
    } catch (err) {
      console.error('Batch share failed for referral', id, err);
      failed.push(id);
    }
  }
  return { created, failed };
}

/** All shares for a referral, newest first (admin management view). */
export async function listReferralShares(referralId: string): Promise<ReferralShare[]> {
  // No orderBy (avoids a composite index); sort in memory.
  const snap = await adminDb().collection(COLLECTION).where('referralId', '==', referralId).get();
  const now = Date.now();
  return snap.docs
    .map((d) => serializeShare(d.id, d.data(), now))
    .sort((a, b) => (Date.parse(b.createdAt ?? '') || 0) - (Date.parse(a.createdAt ?? '') || 0));
}

/** Revoke a share (idempotent). Returns false if the share doesn't exist. */
export async function revokeReferralShare(shareId: string, caller: AuthedCaller): Promise<boolean> {
  const ref = adminDb().collection(COLLECTION).doc(shareId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const data = snap.data() as FirebaseFirestore.DocumentData;
  if (data.revokedAt) return true;

  await ref.update({
    revokedAt: FieldValue.serverTimestamp(),
    revokedBy: caller.uid,
  });
  await logReferralActivity(data.referralId, {
    type: 'share',
    text: `Revoked share with ${data.partnerAgency ?? 'partner agency'}`,
    byUid: caller.uid,
    byName: caller.profile.displayName || '',
    byRole: caller.role,
  });
  return true;
}

/**
 * Resolve a raw token to the shared referral view, auditing the view. Returns a
 * tagged result distinguishing not-found / expired / revoked so the public page
 * can show the right message.
 */
export async function resolveSharedReferral(token: string): Promise<ResolveResult> {
  if (!token) return { ok: false, reason: 'not_found' };
  const id = shareDocId(token);
  const ref = adminDb().collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: 'not_found' };

  const data = snap.data() as FirebaseFirestore.DocumentData;
  if (data.revokedAt) return { ok: false, reason: 'revoked' };
  const expiresAtMs = toMillis(data.expiresAt);
  if (expiresAtMs != null && Date.now() > expiresAtMs) return { ok: false, reason: 'expired' };

  const referral = await getReferral(data.referralId);
  if (!referral) return { ok: false, reason: 'not_found' };

  // Audit the view (after we know there's content to show).
  await ref.update({
    viewCount: FieldValue.increment(1),
    lastViewedAt: FieldValue.serverTimestamp(),
    ...(data.firstViewedAt ? {} : { firstViewedAt: FieldValue.serverTimestamp() }),
  });

  return {
    ok: true,
    referral: {
      partnerAgency: data.partnerAgency ?? '',
      clientName: referral.clientName,
      clientEmail: referral.clientEmail,
      clientPhone: referral.clientPhone,
      county: referral.county ?? '',
      program: referral.program ?? '',
      referrerName: referral.referrerName ?? '',
      details: referral.details,
      submittedAt: referral.submittedAt,
    },
  };
}

/**
 * Summarize every share, grouped by referral, for the admin board/table. One
 * collection read (the share set is small for this org) — avoids an N+1 or the
 * 30-item `in`-query cap. Returns a map keyed by referralId; referrals with no
 * shares are simply absent.
 */
export async function summarizeSharesByReferral(): Promise<Record<string, ReferralShareSummary>> {
  const snap = await adminDb().collection(COLLECTION).get();
  const rows: ShareSummaryRow[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      referralId: data.referralId ?? '',
      revokedAtMs: toMillis(data.revokedAt),
      expiresAtMs: toMillis(data.expiresAt),
      viewCount: typeof data.viewCount === 'number' ? data.viewCount : 0,
      createdMs: toMillis(data.createdAt),
    };
  });
  return foldShareSummaries(rows, Date.now());
}
