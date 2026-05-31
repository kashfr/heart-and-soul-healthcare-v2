import { normalizeName } from './levenshtein';

/**
 * Pure predicate: does an already-stored note duplicate the note being
 * written? The caller scopes candidates to the same nurse + same date of
 * service (via the Firestore query); this decides the patient-identity match.
 *
 * Firebase-free so it's unit-testable. Excludes admin-archived notes (status
 * 'archived' or an `archivedAt` timestamp). Matches on the roster link when
 * BOTH notes have a `patientId`; otherwise compares normalized names so
 * "Fernando-Bautista" and "Fernando Bautista" are the same person.
 */
export function noteIsActiveDuplicate(
  note: { status?: unknown; archivedAt?: unknown; patientId?: unknown; q3_clientName?: unknown },
  target: { patientId?: string; normName: string }
): boolean {
  if (note.status === 'archived' || note.archivedAt) return false;
  const candidatePatientId = String(note.patientId || '');
  if (target.patientId && candidatePatientId) {
    return candidatePatientId === target.patientId;
  }
  return target.normName !== '' && normalizeName(String(note.q3_clientName || '')) === target.normName;
}
