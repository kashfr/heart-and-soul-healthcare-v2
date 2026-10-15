import 'server-only';
import { activityDateBounds, type ActivityFilters } from './activityFilters';
import { FieldValue, type DocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import { AdminAuthError, requireRole, type AuthedCaller } from './adminAuthGuard';
import { assertAssistantId, AssistantClientError } from './assistantClientsServer';
import { activityChangedFields, sameActivityValue, type ClientActivity } from './clientActivity';
import { hasGuardianErrors, validateGuardian, type GuardianContact, type GuardianRecord } from './guardianShared';

const DIRECTORY = ['name', 'dob', 'street', 'city', 'state', 'zip'];
const CONTACT = ['id', 'role', 'name', 'relationship', 'phone', 'email', 'address'];
type Data = Record<string, unknown>;
const data = (v: unknown): Data => v && typeof v === 'object' && !Array.isArray(v) ? v as Data : {};
const iso = (v: unknown): string | null => {
  const timestamp = v as { toDate?: () => Date } | undefined;
  return timestamp?.toDate ? timestamp.toDate().toISOString() : null;
};
export async function requireActivityAdmin(request: Request) {
  const caller = await requireRole(request, ['admin']);
  if (caller.profile.active !== true) throw new AdminAuthError(403, 'An active administrator account is required.');
  return caller;
}
export async function listClientActivity(patientId: string, cursor?: string | null) {
  assertAssistantId(patientId);
  const patient = adminDb().collection('patients').doc(patientId);
  if (!(await patient.get()).exists) throw new AssistantClientError(404, 'Client not found.');
  const collection = patient.collection('administrativeAudit');
  let query = collection.orderBy('at', 'desc').limit(51);
  if (cursor) {
    assertAssistantId(cursor);
    const last = await collection.doc(cursor).get();
    if (!last.exists) throw new AssistantClientError(400, 'Invalid activity cursor.');
    query = query.startAfter(last);
  }
  const snapshot = await query.get();
  const entries: ClientActivity[] = snapshot.docs.slice(0, 50).map(s => {
    return serializeActivity(s);
  });
  return { entries, nextCursor: snapshot.docs.length > 50 ? entries.at(-1)!.id : null };
}
function serializeActivity(s: DocumentSnapshot): ClientActivity {
    const d = s.data()!;
    return { id: s.id, recordLabel: typeof d.recordLabel === 'string' ? d.recordLabel : undefined, sourcePath: typeof d.sourcePath === 'string' ? d.sourcePath : undefined, patientName: typeof d.patientName === 'string' ? d.patientName : undefined, truncated: d.truncated === true, actorUid: String(d.actorUid || ''), action: String(d.action || ''), actorName: String(d.actorName || 'Unknown staff'),
      actorRole: String(d.actorRole || ''), at: iso(d.at), before: data(d.before), after: data(d.after),
      documentId: typeof d.documentId === 'string' ? d.documentId : undefined,
      revertedAt: iso(d.revertedAt), revertedByName: typeof d.revertedByName === 'string' ? d.revertedByName : undefined,
      originalActivityId: typeof d.originalActivityId === 'string' ? d.originalActivityId : undefined };
}
/** Global history remains admin-only and reads the original immutable audit paths. */
export async function listAllClientActivity(actorUid?: string | null, cursor?: string | null, filters: ActivityFilters = {}) {
  if (filters.client) assertAssistantId(filters.client);
  let bounds: ReturnType<typeof activityDateBounds>;
  try { bounds = activityDateBounds(filters.from, filters.through); } catch (error) { throw new AssistantClientError(400, (error as Error).message); }
  if (actorUid) assertAssistantId(actorUid);
  const db = adminDb();
  let query = (filters.client ? db.collection(`patients/${filters.client}/administrativeAudit`) : db.collectionGroup('administrativeAudit')).orderBy('at', 'desc').limit(51);
  if (bounds.start) query = query.where('at', '>=', bounds.start);
  if (bounds.end) query = query.where('at', '<', bounds.end);
  if (actorUid) query = query.where('actorUid', '==', actorUid);
  if (cursor) {
    const parts = cursor.split(':');
    if (parts.length !== 2) throw new AssistantClientError(400, 'Invalid activity cursor.');
    parts.forEach(assertAssistantId);
    const last = await db.doc(`patients/${parts[0]}/administrativeAudit/${parts[1]}`).get();
    if (!last.exists || !last.data()?.at || (actorUid && last.data()?.actorUid !== actorUid)) throw new AssistantClientError(400, 'Invalid activity cursor.');
    const at = last.data()!.at.toDate();
    if ((filters.client && parts[0] !== filters.client) || (bounds.start && at < bounds.start) || (bounds.end && at >= bounds.end)) throw new AssistantClientError(400, 'Invalid activity cursor.');
    query = query.startAfter(last);
  }
  const snapshot = await query.get();
  const page = snapshot.docs.slice(0, 50);
  const valid = page.filter(s => /^patients\/[^/]+\/administrativeAudit\/[^/]+$/.test(s.ref.path));
  const ids = [...new Set(valid.map(s => s.ref.parent.parent!.id))];
  const patients = ids.length ? await db.getAll(...ids.map(id => db.doc(`patients/${id}`))) : [];
  const byId = new Map(patients.map(p => [p.id, p]));
  const entries = valid.map(s => {
    const patientId = s.ref.parent.parent!.id, patient = byId.get(patientId);
    return { ...serializeActivity(s), patientId, patientName: String(patient?.data()?.name || s.data().patientName || 'Unavailable client'), patientExists: patient?.exists === true };
  });
  const last = page.at(-1);
  const staff = await db.collection('users').select('displayName', 'role', 'active').get();
  const clients = await db.collection('patients').select('name').get();
  return { clients: clients.docs.map(s => ({ id: s.id, name: String(s.data().name || 'Unnamed client') })).sort((a, b) => a.name.localeCompare(b.name)), entries, nextCursor: snapshot.docs.length > 50 && last ? `${last.ref.parent.parent!.id}:${last.id}` : null,
    staff: staff.docs.map(s => ({ uid: s.id, name: String(s.data().displayName || 'Unnamed staff'), active: s.data().active === true }))
      .sort((a, b) => a.name.localeCompare(b.name)) };
}
function conflict(): never {
  throw new AssistantClientError(409, 'This record has been edited since that change. Review the latest information and correct it manually; nothing was undone.');
}
/** Require both exact current values and no later writes to the affected record. */
function assertUnchanged(snapshot: DocumentSnapshot, at: unknown) {
  const stamp = at as { seconds?: number; nanoseconds?: number } | undefined;
  if (!snapshot.exists || !snapshot.updateTime || typeof stamp?.seconds !== 'number' || typeof stamp.nanoseconds !== 'number') conflict();
  if (snapshot.updateTime.seconds !== stamp.seconds || snapshot.updateTime.nanoseconds !== stamp.nanoseconds) conflict();
}
function contacts(value: unknown): Data[] {
  if (!Array.isArray(value) || value.some(c => !c || typeof c !== 'object' || typeof c.id !== 'string')) conflict();
  return value.map(c => Object.fromEntries(CONTACT.map(k => [k, typeof c[k] === 'string' ? c[k] : ''])));
}
export async function undoClientActivity(patientId: string, activityId: string, caller: AuthedCaller) {
  assertAssistantId(patientId); assertAssistantId(activityId);
  const db = adminDb(), patientRef = db.collection('patients').doc(patientId);
  const activityRef = patientRef.collection('administrativeAudit').doc(activityId);
  const reversalRef = patientRef.collection('administrativeAudit').doc();
  await db.runTransaction(async tx => {
    const [user, patient, activity] = await Promise.all([
      tx.get(db.collection('users').doc(caller.uid)), tx.get(patientRef), tx.get(activityRef),
    ]);
    if (user.data()?.role !== 'admin' || user.data()?.active !== true) throw new AdminAuthError(403, 'An active administrator account is required.');
    if (!patient.exists || !activity.exists) throw new AssistantClientError(404, 'Client activity not found.');
    const original = activity.data()!;
    if (original.revertedAt) throw new AssistantClientError(409, 'This activity has already been undone.');
    const before = data(original.before), after = data(original.after);
    const actorName = String(user.data()?.displayName || caller.email || 'Administrator');
    const stamp = { auditEventId: reversalRef.id, updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.uid, updatedByName: actorName };
    let reversal: Data;
    if (original.action === 'assistant-information-update') {
      const keys = activityChangedFields({ before, after });
      if (!keys.length) throw new AssistantClientError(400, 'This entry has no changed information to undo.');
      const clinicalRef = patientRef.collection('clinical').doc('profile');
      const guardianRef = patientRef.collection('clinical').doc('guardian');
      const [clinical, guardian] = await Promise.all([tx.get(clinicalRef), tx.get(guardianRef)]);
      const directoryPatch: Data = {}, clinicalPatch: Data = {};
      let guardianPatch: Data | undefined;
      for (const key of keys) {
        if (key === 'guardianContacts') {
          assertUnchanged(guardian, activity.updateTime);
          const current = guardian.data() || {};
          if (!sameActivityValue(contacts(current.contacts), contacts(after[key]))) conflict();
          const restored = contacts(before[key]).map(c => ({
            ...(current.contacts as GuardianContact[]).find(existing => existing.id === c.id), ...c,
          })) as unknown as GuardianContact[];
          if (current.decisionMaker && hasGuardianErrors(validateGuardian({ decisionMaker: current.decisionMaker, contacts: restored } as GuardianRecord))) conflict();
          guardianPatch = { contacts: restored, ...stamp };
        } else {
          const target = DIRECTORY.includes(key) ? patient : clinical;
          assertUnchanged(target, activity.updateTime);
          if (typeof before[key] !== 'string' || typeof after[key] !== 'string' || !sameActivityValue(target.data()?.[key] ?? '', after[key])) conflict();
          (DIRECTORY.includes(key) ? directoryPatch : clinicalPatch)[key] = before[key];
        }
      }
      if (Object.keys(directoryPatch).length) tx.update(patientRef, { ...directoryPatch, ...stamp });
      if (Object.keys(clinicalPatch).length) tx.set(clinicalRef, { ...clinicalPatch, ...stamp }, { merge: true });
      if (guardianPatch) tx.set(guardianRef, guardianPatch, { merge: true });
      reversal = { before: Object.fromEntries(keys.map(k => [k, after[k]])), after: Object.fromEntries(keys.map(k => [k, before[k]])) };
    } else if (original.action === 'assistant-document-upload') {
      const documentId = String(original.documentId || ''); assertAssistantId(documentId);
      const documentRef = db.collection('patientDocuments').doc(documentId), document = await tx.get(documentRef);
      assertUnchanged(document, activity.updateTime);
      const d = document.data()!;
      if (d.patientId !== patientId || d.uploadedBy !== original.actorUid || d.archived === true
        || Object.entries(after).some(([k, v]) => !sameActivityValue(d[k], v))) conflict();
      tx.update(documentRef, { auditEventId: reversalRef.id, archived: true, archivedAt: FieldValue.serverTimestamp(), archivedBy: caller.uid, archivedByName: actorName });
      reversal = { documentId, before: { archived: false }, after: { archived: true, title: d.title || d.fileName || 'Document' } };
    } else throw new AssistantClientError(400, 'This activity cannot be undone.');
    tx.update(activityRef, { revertedAt: FieldValue.serverTimestamp(), revertedBy: caller.uid, revertedByName: actorName, reversalId: reversalRef.id });
    tx.create(reversalRef, { action: 'admin-undo', originalActivityId: activityId, ...reversal,
      actorUid: caller.uid, actorName, actorRole: 'admin', at: FieldValue.serverTimestamp() });
  });
  return { ok: true, reversalId: reversalRef.id };
}
