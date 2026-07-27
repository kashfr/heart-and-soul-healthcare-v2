/**
 * Treatment Administration Record — pure helpers shared by the TAR grid, the
 * record modal, and (later) the PDF renderer. NO Firebase imports, so the
 * server-rendered PDF can import this file.
 *
 * A TAR entry answers "was this ordered treatment carried out on this day, and
 * by whom". It deliberately mirrors marAdministrations: append-only, snapshots
 * the task so later catalog edits can't rewrite history, and records the
 * performer separately from the person documenting it.
 */

/** What happened to a scheduled treatment box. */
export type TarStatus = 'done' | 'not-done' | 'na';

/**
 * Who physically performed the treatment. The RN supervisor asked for
 * "parent/Guardian completed the care" as a routine entry: that is a DONE
 * status with a family performer, not a refusal, so it lives here rather than
 * in the not-done reasons.
 */
export const TAR_PERFORMER_TYPES = [
  { value: 'nurse', label: 'Nurse (me)' },
  { value: 'family', label: 'Parent / guardian' },
  { value: 'responsibleParty', label: 'Responsible party' },
  { value: 'dsp', label: 'DSP / direct support staff' },
  { value: 'proxy', label: 'Proxy' },
] as const;

export type TarPerformerType = (typeof TAR_PERFORMER_TYPES)[number]['value'];

/**
 * Reasons a treatment was not carried out. The RN supervisor's expected set is
 * "Pt refused" plus the MAR's existing situational codes, which the DBHDD FY27
 * manual already defines for the MAR legend (D.6.c.ii) and which surveyors
 * therefore already read fluently.
 */
export const TAR_NOT_DONE_REASONS = [
  'Client refused',
  'Hospital',
  'Home visit',
  'Day service',
  'Client unavailable',
  'Supplies unavailable',
  'Other (see note)',
] as const;

/** One-letter grid marks for statuses that aren't a plain initialled "done". */
export const TAR_STATUS_MARKS: Record<Exclude<TarStatus, 'done'>, string> = {
  'not-done': 'R',
  na: 'N/A',
};

export interface TarEntryFieldInput {
  taskId: string;
  slotIndex: number; // 0-based box within the day, for timesPerDay > 1
  status: TarStatus;
  performedByType: TarPerformerType | '';
  performerName: string;
  initials: string;
  time: string; // 'HH:MM' the treatment was performed
  reason: string; // required when status is 'not-done'
  note: string;
  // Snapshots, so a later task edit never rewrites what this entry meant.
  taskNameSnapshot: string;
  categoryLabelSnapshot: string;
  frequencySnapshot: string;
  levelSnapshot: string;
}

export interface TarEntryFieldMeta {
  patientId: string;
  date: string; // 'YYYY-MM-DD'
  sourceNoteId?: string;
  documenter: { uid: string; name: string; credential: string };
}

/**
 * Build the stored shape of one TAR entry. Normalisation rules mirror the MAR's
 * buildMarAdminFields:
 *  - a reason is meaningful only when the treatment was NOT done;
 *  - performerName is blanked when the documenting nurse did it herself, so the
 *    record never implies a second person was involved;
 *  - actual time is kept for a done entry and dropped otherwise.
 */
export function buildTarEntryFields(r: TarEntryFieldInput, meta: TarEntryFieldMeta) {
  const done = r.status === 'done';
  const selfPerformed = r.performedByType === 'nurse' || r.performedByType === '';
  return {
    patientId: meta.patientId,
    date: meta.date,
    taskId: r.taskId,
    slotIndex: Math.max(0, Math.floor(r.slotIndex) || 0),
    status: r.status,
    performedByType: done ? r.performedByType || 'nurse' : '',
    performerName: done && !selfPerformed ? r.performerName.trim() : '',
    initials: r.initials.trim().toUpperCase(),
    time: done ? r.time.trim() : '',
    reason: r.status === 'not-done' ? r.reason.trim() : '',
    note: r.note.trim(),
    taskNameSnapshot: r.taskNameSnapshot,
    categoryLabelSnapshot: r.categoryLabelSnapshot,
    frequencySnapshot: r.frequencySnapshot,
    levelSnapshot: r.levelSnapshot,
    sourceNoteId: meta.sourceNoteId ?? '',
    documentedBy: meta.documenter.uid,
    documentedByName: meta.documenter.name,
    documentedByCredential: meta.documenter.credential,
  };
}

/** Key identifying one box in the grid: task + date + slot. */
export function tarCellKey(taskId: string, date: string, slotIndex: number): string {
  return `${taskId}|${date}|${slotIndex}`;
}

export interface TarEntryLike {
  taskId: string;
  date: string;
  slotIndex?: number;
  status: TarStatus;
  initials?: string;
  amends?: string;
  id?: string;
}

/**
 * Drop entries that a later correction supersedes, so a cell shows the current
 * truth rather than every revision. Same chain-resolution the MAR uses.
 */
export function resolveCurrentTarEntries<T extends { id?: string; amends?: string }>(list: T[]): T[] {
  const superseded = new Set(list.map((e) => e.amends).filter(Boolean) as string[]);
  return list.filter((e) => !e.id || !superseded.has(e.id));
}

/**
 * Index entries by cell so the grid can render in one pass. When two entries
 * land on the same box (a correction chain already resolved, or a duplicate
 * click) the LAST one wins, matching the order callers sort in.
 */
export function indexTarEntriesByCell<T extends TarEntryLike>(entries: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const e of entries) {
    map.set(tarCellKey(e.taskId, e.date, e.slotIndex ?? 0), e);
  }
  return map;
}

/** What a grid box should display. Empty string = nothing charted yet. */
export function tarCellLabel(entry: TarEntryLike | undefined): string {
  if (!entry) return '';
  if (entry.status === 'done') return (entry.initials || '').toUpperCase();
  return TAR_STATUS_MARKS[entry.status];
}

/**
 * Whether a task applies on a given date. Discontinued tasks keep their history
 * visible on the days they were active, exactly like a discontinued MAR order.
 */
export function taskAppliesOn(
  task: { status: string; createdAtISO?: string; discontinuedAtISO?: string },
  date: string,
): boolean {
  if (task.createdAtISO && date < task.createdAtISO) return false;
  if (task.status === 'discontinued' && task.discontinuedAtISO && date > task.discontinuedAtISO) {
    return false;
  }
  return true;
}
