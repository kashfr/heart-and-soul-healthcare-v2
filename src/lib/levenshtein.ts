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
 * Four signals, any of which marks a patient as a candidate:
 *   - Exact DOB match (very strong in a roster of ~dozens)
 *   - Levenshtein name distance ≤ 5 (handles typos like "Yanra" for
 *     "Yanira" and short truncations)
 *   - Exact normalized name (catches missing-hyphen / casing variants)
 *   - First "word" of the typed name matches the first word of a roster
 *     name (handles "Yanira Fernando b" → "Yanira Fernando-Bautista"
 *     where Levenshtein is high but the first name is unmistakable).
 *     Crucially, the first-word path does NOT require a close DOB —
 *     nurses often type the patient name before the DOB on Page 1, and
 *     blocking the suggestion behind DOB defeats the whole point of a
 *     real-time prompt.
 *
 * Returns the top N candidates ranked by composite score (lower better).
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
    const closeName = nameDist <= 5;
    const closeDob = dobDist !== Infinity && dobDist <= 30;

    let isCandidate = false;
    const reasons: string[] = [];

    if (exactName && exactDob) {
      isCandidate = true;
      reasons.push('Exact match');
    } else if (exactDob) {
      isCandidate = true;
      reasons.push(exactName ? 'DOB + name exact' : 'DOB exact, name differs');
    } else if (closeName) {
      isCandidate = true;
      reasons.push(exactName ? 'Name exact, DOB differs' : `Name distance ${nameDist}`);
      if (closeDob) reasons.push(`DOB ±${dobDist}d`);
    } else if (firstWordMatch) {
      isCandidate = true;
      if (exactDob) reasons.push('First-name match + DOB exact');
      else if (closeDob) reasons.push(`First-name match + DOB ±${dobDist}d`);
      else if (dobDist === Infinity) reasons.push('First-name match, no DOB yet');
      else reasons.push('First-name match');
    }

    if (isCandidate) {
      // Composite score: name distance counts double, DOB drift capped at
      // 30. Capped Infinity → 30 keeps blank-DOB candidates sortable
      // (otherwise they'd all tie at NaN/Infinity).
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
 * Form-side roster suggestion based on NAME only. Used by both:
 *   - the Page-1 "did you mean?" banner that fires while the nurse is
 *     still typing the client name (DOB is empty), and
 *   - the pre-submit safety net modal (DOB is shown in the modal as
 *     informational context but doesn't gate matching — the whole point
 *     of the safety net is to catch typos regardless of what the nurse
 *     entered for DOB).
 *
 * Why a separate function from findPatientCandidates? Because gating
 * suggestions on DOB defeats the purpose of a real-time prompt — the
 * autofill is supposed to POPULATE the DOB for her once she accepts.
 * The DOB-aware variant below stays useful for the backfill admin
 * review, where historical notes have both fields and DOB is a strong
 * corroborating signal.
 *
 * Signals (in order of strength):
 *   - Exact normalized name
 *   - Substring match either direction (typed in roster, or vice versa)
 *   - Levenshtein distance ≤ 5
 *   - First-word (first-name) match
 *
 * Returns candidates ranked by name distance (lower = better).
 */
export function findNameCandidates(
  typedName: string,
  roster: RosterPatientLite[],
  maxResults = 1,
): MatchCandidate[] {
  const normTyped = normalizeName(typedName);
  if (normTyped.length < 3) return [];
  const typedFirst = normTyped.split(' ')[0] || '';

  const candidates: MatchCandidate[] = [];

  for (const p of roster) {
    const normName = normalizeName(p.name);
    const nameDist = levenshtein(normName, normTyped);
    const rosterFirst = normName.split(' ')[0] || '';
    const firstWordMatch = typedFirst.length > 0 && typedFirst === rosterFirst;
    // Either direction — handles both partial typing ("yanira fern")
    // and ambient extra text ("yanira fernando b").
    const isSubstring = normName.includes(normTyped) || normTyped.includes(normName);

    let reason: string | null = null;
    if (nameDist === 0) reason = 'Exact name';
    else if (isSubstring) reason = 'Substring match';
    else if (nameDist <= 5) reason = `Name distance ${nameDist}`;
    else if (firstWordMatch) reason = 'First-name match';

    if (reason !== null) {
      candidates.push({
        patientId: p.id,
        patientName: p.name,
        patientDob: p.dob,
        score: nameDist,
        reason,
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
