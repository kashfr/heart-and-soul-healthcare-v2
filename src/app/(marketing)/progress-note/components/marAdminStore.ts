// Module-level store for the medication-administration marks a nurse makes on
// Page 5 of the progress note. Mirrors the DeselectableRadio store pattern:
// React subscribes via useSyncExternalStore (getSnapshot returns a version
// number), and components read `marAdminState` directly.
//
// Each entry holds BOTH the row context (med snapshot) and the nurse's mark, so
// the submit handler in page.tsx can build the append-only marAdministrations
// docs without re-fetching the orders. Keyed by `${patientId}|${orderId}|${slot}`.
//
// This is a module-level SINGLETON shared across the SPA, so a mark made on one
// note is still resident when another note mounts. That is the cross-note
// "phantom administration" leak fixed in June 2026 by THREE independent guards:
//   1. the store is cleared on fresh mount/unmount and on resume (page.tsx), so
//      it normally only holds the current note's marks;
//   2. each record is stamped with the session id (`sessionId`) of the note that
//      created it, and the submit harvest writes only marks matching the current
//      note's session (see selectSubmittableMarks); and
//   3. writeMarAdministrations re-asserts each record's patientId.
// The key alone is NOT a safety boundary (two notes for the same client reuse
// the same keys), which is why the session/patient stamps exist.

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
  indication?: string; // the order's standing "what for", snapshotted at submit
  status: AdminStatus;
  administeredByType: string; // 'nurse' | 'family' | 'responsibleParty' | 'self' | 'proxy'
  administratorName: string;
  actualTime: string;
  initials: string;
  reason: string;
  outcome?: string; // PRN effectiveness/result (required at submit for a given PRN)
  prescriberNotified?: boolean; // held/refused: documenter notified the prescriber
  sessionId?: string; // the note session (submissionId) that created this mark
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

/** Key for an "unlisted"/unscheduled one-off dose (a med given that has no
 *  standing order yet, recorded via the change-request modal). A unique suffix
 *  keeps two same-time one-offs for the same med from colliding onto one key —
 *  before this, the second silently overwrote the first. */
export function unlistedMarAdminKey(patientId: string, medName: string, uid: string): string {
  return `${patientId}|unlisted:${medName}:${uid}|unscheduled`;
}

export type MarAdminEntry = MarAdminRecord & { key: string };

/**
 * The marks eligible to be written as administrations for THIS note: they must
 * belong to the current client, carry a status, and — defense in depth against
 * the cross-note leak — either predate session stamping (legacy drafts, no
 * sessionId) or match this note's session id. Pure for unit testing.
 */
export function selectSubmittableMarks(
  records: MarAdminEntry[],
  opts: { patientId: string; sessionId: string },
): MarAdminEntry[] {
  return records.filter(
    (r) =>
      r.patientId === opts.patientId &&
      !!r.status &&
      (!r.sessionId || r.sessionId === opts.sessionId),
  );
}

/**
 * Marks for this client that no order-derived row already renders this pass
 * (resumed unlisted one-offs, or a scheduled dose whose order isn't on the
 * current date). They surface as "extra" cards so the form never silently hides
 * a dose it would still submit. Pure for unit testing.
 */
export function computeExtraMarks(
  records: MarAdminEntry[],
  coveredKeys: Set<string>,
  patientId: string,
): MarAdminEntry[] {
  if (!patientId) return [];
  return records.filter((r) => r.patientId === patientId && !!r.status && !coveredKeys.has(r.key));
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
