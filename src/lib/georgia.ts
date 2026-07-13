// Canonical Georgia geography + GAPP service definitions, shared by the server
// (partner-agency validation) and the client (agency form pickers, smart-match
// suggestions). Pure data — no 'server-only', no Firestore.

/** All 159 Georgia counties, alphabetical. Agencies' service areas are validated
 *  against this list, so a typo can never create a phantom county. */
export const GA_COUNTIES: string[] = [
  'Appling', 'Atkinson', 'Bacon', 'Baker', 'Baldwin', 'Banks', 'Barrow', 'Bartow',
  'Ben Hill', 'Berrien', 'Bibb', 'Bleckley', 'Brantley', 'Brooks', 'Bryan',
  'Bulloch', 'Burke', 'Butts', 'Calhoun', 'Camden', 'Candler', 'Carroll',
  'Catoosa', 'Charlton', 'Chatham', 'Chattahoochee', 'Chattooga', 'Cherokee',
  'Clarke', 'Clay', 'Clayton', 'Clinch', 'Cobb', 'Coffee', 'Colquitt', 'Columbia',
  'Cook', 'Coweta', 'Crawford', 'Crisp', 'Dade', 'Dawson', 'Decatur', 'DeKalb',
  'Dodge', 'Dooly', 'Dougherty', 'Douglas', 'Early', 'Echols', 'Effingham',
  'Elbert', 'Emanuel', 'Evans', 'Fannin', 'Fayette', 'Floyd', 'Forsyth',
  'Franklin', 'Fulton', 'Gilmer', 'Glascock', 'Glynn', 'Gordon', 'Grady',
  'Greene', 'Gwinnett', 'Habersham', 'Hall', 'Hancock', 'Haralson', 'Harris',
  'Hart', 'Heard', 'Henry', 'Houston', 'Irwin', 'Jackson', 'Jasper', 'Jeff Davis',
  'Jefferson', 'Jenkins', 'Johnson', 'Jones', 'Lamar', 'Lanier', 'Laurens', 'Lee',
  'Liberty', 'Lincoln', 'Long', 'Lowndes', 'Lumpkin', 'Macon', 'Madison',
  'Marion', 'McDuffie', 'McIntosh', 'Meriwether', 'Miller', 'Mitchell', 'Monroe',
  'Montgomery', 'Morgan', 'Murray', 'Muscogee', 'Newton', 'Oconee', 'Oglethorpe',
  'Paulding', 'Peach', 'Pickens', 'Pierce', 'Pike', 'Polk', 'Pulaski', 'Putnam',
  'Quitman', 'Rabun', 'Randolph', 'Richmond', 'Rockdale', 'Schley', 'Screven',
  'Seminole', 'Spalding', 'Stephens', 'Stewart', 'Sumter', 'Talbot', 'Taliaferro',
  'Tattnall', 'Taylor', 'Telfair', 'Terrell', 'Thomas', 'Tift', 'Toombs', 'Towns',
  'Treutlen', 'Troup', 'Turner', 'Twiggs', 'Union', 'Upson', 'Walker', 'Walton',
  'Ware', 'Warren', 'Washington', 'Wayne', 'Webster', 'Wheeler', 'White',
  'Whitfield', 'Wilcox', 'Wilkes', 'Wilkinson', 'Worth',
];

// Case-insensitive lookup: "dekalb" / "DeKalb County" -> "DeKalb".
const COUNTY_BY_KEY = new Map(GA_COUNTIES.map((c) => [c.toLowerCase(), c]));

/** Normalize free text to a canonical county name, or null if not a GA county.
 *  Tolerates case differences and a trailing " County". */
export function normalizeCounty(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim().replace(/\s+county$/i, '');
  if (!raw) return null;
  return COUNTY_BY_KEY.get(raw.toLowerCase()) ?? null;
}

/**
 * GAPP's three service lines, per the GAPP In-Home Nursing Policy Manual
 * (§602, §604, Appendix W): Skilled Nursing, Personal Support Services, and
 * Behavioral Support Aide Services (added 4/1/2023).
 */
export type GappServiceKey = 'nursing' | 'pss' | 'behavioral';

export const GAPP_SERVICES: { key: GappServiceKey; label: string; short: string }[] = [
  { key: 'nursing', label: 'Skilled Nursing', short: 'SN' },
  { key: 'pss', label: 'Personal Support Services (PSS)', short: 'PSS' },
  { key: 'behavioral', label: 'Behavioral Support Aide Services (BSS)', short: 'BSS' },
];

export const SERVICE_KEYS: GappServiceKey[] = GAPP_SERVICES.map((s) => s.key);
export const SERVICE_LABEL: Record<GappServiceKey, string> = Object.fromEntries(
  GAPP_SERVICES.map((s) => [s.key, s.label])
) as Record<GappServiceKey, string>;
export const SERVICE_SHORT: Record<GappServiceKey, string> = Object.fromEntries(
  GAPP_SERVICES.map((s) => [s.key, s.short])
) as Record<GappServiceKey, string>;

/**
 * Map the referral form's stored "Primary care need" display text to a service
 * key. The details array stores the human label verbatim ("Hands-on personal
 * care", "Skilled medical / nursing care", "Behavioral / autism support"), so we
 * prefix-match the stable head of each label. Returns null for "Not sure",
 * blanks, or unrecognized text — those match on county alone.
 */
export function serviceFromCareNeed(label: string | null | undefined): GappServiceKey | null {
  const s = String(label ?? '').trim().toLowerCase();
  if (s.startsWith('hands-on')) return 'pss';
  if (s.startsWith('skilled')) return 'nursing';
  if (s.startsWith('behavioral')) return 'behavioral';
  return null;
}
