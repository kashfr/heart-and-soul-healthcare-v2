import 'server-only';
import { randomBytes } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';
import { EDWP_CONSENT_VERSION, type EdwpConsentInput } from './edwpConsent';

// Firestore side of the EDWP consent form. Two collections, both written only
// through the Admin SDK (firestore.rules denies every client access): the public
// form posts to the intake route, staff read through the admin routes.
//
//   edwpConsents        one signed form per doc
//   edwpConsentInvites  a "please sign" link a staff member emailed to a client

const CONSENTS = 'edwpConsents';
const INVITES = 'edwpConsentInvites';

/** A signed consent, as stored (minus the signature image) plus its id. */
export interface EdwpConsentRecord extends Omit<EdwpConsentInput, 'inviteToken'> {
  id: string;
  consentVersion: string;
  submittedAt: string | null; // ISO
  inviteId: string | null;
  /** Where the form was filled in. Public form only today. */
  source: 'website';
}

export interface EdwpConsentInvite {
  id: string;
  clientName: string;
  email: string;
  sentBy: string;
  sentByName: string;
  sentAt: string | null; // ISO
  status: 'sent' | 'completed';
  completedAt: string | null;
  consentId: string | null;
}

function toIso(ts: unknown): string | null {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : null;
}

function serializeConsent(id: string, d: FirebaseFirestore.DocumentData): EdwpConsentRecord {
  return {
    id,
    clientName: d.clientName ?? '',
    dob: d.dob ?? '',
    address: d.address ?? '',
    medicaidId: d.medicaidId ?? '',
    phone: d.phone ?? '',
    email: d.email ?? '',
    emergencyContactName: d.emergencyContactName ?? '',
    emergencyContactPhone: d.emergencyContactPhone ?? '',
    program: d.program ?? '',
    careCoordinatorName: d.careCoordinatorName ?? '',
    careCoordinatorAgency: d.careCoordinatorAgency ?? '',
    careCoordinatorPhone: d.careCoordinatorPhone ?? '',
    services: Array.isArray(d.services) ? d.services : [],
    servicesOther: d.servicesOther ?? '',
    agreed: d.agreed === true,
    signerType: d.signerType === 'representative' ? 'representative' : 'client',
    signerName: d.signerName ?? '',
    signerRelationship: d.signerRelationship ?? '',
    signature: d.signature ?? '',
    consentVersion: d.consentVersion ?? '',
    submittedAt: toIso(d.submittedAt),
    inviteId: d.inviteId ?? null,
    source: 'website',
  };
}

function serializeInvite(id: string, d: FirebaseFirestore.DocumentData): EdwpConsentInvite {
  return {
    id,
    clientName: d.clientName ?? '',
    email: d.email ?? '',
    sentBy: d.sentBy ?? '',
    sentByName: d.sentByName ?? '',
    sentAt: toIso(d.sentAt),
    status: d.status === 'completed' ? 'completed' : 'sent',
    completedAt: toIso(d.completedAt),
    consentId: d.consentId ?? null,
  };
}

/**
 * Store a validated submission. If it came from a staff-sent link, the invite
 * is marked completed in the same batch so the admin list flips from "Sent" to
 * "Signed" atomically with the consent appearing.
 */
export async function createEdwpConsent(
  input: EdwpConsentInput
): Promise<{ id: string; inviteId: string | null }> {
  const db = adminDb();
  const { inviteToken, ...fields } = input;

  let inviteRef: FirebaseFirestore.DocumentReference | null = null;
  if (inviteToken) {
    const snap = await db.collection(INVITES).where('token', '==', inviteToken).limit(1).get();
    // An unknown or already-used token is not an error for the client: the
    // form still gets filed, it just isn't tied to an invite.
    if (!snap.empty && snap.docs[0].data().status === 'sent') inviteRef = snap.docs[0].ref;
  }

  const consentRef = db.collection(CONSENTS).doc();
  const batch = db.batch();
  batch.create(consentRef, {
    ...fields,
    consentVersion: EDWP_CONSENT_VERSION,
    source: 'website',
    inviteId: inviteRef ? inviteRef.id : null,
    submittedAt: FieldValue.serverTimestamp(),
  });
  if (inviteRef) {
    batch.update(inviteRef, {
      status: 'completed',
      completedAt: FieldValue.serverTimestamp(),
      consentId: consentRef.id,
    });
  }
  await batch.commit();
  return { id: consentRef.id, inviteId: inviteRef ? inviteRef.id : null };
}

export async function getEdwpConsent(id: string): Promise<EdwpConsentRecord | null> {
  const snap = await adminDb().collection(CONSENTS).doc(id).get();
  return snap.exists ? serializeConsent(snap.id, snap.data()!) : null;
}

/** Newest first. The signature image is stripped: the list never needs it and
 *  it would multiply the payload. Fetch one record for the PDF instead. */
export async function listEdwpConsents(limit = 200): Promise<EdwpConsentRecord[]> {
  const snap = await adminDb()
    .collection(CONSENTS)
    .orderBy('submittedAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((d) => ({ ...serializeConsent(d.id, d.data()), signature: '' }));
}

export async function listEdwpConsentInvites(limit = 200): Promise<EdwpConsentInvite[]> {
  const snap = await adminDb()
    .collection(INVITES)
    .orderBy('sentAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((d) => serializeInvite(d.id, d.data()));
}

/**
 * Record that a staff member sent the form to a client. Returns the token that
 * goes in the emailed link; the form posts it back so the signed consent can be
 * matched to this invite.
 */
export async function createEdwpConsentInvite(
  input: { clientName: string; email: string },
  caller: AuthedCaller
): Promise<{ invite: EdwpConsentInvite; token: string }> {
  const token = randomBytes(24).toString('base64url');
  const ref = adminDb().collection(INVITES).doc();
  const data = {
    token,
    clientName: input.clientName,
    email: input.email,
    sentBy: caller.uid,
    sentByName: caller.profile.displayName || caller.email || '',
    sentAt: FieldValue.serverTimestamp(),
    status: 'sent' as const,
    completedAt: null,
    consentId: null,
  };
  await ref.create(data);
  return {
    invite: serializeInvite(ref.id, { ...data, sentAt: Timestamp.now() }),
    token,
  };
}

/** Client name on file for an invite token, used to prefill the public form.
 *  Only ever exposes the name (never the email or who sent it). */
export async function lookupInviteName(token: string): Promise<string | null> {
  if (!token) return null;
  const snap = await adminDb().collection(INVITES).where('token', '==', token).limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0].data();
  return d.status === 'sent' ? (d.clientName ?? '') : null;
}
