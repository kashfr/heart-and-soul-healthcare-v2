import 'server-only';
import { createHash } from 'node:crypto';
import { FieldValue, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { adminBucket, adminDb } from './firebaseAdmin';
import { AdminAuthError, requireRole, type AuthedCaller } from './adminAuthGuard';
import { getServerSettings } from './settingsServer';
import { mergeWithDefaults } from './settings';
import { getAssistantClientGrant, type AssistantClientGrant } from './assistantClientAccess';
import { DOC_CATEGORIES } from './docCategories';
import { GUARDIAN_ROLES, hasGuardianErrors, validateGuardian, type DecisionMaker, type GuardianContact } from './guardianShared';

const MAX_BYTES = 20 * 1024 * 1024;
const TYPES: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};
const DIRECTORY_FIELDS = ['name', 'dob', 'street', 'city', 'state', 'zip'] as const;
const PROFILE_FIELDS = ['medicaidId', 'physicianName', 'physicianPhone', 'physicianFax'] as const;
const CONTACT_FIELDS = ['id', 'role', 'name', 'relationship', 'phone', 'email', 'address'] as const;
type Data = Record<string, unknown>;
export interface AssistantContext { caller: AuthedCaller; grant: AssistantClientGrant }
export class AssistantClientError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const text = (value: unknown) => typeof value === 'string' ? value : '';
export function assertAssistantId(id: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new AssistantClientError(400, 'Invalid record identifier.');
}

export async function requireAssistant(request: Request): Promise<AssistantContext> {
  const caller = await requireRole(request, ['va']);
  // Older shared guards tolerate profiles missing active; delegated access does not.
  if (caller.profile.active !== true) throw new AdminAuthError(403, 'Your account is not active.');
  const settings = await getServerSettings();
  const grant = getAssistantClientGrant(settings.assistantClients, caller.uid, caller.role);
  if (!grant) throw new AdminAuthError(403, 'Client assistance access has not been enabled for your account.');
  return { caller, grant };
}
function assertScope(grant: AssistantClientGrant, patient: Data | undefined): asserts patient is Data {
  if (!patient || (grant.scope !== 'all' && patient.program !== 'gapp')) {
    throw new AssistantClientError(404, 'Client not found or outside your assigned access.');
  }
}
function revision(...snapshots: DocumentSnapshot[]): string {
  return createHash('sha256').update(snapshots.map(s => `${s.id}:${s.updateTime?.seconds ?? 0}:${s.updateTime?.nanoseconds ?? 0}`).join('|')).digest('hex');
}
export function administrativeClient(id: string, patient: Data, clinical: Data, guardian: Data, version: string) {
  return {
    id, ...Object.fromEntries(DIRECTORY_FIELDS.map(k => [k, text(patient[k])])),
    program: text(patient.program),
    ...Object.fromEntries(PROFILE_FIELDS.map(k => [k, text(clinical[k])])),
    guardianContacts: Array.isArray(guardian.contacts) ? guardian.contacts.map(c => Object.fromEntries(CONTACT_FIELDS.map(k => [k, text(c?.[k])]))) : [],
    revision: version,
  };
}
export function documentMetadata(id: string, data: Data) {
  const at = data.uploadedAt as { toDate?: () => Date } | undefined;
  return {
    id, title: text(data.title), category: text(data.category), docDate: text(data.docDate),
    fileName: text(data.fileName), contentType: text(data.contentType), size: Number(data.size || 0),
    uploadedAt: at?.toDate ? at.toDate().toISOString() : null,
    uploadedByName: text(data.uploadedByName),
  };
}
export async function listAssistantClients({ grant }: AssistantContext) {
  const collection = adminDb().collection('patients');
  const snap = await (grant.scope === 'all' ? collection : collection.where('program', '==', 'gapp')).get();
  const clients = snap.docs.map(d => {
    const p = d.data();
    return { id: d.id, name: text(p.name), dob: text(p.dob), program: text(p.program), city: text(p.city), state: text(p.state) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { clients, grant };
}
export async function getAssistantClient(context: AssistantContext, id: string) {
  assertAssistantId(id);
  const ref = adminDb().collection('patients').doc(id);
  const patient = await ref.get();
  assertScope(context.grant, patient.data());
  const [clinical, guardian, docs] = await Promise.all([
    ref.collection('clinical').doc('profile').get(), ref.collection('clinical').doc('guardian').get(),
    adminDb().collection('patientDocuments').where('patientId', '==', id).get(),
  ]);
  return {
    client: administrativeClient(id, patient.data()!, clinical.data() || {}, guardian.data() || {}, revision(patient, clinical, guardian)),
    documents: docs.docs.filter(d => d.data().archived !== true).map(d => documentMetadata(d.id, d.data())).sort((a, b) => b.docDate.localeCompare(a.docDate) || String(b.uploadedAt).localeCompare(String(a.uploadedAt))),
    grant: context.grant,
  };
}

/** Recheck role, grant and program in the same transaction as every mutation. */
async function currentWriteGrant(tx: Transaction, context: AssistantContext, patientId: string, permission: 'editInfo' | 'uploadDocuments') {
  const db = adminDb();
  const [profile, settings, patient] = await Promise.all([
    tx.get(db.collection('users').doc(context.caller.uid)), tx.get(db.doc('settings/global')),
    tx.get(db.collection('patients').doc(patientId)),
  ]);
  const p = profile.data();
  const grant = p?.active === true ? getAssistantClientGrant(mergeWithDefaults(settings.data()).assistantClients, context.caller.uid, p.role) : null;
  if (!grant || !grant[permission]) throw new AssistantClientError(403, 'Your permission for this action is no longer enabled.');
  assertScope(grant, patient.data());
  return { patient, grant };
}
function object(value: unknown): value is Data { return !!value && typeof value === 'object' && !Array.isArray(value); }
function agencyToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function validateAdministrativePatch(input: unknown): { revision: string; directory: Data; clinical: Data; contacts?: GuardianContact[] } {
  if (!object(input)) throw new AssistantClientError(400, 'Invalid client information.');
  const allowed = new Set<string>(['revision', 'guardianContacts', ...DIRECTORY_FIELDS, ...PROFILE_FIELDS]);
  if (Object.keys(input).some(k => !allowed.has(k))) throw new AssistantClientError(400, 'This form can only change administrative client information.');
  if (typeof input.revision !== 'string' || !/^[a-f0-9]{64}$/.test(input.revision)) throw new AssistantClientError(409, 'Reload the client before saving.');
  const directory: Data = {}, clinical: Data = {};
  for (const field of [...DIRECTORY_FIELDS, ...PROFILE_FIELDS]) {
    if (!(field in input)) continue;
    if (typeof input[field] !== 'string' || (input[field] as string).length > 200) throw new AssistantClientError(400, `Invalid ${field}.`);
    const value = (input[field] as string).trim();
    if (field === 'name' && !value) throw new AssistantClientError(400, 'Enter the client name.');
    if (field === 'dob' && (!validDate(value) || value > agencyToday())) throw new AssistantClientError(400, 'Enter a valid birth date.');
    if (field === 'state' && value && !/^[A-Za-z]{2}$/.test(value)) throw new AssistantClientError(400, 'Use the two-letter state abbreviation.');
    if (field === 'zip' && value && !/^\d{5}(?:-\d{4})?$/.test(value)) throw new AssistantClientError(400, 'Enter a five-digit ZIP code (or ZIP+4).');
    if (field === 'medicaidId' && value && !/^\d{1,25}$/.test(value)) throw new AssistantClientError(400, 'Medicaid ID must contain digits only.');
    const target = (DIRECTORY_FIELDS as readonly string[]).includes(field) ? directory : clinical;
    target[field] = field === 'state' ? value.toUpperCase() : value;
  }
  let contacts: GuardianContact[] | undefined;
  if ('guardianContacts' in input) {
    if (!Array.isArray(input.guardianContacts) || input.guardianContacts.length > 30) throw new AssistantClientError(400, 'Invalid guardian contacts.');
    const seen = new Set<string>();
    contacts = input.guardianContacts.map(c => {
      if (!object(c) || Object.keys(c).some(k => !(CONTACT_FIELDS as readonly string[]).includes(k))) throw new AssistantClientError(400, 'Only contact details may be changed.');
      const row: Record<string, string> = {};
      for (const field of CONTACT_FIELDS) {
        if (c[field] !== undefined && (typeof c[field] !== 'string' || (c[field] as string).length > 300)) throw new AssistantClientError(400, 'Invalid guardian contact details.');
        row[field] = text(c[field]).trim();
      }
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(row.id) || seen.has(row.id)) throw new AssistantClientError(400, 'Each guardian contact needs a unique identifier.');
      seen.add(row.id);
      if (!(GUARDIAN_ROLES as readonly string[]).includes(row.role) || !row.name || (!row.phone && !row.email) || (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))) throw new AssistantClientError(400, 'Each contact needs a role, name, and valid phone or email.');
      return row as unknown as GuardianContact;
    });
  }
  if (!Object.keys(directory).length && !Object.keys(clinical).length && !contacts) throw new AssistantClientError(400, 'No changes were supplied.');
  return { revision: input.revision, directory, clinical, contacts };
}
export async function updateAssistantClient(context: AssistantContext, id: string, input: unknown) {
  assertAssistantId(id);
  if (!context.grant.editInfo) throw new AssistantClientError(403, 'Editing client information is not enabled for your account.');
  const patch = validateAdministrativePatch(input);
  const db = adminDb(), patientRef = db.collection('patients').doc(id);
  const clinicalRef = patientRef.collection('clinical').doc('profile'), guardianRef = patientRef.collection('clinical').doc('guardian');
  await db.runTransaction(async tx => {
    const { patient } = await currentWriteGrant(tx, context, id, 'editInfo');
    const [clinical, guardian] = await Promise.all([tx.get(clinicalRef), tx.get(guardianRef)]);
    if (revision(patient, clinical, guardian) !== patch.revision) throw new AssistantClientError(409, 'Someone updated this client. Reload and review the latest information before saving.');
    const oldPatient = patient.data() || {}, oldClinical = clinical.data() || {}, oldGuardian = guardian.data() || {};
    const before: Data = {}, after: Data = {};
    for (const [key, value] of Object.entries({ ...patch.directory, ...patch.clinical })) {
      before[key] = (key in patch.directory ? oldPatient : oldClinical)[key] ?? '';
      after[key] = value;
    }
    let contacts: GuardianContact[] | undefined;
    if (patch.contacts) {
      const existing: GuardianContact[] = Array.isArray(oldGuardian.contacts) ? oldGuardian.contacts : [];
      if (existing.some(c => !patch.contacts!.some(next => next.id === c.id))) throw new AssistantClientError(400, 'Existing contacts cannot be removed here. Ask an administrator to remove a contact.');
      contacts = patch.contacts.map(c => ({ ...(existing.find(old => old.id === c.id) || {}), ...c }));
      if (oldGuardian.decisionMaker && hasGuardianErrors(validateGuardian({ decisionMaker: oldGuardian.decisionMaker as DecisionMaker, contacts }))) {
        throw new AssistantClientError(400, 'Keep the required parent or legal guardian contact on this record.');
      }
      before.guardianContacts = existing.map(c => Object.fromEntries(CONTACT_FIELDS.map(k => [k, text(c[k])])));
      after.guardianContacts = patch.contacts;
    }
    const stamp = { updatedAt: FieldValue.serverTimestamp(), updatedBy: context.caller.uid, updatedByName: context.caller.profile.displayName || context.caller.email || '' };
    if (Object.keys(patch.directory).length) tx.update(patientRef, { ...patch.directory, ...stamp });
    if (Object.keys(patch.clinical).length) tx.set(clinicalRef, { ...patch.clinical, ...stamp }, { merge: true });
    if (contacts) tx.set(guardianRef, { contacts, ...stamp }, { merge: true });
    tx.set(patientRef.collection('administrativeAudit').doc(), {
      action: 'assistant-information-update', before, after, actorUid: context.caller.uid,
      actorName: context.caller.profile.displayName || context.caller.email || '', actorRole: context.caller.role, at: FieldValue.serverTimestamp(),
    });
  });
  const result = await getAssistantClient(context, id);
  return { client: result.client, grant: result.grant };
}

export function validateAssistantUpload(file: File, title: string, category: string, docDate: string) {
  if (file.size <= 0 || file.size >= MAX_BYTES) throw new AssistantClientError(400, 'Upload a file smaller than 20 MB.');
  const ext = file.name.split('.').pop()?.toLowerCase();
  const contentType = file.type || Object.keys(TYPES).find(type => TYPES[type] === ext || (type === 'image/jpeg' && ext === 'jpeg')) || '';
  if (!TYPES[contentType]) throw new AssistantClientError(400, 'Upload a PDF, JPEG, PNG, HEIC, or Word document.');
  if (!(DOC_CATEGORIES as readonly string[]).includes(category)) throw new AssistantClientError(400, 'Choose a document category.');
  if (!title.trim() || title.length > 200) throw new AssistantClientError(400, 'Enter a document title under 200 characters.');
  if (docDate && !validDate(docDate)) throw new AssistantClientError(400, 'Enter a valid document date.');
  if (docDate && docDate > agencyToday()) throw new AssistantClientError(400, 'The document date cannot be in the future.');
  const original = file.name.replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);
  return { contentType, fileName: original || `document.${TYPES[contentType]}`, title: title.trim(), category, docDate };
}
export async function uploadAssistantDocument(context: AssistantContext, id: string, file: File, input: { title: string; category: string; docDate: string }) {
  assertAssistantId(id);
  if (!context.grant.uploadDocuments) throw new AssistantClientError(403, 'Document uploads are not enabled for your account.');
  const details = validateAssistantUpload(file, input.title, input.category, input.docDate);
  const db = adminDb(), patientRef = db.collection('patients').doc(id);
  assertScope(context.grant, (await patientRef.get()).data());
  const docRef = db.collection('patientDocuments').doc();
  const storagePath = `patients/${id}/documents/${docRef.id}/${details.fileName}`;
  const object = adminBucket().file(storagePath);
  await object.save(Buffer.from(await file.arrayBuffer()), { resumable: false, contentType: details.contentType, preconditionOpts: { ifGenerationMatch: 0 } });
  const metadata = {
    patientId: id, ...details, storagePath, size: file.size, archived: false,
    uploadedBy: context.caller.uid, uploadedByRole: context.caller.role,
    uploadedByName: context.caller.profile.displayName || context.caller.email || '', uploadedAt: FieldValue.serverTimestamp(),
  };
  try {
    await db.runTransaction(async tx => {
      await currentWriteGrant(tx, context, id, 'uploadDocuments');
      tx.create(docRef, metadata);
      tx.set(patientRef.collection('administrativeAudit').doc(), {
        action: 'assistant-document-upload', documentId: docRef.id,
        after: { title: details.title, category: details.category, docDate: details.docDate, fileName: details.fileName, size: file.size },
        actorUid: context.caller.uid, actorName: metadata.uploadedByName, actorRole: context.caller.role, at: FieldValue.serverTimestamp(),
      });
    });
  } catch (err) {
    await object.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw err;
  }
  return { document: documentMetadata(docRef.id, (await docRef.get()).data() || metadata) };
}
export async function readAssistantDocument(context: AssistantContext, id: string, documentId: string) {
  assertAssistantId(id); assertAssistantId(documentId);
  const db = adminDb();
  assertScope(context.grant, (await db.collection('patients').doc(id).get()).data());
  const snap = await db.collection('patientDocuments').doc(documentId).get();
  const data = snap.data();
  if (!data || data.patientId !== id || data.archived === true) throw new AssistantClientError(404, 'Document not found.');
  const path = text(data.storagePath), prefix = `patients/${id}/documents/${documentId}/`;
  const filename = path.slice(prefix.length);
  if (!path.startsWith(prefix) || !filename || filename.includes('/') || filename === '.' || filename === '..') throw new AssistantClientError(404, 'Document not found.');
  const object = adminBucket().file(path);
  const [metadata] = await object.getMetadata();
  if (Number(metadata.size || 0) >= MAX_BYTES) throw new AssistantClientError(400, 'This document is too large to open here.');
  const type = text(metadata.contentType);
  const contentType = TYPES[type] ? type : 'application/octet-stream';
  const [bytes] = await object.download();
  return { bytes, contentType, fileName: filename.replace(/[^\w.\- ]+/g, '_') || 'document' };
}
