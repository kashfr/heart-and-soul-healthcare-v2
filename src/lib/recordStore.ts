/**
 * Where a client-dashboard card reads and saves its record. Staff cards
 * default to Firestore directly; the assistant workspace passes a store that
 * goes through /api/assistant/clients, where the grant is rechecked and every
 * save is audited.
 */
export interface RecordStore<T, S = T> {
  load: () => Promise<T | null>;
  save: (data: S) => Promise<void>;
}

/** A save failure whose message is written for the person at the keyboard
 *  (a server validation or stale-record message), safe to show verbatim. */
export class UserFacingError extends Error {}
