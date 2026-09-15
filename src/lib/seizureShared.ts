/**
 * Seizure log: pure helpers shared by the progress-note form, the submit
 * gate, the client dashboard, and the printed log. No Firebase imports.
 *
 * Model: one attestation per shift ("no seizure noted" OR one-or-more
 * seizures), each seizure its own numbered block of form fields on the note
 * (q69_seizure{n}_*), and after the note saves, one append-only
 * seizureEvents record per block. The note fields are the nurse's working
 * copy (they ride drafts and edits for free); the event records are the
 * indexed clinical log.
 */

export const SEIZURE_FIELD_PREFIX = 'q69_seizure';
export const SEIZURE_COUNT_KEY = 'q69_seizureCount';
export const MAX_SEIZURES_PER_NOTE = 10;

export const SEIZURE_TYPES = [
  'Tonic-clonic (generalized)',
  'Absence (staring / blank)',
  'Myoclonic (brief jerks)',
  'Atonic / drop (sudden loss of tone)',
  'Tonic (stiffening)',
  'Focal (one side or area)',
  'Unknown / other',
] as const;

export const SEIZURE_OBSERVATIONS = [
  'Loss of consciousness',
  'Incontinence',
  'Cyanosis or breathing change',
  'Injury (fall, bite, bruise)',
  'Vomiting or aspiration risk',
  'Eyes fixed or deviated',
  'Drooling',
] as const;

export const SEIZURE_INTERVENTIONS = [
  'Timed the seizure',
  'Positioned on side / protected airway',
  'Moved objects away / padded surroundings',
  'Stayed with client and observed',
  'Oxygen applied',
  'Suction',
  'Vital signs after',
  'Rescue medication given',
] as const;

export const SEIZURE_RESPONSES = ['None needed', 'Called 911', 'Transported to ER / urgent care'] as const;

export const POST_SEIZURE_STATES = [
  'Returned to baseline',
  'Sleeping / postictal',
  'Confused or disoriented',
  'Agitated',
  'Weakness on one side',
] as const;

export const SEIZURE_WITNESS = ['Nurse witnessed', 'Reported by family / caregiver'] as const;

/** Seizure lasting this long (or longer) prompts the physician-notification nudge. */
export const PROLONGED_SEIZURE_SECONDS = 5 * 60;
/** This many seizures in one shift is a cluster. */
export const CLUSTER_THRESHOLD = 3;

export interface SeizureEntry {
  index: number; // 1-based, as in the field names
  startTime: string; // 'HH:MM'
  endTime: string; // 'HH:MM'
  durationSeconds: string; // nurse-entered override when the clock is too coarse (drop seizures last 8-30 s)
  seizureType: string;
  witnessedBy: string;
  observations: string; // '; '-joined subset of SEIZURE_OBSERVATIONS
  interventions: string; // '; '-joined subset of SEIZURE_INTERVENTIONS
  rescueMed: string;
  rescueMedTime: string;
  response: string;
  postState: string;
  minutesToBaseline: string;
  physicianNotified: string; // 'Yes' | 'No' | ''
  physicianNotifiedTime: string;
  familyNotified: string;
  notes: string;
}

export const SEIZURE_ENTRY_KEYS: Array<keyof Omit<SeizureEntry, 'index'>> = [
  'startTime', 'endTime', 'durationSeconds', 'seizureType', 'witnessedBy', 'observations',
  'interventions', 'rescueMed', 'rescueMedTime', 'response', 'postState', 'minutesToBaseline',
  'physicianNotified', 'physicianNotifiedTime', 'familyNotified', 'notes',
];

export function seizureFieldKey(index: number, field: keyof Omit<SeizureEntry, 'index'>): string {
  return `${SEIZURE_FIELD_PREFIX}${index}_${field}`;
}

/** Parse 'HH:MM' to minutes since midnight; null when unparseable. */
export function parseHHMM(v: string | undefined): number | null {
  const m = String(v || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/**
 * Effective duration in seconds. A typed duration wins (drop seizures are
 * shorter than the clock's resolution); otherwise end-start, treating an end
 * before the start as crossing midnight. Null when nothing usable.
 */
export function seizureDurationSeconds(e: Pick<SeizureEntry, 'startTime' | 'endTime' | 'durationSeconds'>): number | null {
  const typed = Number(e.durationSeconds);
  if (e.durationSeconds !== '' && Number.isFinite(typed) && typed >= 0) return Math.round(typed);
  const s = parseHHMM(e.startTime), t = parseHHMM(e.endTime);
  if (s === null || t === null) return null;
  let mins = t - s;
  if (mins < 0) mins += 24 * 60;
  return mins * 60;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '';
  if (seconds < 60) return `${seconds} sec`;
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return s ? `${m} min ${s} sec` : `${m} min`;
}

/** Read the numbered blocks out of a flat form-values record. */
export function readSeizureEntries(values: Record<string, unknown>): SeizureEntry[] {
  const n = Math.min(MAX_SEIZURES_PER_NOTE, Math.max(0, Number(values[SEIZURE_COUNT_KEY]) || 0));
  const out: SeizureEntry[] = [];
  for (let i = 1; i <= n; i += 1) {
    const e = { index: i } as SeizureEntry;
    for (const k of SEIZURE_ENTRY_KEYS) e[k] = String(values[seizureFieldKey(i, k)] ?? '');
    out.push(e);
  }
  return out;
}

export interface SeizureGap {
  label: string;
  targetId: string;
}

/**
 * The submit gate for a flagged client. Returns the list of what is missing;
 * empty means the note may submit. Pure so it is unit-testable.
 *  - The Yes/No must be answered.
 *  - Yes needs at least one seizure with start time, end time (or a typed
 *    duration), type, and witnessed-by. Everything else is optional.
 *  - "Rescue medication given" as an intervention needs the med name.
 *  - Called 911 / ER needs physician-notified answered.
 */
export function seizureGaps(values: Record<string, unknown>): SeizureGap[] {
  const gaps: SeizureGap[] = [];
  const answer = String(values.q30_seizureEvent || '');
  if (answer !== 'Yes' && answer !== 'No') {
    gaps.push({ label: 'Seizure event this shift? (answer "No" to attest no seizure was noted)', targetId: 'q30_seizureEventRow' });
    return gaps;
  }
  if (answer === 'No') return gaps;
  const entries = readSeizureEntries(values);
  if (entries.length === 0) {
    gaps.push({ label: 'At least one seizure entry (you answered Yes)', targetId: 'q69_seizureList' });
    return gaps;
  }
  entries.forEach((e) => {
    const p = `Seizure ${e.index}: `;
    if (!parseHHMM(e.startTime)) gaps.push({ label: p + 'start time', targetId: seizureFieldKey(e.index, 'startTime') });
    if (seizureDurationSeconds(e) === null) gaps.push({ label: p + 'end time or duration in seconds', targetId: seizureFieldKey(e.index, 'endTime') });
    if (!e.seizureType) gaps.push({ label: p + 'seizure type', targetId: seizureFieldKey(e.index, 'seizureType') });
    if (!e.witnessedBy) gaps.push({ label: p + 'witnessed by', targetId: seizureFieldKey(e.index, 'witnessedBy') });
    if (/Rescue medication given/.test(e.interventions) && !e.rescueMed.trim()) {
      gaps.push({ label: p + 'which rescue medication was given', targetId: seizureFieldKey(e.index, 'rescueMed') });
    }
    if (e.response && e.response !== 'None needed' && !e.physicianNotified) {
      gaps.push({ label: p + 'physician notified? (required after 911 / ER)', targetId: seizureFieldKey(e.index, 'physicianNotified') });
    }
  });
  return gaps;
}

/** Nudges shown inline (never block): prolonged seizure, cluster, first-ever. */
export function seizureAdvisories(entries: SeizureEntry[]): string[] {
  const out: string[] = [];
  const prolonged = entries.filter((e) => (seizureDurationSeconds(e) ?? 0) >= PROLONGED_SEIZURE_SECONDS);
  if (prolonged.length) out.push(`Seizure ${prolonged.map((e) => e.index).join(', ')} lasted 5 minutes or longer. Notify the physician and consider the emergency protocol.`);
  if (entries.length >= CLUSTER_THRESHOLD) out.push(`${entries.length} seizures this shift is a cluster. Notify the physician.`);
  return out;
}

/** Sort entries chronologically for display and for writing event records. */
export function sortSeizuresByStart<T extends { startTime: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (parseHHMM(a.startTime) ?? 9999) - (parseHHMM(b.startTime) ?? 9999));
}
