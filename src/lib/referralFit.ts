// Per-referral fit against Heart & Soul's OWN intake profile (settings.intake):
// can we serve this client ourselves? This is the first rung of the triage
// ladder — good fits get worked, non-fits get referred out to a matching
// partner (agencyMatch.ts) or, when no partner matches, handed the state
// provider list (Appendix P, phase 3). Pure logic: no Firestore, unit-testable,
// shared by the board badge and the fit filter.

import { normalizeCounty, SERVICE_LABEL, type GappServiceKey } from './georgia';
import type { IntakeSettings } from './settings';

export type FitLevel = 'good' | 'partial' | 'none';

export interface ReferralFit {
  level: FitLevel;
  /** Short badge text, e.g. "Good fit" / "Possible fit" / "Not a fit". */
  label: string;
  /** Hover explanation, e.g. "Fulton is outside your service area". */
  detail: string;
}

/**
 * Assess a referral against the org's intake profile. Returns null when there
 * is nothing to judge (no recognizable county AND no stated care need, or an
 * empty profile) — no badge beats a misleading one.
 *
 * Levels: 'good' = in-area and the care need is a service we offer;
 * 'partial' = one side matches and the other is unknown (worth a look);
 * 'none' = out of area, or the stated need is a service we don't offer.
 */
export function assessReferralFit(
  input: { county: string | null | undefined; service: GappServiceKey | null },
  profile: IntakeSettings
): ReferralFit | null {
  const county = normalizeCounty(input.county);
  const service = input.service;

  const countyKnown = county !== null && profile.counties.length > 0;
  const serviceKnown = service !== null && profile.services.length > 0;
  if (!countyKnown && !serviceKnown) return null;

  const countyOk = countyKnown ? profile.counties.includes(county as string) : null;
  const serviceOk = serviceKnown ? profile.services.includes(service as GappServiceKey) : null;

  // A hard miss on either known side means we can't serve them.
  if (countyOk === false) {
    return {
      level: 'none',
      label: 'Not a fit',
      detail: `${county} is outside your service area`,
    };
  }
  if (serviceOk === false) {
    return {
      level: 'none',
      label: 'Not a fit',
      detail: `You don't offer ${SERVICE_LABEL[service as GappServiceKey]}`,
    };
  }

  if (countyOk === true && serviceOk === true) {
    return {
      level: 'good',
      label: 'Good fit',
      detail: `Covers ${county} · ${SERVICE_LABEL[service as GappServiceKey]}`,
    };
  }

  // One side confirmed, the other unknown — plausible, needs a human look.
  return {
    level: 'partial',
    label: 'Possible fit',
    detail:
      countyOk === true
        ? `In your service area (${county}); care need not specified`
        : 'Care need matches; county not recognized',
  };
}
