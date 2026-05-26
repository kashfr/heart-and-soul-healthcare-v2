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

// ----- Per-word fuzzy matching helpers used by findNameCandidates -----

function nameTokens(s: string): string[] {
  return normalizeName(s)
    .split(' ')
    .filter((w) => w.length > 0);
}

/**
 * For a single typed word, find the best-matching word inside a roster
 * patient name. Returns { dist, matched } where `matched` says whether
 * the match is good enough to count toward the candidate's overall
 * tally.
 *
 * Three positive signals (any one is enough):
 *   - Prefix: typed is the start of a roster word, and typed is at
 *     least 30% of the roster word's length. Catches "fern" → "fernando"
 *     and "yan" → "yanira".
 *   - Small absolute distance (≤ 2): catches single-character typos
 *     in short words.
 *   - Proportional tolerance (typed.length ≥ 4 and dist ≤ length/3):
 *     catches "yanra" → "yanira" (dist 1, 5 chars allowed up to 1).
 */
function bestWordMatch(
  typedWord: string,
  rosterWords: string[],
): { dist: number; matched: boolean } {
  let bestDist = Infinity;
  for (const rw of rosterWords) {
    if (
      typedWord.length >= 2 &&
      rw.startsWith(typedWord) &&
      typedWord.length / rw.length >= 0.3
    ) {
      return { dist: 0, matched: true };
    }
    const d = levenshtein(typedWord, rw);
    if (d < bestDist) bestDist = d;
  }
  const matched =
    bestDist <= 2 ||
    (typedWord.length >= 4 && bestDist <= Math.floor(typedWord.length / 3));
  return { dist: bestDist, matched };
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
 * Per-word fuzzy matching: tokenize both typed name and each roster
 * name, then for every typed word find the best-matching roster word.
 * A patient is a candidate when at least 50% of typed words have a
 * good match. This catches multi-typo + truncation combos like
 * "yanra fern" → "Yanira Fernando-Bautista" that whole-string
 * Levenshtein misses because the overall distance is enormous even
 * though the words match individually.
 *
 * Single-character typed words (e.g. "y" or middle initials) are
 * filtered out of the tally — too noisy on their own.
 *
 * Returns candidates ranked by composite score (lower = better):
 * sum of per-word edit distances, plus a 10-point penalty per
 * unmatched typed word.
 */
export function findNameCandidates(
  typedName: string,
  roster: RosterPatientLite[],
  maxResults = 1,
): MatchCandidate[] {
  // Only words with 2+ chars count toward the match tally — single
  // chars like a middle initial would surface every patient otherwise.
  const typedWords = nameTokens(typedName).filter((w) => w.length >= 2);
  if (typedWords.length === 0) return [];
  // Guard against ultra-short queries even after the per-word filter
  // (e.g. "y" + "x" both filtered would still leave nothing, but two
  // 2-letter words "ya bo" would only total 4 chars — still pretty
  // noisy. Require at least 3 chars across all eligible words.)
  if (typedWords.join('').length < 3) return [];

  const candidates: MatchCandidate[] = [];

  for (const p of roster) {
    const rosterWords = nameTokens(p.name);
    if (rosterWords.length === 0) continue;

    let matchedWords = 0;
    let totalDist = 0;
    for (const tw of typedWords) {
      const { dist, matched } = bestWordMatch(tw, rosterWords);
      if (matched) {
        matchedWords++;
        totalDist += dist;
      }
    }

    // 1-2 typed words: need them all. 3+: need at least half. Stops
    // single-word typos from accidentally claiming a patient with a
    // similar-sounding name on the wrong side of a "yes that's the
    // right person" judgment, while still being forgiving when the
    // nurse types a longer query with some words wrong.
    const requiredMatches =
      typedWords.length <= 2 ? typedWords.length : Math.ceil(typedWords.length * 0.5);
    if (matchedWords < requiredMatches) continue;

    const unmatched = typedWords.length - matchedWords;
    const score = totalDist + unmatched * 10;

    let reason: string;
    if (totalDist === 0 && unmatched === 0) {
      reason = 'Exact word match';
    } else if (unmatched === 0) {
      reason = `${matchedWords} word${matchedWords === 1 ? '' : 's'} matched (typo)`;
    } else {
      reason = `${matchedWords}/${typedWords.length} words matched`;
    }

    candidates.push({
      patientId: p.id,
      patientName: p.name,
      patientDob: p.dob,
      score,
      reason,
    });
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
