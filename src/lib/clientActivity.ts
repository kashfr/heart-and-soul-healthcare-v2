export const ACTIVITY_FIELD_LABELS: Record<string, string> = {
  name: 'Client name', dob: 'Date of birth', street: 'Street address', city: 'City',
  state: 'State', zip: 'ZIP code', medicaidId: 'Medicaid ID', physicianName: 'Attending physician',
  physicianPhone: 'Physician phone', physicianFax: 'Physician fax', guardianContacts: 'Parent / guardian contacts', contacts: 'Parent / guardian contacts',
  diagnosis: 'Diagnosis', allergies: 'Allergies',
};
export interface ClientActivity {
  id: string;
  recordLabel?: string;
  sourcePath?: string;
  fieldPresence?: { before: string[]; after: string[] };
  truncated?: boolean;
  actorUid?: string;
  patientId?: string;
  patientName?: string;
  patientExists?: boolean;
  action: string;
  actorName: string;
  actorRole: string;
  at: string | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  documentId?: string;
  revertedAt: string | null;
  revertedByName?: string;
  originalActivityId?: string;
}

export function sameActivityValue(a: unknown, b: unknown): boolean {
  function stable(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, value]) => [k, stable(value)]));
    return v;
  }
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}
export function activityChangedFields(entry: Pick<ClientActivity, 'before' | 'after'>): string[] {
  return Object.keys(ACTIVITY_FIELD_LABELS).filter(k => k !== 'contacts' && Object.hasOwn(entry.before, k)
    && Object.hasOwn(entry.after, k) && !sameActivityValue(entry.before[k], entry.after[k]));
}

/** Assistant card and authorization saves, review-only: whole records, so every field shows. */
export const ASSISTANT_RECORD_ACTIONS = ['assistant-record-update', 'assistant-authorization-create', 'assistant-authorization-update'];
/** Captured records include changed fields beyond the administrative undo allowlist. */
export function activityDisplayFields(entry: ClientActivity): string[] {
  return entry.action.startsWith('record-') || entry.action === 'admin-undo' || ASSISTANT_RECORD_ACTIONS.includes(entry.action)
    ? [...new Set([...Object.keys(entry.before || {}), ...Object.keys(entry.after || {})])] : activityChangedFields(entry);
}
export function activityFieldLabel(key: string): string {
  return ACTIVITY_FIELD_LABELS[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
}

const DIRECTORY_UNDO_FIELDS = ['name', 'dob', 'street', 'city', 'state', 'zip'];
const PROFILE_UNDO_FIELDS = ['medicaidId', 'physicianName', 'physicianPhone', 'physicianFax'];
const CONTACT_UNDO_FIELDS = ['id', 'role', 'name', 'relationship', 'phone', 'email', 'address'];
/** Only contact details may change; preserve notes and other protected properties. */
function basicContactsOnly(before: unknown, after: unknown): boolean {
  const valid = (v: unknown): v is Record<string, unknown>[] => Array.isArray(v) && v.every(c =>
    c && typeof c === 'object' && typeof c.id === 'string' &&
    CONTACT_UNDO_FIELDS.every(k => c[k] === undefined || typeof c[k] === 'string') &&
    Object.keys(c).every(k => CONTACT_UNDO_FIELDS.includes(k) || (k === 'notes' && typeof c.notes === 'string'))) &&
    new Set(v.map(c => c.id)).size === v.length;
  if (!valid(before) || !valid(after)) return false;
  const protectedData = (c?: Record<string, unknown>) => Object.fromEntries(Object.entries(c || {}).filter(([k]) => !CONTACT_UNDO_FIELDS.includes(k)));
  return [...new Set([...before, ...after].map(c => c.id))].every(id =>
    sameActivityValue(protectedData(before.find(c => c.id === id)), protectedData(after.find(c => c.id === id))));
}
export function capturedUndoFields(entry: Pick<ClientActivity, 'action' | 'actorRole' | 'sourcePath' | 'truncated' | 'before' | 'after' | 'fieldPresence'>): string[] {
  if (entry.action !== 'record-updated' || !['admin', 'supervisor'].includes(entry.actorRole) || entry.truncated) return [];
  const path = entry.sourcePath || '';
  const allowed = /^patients\/[^/]+$/.test(path) ? DIRECTORY_UNDO_FIELDS :
    /^patients\/[^/]+\/clinical\/profile$/.test(path) ? PROFILE_UNDO_FIELDS :
    /^patients\/[^/]+\/clinical\/guardian$/.test(path) ? ['contacts'] : [];
  return allowed.filter(k => {
    if (!Object.hasOwn(entry.before, k) || !Object.hasOwn(entry.after, k) || (sameActivityValue(entry.before[k], entry.after[k]) && (!entry.fieldPresence || entry.fieldPresence.before.includes(k) === entry.fieldPresence.after.includes(k)))) return false;
    if (k === 'contacts') return basicContactsOnly(entry.before[k], entry.after[k]);
    // Older captures cannot distinguish absent fields from explicit nulls.
    return ['before', 'after'].every(side => {
      const value = entry[side as 'before' | 'after'][k];
      return typeof value === 'string' || (value === null && !!entry.fieldPresence);
    });
  });
}
export function isCapturedUpload(entry: Pick<ClientActivity, 'action' | 'actorRole' | 'sourcePath' | 'after'>): boolean {
  return entry.action === 'record-created' && ['admin', 'supervisor'].includes(entry.actorRole) &&
    /^patientDocuments\/[A-Za-z0-9_-]{1,128}$/.test(entry.sourcePath || '') && entry.after.archived !== true &&
    typeof entry.after.patientId === 'string';
}
export function isActivityUpload(entry: ClientActivity): boolean {
  return entry.action === 'assistant-document-upload' || isCapturedUpload(entry);
}
export function undoInformationFields(entry: ClientActivity): string[] {
  return entry.action === 'assistant-information-update' ? activityChangedFields(entry) : capturedUndoFields(entry);
}
