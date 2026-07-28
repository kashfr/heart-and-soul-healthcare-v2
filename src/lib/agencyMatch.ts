// Smart-match: rank partner agencies for a referral by service area (county)
// and GAPP service line. Pure logic — no Firestore, no 'server-only' — shared by
// the share pickers and unit-testable directly.
//
// Ranking philosophy: county coverage is the hard constraint (an agency that
// doesn't serve the family's county can't take the case), service fit refines
// within that. Agencies with NO data on file are unknowns — they rank below
// positive matches but are never called a mismatch. Agencies whose counties are
// known and do NOT include the referral's county are excluded from suggestions
// entirely (suggesting a known-wrong agency is worse than suggesting nothing).

import {
  normalizeCounty,
  SERVICE_LABEL,
  SERVICE_SHORT,
  type GappServiceKey,
} from './georgia';

export interface MatchableAgency {
  id: string;
  name: string;
  email: string;
  counties: string[];
  services: string[];
}

export interface AgencyMatch {
  agency: MatchableAgency;
  /** Higher = better. county match: +4, service match: +2, unknowns: +1 each. */
  score: number;
  /** Why-badges, e.g. ["Covers Henry", "PSS"]. Empty only for pure unknowns. */
  reasons: string[];
  countyMatch: boolean | null; // null = agency has no counties on file
  serviceMatch: boolean | null; // null = agency has no services on file / no need known
}

/**
 * Rank agencies for one referral. Returns only viable candidates (never a
 * known county mismatch), best first; ties break on name. Callers typically
 * show the top 3. A referral with no recognizable county matches on service
 * alone; one with no recognizable care need matches on county alone.
 */
export function matchAgencies(
  input: { county: string | null | undefined; service: GappServiceKey | null },
  agencies: MatchableAgency[]
): AgencyMatch[] {
  const county = normalizeCounty(input.county);
  const service = input.service;

  const out: AgencyMatch[] = [];
  for (const agency of agencies) {
    const hasCounties = agency.counties.length > 0;
    const hasServices = agency.services.length > 0;

    const countyMatch: boolean | null =
      county && hasCounties ? agency.counties.includes(county) : null;
    const serviceMatch: boolean | null =
      service && hasServices ? agency.services.includes(service) : null;

    // Known county mismatch -> not a viable suggestion at all.
    if (countyMatch === false) continue;
    // Known service mismatch with no county signal either -> skip.
    if (serviceMatch === false && countyMatch !== true) continue;

    let score = 0;
    const reasons: string[] = [];
    if (countyMatch === true) {
      score += 4;
      reasons.push(`Covers ${county}`);
    } else if (county && !hasCounties) {
      score += 1; // unknown coverage: plausible, rank under proven coverage
    }
    if (serviceMatch === true) {
      score += 2;
      reasons.push(SERVICE_SHORT[service as GappServiceKey]);
    } else if (service && !hasServices) {
      score += 1;
    }

    out.push({ agency, score, reasons, countyMatch, serviceMatch });
  }

  return out.sort(
    (a, b) => b.score - a.score || a.agency.name.localeCompare(b.agency.name)
  );
}

/**
 * Rank agencies for a batch of referrals (bulk share): score by how many of the
 * batch's counties the agency covers plus how many of the batch's care needs it
 * offers. Known non-coverage of the whole batch excludes the agency.
 */
export function matchAgenciesBulk(
  inputs: { county: string | null | undefined; service: GappServiceKey | null }[],
  agencies: MatchableAgency[]
): AgencyMatch[] {
  const counties = [...new Set(inputs.map((i) => normalizeCounty(i.county)).filter(Boolean))] as string[];
  const services = [...new Set(inputs.map((i) => i.service).filter(Boolean))] as GappServiceKey[];

  const out: AgencyMatch[] = [];
  for (const agency of agencies) {
    const hasCounties = agency.counties.length > 0;
    const hasServices = agency.services.length > 0;

    const coveredCounties = counties.filter((c) => agency.counties.includes(c));
    const offeredServices = services.filter((s) => agency.services.includes(s));

    // Counties known on both sides but zero overlap -> known mismatch, skip.
    if (counties.length > 0 && hasCounties && coveredCounties.length === 0) continue;

    let score = coveredCounties.length * 4 + offeredServices.length * 2;
    const reasons: string[] = [];
    if (coveredCounties.length > 0) {
      reasons.push(
        counties.length > 1
          ? `Covers ${coveredCounties.length} of ${counties.length} counties`
          : `Covers ${coveredCounties[0]}`
      );
    } else if (counties.length > 0 && !hasCounties) {
      score += 1;
    }
    if (offeredServices.length > 0) {
      reasons.push(offeredServices.map((s) => SERVICE_SHORT[s]).join(' · '));
    } else if (services.length > 0 && !hasServices) {
      score += 1;
    }

    out.push({
      agency,
      score,
      reasons,
      countyMatch: hasCounties && counties.length > 0 ? coveredCounties.length > 0 : null,
      serviceMatch: hasServices && services.length > 0 ? offeredServices.length > 0 : null,
    });
  }

  return out.sort(
    (a, b) => b.score - a.score || a.agency.name.localeCompare(b.agency.name)
  );
}

/**
 * The matches worth acting on, and the single definition of "a partner for this
 * referral" shared by the badge, the share pickers, and the CSV export.
 *
 * Two conditions. Positive evidence (a real county or service hit, not just
 * unknowns), AND no known service mismatch: an agency that covers the family's
 * county but is on record as not offering the service they need is a wasted
 * call, so it never counts. Without that second condition the count collapses
 * into "how many partners cover this county" — the same number for a nursing,
 * PSS, or BSS referral — which is how a behavioral case came to show eight
 * partners when only one of them offers behavioral support.
 *
 * Ruled-out agencies stay in matchAgencies' ranking; they're just no longer
 * proposed. Staff can still pick any agency by hand.
 */
export function qualifiedMatches(matches: AgencyMatch[]): AgencyMatch[] {
  return matches.filter((m) => m.reasons.length > 0 && m.serviceMatch !== false);
}

/** Top-N suggestions worth showing, best first. */
export function topSuggestions(matches: AgencyMatch[], n = 3): AgencyMatch[] {
  return qualifiedMatches(matches).slice(0, n);
}

export type PartnerMatchLevel = 'match' | 'none';

export interface PartnerMatchSummary {
  level: PartnerMatchLevel;
  /** How many partners have positive evidence (0 when level is 'none'). */
  count: number;
  /** Badge text, e.g. "3 partners" / "No partner match". */
  label: string;
  /** Hover explanation: who matched and why, or what ruled everyone out. */
  detail: string;
}

/**
 * Board-level answer to "can somebody ELSE serve this family?" — the companion
 * to assessReferralFit's "can WE serve them?". Same directory and ranking the
 * share pickers use, collapsed to one pill.
 *
 * Returns null whenever a verdict would be guesswork rather than a finding:
 *  - no agencies saved at all (nothing to match against);
 *  - neither a recognizable county nor a stated care need (nothing to match on);
 *  - candidates exist but every one is an unknown — no counties or services on
 *    file. Calling those a non-match would libel agencies for having thin
 *    records, which is exactly what matchAgencies refuses to do.
 *
 * So 'none' carries a real meaning: every saved partner was ruled out on data
 * we actually have.
 */
export function summarizePartnerMatches(
  input: { county: string | null | undefined; service: GappServiceKey | null },
  agencies: MatchableAgency[]
): PartnerMatchSummary | null {
  if (agencies.length === 0) return null;

  const county = normalizeCounty(input.county);
  const service = input.service;
  if (!county && !service) return null;

  const viable = matchAgencies(input, agencies);
  const positives = viable.filter((m) => m.reasons.length > 0);
  const qualified = qualifiedMatches(viable);

  if (qualified.length > 0) {
    const shown = qualified.slice(0, 3);
    const rest = qualified.length - shown.length;
    const detail = shown
      .map((m) => `${m.agency.name} (${m.reasons.join(' · ')})`)
      .join('; ');
    return {
      level: 'match',
      count: qualified.length,
      label: qualified.length === 1 ? '1 partner' : `${qualified.length} partners`,
      detail: rest > 0 ? `${detail}; +${rest} more` : detail,
    };
  }

  // Nobody qualified. That's a finding when we ruled partners out on data we
  // actually have — either everyone failed on county (nothing viable), or
  // partners do cover the county but are on record as not offering the service
  // (positives survived, none qualified). Survivors with no positive evidence
  // at all are unknowns, not misses — say nothing.
  if (positives.length === 0 && viable.length > 0) return null;

  let detail: string;
  if (county && service) {
    detail = `No saved partner covers ${county} for ${SERVICE_LABEL[service]}`;
  } else if (county) {
    detail = `No saved partner agency covers ${county}`;
  } else {
    detail = `No saved partner agency offers ${SERVICE_LABEL[service as GappServiceKey]}`;
  }
  return { level: 'none', count: 0, label: 'No partner match', detail };
}
