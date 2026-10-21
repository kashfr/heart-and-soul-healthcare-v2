import 'server-only';
import { FieldValue, type DocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import {
  AssistantClientError, VIEW_AS_READ_ONLY, assertAssistantId, assertScope, currentWriteGrant, type AssistantContext,
} from './assistantClientsServer';
import { normalizePhysicians, validatePhysicians, type Physician } from './physiciansShared';
import { hasGuardianErrors, normalizeGuardian, validateGuardian, type GuardianRecord } from './guardianShared';
import { normalizeCoordinator, validateCoordinator, type SupportCoordinator } from './supportCoordinatorShared';
import { normalizeDayProgram, validateDayProgram, type DayProgram } from './dayProgramShared';
import { validateHoursAuthorizationInput } from './hoursAuthorizationInput';

/**
 * The Overview cards an assistant may read and edit for a client in her
 * grant (Physicians, Guardian, Support Coordinator, Day Program) plus the
 * Hours tab's authorization lines. Each record is the same Firestore
 * document the staff cards read and write; the assistant reaches it only
 * through these server functions, which recheck role, grant, and program
 * inside the write transaction, refuse stale saves, and audit before/after
 * under patients/{id}/administrativeAudit.
 *
 * Hours: only the authorization lines themselves (what the payer approved).
 * Hours worked, billing rates, and dollars never leave the owner's view.
 */

type Data = Record<string, unknown>;

export const ASSISTANT_RECORD_KINDS = ['physicians', 'guardian', 'supportCoordinator', 'dayProgram'] as const;
export type AssistantRecordKind = (typeof ASSISTANT_RECORD_KINDS)[number];

export function isAssistantRecordKind(v: string): v is AssistantRecordKind {
  return (ASSISTANT_RECORD_KINDS as readonly string[]).includes(v);
}

const MAX_TEXT = 2000;
const MAX_ROWS = 40;

const object = (v: unknown): v is Data => !!v && typeof v === 'object' && !Array.isArray(v);

/** Every string within reach is bounded; anything that is not a string or a
 *  plain row is refused rather than coerced. */
function strings(v: Data, keys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const value = v[k];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string' || value.length > MAX_TEXT) throw new AssistantClientError(400, 'Invalid record details.');
    out[k] = value;
  }
  return out;
}

function rows(v: unknown, keys: readonly string[]): Record<string, string>[] {
  if (!Array.isArray(v) || v.length > MAX_ROWS) throw new AssistantClientError(400, 'Invalid record details.');
  const seen = new Set<string>();
  return v.map((row) => {
    if (!object(row)) throw new AssistantClientError(400, 'Invalid record details.');
    const out = strings(row, keys);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(out.id || '') || seen.has(out.id)) throw new AssistantClientError(400, 'Each row needs a unique identifier.');
    seen.add(out.id);
    return out;
  });
}

const firstError = (errors: Record<string, unknown>): string => {
  for (const v of Object.values(errors)) {
    if (typeof v === 'string') return v;
    if (object(v)) { const inner: string = firstError(v); if (inner) return inner; }
  }
  return '';
};

/** Validate with the same shared rules the staff card uses, then normalize. */
export function cleanAssistantRecord(kind: AssistantRecordKind, input: unknown): Data {
  if (!object(input)) throw new AssistantClientError(400, 'Invalid record details.');
  if (kind === 'physicians') {
    const list = rows(input.list, ['id', 'name', 'specialty', 'practice', 'address', 'phone', 'fax', 'notes']) as unknown as Physician[];
    const errors = validatePhysicians(list);
    if (Object.keys(errors).length) throw new AssistantClientError(400, firstError(errors) || 'Check the physician details.');
    return { list: normalizePhysicians(list) };
  }
  if (kind === 'guardian') {
    const dm = input.decisionMaker;
    if (dm !== 'self' && dm !== 'guardian' && dm !== 'parent') throw new AssistantClientError(400, 'Choose who makes legal decisions for this client.');
    const rec: GuardianRecord = { decisionMaker: dm, contacts: rows(input.contacts, ['id', 'role', 'name', 'relationship', 'phone', 'email', 'address', 'notes']) as unknown as GuardianRecord['contacts'] };
    const errors = validateGuardian(rec);
    if (hasGuardianErrors(errors)) throw new AssistantClientError(400, errors.decisionMaker || errors.contacts || firstError(errors.rows) || 'Check the guardian details.');
    return normalizeGuardian(rec);
  }
  if (kind === 'supportCoordinator') {
    const c = strings(input, ['name', 'title', 'agency', 'phone', 'cell', 'email', 'fax', 'address', 'supervisor', 'notes']) as SupportCoordinator;
    const errors = validateCoordinator(c);
    if (Object.keys(errors).length) throw new AssistantClientError(400, firstError(errors));
    return normalizeCoordinator(c);
  }
  const d = strings(input, ['attends', 'programName', 'operator', 'serviceType', 'address', 'schedule', 'startedOn', 'contactName', 'contactTitle', 'phone', 'cell', 'email', 'fax', 'staff', 'notes']) as DayProgram;
  const errors = validateDayProgram(d);
  if (Object.keys(errors).length) throw new AssistantClientError(400, firstError(errors));
  return normalizeDayProgram(d);
}

/** Opaque version of one document: its update time, or "new" before it exists. */
export function recordRevision(snap: DocumentSnapshot): string {
  return snap.exists && snap.updateTime ? `${snap.updateTime.seconds}.${snap.updateTime.nanoseconds}` : 'new';
}

const STALE = 'Someone updated this record. Reload and review the latest information before saving.';
const stampOf = (context: AssistantContext, auditId: string) => ({
  auditEventId: auditId, updatedAt: FieldValue.serverTimestamp(), updatedBy: context.caller.uid,
  updatedByName: context.caller.profile.displayName || context.caller.email || '',
});
const actorOf = (context: AssistantContext) => ({
  actorUid: context.caller.uid, actorName: context.caller.profile.displayName || context.caller.email || '',
  actorRole: context.caller.role, at: FieldValue.serverTimestamp(),
});
const iso = (v: unknown) => (v as { toDate?: () => Date } | undefined)?.toDate?.().toISOString() ?? null;

/** The record as the staff card stores it, minus write stamps. */
const STAMP_KEYS = ['updatedAt', 'updatedBy', 'updatedByName', 'auditEventId', '_auditActor'];
const withoutStamps = (data: Data): Data => Object.fromEntries(Object.entries(data).filter(([k]) => !STAMP_KEYS.includes(k)));

function projection(data: Data | undefined): Data | null {
  if (!data) return null;
  return { ...withoutStamps(data), updatedByName: data.updatedByName ?? '', updatedAt: iso(data.updatedAt) };
}

async function scopedPatient(context: AssistantContext, id: string) {
  assertAssistantId(id);
  const ref = adminDb().collection('patients').doc(id);
  assertScope(context.grant, (await ref.get()).data());
  return ref;
}

export async function getAssistantRecord(context: AssistantContext, id: string, kind: AssistantRecordKind) {
  const ref = await scopedPatient(context, id);
  const snap = await ref.collection('clinical').doc(kind).get();
  return { record: projection(snap.data()), revision: recordRevision(snap) };
}

export async function saveAssistantRecord(context: AssistantContext, id: string, kind: AssistantRecordKind, body: unknown) {
  assertAssistantId(id);
  if (context.preview) throw new AssistantClientError(403, VIEW_AS_READ_ONLY);
  if (!context.grant.editInfo) throw new AssistantClientError(403, 'Editing client information is not enabled for your account.');
  if (!object(body) || typeof body.revision !== 'string') throw new AssistantClientError(409, 'Reload the client before saving.');
  const clean = cleanAssistantRecord(kind, body.record);
  const db = adminDb(), patientRef = db.collection('patients').doc(id), ref = patientRef.collection('clinical').doc(kind);
  await db.runTransaction(async (tx) => {
    await currentWriteGrant(tx, context, id, 'editInfo');
    const current = await tx.get(ref);
    if (recordRevision(current) !== body.revision) throw new AssistantClientError(409, STALE);
    const auditRef = patientRef.collection('administrativeAudit').doc();
    // Full replace, exactly as the staff card saves it.
    tx.set(ref, { ...clean, ...stampOf(context, auditRef.id) });
    tx.set(auditRef, { action: 'assistant-record-update', record: kind, before: withoutStamps(current.data() || {}), after: clean, ...actorOf(context) });
  });
  return getAssistantRecord(context, id, kind);
}

// --- Hours authorizations ---------------------------------------------------

/** Same collection as hoursAuthorizations.ts (a client-SDK module, so not importable here). */
const HOURS_AUTH_COLLECTION_NAME = 'hoursAuthorizations';
const AUTH_FIELDS = ['paNumber', 'kind', 'covers', 'rateBasis', 'rateHours', 'from', 'to', 'monthOverrides', 'totalUnits', 'serviceCode', 'note'] as const;
const pick = (data: Data): Data => Object.fromEntries(AUTH_FIELDS.map((k) => [k, data[k] ?? null]));

export async function listAssistantAuthorizations(context: AssistantContext, id: string) {
  await scopedPatient(context, id);
  const snap = await adminDb().collection(HOURS_AUTH_COLLECTION_NAME).where('patientId', '==', id).get();
  return {
    authorizations: snap.docs
      .map((d): Data => ({ id: d.id, patientId: id, ...pick(d.data()), revision: recordRevision(d) }))
      .sort((a, b) => String(b.from).localeCompare(String(a.from))),
  };
}

export async function saveAssistantAuthorization(context: AssistantContext, id: string, authId: string | null, body: unknown) {
  assertAssistantId(id);
  if (authId !== null) assertAssistantId(authId);
  if (context.preview) throw new AssistantClientError(403, VIEW_AS_READ_ONLY);
  if (!context.grant.editInfo) throw new AssistantClientError(403, 'Editing client information is not enabled for your account.');
  if (!object(body)) throw new AssistantClientError(400, 'Invalid authorization.');
  const checked = validateHoursAuthorizationInput(body.authorization);
  if (!checked.ok) throw new AssistantClientError(400, checked.error);
  const db = adminDb(), patientRef = db.collection('patients').doc(id);
  const ref = authId ? db.collection(HOURS_AUTH_COLLECTION_NAME).doc(authId) : db.collection(HOURS_AUTH_COLLECTION_NAME).doc();
  await db.runTransaction(async (tx) => {
    await currentWriteGrant(tx, context, id, 'editInfo');
    const current = await tx.get(ref);
    const auditRef = patientRef.collection('administrativeAudit').doc();
    const stamp = { updatedAt: FieldValue.serverTimestamp(), updatedBy: context.caller.uid, auditEventId: auditRef.id };
    if (authId) {
      // An id from another client is "not found", never an edit across charts.
      if (!current.exists || current.data()?.patientId !== id) throw new AssistantClientError(404, 'Authorization not found.');
      if (recordRevision(current) !== body.revision) throw new AssistantClientError(409, STALE);
      tx.update(ref, { ...checked.fields, ...stamp });
    } else {
      tx.create(ref, { patientId: id, ...checked.fields, ...stamp, createdAt: FieldValue.serverTimestamp(), createdBy: context.caller.uid });
    }
    tx.set(auditRef, {
      action: authId ? 'assistant-authorization-update' : 'assistant-authorization-create', authorizationId: ref.id,
      before: authId ? pick(current.data() || {}) : null, after: checked.fields, ...actorOf(context),
    });
  });
  return listAssistantAuthorizations(context, id);
}
