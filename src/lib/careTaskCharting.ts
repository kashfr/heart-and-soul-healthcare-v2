/**
 * Care task charting — pure helpers shared by the progress-note form, the
 * submit-time completeness gate, the PDF renderer, and the admin detail view.
 * NO Firebase imports: ProgressNotePDF is server-rendered and must be able to
 * import this file.
 *
 * How task charting is stored on a note (all inside the flat form-values map):
 *   careTasksMeta          JSON snapshot of the tasks that were PRESENTED to
 *                          the nurse (id, name, category, frequency, level),
 *                          written by the form when the roster loads. The
 *                          snapshot — not the live careTasks collection — is
 *                          the historical record, so later catalog edits never
 *                          rewrite what a past note charted against.
 *   careTask_<id>          per-task status: 'Completed' | 'Not completed' | 'N/A'
 *   careTask_<id>_note     optional per-task note (why not completed, details)
 */

export const CARE_TASK_STATUSES = ['Completed', 'Not completed', 'N/A'] as const;
export type CareTaskChartStatus = (typeof CARE_TASK_STATUSES)[number];

export interface CareTaskMetaEntry {
  id: string;
  name: string;
  categoryLabel: string;
  frequency: string;
  level: string;
}

export interface CareTaskChartEntry extends CareTaskMetaEntry {
  status: string; // '' when unanswered
  note: string;
}

/** Serialize the presented-task snapshot for storage on the note. */
export function buildCareTasksMeta(entries: CareTaskMetaEntry[]): string {
  return JSON.stringify(entries);
}

/** Parse a stored careTasksMeta value. Returns [] for missing/corrupt data. */
export function parseCareTasksMeta(raw: unknown): CareTaskMetaEntry[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .filter((e) => typeof e.id === 'string' && e.id.length > 0 && typeof e.name === 'string')
      .map((e) => ({
        id: e.id as string,
        name: e.name as string,
        categoryLabel: typeof e.categoryLabel === 'string' ? e.categoryLabel : '',
        frequency: typeof e.frequency === 'string' ? e.frequency : '',
        level: typeof e.level === 'string' ? e.level : '',
      }));
  } catch {
    return [];
  }
}

/**
 * Join the meta snapshot with the per-task status/note values from a note's
 * data map. Works on any Record-shaped note data (form values, Firestore doc).
 */
export function parseCareTaskCharting(data: Record<string, unknown>): CareTaskChartEntry[] {
  const meta = parseCareTasksMeta(data['careTasksMeta']);
  return meta.map((m) => ({
    ...m,
    status: typeof data[`careTask_${m.id}`] === 'string' ? (data[`careTask_${m.id}`] as string) : '',
    note: typeof data[`careTask_${m.id}_note`] === 'string' ? (data[`careTask_${m.id}_note`] as string) : '',
  }));
}

/** Tasks from the snapshot that have no status answer yet. */
export function unansweredCareTasks(data: Record<string, unknown>): CareTaskMetaEntry[] {
  return parseCareTaskCharting(data).filter((e) => !e.status.trim());
}
