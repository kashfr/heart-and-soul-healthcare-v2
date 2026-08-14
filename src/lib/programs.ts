// Which payer program a client is enrolled in, and how heavily we staff them.
//
// These are two ORTHOGONAL axes and are deliberately kept as separate fields:
//
//   program      — whose rulebook applies. NOW/COMP follows the DBHDD provider
//                  manual and an ISP; GAPP follows the GAPP In-Home Nursing
//                  manual and an Appendix T plan of treatment. Different forms,
//                  different audits, different reviewers.
//   serviceLevel — what staffing and documentation cadence to expect. Oversight
//                  only means roughly monthly RN visits; daily LPN means daily
//                  notes and an active MAR; shift nursing means continuous
//                  RN/LPN shift coverage, which is how GAPP is staffed.
//
// Collapsing them into one four-value field would force every consumer that
// cares about only one axis to re-parse it, and would break the moment a
// program appears at more than one service level.
//
// Firebase-free on purpose so the roster, the pickers, and any server route can
// all import it.

export interface ProgramDef {
  id: string;
  /** Short form used on badges and filters. */
  label: string;
  /** Spelled out, for tooltips and anywhere the acronym alone is unhelpful. */
  full: string;
  /** Badge colors, mirroring the chip styling already used on the roster. */
  bg: string;
  fg: string;
  border: string;
}

/**
 * Every program we are approved for. EDWP and ICWP were approved in August 2026
 * and have no clients yet; they are listed here from the start so that
 * onboarding the first one is a data entry task rather than a code change.
 */
export const PROGRAMS: ProgramDef[] = [
  {
    id: 'now-comp',
    label: 'NOW/COMP',
    full: 'New Options Waiver / Comprehensive Supports Waiver Program',
    bg: '#eef4fb',
    fg: '#1a3a5c',
    border: '#c8def5',
  },
  {
    id: 'gapp',
    label: 'GAPP',
    full: 'Georgia Pediatric Program',
    bg: '#e9f6f2',
    fg: '#14544a',
    border: '#b9e3d8',
  },
  {
    id: 'edwp',
    label: 'EDWP',
    full: 'Elderly and Disabled Waiver Program',
    bg: '#f3eefb',
    fg: '#412a63',
    border: '#d9c9f0',
  },
  {
    id: 'icwp',
    label: 'ICWP',
    full: 'Independent Care Waiver Program',
    bg: '#fdeef1',
    fg: '#6d1f2f',
    border: '#f3ccd5',
  },
];

export interface ServiceLevelDef {
  id: string;
  label: string;
  full: string;
  /**
   * Short badge text for the roster, or null to render no badge. Oversight only
   * is the overwhelming majority of the NOW/COMP caseload, so badging it would
   * put a chip on nearly every row and say nothing; we badge the exceptions.
   */
  badge: string | null;
  bg: string;
  fg: string;
  border: string;
}

export const SERVICE_LEVELS: ServiceLevelDef[] = [
  {
    id: 'rn-oversight',
    label: 'RN oversight only',
    full: 'RN oversight only, no daily direct-care nursing',
    badge: null,
    bg: '#f4f5f7',
    fg: '#4a5260',
    border: '#dfe3e8',
  },
  {
    id: 'rn-lpn-daily',
    label: 'RN oversight + daily LPN',
    full: 'RN oversight plus daily LPN services',
    badge: 'DAILY LPN',
    bg: '#eae7fb',
    fg: '#33296b',
    border: '#cdc5ef',
  },
  {
    id: 'skilled-nursing-shifts',
    label: 'Daily skilled nursing shifts',
    full: 'Daily skilled nursing shifts (RN/LPN shift coverage), the GAPP staffing model',
    badge: 'SHIFT NURSING',
    bg: '#e6f0fa',
    fg: '#123a63',
    border: '#bcd8f0',
  },
];

export function getProgram(id: string | undefined): ProgramDef | undefined {
  return id ? PROGRAMS.find((p) => p.id === id) : undefined;
}

export function getServiceLevel(id: string | undefined): ServiceLevelDef | undefined {
  return id ? SERVICE_LEVELS.find((s) => s.id === id) : undefined;
}

/** Label for a program id, falling back to the raw value so unknown ids stay visible. */
export function programLabel(id: string | undefined): string {
  return getProgram(id)?.label ?? (id || '');
}

export function serviceLevelLabel(id: string | undefined): string {
  return getServiceLevel(id)?.label ?? (id || '');
}

/**
 * Does this client match the selected program / service level filters?
 * An empty filter means "any", and a client with the field unset only ever
 * matches the "any" case, so unclassified clients surface plainly rather than
 * hiding inside whichever group happens to be selected.
 */
export function matchesClassification(
  client: { program?: string; serviceLevel?: string },
  filters: { program?: string; serviceLevel?: string },
): boolean {
  if (filters.program && client.program !== filters.program) return false;
  if (filters.serviceLevel && client.serviceLevel !== filters.serviceLevel) return false;
  return true;
}
