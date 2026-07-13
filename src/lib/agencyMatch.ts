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

import { normalizeCounty, SERVICE_SHORT, type GappServiceKey } from './georgia';

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

/** Top-N suggestions worth showing: positive evidence only (score from a real
 *  county or service match, not just unknowns). */
export function topSuggestions(matches: AgencyMatch[], n = 3): AgencyMatch[] {
  return matches.filter((m) => m.reasons.length > 0).slice(0, n);
}
