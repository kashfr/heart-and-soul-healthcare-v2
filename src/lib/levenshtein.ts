/**
 * Pure helpers for fuzzy-matching nurse-typed patient names against the
 * roster. Two consumers today:
 *   1. The one-time backfill that links existing progressNotes to patient
 *      docs (so the care-team feature has clean data to build on).
 *   2. The form-level "did you mean?" prompt that catches typos at note
 *      entry time (Phase 2).
 *
 * Kept dependency-free so it can be unit-tested without dragging in
 * Firebase + Next.
 */

/** Classic iterative-DP Levenshtein. Case-insensitive, whitespace-normalized. */
export function levenshtein(a: string, b: string): number {
  const s = (a || '').trim().toLowerCase();
  const t = (b || '').trim().toLowerCase();
  if (s === t) return 0;
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;

  // Single-row DP — O(min(s, t)) memory.
  const v0 = new Array(t.length + 1);
  const v1 = new Array(t.length + 1);
  for (let i = 0; i <= t.length; i++) v0[i] = i;

  for (let i = 0; i < s.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < t.length; j++) {
      const cost = s.charCodeAt(i) === t.charCodeAt(j) ? 0 : 1;
      v1[j + 1] = Math.min(
        v1[j] + 1,        // insertion
        v0[j + 1] + 1,    // deletion
        v0[j] + cost,     // substitution
      );
    }
    for (let j = 0; j <= t.length; j++) v0[j] = v1[j];
  }
  return v0[t.length];
}

/** Days between two YYYY-MM-DD strings. Returns Infinity if either is unparseable. */
export function dayDiff(a: string, b: string): number {
  const da = parseIso(a);
  const db = parseIso(b);
  if (da === null || db === null) return Infinity;
  return Math.abs(Math.round((da - db) / 86400000));
}

function parseIso(s: string): number | null {
  if (!s) return null;
  // Anchor at noon to dodge DST drift.
  const d = new Date(s + 'T12:00:00');
  const t = d.getTime();
  return isNaN(t) ? null : t;
}

/** Normalize a patient name for substring/prefix comparisons. */
export function normalizeName(s: string): string {
  return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface RosterPatientLite {
  id: string;
  name: string;
  dob: string;
}

export interface MatchCandidate {
  patientId: string;
  patientName: string;
  patientDob: string;
  /** Lower = better. Composite of name distance + DOB drift. */
  score: number;
  /** Human-readable reason chip ("DOB exact, name typo", "Name prefix", ...). */
  reason: string;
}

/**
 * Find roster patients that plausibly match the typed name + DOB.
 *
 * Three signals, any of which marks a patient as a candidate:
 *   - Exact DOB match (very strong in a roster of ~dozens)
 *   - Levenshtein name distance ≤ 3 (handles typos)
 *   - First "word" of the typed name matches the first word of a roster
 *     name AND DOB drift ≤ 30 days (handles truncated entries like
 *     "Yanira Fernando b")
 *
 * Returns the top N candidates ranked by composite score.
 */
export function findPatientCandidates(
  typedName: string,
  typedDob: string,
  roster: RosterPatientLite[],
  maxResults = 3,
): MatchCandidate[] {
  const normTyped = normalizeName(typedName);
  const typedFirst = normTyped.split(' ')[0] || '';
  const candidates: MatchCandidate[] = [];

  for (const p of roster) {
    const nameDist = levenshtein(normalizeName(p.name), normTyped);
    const dobDist = dayDiff(p.dob, typedDob);
    const rosterFirst = normalizeName(p.name).split(' ')[0] || '';
    const firstWordMatch = typedFirst.length > 0 && typedFirst === rosterFirst;
    const exactDob = dobDist === 0;
    const exactName = nameDist === 0;

    let isCandidate = false;
    const reasons: string[] = [];

    if (exactName && exactDob) {
      // Already perfectly linkable — caller will handle this as a strict
      // match before falling through to candidates, so it's harmless to
      // skip here. Included for completeness.
      isCandidate = true;
      reasons.push('Exact match');
    } else if (exactDob) {
      isCandidate = true;
      reasons.push(exactName ? 'DOB + name exact' : 'DOB exact, name differs');
    } else if (nameDist <= 3) {
      isCandidate = true;
      reasons.push(`Name distance ${nameDist}`);
      if (dobDist <= 30 && dobDist !== Infinity) reasons.push(`DOB ±${dobDist}d`);
    } else if (firstWordMatch && dobDist <= 30) {
      isCandidate = true;
      reasons.push('First-name match + close DOB');
    }

    if (isCandidate) {
      // Composite score: name distance counts double, DOB drift capped at 30.
      const score = nameDist * 2 + Math.min(dobDist, 30);
      candidates.push({
        patientId: p.id,
        patientName: p.name,
        patientDob: p.dob,
        score,
        reason: reasons.join(', '),
      });
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates.slice(0, maxResults);
}

/**
 * Strict-match lookup used by the backfill auto-link pass — name and DOB
 * must both match exactly (after normalization). Returns the patient id
 * or null if zero or multiple roster docs match.
 */
export function findExactPatientId(
  typedName: string,
  typedDob: string,
  roster: RosterPatientLite[],
): string | null {
  const normTyped = normalizeName(typedName);
  const matches = roster.filter(
    (p) => normalizeName(p.name) === normTyped && p.dob === typedDob,
  );
  return matches.length === 1 ? matches[0].id : null;
}
