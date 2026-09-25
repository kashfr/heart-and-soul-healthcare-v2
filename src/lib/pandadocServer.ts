import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminBucket, adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';
import { getServerSettings } from './settingsServer';
import { createPortalNotification } from './notificationsServer';
import {
  isNewer,
  isTrackedDocument,
  packetStage,
  packetSubject,
  PACKET_STAGE_LABEL,
  type PacketStage,
  type PandadocDocEvent,
  type PandadocRecipient,
} from './pandadocShared';

/**
 * PandaDoc packet tracking, server side (webhook only; no PandaDoc API calls,
 * which the current plan doesn't allow in production).
 *
 *   pandadocDocuments/{pandadocId}              latest known state of a tracked packet
 *   staff/packets/{pandadocId}/{file}  (GCS)    signed copy an admin uploaded
 *
 * Env: PANDADOC_WEBHOOK_KEY, the shared key PandaDoc shows when the webhook
 * is created (Dev Center > Webhooks). Without it every delivery is refused.
 */

const COL = 'pandadocDocuments';

/** PandaDoc signs the raw body: hex HMAC-SHA256 with the webhook's shared
 *  key, sent as the `signature` query parameter. */
export function verifyPandadocSignature(rawBody: string, signature: string): boolean {
  const key = process.env.PANDADOC_WEBHOOK_KEY || '';
  if (!key || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', key).update(rawBody, 'utf8').digest('hex');
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature.toLowerCase(), 'hex'));
}

async function uidsByEmail(emails: string[]): Promise<Map<string, { uid: string; name: string }>> {
  const out = new Map<string, { uid: string; name: string }>();
  const unique = Array.from(new Set(emails.filter(Boolean)));
  for (let i = 0; i < unique.length; i += 30) {
    const snap = await adminDb().collection('users').where('email', 'in', unique.slice(i, i + 30)).get();
    for (const d of snap.docs) {
      const x = d.data() as { email?: string; displayName?: string; active?: boolean };
      if (x.active === false) continue;
      out.set(String(x.email || '').toLowerCase(), { uid: d.id, name: String(x.displayName || '') });
    }
  }
  return out;
}

async function activeAdminUids(): Promise<string[]> {
  const snap = await adminDb().collection('users').where('role', '==', 'admin').get();
  return snap.docs.filter((d) => (d.data() as { active?: boolean }).active !== false).map((d) => d.id);
}

/**
 * Apply one webhook delivery. Untracked documents (per Settings) are dropped
 * without being stored. Returns how many tracked documents changed.
 */
export async function applyPandadocEvents(events: PandadocDocEvent[]): Promise<number> {
  if (events.length === 0) return 0;
  const settings = await getServerSettings();
  const keywords = settings.esign.trackKeywords;
  const db = adminDb();
  let changed = 0;
  for (const e of events) {
    const ref = db.collection(COL).doc(e.id);
    if (e.event === 'document_deleted') {
      const snap = await ref.get();
      if (snap.exists) {
        await ref.update({ deleted: true, updatedAt: FieldValue.serverTimestamp() });
        changed++;
      }
      continue;
    }
    if (!isTrackedDocument(e, keywords)) continue;

    const subject = packetSubject(e.recipients);
    const stage = packetStage(e.status, e.recipients);
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const prev = snap.exists ? snap.data() || {} : null;
      if (prev && !isNewer(e.modifiedAt, String(prev.modifiedAt || ''))) return null;
      tx.set(
        ref,
        {
          name: e.name,
          templateName: e.templateName,
          status: e.status,
          stage,
          modifiedAt: e.modifiedAt,
          createdAt: prev?.createdAt || e.createdAt,
          sentByName: e.sentByName || prev?.sentByName || '',
          recipients: e.recipients,
          subjectEmail: subject?.email || '',
          subjectName: subject?.name || '',
          deleted: false,
          lastEvent: e.event,
          updatedAt: FieldValue.serverTimestamp(),
          ...(prev ? {} : { firstSeenAt: FieldValue.serverTimestamp() }),
        },
        { merge: true },
      );
      return { prevStage: String(prev?.stage || '') };
    });
    if (!result) continue;
    changed++;
    if (result.prevStage !== stage) {
      try {
        await notifyStageChange(e, stage, subject);
      } catch (err) {
        console.error('PandaDoc: stage notification failed (non-fatal):', err);
      }
    }
  }
  return changed;
}

async function notifyStageChange(e: PandadocDocEvent, stage: PacketStage, subject: PandadocRecipient | null): Promise<void> {
  const db = adminDb();
  const who = subject?.name || subject?.email || 'The recipient';
  const doc = e.templateName || e.name || 'packet';
  if (stage === 'awaiting-countersign') {
    // Ring the Heart and Soul signer(s) who still owe a signature.
    const owed = e.recipients.filter((r) => r.internal && !r.completed).map((r) => r.email);
    const users = await uidsByEmail(owed);
    for (const { uid } of users.values()) {
      await createPortalNotification(db, {
        userId: uid,
        kind: 'pandadoc-countersign',
        text: `${who} signed the ${doc}. It is waiting for your signature in PandaDoc.`,
        href: '/admin/esign',
      });
    }
    return;
  }
  if (stage === 'completed' || stage === 'declined' || stage === 'expired') {
    const text =
      stage === 'completed'
        ? `${who}'s ${doc} is complete. Save the signed PDF from PandaDoc to their packet in E-signatures.`
        : `${who}'s ${doc} was ${PACKET_STAGE_LABEL[stage].toLowerCase()}.`;
    for (const uid of await activeAdminUids()) {
      await createPortalNotification(db, { userId: uid, kind: `pandadoc-${stage}`, text, href: '/admin/esign' });
    }
  }
}

export interface TrackedPacket {
  id: string;
  name: string;
  templateName: string;
  status: string;
  stage: PacketStage;
  modifiedAt: string;
  sentByName: string;
  recipients: PandadocRecipient[];
  subjectEmail: string;
  subjectName: string;
  /** The portal staff member the packet is for, matched by email ('' when none). */
  staffUid: string;
  staffName: string;
  signedCopy: { fileName: string; uploadedByName: string; uploadedAt: string | null } | null;
}

function toIso(ts: unknown): string | null {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : null;
}

export async function listTrackedPackets(): Promise<TrackedPacket[]> {
  const snap = await adminDb().collection(COL).orderBy('modifiedAt', 'desc').limit(300).get();
  const rows = snap.docs.filter((d) => d.data().deleted !== true);
  const staff = await uidsByEmail(rows.map((d) => String(d.data().subjectEmail || '')));
  return rows.map((d) => {
    const x = d.data();
    const sc = x.signedCopy as Record<string, unknown> | undefined;
    const match = staff.get(String(x.subjectEmail || ''));
    return {
      id: d.id,
      name: String(x.name || ''),
      templateName: String(x.templateName || ''),
      status: String(x.status || ''),
      stage: (String(x.stage || 'other') as PacketStage),
      modifiedAt: String(x.modifiedAt || ''),
      sentByName: String(x.sentByName || ''),
      recipients: Array.isArray(x.recipients) ? (x.recipients as PandadocRecipient[]) : [],
      subjectEmail: String(x.subjectEmail || ''),
      subjectName: String(x.subjectName || ''),
      staffUid: match?.uid || '',
      staffName: match?.name || '',
      signedCopy: sc ? { fileName: String(sc.fileName || ''), uploadedByName: String(sc.uploadedByName || ''), uploadedAt: toIso(sc.uploadedAt) } : null,
    };
  });
}

/**
 * Attach the signed PDF (saved from PandaDoc's completion email or the
 * document page) to a completed packet. Admin only: onboarding packets
 * carry tax and identity forms.
 */
export async function saveSignedCopy(p: { packetId: string; pdf: Buffer; caller: AuthedCaller }): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (p.pdf.subarray(0, 5).toString() !== '%PDF-') return { ok: false, status: 400, error: 'The signed copy must be a PDF.' };
  const ref = adminDb().collection(COL).doc(p.packetId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.deleted === true) return { ok: false, status: 404, error: 'Packet not found.' };
  const x = snap.data() || {};
  const who = String(x.subjectName || x.subjectEmail || 'packet').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40);
  const fileName = `${who}_${String(x.templateName || x.name || 'packet').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40)}_signed.pdf`;
  const storagePath = `staff/packets/${p.packetId}/${Date.now()}_${fileName}`;
  await adminBucket().file(storagePath).save(p.pdf, { contentType: 'application/pdf', resumable: false });
  await ref.update({
    signedCopy: {
      fileName,
      storagePath,
      size: p.pdf.length,
      uploadedBy: p.caller.uid,
      uploadedByName: p.caller.profile.displayName || p.caller.email || '',
      uploadedAt: FieldValue.serverTimestamp(),
    },
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
}

export async function readSignedCopy(packetId: string): Promise<{ bytes: Buffer; fileName: string } | null> {
  const snap = await adminDb().collection(COL).doc(packetId).get();
  const sc = (snap.data() || {}).signedCopy as { storagePath?: string; fileName?: string } | undefined;
  if (!snap.exists || !sc?.storagePath) return null;
  const [bytes] = await adminBucket().file(sc.storagePath).download();
  return { bytes, fileName: sc.fileName || 'signed.pdf' };
}
