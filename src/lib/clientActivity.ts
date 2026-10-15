export const ACTIVITY_FIELD_LABELS: Record<string, string> = {
  name: 'Client name', dob: 'Date of birth', street: 'Street address', city: 'City',
  state: 'State', zip: 'ZIP code', medicaidId: 'Medicaid ID', physicianName: 'Attending physician',
  physicianPhone: 'Physician phone', physicianFax: 'Physician fax', guardianContacts: 'Parent / guardian contacts',
};
export interface ClientActivity {
  id: string;
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
  return Object.keys(ACTIVITY_FIELD_LABELS).filter(k => Object.hasOwn(entry.before, k)
    && Object.hasOwn(entry.after, k) && !sameActivityValue(entry.before[k], entry.after[k]));
}
