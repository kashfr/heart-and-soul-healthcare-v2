// Module-level store for the medication-administration marks a nurse makes on
// Page 5 of the progress note. Mirrors the DeselectableRadio store pattern:
// React subscribes via useSyncExternalStore (getSnapshot returns a version
// number), and components read `marAdminState` directly.
//
// Each entry holds BOTH the row context (med snapshot) and the nurse's mark, so
// the submit handler in page.tsx can build the append-only marAdministrations
// docs without re-fetching the orders. Keyed by `${patientId}|${orderId}|${slot}`
// so marks for one client can never leak onto another's note (the submit
// handler also filters by patientId as a safety net).

export type AdminStatus = '' | 'given' | 'held' | 'refused';

export interface MarAdminRecord {
  patientId: string;
  orderId: string;
  medName: string;
  dose: string;
  units: string;
  route: string;
  scheduledTime: string; // 'HH:MM' or 'PRN'
  isPRN: boolean;
  status: AdminStatus;
  administeredByType: string; // 'nurse' | 'family' | 'responsibleParty' | 'self' | 'proxy'
  administratorName: string;
  actualTime: string;
  initials: string;
  reason: string;
}

export const marAdminState: Record<string, MarAdminRecord> = {};

let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

export function marAdminSubscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function marAdminGetSnapshot(): number {
  return version;
}

export function marAdminKey(patientId: string, orderId: string, slot: string): string {
  return `${patientId}|${orderId}|${slot}`;
}

export function setMarAdmin(key: string, record: MarAdminRecord): void {
  marAdminState[key] = record;
  emit();
}

/** All current marks, with their keys. Untouched rows (status '') are included
 *  only if present; callers filter by status. */
export function getAllMarAdmin(): Array<MarAdminRecord & { key: string }> {
  return Object.entries(marAdminState).map(([key, rec]) => ({ key, ...rec }));
}

/** Wipe all marks (called after a successful submit / form reset). */
export function clearMarAdmin(): void {
  for (const k of Object.keys(marAdminState)) delete marAdminState[k];
  emit();
}
